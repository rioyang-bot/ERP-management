@echo off
chcp 65001 >nul
echo ========================================================
echo   ⚠️ METECH ERP - 清除遠端 (192.168.100.249) 所有耗材資料
echo ========================================================
echo.
echo 此操作將刪除遠端資料庫中所有的「耗材」品項、庫存及借用紀錄！
echo （「設備」與「硬體」資料完全受保護，不受影響）
echo.
set /p CONFIRM="確定要執行清除嗎？請輸入 YES 後按 Enter: "
if /i not "%CONFIRM%"=="YES" (
    echo 操作已取消。
    pause
    exit /b 0
)

echo.
echo [1/2] 上傳 delete_all_consumables.sql 到伺服器...
scp database/delete_all_consumables.sql root@192.168.100.249:/opt/erp-management/database/
if %ERRORLEVEL% neq 0 (
    echo 上傳失敗，請檢查密碼與連線！
    pause
    exit /b %ERRORLEVEL%
)

echo.
echo [2/2] 於遠端伺服器執行資料庫清除...
ssh root@192.168.100.249 "cat /opt/erp-management/database/delete_all_consumables.sql | sudo -u postgres psql -d ERP_db; pm2 restart all"
if %ERRORLEVEL% neq 0 (
    echo 執行失敗！
    pause
    exit /b %ERRORLEVEL%
)

echo.
echo ========================================================
echo   ✅ 遠端耗材資料清除完成！
echo ========================================================
pause
