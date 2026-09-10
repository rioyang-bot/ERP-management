# METECH ERP Deploy Script
$ErrorActionPreference = "Stop"

Write-Host "==========================================" -ForegroundColor Cyan
Write-Host "  METECH ERP Deploy Script" -ForegroundColor Cyan
Write-Host "==========================================" -ForegroundColor Cyan

# 1. Build
Write-Host "[1/3] Building frontend (npm run build)..." -ForegroundColor Yellow
npm run build
if ($LASTEXITCODE -ne 0) {
    Write-Host "Build failed!" -ForegroundColor Red
    exit 1
}

# 2. SCP
Write-Host "[2/3] Uploading dist, database, and server.js to server (192.168.100.249)..." -ForegroundColor Yellow
scp -r dist database server.js root@192.168.100.249:/opt/erp-management/
if ($LASTEXITCODE -ne 0) {
    Write-Host "SCP transfer failed!" -ForegroundColor Red
    exit 1
}

# 3. Remote Execute
Write-Host "[3/3] Running migrations and restarting services on server..." -ForegroundColor Yellow
$remoteCmd = 'cat /opt/erp-management/database/migration_brand_models_types.sql | sudo -u postgres psql -d ERP_db; cat /opt/erp-management/database/migration_spec_optional.sql | sudo -u postgres psql -d ERP_db; cat /opt/erp-management/database/migration_partners_project_info.sql | sudo -u postgres psql -d ERP_db; cat /opt/erp-management/database/migration_outbound_project_name.sql | sudo -u postgres psql -d ERP_db; cat /opt/erp-management/database/migration_add_end_user.sql | sudo -u postgres psql -d ERP_db; cat /opt/erp-management/database/migration_inbound_history.sql | sudo -u postgres psql -d ERP_db; cat /opt/erp-management/database/migration_outbound_items_columns.sql | sudo -u postgres psql -d ERP_db; cat /opt/erp-management/database/migration_asset_shipping_date.sql | sudo -u postgres psql -d ERP_db; cat /opt/erp-management/database/update_consumable_brand_metech.sql | sudo -u postgres psql -d ERP_db; pm2 restart all; systemctl reload nginx'
ssh root@192.168.100.249 $remoteCmd
if ($LASTEXITCODE -ne 0) {
    Write-Host "Remote commands failed!" -ForegroundColor Red
    exit 1
}

Write-Host "==========================================" -ForegroundColor Green
Write-Host "Deployment completed successfully!" -ForegroundColor Green
Write-Host "==========================================" -ForegroundColor Green
