# Teacher Resource Platform Auto-Start Script
# This script starts the server using PM2 after a 60-second delay

param(
    [string]$ProjectPath = $PSScriptRoot
)

Write-Host "Teacher Resource Platform Auto-Start Script" -ForegroundColor Green
Write-Host "Starting server in 60 seconds..." -ForegroundColor Yellow

# Wait for 60 seconds (1 minute)
Start-Sleep -Seconds 60

# Change to the project directory
Set-Location $ProjectPath

Write-Host "Changing to project directory: $ProjectPath" -ForegroundColor Cyan

# Check if PM2 is installed
try {
    $pm2Version = pm2 --version 2>$null
    if ($LASTEXITCODE -ne 0) {
        Write-Host "PM2 is not installed. Please install PM2 first:" -ForegroundColor Red
        Write-Host "npm install -g pm2" -ForegroundColor Yellow
        exit 1
    }
} catch {
    Write-Host "PM2 is not installed. Please install PM2 first:" -ForegroundColor Red
    Write-Host "npm install -g pm2" -ForegroundColor Yellow
    exit 1
}

# Check if the server is already running
$existingProcess = pm2 list | Select-String "teacher-resource-platform"
if ($existingProcess) {
    Write-Host "Server is already running. Restarting..." -ForegroundColor Yellow
    pm2 restart teacher-resource-platform
} else {
    Write-Host "Starting server with PM2..." -ForegroundColor Green
    pm2 start server.js --name "teacher-resource-platform"
}

Write-Host "Server started successfully!" -ForegroundColor Green
Write-Host "You can check the status with: pm2 status" -ForegroundColor Cyan
Write-Host "You can view logs with: pm2 logs teacher-resource-platform" -ForegroundColor Cyan

# Save PM2 configuration to start on boot
pm2 save
pm2 startup 