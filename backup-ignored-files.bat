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

:: Important patterns to backup - focus on specific data files
set PATTERNS=*.db *.sqlite *.sqlite3 .env* PBS_passwords.txt Phumdham-pswds.txt

:: Find and copy database files
echo Processing database files...
for %%p in (*.db *.sqlite *.sqlite3) do (
    for /r "%PROJECT_ROOT%" %%f in (%%p) do (
        echo   Backing up: %%~nxf
        copy "%%f" "%BACKUP_DIR%\%BACKUP_NAME%\"
    )
)

:: Find and copy environment files
echo Processing environment files...
for /r "%PROJECT_ROOT%" %%f in (.env*) do (
    echo   Backing up: %%~nxf
    copy "%%f" "%BACKUP_DIR%\%BACKUP_NAME%\"
)

:: Find and copy password files
echo Processing password files...
for /r "%PROJECT_ROOT%" %%f in (PBS_passwords.txt Phumdham-pswds.txt) do (
    if exist "%%f" (
        echo   Backing up: %%~nxf
        copy "%%f" "%BACKUP_DIR%\%BACKUP_NAME%\"
    )
)

:: Back up portfolio data if it exists
echo Processing portfolio data...
if exist "%PROJECT_ROOT%\portfolios\data temp" (
    echo   Backing up: portfolios\data temp
    if not exist "%BACKUP_DIR%\%BACKUP_NAME%\portfolios\data temp" mkdir "%BACKUP_DIR%\%BACKUP_NAME%\portfolios\data temp"
    xcopy "%PROJECT_ROOT%\portfolios\data temp\*" "%BACKUP_DIR%\%BACKUP_NAME%\portfolios\data temp\" /E /Y /Q
)

:: Create zip archive using PowerShell (available in modern Windows)
echo Creating zip archive...
powershell -Command "Compress-Archive -Path '%BACKUP_DIR%\%BACKUP_NAME%' -DestinationPath '%BACKUP_DIR%\%BACKUP_NAME%.zip' -Force"

:: Remove the temporary directory
rd /s /q "%BACKUP_DIR%\%BACKUP_NAME%"

echo Backup completed: %BACKUP_DIR%\%BACKUP_NAME%.zip

:: Get file size using PowerShell
for /f "tokens=*" %%a in ('powershell -Command "(Get-Item '%BACKUP_DIR%\%BACKUP_NAME%.zip').length / 1MB"') do set size=%%a
echo Total size: %size% MB

endlocal 