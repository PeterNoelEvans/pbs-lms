# Teacher Resource Platform Auto-Start Setup

This guide will help you set up your Teacher Resource Platform to start automatically one minute after your computer boots.

## Prerequisites

1. **PM2 must be installed globally:**
   ```bash
   npm install -g pm2
   ```

2. **Node.js and npm must be installed and working**

## Setup Options

### Option 1: Automatic Setup (Recommended)

1. **Run the setup script as Administrator:**
   - Right-click on `setup-auto-start.bat`
   - Select "Run as administrator"
   - Follow the prompts

This will create a Windows Task Scheduler task that runs automatically on startup.

### Option 2: Manual Setup

If the automatic setup doesn't work, you can set it up manually:

1. **Open Task Scheduler:**
   - Press `Win + R`
   - Type `taskschd.msc`
   - Press Enter

2. **Create a new task:**
   - Click "Create Basic Task" in the right panel
   - Name: `TeacherResourcePlatform`
   - Trigger: "When the computer starts"
   - Action: "Start a program"
   - Program: `powershell.exe`
   - Arguments: `-ExecutionPolicy Bypass -File "C:\path\to\your\project\startup-script.ps1" -ProjectPath "C:\path\to\your\project"`

3. **Set the delay:**
   - After creating the task, right-click it and select "Properties"
   - Go to the "Triggers" tab
   - Edit the trigger and check "Delay task for: 1 minute"

## Available Scripts

### `startup-script.ps1`
- PowerShell script that starts the server with PM2
- Includes error checking and logging
- Automatically saves PM2 configuration

### `startup-script.bat`
- Simple batch file version
- Good for manual testing

### `setup-auto-start.bat`
- Automatically creates the Windows Task Scheduler task
- Must be run as Administrator

## Managing the Auto-Start

### Check if the task exists:
```cmd
schtasks /query /tn "TeacherResourcePlatform"
```

### Delete the task:
```cmd
schtasks /delete /tn "TeacherResourcePlatform" /f
```

### Run the task manually:
```cmd
schtasks /run /tn "TeacherResourcePlatform"
```

### Check PM2 status:
```cmd
pm2 status
pm2 logs teacher-resource-platform
```

## Troubleshooting

### If the server doesn't start:

1. **Check if PM2 is installed:**
   ```cmd
   npm list -g pm2
   ```

2. **Check the task in Task Scheduler:**
   - Open Task Scheduler
   - Look for "TeacherResourcePlatform" task
   - Check the "Last Run Result" column

3. **Run the script manually to test:**
   ```cmd
   powershell.exe -ExecutionPolicy Bypass -File "startup-script.ps1"
   ```

4. **Check Windows Event Viewer:**
   - Press `Win + R`
   - Type `eventvwr.msc`
   - Look under "Windows Logs" > "Application" for errors

### If you get permission errors:

- Make sure you're running the setup script as Administrator
- Check that your user account has permission to create scheduled tasks

## Notes

- The server will start 1 minute after boot to allow other services to initialize first
- PM2 will automatically restart the server if it crashes
- The task runs under the SYSTEM account for maximum compatibility
- You can modify the delay by editing the task in Task Scheduler

## Manual PM2 Setup (Alternative)

If you prefer to use PM2's built-in startup feature:

1. **Start your server with PM2:**
   ```cmd
   pm2 start server.js --name "teacher-resource-platform"
   ```

2. **Save the PM2 configuration:**
   ```cmd
   pm2 save
   ```

3. **Generate startup script:**
   ```cmd
   pm2 startup
   ```

4. **Follow the instructions provided by PM2**

This method is simpler but doesn't include the 1-minute delay you requested. 