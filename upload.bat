@echo off
chcp 65001 >nul
echo ==========================================
echo   METECH ERP Deploy Script
echo ==========================================

echo [1/3] Building frontend...
call npm run build
if %ERRORLEVEL% neq 0 (
    echo Build failed!
    pause
    exit /b %ERRORLEVEL%
)

echo [2/3] Uploading dist, database, and server.js via SCP...
scp -r dist database server.js root@192.168.100.249:/opt/erp-management/
if %ERRORLEVEL% neq 0 (
    echo SCP failed!
    pause
    exit /b %ERRORLEVEL%
)

echo [3/3] Running migrations and restarting server...
ssh root@192.168.100.249 "cat /opt/erp-management/database/migration_brand_models_types.sql | sudo -u postgres psql -d ERP_db; cat /opt/erp-management/database/migration_spec_optional.sql | sudo -u postgres psql -d ERP_db; cat /opt/erp-management/database/migration_partners_project_info.sql | sudo -u postgres psql -d ERP_db; cat /opt/erp-management/database/migration_outbound_project_name.sql | sudo -u postgres psql -d ERP_db; pm2 restart all; systemctl reload nginx"
if %ERRORLEVEL% neq 0 (
    echo Remote execution failed!
    pause
    exit /b %ERRORLEVEL%
)

echo ==========================================
echo Deployment completed successfully!
echo ==========================================
pause
