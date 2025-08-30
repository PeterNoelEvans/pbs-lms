@echo off
setlocal enabledelayedexpansion

:: Restore script for files backed up from git-ignored files
:: This script restores files from a backup to their original locations

:: Configuration
set BACKUP_DIR=backups
set PROJECT_ROOT=%cd%
set TEMP_DIR=%PROJECT_ROOT%\%BACKUP_DIR%\temp_restore

echo Restore Backup Files to Project
echo -------------------------------

:: Check if backups directory exists
if not exist "%BACKUP_DIR%" (
    echo ERROR: Backup directory not found at %BACKUP_DIR%
    echo Please place this script in the root of your project directory where the 'backups' folder is located.
    exit /b 1
)

:: List available backups
echo Available backups:
dir /b "%BACKUP_DIR%\backup-*.zip" 2>nul
echo.

:: Ask which backup to restore
set /p BACKUP_FILE="Enter backup filename to restore (or press Enter for latest): "

:: If no input, find the latest backup
if "%BACKUP_FILE%"=="" (
    for /f "delims=" %%f in ('dir /b /o-d "%BACKUP_DIR%\backup-*.zip" 2^>nul') do (
        set "BACKUP_FILE=%%f"
        goto :found_latest
    )
    :found_latest
)

:: Check if the backup file exists
if not exist "%BACKUP_DIR%\%BACKUP_FILE%" (
    echo ERROR: Backup file %BACKUP_DIR%\%BACKUP_FILE% not found.
    exit /b 1
)

echo.
echo Will restore from: %BACKUP_DIR%\%BACKUP_FILE%
echo This will overwrite any existing files with the same names.
set /p CONFIRM="Continue? (Y/N): "
if /i not "%CONFIRM%"=="Y" (
    echo Restore cancelled.
    exit /b 0
)

echo.
echo Starting restore process...

:: Create temp directory for extraction
if exist "%TEMP_DIR%" rd /s /q "%TEMP_DIR%"
mkdir "%TEMP_DIR%"

:: Extract the backup
echo Extracting backup...
powershell -Command "Expand-Archive -Path '%BACKUP_DIR%\%BACKUP_FILE%' -DestinationPath '%TEMP_DIR%' -Force"

:: Find the backup folder inside temp directory (should be backup-YYYYMMDD-HHMMSS)
for /f "delims=" %%d in ('dir /b /ad "%TEMP_DIR%" 2^>nul') do (
    set "BACKUP_CONTENTS=%%d"
)

if not defined BACKUP_CONTENTS (
    echo ERROR: Could not find backup contents in extracted archive.
    goto :cleanup
)

:: Begin restoring files
echo.
echo Restoring files to their original locations...

:: Database files
echo Restoring database files...
for %%p in (*.db *.sqlite *.sqlite3) do (
    if exist "%TEMP_DIR%\%BACKUP_CONTENTS%\%%p" (
        echo   Restoring: %%p
        copy "%TEMP_DIR%\%BACKUP_CONTENTS%\%%p" "%PROJECT_ROOT%\" /Y
    )
)

:: Environment files
echo Restoring environment files...
for %%p in (.env*) do (
    if exist "%TEMP_DIR%\%BACKUP_CONTENTS%\%%p" (
        echo   Restoring: %%p
        copy "%TEMP_DIR%\%BACKUP_CONTENTS%\%%p" "%PROJECT_ROOT%\" /Y
    )
)

:: Password files
echo Restoring password files...
for %%p in (PBS_passwords.txt Phumdham-pswds.txt) do (
    if exist "%TEMP_DIR%\%BACKUP_CONTENTS%\%%p" (
        echo   Restoring: %%p
        copy "%TEMP_DIR%\%BACKUP_CONTENTS%\%%p" "%PROJECT_ROOT%\" /Y
    )
)

:: Restore files with directory structure
echo Restoring directory structures...

:: portfolios/data temp directory
if exist "%TEMP_DIR%\%BACKUP_CONTENTS%\portfolios\data temp" (
    echo   Restoring: portfolios\data temp
    if not exist "%PROJECT_ROOT%\portfolios\data temp" mkdir "%PROJECT_ROOT%\portfolios\data temp"
    xcopy "%TEMP_DIR%\%BACKUP_CONTENTS%\portfolios\data temp\*" "%PROJECT_ROOT%\portfolios\data temp\" /E /Y /Q
)

:: Check for any other directories we might have backed up
for /d %%d in ("%TEMP_DIR%\%BACKUP_CONTENTS%\*") do (
    set "DIR_NAME=%%~nxd"
    if not "!DIR_NAME!"=="portfolios" (
        if exist "%%d" (
            echo   Restoring directory: !DIR_NAME!
            if not exist "%PROJECT_ROOT%\!DIR_NAME!" mkdir "%PROJECT_ROOT%\!DIR_NAME!"
            xcopy "%%d\*" "%PROJECT_ROOT%\!DIR_NAME!\" /E /Y /Q
        )
    )
)

echo.
echo Restore completed successfully!

:cleanup
:: Clean up temporary directory
echo Cleaning up temporary files...
rd /s /q "%TEMP_DIR%"

echo.
echo Restore process finished.
endlocal 