# Backup and Restore Guide

This guide explains how to use the backup and restore scripts to preserve and restore your important data files that aren't tracked by Git.

## Files Included

- `backup-ignored-files.bat` - Windows batch script to backup files ignored by Git
- `backup-ignored-files.sh` - Bash script version for Git Bash or Linux/macOS
- `restore-backup.bat` - Windows script to restore files from a backup

## What Gets Backed Up

These scripts specifically back up files listed in your `.gitignore` that contain important data:

- Database files (*.db, *.sqlite, *.sqlite3) **with their full directory structure**
- Environment files (.env*)
- Password files (PBS_passwords.txt, Phumdham-pswds.txt)
- Portfolio data in "portfolios/data temp/"
- Any other files specified in the backup patterns

The scripts will search your entire project directory recursively to find these files, so database files will be found no matter where they are located in your project.

## Backup Instructions

### Using the Windows Batch Script

1. Place `backup-ignored-files.bat` in the root of your project directory
2. Double-click the file or run it from Command Prompt
3. The script will create a timestamped backup in a `backups` folder
4. At the end of the backup, the script will display a list of database files that were backed up

### Using the Bash Script

1. Place `backup-ignored-files.sh` in the root of your project directory
2. Make it executable: `chmod +x backup-ignored-files.sh`
3. Run it: `./backup-ignored-files.sh`
4. The script will create a timestamped backup in a `backups` folder
5. At the end of the backup, the script will display a list of database files that were backed up

## Checking Backup Contents

Each backup contains a `backup-manifest.txt` file that lists all files included in the backup. You can view this file after extracting the backup ZIP to verify that all expected files were properly backed up.

## Restore Instructions

### Restoring Files on a New Computer

1. Set up the new computer:
   - Clone or copy your Git repository to the new computer
   - Place `restore-backup.bat` at the root of the project
   - Create a `backups` folder at the root
   - Copy your backup ZIP file(s) to the `backups` folder

2. Run the restore script:
   - Double-click `restore-backup.bat` or run it from Command Prompt
   - It will show a list of available backups
   - Select a backup by typing its name, or press Enter to use the most recent one
   - Confirm the restore operation when prompted

3. The script will:
   - Extract the backup
   - Restore all files to their original locations, maintaining the directory structure
   - Clean up temporary files

## Transfer Process (Complete Steps)

1. **On the original computer:**
   - Run `backup-ignored-files.bat` to create a backup
   - Locate the created backup ZIP file in the `backups` folder
   - Verify the list of database files shown at the end of the backup process

2. **Transfer files to the new computer:**
   - Copy or clone your Git repository to the new computer
   - Copy these files to the new computer:
     - `backup-ignored-files.bat` (for future backups)
     - `restore-backup.bat` (for restoration)
     - The backup ZIP file from your `backups` folder
     - This guide file (BACKUP-RESTORE-GUIDE.md)

3. **On the new computer:**
   - Make sure the files are placed properly:
     - All scripts and the backup file should be at the root of the project
     - The backup ZIP should be in a `backups` folder
   - Run `restore-backup.bat`
   - Follow the prompts to restore your data

4. **After restoration:**
   - Your database and configuration files should be restored to their original locations
   - Start your application normally
   - Verify everything works as expected

## Troubleshooting

### Common Issues

1. **"ERROR: Backup directory not found"**
   - Make sure you have a folder named `backups` in the same directory as the script
   - Make sure the script is located at the root of your project

2. **"ERROR: Backup file not found"**
   - Check if the backup file exists in the `backups` folder
   - Verify the backup file name matches exactly

3. **"ERROR: Could not find backup contents"**
   - The backup ZIP may be corrupted or have an unexpected structure
   - Try creating a new backup on the original system

4. **"WARNING: No database files found"**
   - If you see this warning during backup, check if your database files exist
   - Make sure they have the expected extensions (.db, .sqlite, or .sqlite3)
   - You may need to modify the script if your database uses a different extension

5. **Application still doesn't work after restore**
   - Check if the database files were properly restored by looking in the expected directories
   - Verify that environment files (.env) contain the correct configuration
   - Ensure all paths in the configuration files match the new system

## Scheduled Backups

To set up automatic backups on Windows:

1. Open Task Scheduler
2. Create a new Basic Task
3. Name it "Project Backup" and set a trigger (e.g., Daily or Weekly)
4. Select "Start a program" as the action
5. Browse to and select your `backup-ignored-files.bat` file
6. Set the "Start in" field to your project directory path
7. Finish the wizard 