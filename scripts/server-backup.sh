#!/bin/bash
# =============================================================================
# METECH ERP 伺服器端備份腳本
# -----------------------------------------------------------------------------
# 用法（在伺服器上執行，或由 npm run backup:schedule 從本機呼叫）：
#   server-backup.sh                    立即備份一次並清理過期備份
#   server-backup.sh --install-cron 2   安裝每天凌晨 2:00 的自動備份排程
#   server-backup.sh --remove-cron      移除自動備份排程
#   server-backup.sh --status           顯示目前排程與最近的執行紀錄
#   server-backup.sh --cloud-only       只把現有備份與 uploads 傳到 Google Drive（不另外備份）
#   server-backup.sh --cloud-status     顯示 Google Drive 雲端備份的設定與佔用空間
#
# 排程的安裝寫在這裡而不是 PowerShell，是因為 PowerShell 5.1 把含有引號的
# 字串傳給 ssh 時容易被改寫，放在 shell 腳本裡引號才可控。
#
# 保留策略：
#   每日備份保留 30 天；每月 1 號的備份另外標記為 monthly 保留 13 個月。
#   資料庫約 10 MB、單檔壓縮後數 MB，整年份佔用仍在數百 MB 以內。
#   之所以要留到月，是因為有些資料問題要過幾週才會被發現，
#   只留最近幾天的話，發現時乾淨的版本早已被覆蓋掉。
#
# 雲端備份（Google Drive，設定方式見 BACKUP_GOOGLE_DRIVE.md）：
#   備份完接著把資料庫備份與 uploads（照片、簽收單、附件）傳到公司的共用雲端硬碟。
#   經由 rclone 的加密遠端 erp-backup: 上傳，雲端上只看得到加密過的檔案。
#   - db/        資料庫備份，保留規則與伺服器相同（每日 30 天、每月 13 個月）
#   - uploads/   與伺服器同步，每天只傳新增或變動的檔案；回收區 _deleted 不傳
#   - uploads-removed/日期/  伺服器上已經刪掉的檔案移到這裡，保留 90 天
#   - config/    設定檔：.env（資料庫密碼等）與 SSL 憑證。這兩樣不在 GitHub 上，
#                伺服器整台壞掉時主程式可以從 GitHub 重新部署，但它們只能從這裡找回
#   - config-history/日期/  設定檔有改過時，舊版移到這裡，保留 13 個月
#   還沒設定 erp-backup: 時只做本機備份，不算失敗。
#   雲端上傳失敗不影響本機備份，但這次執行會回報失敗，紀錄寫在 backup.log。
# =============================================================================

set -euo pipefail

DB_NAME="ERP_db"
# 路徑可用環境變數覆寫，僅供測試用
BASE_DIR="${ERP_BASE_DIR:-/opt/erp-management}"
BACKUP_DIR="$BASE_DIR/backups"
UPLOADS_DIR="$BASE_DIR/uploads"
LOG_FILE="$BACKUP_DIR/backup.log"
KEEP_DAILY_DAYS=30
KEEP_MONTHLY_DAYS=400
CLOUD_REMOTE="erp-backup:"
KEEP_CLOUD_REMOVED_DAYS=90
KEEP_CLOUD_CONFIG_DAYS=400
ENV_FILE="$BASE_DIR/.env"
SSL_DIR="$BASE_DIR/ssl"
LOCK_FILE="${ERP_LOCK_FILE:-/var/lock/erp-backup.lock}"
# 用於辨識這條排程，重複安裝時靠它找出舊的並移除
MARKER="erp-daily-backup"
SELF="$(readlink -f "$0")"

log() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*"
}

# rclone 有安裝、也設定好加密遠端 erp-backup: 才算啟用雲端備份
cloud_configured() {
    command -v rclone > /dev/null 2>&1 && rclone listremotes 2>/dev/null | grep -qx "$CLOUD_REMOTE"
}

# 讀 .env 裡某個設定的值（只讀文字，不執行 .env 的內容）
env_value() {
    [ -r "$ENV_FILE" ] || return 0
    grep -E "^[[:space:]]*(export[[:space:]]+)?$1[[:space:]]*=" "$ENV_FILE" | tail -1 \
        | sed -E 's/^[^=]*=[[:space:]]*//; s/[[:space:]]+$//; s/^"(.*)"$/\1/; s/^'"'"'(.*)'"'"'$/\1/' || true
}

# 把要備份的設定檔複製到暫存資料夾 $1：
#   env/.env       伺服器的 .env
#   ssl/           $BASE_DIR/ssl 整個資料夾（伺服器預設讀這裡的憑證）
#   ssl-custom/    .env 用 SSL_KEY_PATH 等指定、不在 ssl 資料夾裡的憑證
# 回傳 1 表示有檔案讀不到（其他的照樣準備）
stage_config_files() {
    local dest="$1" failed=0
    if [ -f "$ENV_FILE" ]; then
        mkdir -p "$dest/env"
        cp -p "$ENV_FILE" "$dest/env/.env" || failed=1
    fi
    if [ -d "$SSL_DIR" ]; then
        mkdir -p "$dest/ssl"
        cp -pR "$SSL_DIR/." "$dest/ssl/" || failed=1
    fi
    local key p real
    for key in SSL_KEY_PATH SSL_CERT_PATH SSL_CA_PATH; do
        p="$(env_value "$key")"
        [ -n "$p" ] || continue
        # 相對路徑以程式目錄為準（伺服器在 $BASE_DIR 底下啟動）
        case "$p" in /*) ;; *) p="$BASE_DIR/$p" ;; esac
        if [ ! -f "$p" ]; then
            log "雲端備份：找不到 .env 指定的 $key（$p）" >&2
            failed=1
            continue
        fi
        real="$(readlink -f "$p")"
        # 已經在 ssl 資料夾裡的不用重複放
        case "$real" in "$(readlink -f "$SSL_DIR" 2>/dev/null || echo "$SSL_DIR")"/*) continue ;; esac
        mkdir -p "$dest/ssl-custom"
        cp -pL "$p" "$dest/ssl-custom/$(basename "$p")" || failed=1
    done
    return $failed
}

# 雲端上以日期命名（YYYYMMDD-HHMMSS）的資料夾，超過 $2 天的整個刪除
# （不能用 --min-age：移過去的檔案保留原本的修改時間，舊檔一移過去就會被刪）
purge_dated_dirs() {
    local remote_dir="$1" days="$2" cutoff dir failed=0
    cutoff="$(date -d "-${days} days" +%Y%m%d-%H%M%S)"
    while IFS= read -r dir; do
        dir="${dir%/}"
        if [[ "$dir" =~ ^[0-9]{8}-[0-9]{6}$ ]] && [[ "$dir" < "$cutoff" ]]; then
            rclone purge "${CLOUD_REMOTE}$remote_dir/$dir" 2>&1 | tail -3 || failed=1
            log "雲端備份：已刪除超過 ${days} 天的 $remote_dir/$dir"
        fi
    done < <(rclone lsf --dirs-only "${CLOUD_REMOTE}$remote_dir" 2>/dev/null || true)
    return $failed
}

# 把資料庫備份、uploads 與設定檔傳到 Google Drive；任何一步失敗都繼續做完其他步，最後回報
cloud_upload() {
    if ! command -v rclone > /dev/null 2>&1; then
        log "雲端備份：伺服器沒有安裝 rclone，略過（設定方式見 BACKUP_GOOGLE_DRIVE.md）"
        return 0
    fi
    if ! cloud_configured; then
        log "雲端備份：還沒設定 $CLOUD_REMOTE，略過（設定方式見 BACKUP_GOOGLE_DRIVE.md）"
        return 0
    fi

    local failed=0
    local stamp
    stamp="$(date +%Y%m%d-%H%M%S)"
    # 網路不穩時多試幾次；--stats-one-line 讓紀錄只留一行摘要
    local opts=(--retries 3 --low-level-retries 10 --stats-one-line --stats 0 -v)

    log "雲端備份：上傳資料庫備份"
    # 部署前與手動的備份也一起傳；已經傳過的會略過
    if rclone copy "$BACKUP_DIR" "${CLOUD_REMOTE}db" --include "${DB_NAME}-*.backup" "${opts[@]}" 2>&1 | tail -3; then
        # 雲端的保留規則與伺服器相同；rclone copy 會保留原本的修改時間，--min-age 依它判斷
        rclone delete "${CLOUD_REMOTE}db" --include "${DB_NAME}-2*.backup" --min-age "${KEEP_DAILY_DAYS}d" 2>&1 | tail -3 || failed=1
        rclone delete "${CLOUD_REMOTE}db" --include "${DB_NAME}-monthly-*.backup" --min-age "${KEEP_MONTHLY_DAYS}d" 2>&1 | tail -3 || failed=1
    else
        log "雲端備份：資料庫備份上傳失敗" >&2
        failed=1
    fi

    if [ -d "$UPLOADS_DIR" ]; then
        log "雲端備份：同步 uploads（照片與文件）"
        # 伺服器上已經刪掉的不直接從雲端刪除，先移到 uploads-removed/日期/
        if ! rclone sync "$UPLOADS_DIR" "${CLOUD_REMOTE}uploads" --exclude "/_deleted/**"                 --backup-dir "${CLOUD_REMOTE}uploads-removed/$stamp" "${opts[@]}" 2>&1 | tail -3; then
            log "雲端備份：uploads 同步失敗" >&2
            failed=1
        fi
        purge_dated_dirs uploads-removed "$KEEP_CLOUD_REMOVED_DAYS" || failed=1
    fi

    # 設定檔（.env、SSL 憑證）：先複製到只有自己讀得到的暫存資料夾，再同步到 config/；
    # 改過的舊版移到 config-history/日期/
    local staging
    staging="$(mktemp -d)"
    chmod 700 "$staging"
    stage_config_files "$staging" || failed=1
    if [ -n "$(ls -A "$staging")" ]; then
        log "雲端備份：同步設定檔（.env、SSL 憑證）"
        if ! rclone sync "$staging" "${CLOUD_REMOTE}config" \
                --backup-dir "${CLOUD_REMOTE}config-history/$stamp" "${opts[@]}" 2>&1 | tail -3; then
            log "雲端備份：設定檔同步失敗" >&2
            failed=1
        fi
        purge_dated_dirs config-history "$KEEP_CLOUD_CONFIG_DAYS" || failed=1
    else
        # 一個都沒有時不同步，免得把雲端上的設定檔當成已刪除
        log "雲端備份：找不到 .env 與 SSL 憑證，設定檔略過" >&2
        failed=1
    fi
    rm -rf "$staging"

    if [ "$failed" -ne 0 ]; then
        log "雲端備份：有步驟失敗，請查看上方訊息" >&2
        return 1
    fi
    log "雲端備份完成"
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

# --- 雲端備份狀態 -------------------------------------------------------------
if [ "${1:-}" = "--cloud-status" ]; then
    if ! command -v rclone > /dev/null 2>&1; then
        echo "伺服器沒有安裝 rclone，雲端備份尚未啟用。設定方式見 BACKUP_GOOGLE_DRIVE.md"
        exit 0
    fi
    if ! cloud_configured; then
        echo "rclone 已安裝，但還沒設定 $CLOUD_REMOTE。設定方式見 BACKUP_GOOGLE_DRIVE.md"
        echo "目前的遠端：$(rclone listremotes | tr '
' ' ')"
        exit 0
    fi
    echo "雲端備份已啟用（$CLOUD_REMOTE）"
    echo
    echo "資料庫備份（新到舊，最多 10 份）："
    rclone lsl "${CLOUD_REMOTE}db" 2>/dev/null | sort -k2,3r | head -10 || echo "（尚無）"
    echo
    for d in db uploads uploads-removed config config-history; do
        echo "$d：$(rclone size "${CLOUD_REMOTE}$d" 2>/dev/null | tr '
' ' ' || echo '（尚無）')"
    done
    echo
    echo "設定檔（只列檔名）："
    rclone lsl "${CLOUD_REMOTE}config" 2>/dev/null || echo "（尚無）"
    echo
    echo "最近的雲端備份紀錄："
    grep "雲端備份" "$LOG_FILE" 2>/dev/null | tail -10 || echo "（尚無執行紀錄）"
    exit 0
fi

# 同一時間只跑一份：第一次上傳 uploads 可能很久，避免隔天的排程疊上來
mkdir -p "$BACKUP_DIR"
if command -v flock > /dev/null 2>&1; then
    exec 9> "$LOCK_FILE"
    if ! flock -n 9; then
        log "上一次備份還在執行，這次略過"
        exit 0
    fi
fi

# --- 只傳雲端 ---------------------------------------------------------------
if [ "${1:-}" = "--cloud-only" ]; then
    cloud_upload
    exit $?
fi

if [ -n "${1:-}" ]; then
    echo "未知的參數：$1" >&2
    echo "可用：--install-cron [時] / --remove-cron / --status / --cloud-only / --cloud-status，或不帶參數直接備份。" >&2
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

# --- 傳到 Google Drive --------------------------------------------------------
# 本機備份已經完成；雲端失敗只讓這次執行回報失敗，不動本機的備份
cloud_upload
