# Local Production Deployment Guide

## Overview
This guide explains how to set up a permanent local production version of the Teacher Resource Project. This setup is ideal for:
- Schools or institutions that want to host the application on their own servers
- Environments with limited or no internet connectivity
- Organizations that require complete control over their data
- Situations where cloud hosting is not preferred

## Prerequisites

### Hardware Requirements
- A dedicated computer or server with:
  - Minimum 4GB RAM
  - 100GB storage (more if storing many resources)
  - Stable power supply
  - Network connectivity (for local network access)

### Software Requirements
- Windows 10/11 or Linux server
- Node.js (v18 or later)
- SQLite (included with Node.js)
- A modern web browser
- (Optional) A backup solution

## Installation Steps

### 1. Prepare the Server
1. Create a dedicated directory for the application:
   ```bash
   mkdir C:\TeacherResource
   cd C:\TeacherResource
   ```

2. Install Node.js if not already installed:
   - Download from https://nodejs.org/
   - Choose the LTS version
   - Run the installer with default settings

### 2. Set Up the Application
1. Copy the application files to the server:
   ```bash
   # Copy all project files to C:\TeacherResource
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Initialize the database:
   ```bash
   npm run prisma:generate
   npm run prisma:migrate
   ```

### 3. Configuration
1. Create a production configuration file:
   ```bash
   copy config\local.js config\production.js
   ```

2. Edit `config/production.js`:
   ```javascript
   module.exports = {
       database: {
           provider: 'sqlite',
           url: 'file:C:/TeacherResource/data/production.db',
       },
       fileStorage: {
           type: 'local',
           uploadDir: 'C:/TeacherResource/uploads',
       },
       server: {
           port: 3000,
           host: '0.0.0.0', // Allow access from other computers
       },
       security: {
           jwtSecret: 'your-secure-production-secret',
       },
       environment: 'production',
       logging: {
           level: 'info',
           file: 'C:/TeacherResource/logs/production.log'
       }
   };
   ```

3. Create necessary directories:
   ```bash
   mkdir C:\TeacherResource\data
   mkdir C:\TeacherResource\uploads
   mkdir C:\TeacherResource\logs
   ```

### 4. Create Startup Script
1. Create `start-production.bat`:
   ```batch
   @echo off
   cd C:\TeacherResource
   node scripts\start-local.js
   ```

2. Create a Windows Service (Optional):
   - Use NSSM (Non-Sucking Service Manager)
   - Download from https://nssm.cc/
   - Install the service:
     ```bash
     nssm install TeacherResource "C:\TeacherResource\start-production.bat"
     nssm set TeacherResource AppDirectory "C:\TeacherResource"
     nssm set TeacherResource DisplayName "Teacher Resource Platform"
     nssm set TeacherResource Description "Local Teacher Resource Management System"
     ```

### 5. Security Configuration
1. Set up Windows Firewall:
   - Allow incoming connections on port 3000
   - Restrict access to local network only

2. Configure user permissions:
   - Create a dedicated service account
   - Set appropriate file permissions for the application directory

### 6. Backup Configuration
1. Create a backup script `backup.bat`:
   ```batch
   @echo off
   set BACKUP_DIR=C:\TeacherResource\backups
   set DATE=%date:~-4,4%%date:~-7,2%%date:~-10,2%
   
   mkdir %BACKUP_DIR%\%DATE%
   xcopy /E /I /Y C:\TeacherResource\data %BACKUP_DIR%\%DATE%\data
   xcopy /E /I /Y C:\TeacherResource\uploads %BACKUP_DIR%\%DATE%\uploads
   ```

2. Schedule regular backups:
   - Use Windows Task Scheduler
   - Run backup script daily
   - Keep backups for 30 days

## Maintenance

### Regular Tasks
1. Database Maintenance:
   ```bash
   # Run monthly
   npm run prisma:migrate
   ```

2. Log Rotation:
   - Configure log rotation in `config/production.js`
   - Keep logs for 30 days

3. Backup Verification:
   - Monthly verification of backup integrity
   - Test restore procedure annually

### Updates
1. Create update script `update.bat`:
   ```batch
   @echo off
   cd C:\TeacherResource
   git pull
   npm install
   npm run prisma:generate
   npm run prisma:migrate
   ```

2. Test updates in a staging environment before applying to production

## Troubleshooting

### Common Issues
1. **Service Won't Start**
   - Check logs in `C:\TeacherResource\logs`
   - Verify port 3000 is not in use
   - Check file permissions

2. **Database Issues**
   - Verify database file exists
   - Check disk space
   - Run database integrity check

3. **File Upload Problems**
   - Check disk space
   - Verify upload directory permissions
   - Check file size limits

### Recovery Procedures
1. **Database Recovery**
   ```bash
   # Stop the service
   nssm stop TeacherResource
   
   # Restore from backup
   copy C:\TeacherResource\backups\[DATE]\data\* C:\TeacherResource\data\
   
   # Start the service
   nssm start TeacherResource
   ```

2. **File System Recovery**
   - Restore from backup
   - Verify file permissions
   - Check disk integrity

## Support
For local support:
1. Document all custom configurations
2. Maintain a list of local administrators
3. Keep contact information for technical support
4. Document all custom scripts and procedures

## Security Considerations
1. Regular password changes for admin accounts
2. Monitor access logs
3. Regular security updates
4. Physical security of the server
5. Network isolation if possible

## Performance Optimization
1. Regular database maintenance
2. Monitor disk space
3. Optimize file storage
4. Regular cleanup of temporary files
5. Monitor system resources

## Documentation
Maintain the following documentation:
1. Installation guide
2. Configuration details
3. Backup procedures
4. Recovery procedures
5. User manual
6. Administrator guide 