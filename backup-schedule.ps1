# =============================================================================
# METECH ERP Daily Backup Scheduler
# -----------------------------------------------------------------------------
# 在伺服器上安裝「每天固定時間自動備份資料庫」的排程 (cron)。
#
# 用法：
#   npm run backup:schedule              安裝每日備份排程（預設每天凌晨 2:00）
#   npm run backup:schedule -- -Hour 3   改成凌晨 3:00
#   npm run backup:schedule -- -Status   查看目前的排程與最近幾次執行紀錄
#   npm run backup:schedule -- -Remove   移除每日備份排程
#
# 重複執行不會累積重複的排程，會先移除舊的再寫入新的。
# 實際動作都在伺服器上的 scripts/server-backup.sh（隨 npm run deploy 一併上傳），
# 本檔只負責呼叫它——PowerShell 5.1 把含引號的字串傳給 ssh 容易被改寫，
# 因此引號一律留在 shell 腳本裡。
# =============================================================================

param(
    [int]$Hour = 2,
    [switch]$Status,
    [switch]$Remove
)

$ErrorActionPreference = "Stop"

$RemoteHost = "root@192.168.100.249"
$RemoteDir  = "/opt/erp-management"
$ScriptPath = "$RemoteDir/scripts/server-backup.sh"

Write-Host "==========================================" -ForegroundColor Cyan
Write-Host "  METECH ERP 每日自動備份排程" -ForegroundColor Cyan
Write-Host "==========================================" -ForegroundColor Cyan
Write-Host "伺服器：$RemoteHost" -ForegroundColor Gray
Write-Host ""

# --- 查看目前狀態 ------------------------------------------------------------
if ($Status) {
    ssh $RemoteHost "$ScriptPath --status"
    if ($LASTEXITCODE -ne 0) {
        Write-Host "無法連線到伺服器，或備份腳本尚未上傳（請先 npm run deploy）。" -ForegroundColor Red
        exit 1
    }
    exit 0
}

# --- 移除排程 ----------------------------------------------------------------
if ($Remove) {
    Write-Host "移除每日備份排程..." -ForegroundColor Yellow
    ssh $RemoteHost "$ScriptPath --remove-cron"
    if ($LASTEXITCODE -ne 0) {
        Write-Host "移除失敗。" -ForegroundColor Red
        exit 1
    }
    exit 0
}

if ($Hour -lt 0 -or $Hour -gt 23) {
    Write-Host "時間必須介於 0 到 23 之間。" -ForegroundColor Red
    exit 1
}

# --- 1. 確認備份腳本存在且可執行 ---------------------------------------------
Write-Host "[1/3] 檢查伺服器上的備份腳本..." -ForegroundColor Yellow
ssh $RemoteHost "test -f $ScriptPath"
if ($LASTEXITCODE -ne 0) {
    Write-Host "伺服器上找不到 $ScriptPath" -ForegroundColor Red
    Write-Host "請先執行 npm run deploy 把 scripts/ 上傳到伺服器，再安裝排程。" -ForegroundColor Yellow
    exit 1
}
# 不在這裡用 sed 修 CRLF：未加引號時反斜線會被遠端 shell 吃掉，
# 變成 s/r$// 反而把腳本每行結尾的字母 r 刪掉。
# 換行由 .gitattributes 的 *.sh text eol=lf 保證，scp 是位元組複製不會改動；
# 萬一真的混進 CR，下面的 bash -n 會擋下來。
ssh $RemoteHost "chmod +x $ScriptPath; bash -n $ScriptPath"
if ($LASTEXITCODE -ne 0) {
    Write-Host "備份腳本無法執行或語法有誤（若剛從 Windows 上傳，請確認換行是 LF 而非 CRLF）。" -ForegroundColor Red
    exit 1
}
Write-Host "備份腳本正常。" -ForegroundColor Green

# --- 2. 寫入排程 -------------------------------------------------------------
Write-Host "[2/3] 安裝排程（每天 $($Hour.ToString('00')):00 執行）..." -ForegroundColor Yellow
ssh $RemoteHost "$ScriptPath --install-cron $Hour"
if ($LASTEXITCODE -ne 0) {
    Write-Host "排程安裝失敗。" -ForegroundColor Red
    exit 1
}

# --- 3. 立即試跑一次，確認排程真的能備份成功 ---------------------------------
Write-Host "[3/3] 立即試跑一次，確認可以正常備份..." -ForegroundColor Yellow
ssh $RemoteHost "$ScriptPath"
if ($LASTEXITCODE -ne 0) {
    Write-Host "試跑失敗。排程已寫入，但請先解決上述錯誤，否則每天都會失敗。" -ForegroundColor Red
    exit 1
}

Write-Host ""
Write-Host "==========================================" -ForegroundColor Green
Write-Host "  排程安裝完成" -ForegroundColor Green
Write-Host "==========================================" -ForegroundColor Green
Write-Host "備份時間：每天 $($Hour.ToString('00')):00" -ForegroundColor Green
Write-Host "備份位置：$RemoteDir/backups/" -ForegroundColor Green
Write-Host "執行紀錄：$RemoteDir/backups/backup.log" -ForegroundColor Green
Write-Host "保留策略：每日備份留 30 天，每月 1 號的備份留 13 個月" -ForegroundColor Green
Write-Host ""
Write-Host "查看排程與執行紀錄：npm run backup:schedule -- -Status" -ForegroundColor Gray
Write-Host "查看現有備份　　　：npm run backup:list" -ForegroundColor Gray
