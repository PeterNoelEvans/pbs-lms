@echo off
echo Setting up Teacher Resource Platform Auto-Start...
echo This will create a Windows Task Scheduler task to start your server automatically.

REM Get the current directory
set "PROJECT_PATH=%~dp0"
set "PROJECT_PATH=%PROJECT_PATH:~0,-1%"

echo Project path: %PROJECT_PATH%

REM Create the task
echo Creating Windows Task Scheduler task...
schtasks /create /tn "TeacherResourcePlatform" /tr "powershell.exe -ExecutionPolicy Bypass -File \"%PROJECT_PATH%\startup-script.ps1\" -ProjectPath \"%PROJECT_PATH%\"" /sc onstart /delay 0001:00 /ru "SYSTEM" /f

if %ERRORLEVEL% EQU 0 (
    echo.
    echo SUCCESS! Auto-start task has been created.
    echo.
    echo The server will now start automatically 1 minute after your computer boots.
    echo.
    echo To manage the task:
    echo - View task: schtasks /query /tn "TeacherResourcePlatform"
    echo - Delete task: schtasks /delete /tn "TeacherResourcePlatform" /f
    echo - Run task now: schtasks /run /tn "TeacherResourcePlatform"
    echo.
    echo To check if PM2 is installed globally, run: npm list -g pm2
    echo If PM2 is not installed, run: npm install -g pm2
) else (
    echo.
    echo ERROR: Failed to create the task.
    echo You may need to run this script as Administrator.
    echo Right-click on this file and select "Run as administrator"
)

pause 