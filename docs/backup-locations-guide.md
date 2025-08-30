# Backup Locations & Strategy Guide

## 📍 Current Backup Locations

### Local Backups (Primary)
**Location:** `O:\2025\LMS-weekend05172025\Peter-s-Teacher-Resource-Project\backups\database\`

**Structure:**
```
backups/
└── database/
    └── backup-2025-08-09T05-07-03-005Z/
        ├── dev.db (2.9MB)           # Your SQLite database
        ├── backup-metadata.json     # Database statistics
        ├── checksum.txt            # Integrity verification
        └── schema.prisma           # Prisma schema
```

**Purpose:** Fast local recovery, daily operations

## ☁️ Recommended Cloud Backup Strategy

### Google Drive Setup (Recommended)
1. **Create folder structure in Google Drive:**
   ```
   Google Drive/
   └── PBS-LMS-Backups/
       ├── database/           # Database backups
       ├── uploads/           # Recent uploaded files
       ├── config/            # Configuration files
       └── last-sync.txt      # Sync summary
   ```

2. **What to sync:**
   - ✅ **All database backups** (complete backup folders)
   - ✅ **Recent uploaded resources** (last 30 days)
   - ✅ **Configuration files** (schema.prisma, package.json)
   - ❌ **Not needed:** node_modules, .git, logs

### Alternative Cloud Options
- **OneDrive** (if you prefer Microsoft)
- **Dropbox** (good for automatic sync)
- **iCloud** (if using Mac/iOS)

## 🔧 Easy Sync Methods

### Method 1: Automated Script (Recommended)
```batch
# Run the sync script
scripts\sync-backups-to-cloud.bat
```

### Method 2: Manual Copy
1. **Copy entire backup folder:**
   ```
   Source: O:\2025\LMS-weekend05172025\Peter-s-Teacher-Resource-Project\backups\database\
   Target: [Your Google Drive]\PBS-LMS-Backups\database\
   ```

2. **Copy recent uploads (optional):**
   ```
   Source: O:\2025\LMS-weekend05172025\Peter-s-Teacher-Resource-Project\uploads\resources\
   Target: [Your Google Drive]\PBS-LMS-Backups\uploads\
   ```

### Method 3: Google Drive Desktop App
1. Install Google Drive Desktop
2. Set up automatic sync for the backup folder
3. Move backups to Google Drive folder for automatic cloud sync

## 📋 Backup Schedule Recommendations

### Daily (Automated)
```batch
# Create backup
node scripts\database-backup-manager.js backup

# Sync to cloud (weekly)
scripts\sync-backups-to-cloud.bat
```

### Weekly
- Run full backup verification
- Clean up old local backups (keep last 7 days)
- Verify cloud backup integrity

### Monthly
- Archive old backups
- Test restore procedure
- Review backup storage usage

## 🗂️ File Priorities

### Critical (Must Backup)
1. **Database file** (`prisma/dev.db`) - Contains all your data
2. **Recent backups** (last 7 days minimum)
3. **Uploaded resources** (`uploads/resources/`) - Student/teacher files

### Important (Should Backup)
1. **Configuration files** (`prisma/schema.prisma`, `package.json`)
2. **Custom scripts** (`scripts/` folder)
3. **Documentation** (`docs/` folder)

### Optional (Can Recreate)
1. **Node modules** (`node_modules/`) - Can reinstall
2. **Git history** (`.git/`) - Stored on GitHub
3. **Logs and temp files**

## 💾 Storage Requirements

### Current Database Size
- **SQLite file:** ~2.9MB
- **With metadata:** ~3MB per backup
- **Daily backups for 30 days:** ~90MB

### Projected Growth
- **1 year of daily backups:** ~1.1GB
- **With uploads (estimated):** ~5-10GB
- **Google Drive free tier:** 15GB (plenty of space!)

## 🚨 Emergency Recovery Plan

### If Local Drive Fails
1. **Download from Google Drive:**
   - Get latest backup folder
   - Extract `dev.db` file
   - Place in `prisma/` folder

2. **Restore and restart:**
   ```bash
   # Copy backup database
   cp downloaded-backup/dev.db prisma/dev.db
   
   # Restart server
   pm2 restart teacher-resource-platform
   ```

### If Both Local and Cloud Fail
1. **Check existing backups folder:**
   ```bash
   node scripts\database-backup-manager.js list
   ```

2. **Use any available backup:**
   ```bash
   node scripts\database-backup-manager.js restore [backup-name] --force
   ```

## 🔐 Security Considerations

### Google Drive Security
- ✅ **Encrypted in transit and at rest**
- ✅ **Two-factor authentication recommended**
- ✅ **Share permissions (keep private)**

### File Encryption (Optional)
For extra security, you can encrypt backup files:
```batch
# Example with 7-Zip (if installed)
7z a -p[password] backup-encrypted.7z backups\database\backup-*
```

## 📞 Quick Actions

### Create Backup Now
```batch
cd O:\2025\LMS-weekend05172025\Peter-s-Teacher-Resource-Project
node scripts\database-backup-manager.js backup
```

### Sync to Google Drive Now
```batch
scripts\sync-backups-to-cloud.bat
```

### Check Backup Status
```batch
node scripts\database-backup-manager.js list
```

### Emergency Restore
```batch
# List available backups
node scripts\database-backup-manager.js list

# Test restore (safe)
node scripts\database-backup-manager.js test-restore [backup-name]

# Full restore (caution!)
node scripts\database-backup-manager.js restore [backup-name] --force
```

---

**Remember:** The best backup is the one you actually use! Start with Google Drive sync and build from there. 🛡️
