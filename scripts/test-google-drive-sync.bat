@echo off
REM Simple test script to verify Google Drive sync works

echo 🧪 Testing Google Drive Sync
echo ==============================
echo.

REM Set paths
set "GOOGLE_DRIVE_PATH=G:\My Drive\PBS-LMS-Backups"
set "LOCAL_BACKUP_PATH=%~dp0..\backups"

echo 📍 Testing paths:
echo   Local backups: "%LOCAL_BACKUP_PATH%"
echo   Google Drive:  "%GOOGLE_DRIVE_PATH%"
echo.

REM Test 1: Check if Google Drive exists
echo 🔍 Test 1: Checking Google Drive access...
if exist "%GOOGLE_DRIVE_PATH%" (
    echo ✅ Google Drive path found
    dir "%GOOGLE_DRIVE_PATH%" /b
) else (
    echo ❌ Google Drive path not found
    echo.
    echo Available drives:
    wmic logicaldisk get size,freespace,caption
    goto :end
)
echo.

REM Test 2: Check if local backups exist
echo 🔍 Test 2: Checking local backups...
if exist "%LOCAL_BACKUP_PATH%" (
    echo ✅ Local backup path found
    dir "%LOCAL_BACKUP_PATH%" /b
) else (
    echo ❌ Local backup path not found
    goto :end
)
echo.

REM Test 3: Check if complete backups exist
echo 🔍 Test 3: Checking for complete backups...
if exist "%LOCAL_BACKUP_PATH%\complete" (
    echo ✅ Complete backup folder found
    dir "%LOCAL_BACKUP_PATH%\complete" /b
    
    REM Test copy of one backup if it exists
    for /d %%i in ("%LOCAL_BACKUP_PATH%\complete\complete-backup-*") do (
        echo.
        echo 🧪 Test 4: Testing copy of backup...
        echo Source: "%%i"
        echo Target: "%GOOGLE_DRIVE_PATH%\complete\"
        
        if not exist "%GOOGLE_DRIVE_PATH%\complete" (
            echo Creating complete folder in Google Drive...
            mkdir "%GOOGLE_DRIVE_PATH%\complete"
        )
        
        echo Copying backup folder... (this may take a few minutes)
        robocopy "%%i" "%GOOGLE_DRIVE_PATH%\complete\%%~ni" /E /R:3 /W:5
        
        if %ERRORLEVEL% LSS 8 (
            echo ✅ Test copy successful!
            echo 📁 Backup copied to Google Drive
        ) else (
            echo ❌ Test copy failed with error level %ERRORLEVEL%
        )
        goto :test_done
    )
    
    echo ⚠️  No complete backups found to test
) else (
    echo ❌ Complete backup folder not found
)
echo.

:test_done
echo.
echo 🎯 Test completed!
echo If successful, your backup should now be visible in:
echo Google Drive ^> PBS-LMS-Backups ^> complete ^> [backup-folder]
echo.

:end
pause
