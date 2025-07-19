@echo off
echo Starting Teacher Resource Platform in 60 seconds...
echo This script will start the server using PM2 after a 60-second delay.

REM Wait for 60 seconds (1 minute)
timeout /t 60 /nobreak > nul

REM Change to the project directory
cd /d "%~dp0"

REM Start the server using PM2
echo Starting server with PM2...
pm2 start server.js --name "teacher-resource-platform"

echo Server started successfully!
echo You can check the status with: pm2 status
echo You can view logs with: pm2 logs teacher-resource-platform
pause 