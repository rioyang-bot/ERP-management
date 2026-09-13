# =============================================================================
# METECH ERP Database Usage Report
# -----------------------------------------------------------------------------
# 查看伺服器資料庫的使用量：資料庫大小、各資料表佔用空間與筆數、
# 備份檔累積的空間，以及磁碟剩餘容量。
#
# 用法：
#   npm run db:usage
#
# 純查詢，不會更動任何資料。
# =============================================================================

$ErrorActionPreference = "Stop"

$RemoteHost = "root@192.168.100.249"
$RemoteDir  = "/opt/erp-management"
$DbName     = "ERP_db"

Write-Host "==========================================" -ForegroundColor Cyan
Write-Host "  METECH ERP 伺服器資料庫使用量" -ForegroundColor Cyan
Write-Host "==========================================" -ForegroundColor Cyan
Write-Host "伺服器：$RemoteHost" -ForegroundColor Gray
Write-Host ""

# --- 1. 各資料庫大小 ---------------------------------------------------------
Write-Host "[1/4] 資料庫大小" -ForegroundColor Yellow
ssh $RemoteHost "sudo -u postgres psql -d $DbName -c 'SELECT datname AS 資料庫, pg_size_pretty(pg_database_size(datname)) AS 大小 FROM pg_database WHERE datistemplate = false ORDER BY pg_database_size(datname) DESC'"
if ($LASTEXITCODE -ne 0) {
    Write-Host "無法連線到伺服器或查詢失敗。" -ForegroundColor Red
    exit 1
}

# --- 2. 佔用空間最大的資料表 -------------------------------------------------
Write-Host "[2/4] $DbName 佔用空間最大的資料表（含索引）" -ForegroundColor Yellow
# 筆數取自統計資訊，長期沒有 ANALYZE 過會停留在舊值甚至 0，
# 因此先更新統計再查。ANALYZE 只更新查詢規劃用的統計，不會更動資料。
ssh $RemoteHost "sudo -u postgres psql -d $DbName -q -c ANALYZE" | Out-Null
ssh $RemoteHost "sudo -u postgres psql -d $DbName -c 'SELECT relname AS 資料表, pg_size_pretty(pg_total_relation_size(relid)) AS 佔用空間, n_live_tup AS 筆數 FROM pg_stat_user_tables ORDER BY pg_total_relation_size(relid) DESC LIMIT 15'"
if ($LASTEXITCODE -ne 0) {
    Write-Host "查詢資料表失敗。" -ForegroundColor Red
    exit 1
}

# --- 3. 備份檔佔用空間 -------------------------------------------------------
Write-Host "[3/4] 備份檔累積狀況" -ForegroundColor Yellow
ssh $RemoteHost "if [ -d $RemoteDir/backups ]; then echo -n '備份份數：'; ls -1 $RemoteDir/backups/*.backup 2>/dev/null | wc -l; echo -n '合計佔用：'; du -sh $RemoteDir/backups | cut -f1; echo '最近三份：'; ls -lht $RemoteDir/backups/*.backup 2>/dev/null | head -3; else echo '（尚無備份目錄）'; fi"

# --- 4. 磁碟剩餘容量 ---------------------------------------------------------
Write-Host "[4/4] 磁碟剩餘容量" -ForegroundColor Yellow
ssh $RemoteHost "df -h $RemoteDir | tail -2 | head -1; df -h $RemoteDir | tail -1"
if ($LASTEXITCODE -ne 0) {
    Write-Host "查詢磁碟容量失敗。" -ForegroundColor Red
    exit 1
}

Write-Host ""
Write-Host "查詢完成。除了更新統計資訊外，未更動任何資料。" -ForegroundColor Green
Write-Host "備份指令：npm run backup　／　列出備份：npm run backup:list" -ForegroundColor Gray
