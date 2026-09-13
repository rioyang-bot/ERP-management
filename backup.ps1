# =============================================================================
# METECH ERP Database Backup Script
# -----------------------------------------------------------------------------
# 備份伺服器資料庫。備份檔保留在伺服器上，不會下載到本機。
#
# 用法：
#   npm run backup           立即備份一次
#   npm run backup:list      列出伺服器上現有的備份
#
# 備份檔位置：/opt/erp-management/backups/ERP_db-<日期時間>.backup
# 格式為 pg_dump 自訂格式 (-F c)，還原指令在備份完成後會一併印出。
#
# 部署 (npm run deploy) 本身也會自動先備份一次，這支是給平常想額外留檔時用的。
# =============================================================================

param(
    [switch]$List
)

$ErrorActionPreference = "Stop"

$RemoteHost = "root@192.168.100.249"
$RemoteDir  = "/opt/erp-management"
$DbName     = "ERP_db"

Write-Host "==========================================" -ForegroundColor Cyan
Write-Host "  METECH ERP 資料庫備份" -ForegroundColor Cyan
Write-Host "==========================================" -ForegroundColor Cyan
Write-Host "伺服器：$RemoteHost" -ForegroundColor Gray
Write-Host "資料庫：$DbName" -ForegroundColor Gray
Write-Host ""

# --- 只列出現有備份 ----------------------------------------------------------
if ($List) {
    Write-Host "伺服器上現有的備份（新到舊）：" -ForegroundColor Yellow
    ssh $RemoteHost "ls -lht $RemoteDir/backups/*.backup 2>/dev/null || echo '（尚無備份）'"
    if ($LASTEXITCODE -ne 0) {
        Write-Host "無法連線到伺服器。" -ForegroundColor Red
        exit 1
    }
    Write-Host ""
    Write-Host "備份總佔用空間與磁碟剩餘：" -ForegroundColor Yellow
    ssh $RemoteHost "du -sh $RemoteDir/backups 2>/dev/null; df -h $RemoteDir | tail -1"
    exit 0
}

$stamp = Get-Date -Format "yyyyMMdd-HHmmss"
$backupFile = "$RemoteDir/backups/$DbName-$stamp.backup"

# pg_dump 以 postgres 身分執行，但 backups/ 由 root 建立，postgres 無權寫入該目錄，
# 因此讓 pg_dump 輸出到標準輸出，由 root 的 shell 轉寫成檔案。
# set -o pipefail 確保 pg_dump 失敗時整條指令的離開代碼不為 0，
# 否則備份失敗仍會留下一個 0 KB 的檔案而看不出問題。
Write-Host "備份中..." -ForegroundColor Yellow
$backupCmd = "set -o pipefail; mkdir -p $RemoteDir/backups && sudo -u postgres pg_dump -F c -d $DbName > $backupFile && ls -lh $backupFile"
ssh $RemoteHost $backupCmd
if ($LASTEXITCODE -ne 0) {
    Write-Host "備份失敗，未產生可用的備份檔。" -ForegroundColor Red
    exit 1
}

Write-Host ""
Write-Host "==========================================" -ForegroundColor Green
Write-Host "  備份完成" -ForegroundColor Green
Write-Host "==========================================" -ForegroundColor Green
Write-Host "備份檔：$backupFile" -ForegroundColor Green
Write-Host ""
Write-Host "查看所有備份：npm run backup:list" -ForegroundColor Gray
Write-Host ""
Write-Host "還原方式（會覆蓋伺服器現有資料，執行前請再三確認）：" -ForegroundColor Yellow
Write-Host "  ssh $RemoteHost" -ForegroundColor Gray
Write-Host "  sudo -u postgres pg_restore -d $DbName --clean --if-exists $backupFile" -ForegroundColor Gray
