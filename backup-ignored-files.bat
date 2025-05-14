@echo off
setlocal enabledelayedexpansion

:: Backup script for files ignored by git
:: This script backs up files that are in .gitignore but should be preserved

:: Configuration
set BACKUP_DIR=backups
set TIMESTAMP=%date:~10,4%%date:~4,2%%date:~7,2%-%time:~0,2%%time:~3,2%%time:~6,2%
set TIMESTAMP=%TIMESTAMP: =0%
set BACKUP_NAME=backup-%TIMESTAMP%
set PROJECT_ROOT=%cd%

:: Create backup directory if it doesn't exist
if not exist "%BACKUP_DIR%" mkdir "%BACKUP_DIR%"
if not exist "%BACKUP_DIR%\%BACKUP_NAME%" mkdir "%BACKUP_DIR%\%BACKUP_NAME%"

echo Starting backup of git-ignored files...
echo Backup location: %BACKUP_DIR%\%BACKUP_NAME%

:: Process important files to back up
echo Looking for critical data files...

:: Database files - IMPROVED: Preserve directory structure
echo Processing database files throughout the project...
for /r "%PROJECT_ROOT%" %%f in (*.db *.sqlite *.sqlite3) do (
    set "REL_PATH=%%f"
    set "REL_PATH=!REL_PATH:%PROJECT_ROOT%\=!"
    set "TARGET_DIR=%BACKUP_DIR%\%BACKUP_NAME%\!REL_PATH:%%~nxf=!"
    if not exist "!TARGET_DIR!" mkdir "!TARGET_DIR!" 2>nul
    echo   Backing up: !REL_PATH!
    copy "%%f" "!TARGET_DIR!" /Y
)

:: Environment files - IMPROVED: Preserve directory structure
echo Processing environment files...
for /r "%PROJECT_ROOT%" %%f in (.env*) do (
    set "REL_PATH=%%f"
    set "REL_PATH=!REL_PATH:%PROJECT_ROOT%\=!"
    set "TARGET_DIR=%BACKUP_DIR%\%BACKUP_NAME%\!REL_PATH:%%~nxf=!"
    if not exist "!TARGET_DIR!" mkdir "!TARGET_DIR!" 2>nul
    echo   Backing up: !REL_PATH!
    copy "%%f" "!TARGET_DIR!" /Y
)

:: Password files - IMPROVED: Preserve directory structure
echo Processing password files...
for /r "%PROJECT_ROOT%" %%f in (PBS_passwords.txt Phumdham-pswds.txt) do (
    if exist "%%f" (
        set "REL_PATH=%%f"
        set "REL_PATH=!REL_PATH:%PROJECT_ROOT%\=!"
        set "TARGET_DIR=%BACKUP_DIR%\%BACKUP_NAME%\!REL_PATH:%%~nxf=!"
        if not exist "!TARGET_DIR!" mkdir "!TARGET_DIR!" 2>nul
        echo   Backing up: !REL_PATH!
        copy "%%f" "!TARGET_DIR!" /Y
    )
)

:: Back up portfolio data if it exists
echo Processing portfolio data...
if exist "%PROJECT_ROOT%\portfolios\data temp" (
    echo   Backing up: portfolios\data temp
    if not exist "%BACKUP_DIR%\%BACKUP_NAME%\portfolios\data temp" mkdir "%BACKUP_DIR%\%BACKUP_NAME%\portfolios\data temp"
    xcopy "%PROJECT_ROOT%\portfolios\data temp\*" "%BACKUP_DIR%\%BACKUP_NAME%\portfolios\data temp\" /E /Y /Q
)

:: Add a list of what was backed up
echo Creating backup manifest...
echo Backup created on %date% at %time% > "%BACKUP_DIR%\%BACKUP_NAME%\backup-manifest.txt"
echo. >> "%BACKUP_DIR%\%BACKUP_NAME%\backup-manifest.txt"
echo Files included: >> "%BACKUP_DIR%\%BACKUP_NAME%\backup-manifest.txt"
dir "%BACKUP_DIR%\%BACKUP_NAME%" /s /b | findstr /v "backup-manifest.txt" >> "%BACKUP_DIR%\%BACKUP_NAME%\backup-manifest.txt"

:: Create zip archive using PowerShell (available in modern Windows)
echo Creating zip archive...
powershell -Command "Compress-Archive -Path '%BACKUP_DIR%\%BACKUP_NAME%' -DestinationPath '%BACKUP_DIR%\%BACKUP_NAME%.zip' -Force"

:: Remove the temporary directory
rd /s /q "%BACKUP_DIR%\%BACKUP_NAME%"

echo Backup completed: %BACKUP_DIR%\%BACKUP_NAME%.zip

:: Get file size using PowerShell
for /f "tokens=*" %%a in ('powershell -Command "(Get-Item '%BACKUP_DIR%\%BACKUP_NAME%.zip').length / 1MB"') do set size=%%a
echo Total size: %size% MB

echo.
echo Database files backed up: 
for /r "%PROJECT_ROOT%" %%f in (*.db *.sqlite *.sqlite3) do (
    echo   - %%~nxf
)

endlocal 