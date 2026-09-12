# =============================================================================
# METECH ERP Deploy Script
# -----------------------------------------------------------------------------
# 與舊版的差異：
#   1. 一併上傳 server/（身分驗證模組）與 package.json，並在伺服器安裝相依套件。
#      舊版只上傳 dist / database / server.js，新版程式會因缺少模組而啟動失敗。
#   2. 資料庫變更改由 scripts/migrate.mjs 依 migrations.manifest.json 執行，
#      不再把腳本清單寫死在本檔。已套用過的不會重複執行。
#   3. 每個遠端步驟都檢查離開代碼。舊版 `cat X.sql | psql` 失敗只印訊息就繼續，
#      而最後檢查的是 `systemctl reload nginx` 的結果，migration 失敗完全看不到。
#   4. 部署前先備份資料庫。
#
# 注意：.env 不會上傳（內含密碼，且已列入 .gitignore）。
#       伺服器端的 .env 需自行維護，首次部署請參考 .env.example。
# =============================================================================

$ErrorActionPreference = "Stop"

$RemoteHost = "root@192.168.100.249"
$RemoteDir  = "/opt/erp-management"

function Invoke-Step {
    param([string]$Label, [scriptblock]$Action)
    Write-Host $Label -ForegroundColor Yellow
    & $Action
    if ($LASTEXITCODE -ne 0) {
        Write-Host "失敗：$Label" -ForegroundColor Red
        exit 1
    }
}

Write-Host "==========================================" -ForegroundColor Cyan
Write-Host "  METECH ERP Deploy Script" -ForegroundColor Cyan
Write-Host "==========================================" -ForegroundColor Cyan

# --- 1. 建置前端 -------------------------------------------------------------
Invoke-Step "[1/6] 建置前端 (npm run build)..." { npm run build }

# --- 2. 備份遠端資料庫 -------------------------------------------------------
Write-Host "[2/6] 備份伺服器資料庫..." -ForegroundColor Yellow
$stamp = Get-Date -Format "yyyyMMdd-HHmmss"
$backupCmd = "mkdir -p $RemoteDir/backups && sudo -u postgres pg_dump -F c -d ERP_db -f $RemoteDir/backups/ERP_db-$stamp.backup && ls -lh $RemoteDir/backups/ERP_db-$stamp.backup"
ssh $RemoteHost $backupCmd
if ($LASTEXITCODE -ne 0) {
    Write-Host "資料庫備份失敗，為安全起見中止部署。" -ForegroundColor Red
    exit 1
}

# --- 3. 上傳檔案 -------------------------------------------------------------
# server/ 與 package*.json 為新版必要項目，缺少會導致啟動失敗
Invoke-Step "[3/6] 上傳 dist / database / server / server.js / scripts / package.json..." {
    scp -r dist database server server.js scripts package.json package-lock.json "${RemoteHost}:${RemoteDir}/"
}

# --- 4. 安裝相依套件 ---------------------------------------------------------
# 新版加入 bcryptjs，未安裝會導致伺服器啟動失敗
Invoke-Step "[4/6] 於伺服器安裝相依套件 (npm ci --omit=dev)..." {
    ssh $RemoteHost "cd $RemoteDir && npm ci --omit=dev"
}

# --- 5. 套用資料庫變更 -------------------------------------------------------
# 失敗會以非零代碼結束，本步驟即中止，不會繼續重啟服務
Write-Host "[5/6] 套用資料庫變更 (npm run migrate)..." -ForegroundColor Yellow
ssh $RemoteHost "cd $RemoteDir && npm run migrate"
if ($LASTEXITCODE -ne 0) {
    Write-Host "資料庫變更套用失敗，已中止部署。" -ForegroundColor Red
    Write-Host "服務未重啟，仍為舊版。備份檔：$RemoteDir/backups/ERP_db-$stamp.backup" -ForegroundColor Red
    exit 1
}

# --- 6. 重啟服務 -------------------------------------------------------------
Invoke-Step "[6/6] 重啟服務..." {
    ssh $RemoteHost "pm2 restart all && systemctl reload nginx"
}

Write-Host "==========================================" -ForegroundColor Green
Write-Host "部署完成" -ForegroundColor Green
Write-Host "資料庫備份：$RemoteDir/backups/ERP_db-$stamp.backup" -ForegroundColor Green
Write-Host "==========================================" -ForegroundColor Green
Write-Host ""
Write-Host "提醒：登入機制已變更，所有使用者需重新登入一次。" -ForegroundColor Yellow
