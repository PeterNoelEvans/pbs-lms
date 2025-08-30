@echo off
REM Simple Google Drive Sync for PBS LMS Backups

echo 🚀 PBS LMS Backup Sync to Google Drive
echo ========================================
echo.

REM Set paths
set "GOOGLE_DRIVE=G:\My Drive\PBS-LMS-Backups"
set "LOCAL_BACKUPS=%~dp0..\backups"

echo 📍 Syncing from: "%LOCAL_BACKUPS%"
echo 📍 Syncing to:   "%GOOGLE_DRIVE%"
echo.

REM Check if paths exist
if not exist "%GOOGLE_DRIVE%" (
    echo ❌ Google Drive path not found: "%GOOGLE_DRIVE%"
    echo Please check your Google Drive installation.
    pause
    exit /b 1
)

if not exist "%LOCAL_BACKUPS%" (
    echo ❌ Local backup path not found: "%LOCAL_BACKUPS%"
    echo Please create a backup first using the LMS dashboard.
    pause
    exit /b 1
)

echo ✅ Both paths verified
echo.

REM Sync complete backups
echo 🗂️  Syncing complete backups...
if exist "%LOCAL_BACKUPS%\complete" (
    if not exist "%GOOGLE_DRIVE%\complete" mkdir "%GOOGLE_DRIVE%\complete"
    
    REM Count backups to sync
    set backup_count=0
    for /d %%i in ("%LOCAL_BACKUPS%\complete\complete-backup-*") do (
        set /a backup_count+=1
        echo Syncing: %%~ni
        robocopy "%%i" "%GOOGLE_DRIVE%\complete\%%~ni" /MIR /R:2 /W:3 /NFL /NDL /NJH
        
        if !ERRORLEVEL! LSS 8 (
            echo ✅ Synced: %%~ni
        ) else (
            echo ❌ Failed: %%~ni ^(Error: !ERRORLEVEL!^)
        )
    )
    
    echo.
    echo ✅ Complete backups synced: !backup_count!
) else (
    echo ⚠️  No complete backups found
)

REM Sync database backups
echo.
echo 🗄️  Syncing database backups...
if exist "%LOCAL_BACKUPS%\database" (
    if not exist "%GOOGLE_DRIVE%\database" mkdir "%GOOGLE_DRIVE%\database"
    robocopy "%LOCAL_BACKUPS%\database" "%GOOGLE_DRIVE%\database" /MIR /R:2 /W:3 /NFL /NDL /NJH
    
    if %ERRORLEVEL% LSS 8 (
        echo ✅ Database backups synced
    ) else (
        echo ❌ Database backup sync failed ^(Error: %ERRORLEVEL%^)
    )
) else (
    echo ⚠️  No database backups found
)

REM Create sync summary
echo.
echo 📝 Creating sync summary...
echo Backup Sync Summary > "%GOOGLE_DRIVE%\last-sync.txt"
echo =================== >> "%GOOGLE_DRIVE%\last-sync.txt"
echo Sync Date: %date% %time% >> "%GOOGLE_DRIVE%\last-sync.txt"
echo Source: %LOCAL_BACKUPS% >> "%GOOGLE_DRIVE%\last-sync.txt"
echo Target: %GOOGLE_DRIVE% >> "%GOOGLE_DRIVE%\last-sync.txt"
echo. >> "%GOOGLE_DRIVE%\last-sync.txt"

REM Show Google Drive contents
echo.
echo 📁 Google Drive contents after sync:
dir "%GOOGLE_DRIVE%" /b
echo.

echo 🎉 Sync completed successfully!
echo.
echo 📍 Your backups are now available at:
echo    G:\My Drive\PBS-LMS-Backups\
echo.
echo 🌐 They will automatically sync to Google Drive cloud.
echo.

pause
