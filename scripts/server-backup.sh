#!/bin/bash
# =============================================================================
# METECH ERP 伺服器端備份腳本
# -----------------------------------------------------------------------------
# 用法（在伺服器上執行，或由 npm run backup:schedule 從本機呼叫）：
#   server-backup.sh                    立即備份一次並清理過期備份
#   server-backup.sh --install-cron 2   安裝每天凌晨 2:00 的自動備份排程
#   server-backup.sh --remove-cron      移除自動備份排程
#   server-backup.sh --status           顯示目前排程與最近的執行紀錄
#
# 排程的安裝寫在這裡而不是 PowerShell，是因為 PowerShell 5.1 把含有引號的
# 字串傳給 ssh 時容易被改寫，放在 shell 腳本裡引號才可控。
#
# 保留策略：
#   每日備份保留 30 天；每月 1 號的備份另外標記為 monthly 保留 13 個月。
#   資料庫約 10 MB、單檔壓縮後數 MB，整年份佔用仍在數百 MB 以內。
#   之所以要留到月，是因為有些資料問題要過幾週才會被發現，
#   只留最近幾天的話，發現時乾淨的版本早已被覆蓋掉。
# =============================================================================

set -euo pipefail

DB_NAME="ERP_db"
BASE_DIR="/opt/erp-management"
BACKUP_DIR="$BASE_DIR/backups"
LOG_FILE="$BACKUP_DIR/backup.log"
KEEP_DAILY_DAYS=30
KEEP_MONTHLY_DAYS=400
# 用於辨識這條排程，重複安裝時靠它找出舊的並移除
MARKER="erp-daily-backup"
SELF="$(readlink -f "$0")"

log() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*"
}

# --- 安裝排程 ---------------------------------------------------------------
if [ "${1:-}" = "--install-cron" ]; then
    HOUR="${2:-2}"
    if ! echo "$HOUR" | grep -qE '^([0-9]|1[0-9]|2[0-3])$'; then
        echo "時間必須是 0 到 23 的整數，收到：$HOUR" >&2
        exit 1
    fi
    mkdir -p "$BACKUP_DIR"
    # 先濾掉舊的同名排程再寫入，重複執行不會累積
    { crontab -l 2>/dev/null | grep -v "$MARKER" || true; \
      echo "0 $HOUR * * * $SELF >> $LOG_FILE 2>&1 # $MARKER"; } | crontab -
    echo "已安裝排程："
    crontab -l | grep "$MARKER"
    exit 0
fi

# --- 移除排程 ---------------------------------------------------------------
if [ "${1:-}" = "--remove-cron" ]; then
    { crontab -l 2>/dev/null | grep -v "$MARKER" || true; } | crontab -
    echo "已移除每日備份排程。既有備份檔不受影響，仍保留在 $BACKUP_DIR"
    exit 0
fi

# --- 查看狀態 ---------------------------------------------------------------
if [ "${1:-}" = "--status" ]; then
    echo "目前的備份排程："
    crontab -l 2>/dev/null | grep "$MARKER" || echo "（尚未安裝每日備份排程）"
    echo
    echo "最近的執行紀錄："
    tail -20 "$LOG_FILE" 2>/dev/null || echo "（尚無執行紀錄）"
    exit 0
fi

if [ -n "${1:-}" ]; then
    echo "未知的參數：$1" >&2
    echo "可用：--install-cron [時] / --remove-cron / --status，或不帶參數直接備份。" >&2
    exit 1
fi

# --- 備份 -------------------------------------------------------------------
mkdir -p "$BACKUP_DIR"

STAMP="$(date +%Y%m%d-%H%M%S)"
DAY_OF_MONTH="$(date +%d)"

# 每月 1 號的備份另外命名，才不會被每日備份的清理規則刪掉
if [ "$DAY_OF_MONTH" = "01" ]; then
    BACKUP_FILE="$BACKUP_DIR/${DB_NAME}-monthly-${STAMP}.backup"
else
    BACKUP_FILE="$BACKUP_DIR/${DB_NAME}-${STAMP}.backup"
fi

log "開始備份 $DB_NAME"

# pg_dump 以 postgres 身分執行，但 backups/ 由 root 建立、postgres 無權寫入該目錄，
# 因此輸出到標準輸出再由本腳本（root）轉寫成檔案。
# 上方 set -euo pipefail 已開啟 pipefail，pg_dump 失敗不會留下假檔案。
sudo -u postgres pg_dump -F c -d "$DB_NAME" > "$BACKUP_FILE"

# 驗證備份檔真的讀得出內容，避免留下一個大小正常卻損毀的檔案
if ! sudo -u postgres pg_restore --list "$BACKUP_FILE" > /dev/null 2>&1; then
    log "備份檔驗證失敗，已刪除：$BACKUP_FILE" >&2
    rm -f "$BACKUP_FILE"
    exit 1
fi

log "備份完成：$BACKUP_FILE ($(du -h "$BACKUP_FILE" | cut -f1))"

# --- 清理過期備份 -----------------------------------------------------------
# 每日備份（含部署前與手動備份）超過保留天數即刪除；monthly- 開頭的不會被這條比對到
DELETED_DAILY="$(find "$BACKUP_DIR" -maxdepth 1 -type f -name "${DB_NAME}-2*.backup" -mtime "+${KEEP_DAILY_DAYS}" -print -delete | wc -l)"
DELETED_MONTHLY="$(find "$BACKUP_DIR" -maxdepth 1 -type f -name "${DB_NAME}-monthly-*.backup" -mtime "+${KEEP_MONTHLY_DAYS}" -print -delete | wc -l)"

log "清理過期備份：每日 $DELETED_DAILY 份、每月 $DELETED_MONTHLY 份"
log "目前共 $(find "$BACKUP_DIR" -maxdepth 1 -type f -name "${DB_NAME}-*.backup" | wc -l) 份備份，合計 $(du -sh "$BACKUP_DIR" | cut -f1)"
