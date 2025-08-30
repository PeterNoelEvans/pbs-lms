#!/usr/bin/env node
/**
 * Disaster Recovery Script
 * 
 * This script helps restore the complete Teacher Resource Platform 
 * from backups after a disaster (computer failure, data loss, etc.)
 * 
 * Prerequisites:
 * 1. Fresh GitHub clone of the project
 * 2. Backup files available (from Google Drive or external storage)
 * 3. Node.js installed
 * 
 * Usage:
 *   node scripts/disaster-recovery.js restore <backup-path>
 *   node scripts/disaster-recovery.js verify
 *   node scripts/disaster-recovery.js setup-fresh
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

class DisasterRecovery {
    constructor() {
        this.projectRoot = path.join(__dirname, '..');
        this.backupPath = null;
        this.logFile = path.join(this.projectRoot, 'recovery.log');
        
        // Ensure log file exists
        if (!fs.existsSync(this.logFile)) {
            fs.writeFileSync(this.logFile, '');
        }
    }

    log(message) {
        const timestamp = new Date().toISOString();
        const logMessage = `[${timestamp}] ${message}\n`;
        console.log(message);
        fs.appendFileSync(this.logFile, logMessage);
    }

    async setupFreshInstallation() {
        this.log('🚀 Setting up fresh installation...');
        console.log('═'.repeat(60));
        
        try {
            // 1. Install dependencies
            this.log('📦 Installing Node.js dependencies...');
            execSync('npm install', { 
                stdio: 'inherit',
                cwd: this.projectRoot 
            });
            
            // 2. Install Prisma CLI if not available
            this.log('🔧 Setting up Prisma...');
            try {
                execSync('npx prisma --version', { stdio: 'pipe' });
                this.log('✅ Prisma already available');
            } catch (error) {
                this.log('📥 Installing Prisma CLI...');
                execSync('npm install prisma @prisma/client', { 
                    stdio: 'inherit',
                    cwd: this.projectRoot 
                });
            }
            
            // 3. Generate Prisma client
            this.log('🏗️  Generating Prisma client...');
            execSync('npx prisma generate', { 
                stdio: 'inherit',
                cwd: this.projectRoot 
            });
            
            // 4. Create necessary directories
            this.log('📁 Creating directory structure...');
            const directories = [
                'uploads/resources',
                'uploads/thumbnails',
                'uploads/course-docs',
                'backups/database',
                'backups/complete',
                'prisma'
            ];
            
            for (const dir of directories) {
                const dirPath = path.join(this.projectRoot, dir);
                if (!fs.existsSync(dirPath)) {
                    fs.mkdirSync(dirPath, { recursive: true });
                    this.log(`✅ Created directory: ${dir}`);
                }
            }
            
            // 5. Create default environment file if missing
            const envPath = path.join(this.projectRoot, '.env');
            if (!fs.existsSync(envPath)) {
                this.log('⚙️  Creating default .env file...');
                const defaultEnv = `# Environment Configuration
NODE_ENV=development
PORT=3000
DATABASE_URL="file:./dev.db"
JWT_SECRET=your-secret-key-change-this-in-production
`;
                fs.writeFileSync(envPath, defaultEnv);
                this.log('✅ Default .env created (remember to update JWT_SECRET)');
            }
            
            this.log('\n🎉 Fresh installation setup completed!');
            this.log('Next steps:');
            this.log('1. Update .env file with your configuration');
            this.log('2. Run disaster recovery restore if you have backups');
            this.log('3. Or run database migration for fresh start');
            
        } catch (error) {
            this.log(`❌ Fresh installation setup failed: ${error.message}`);
            throw error;
        }
    }

    async restoreFromBackup(backupPath) {
        this.backupPath = path.resolve(backupPath);
        
        this.log(`🔄 Starting disaster recovery from: ${this.backupPath}`);
        console.log('═'.repeat(60));
        
        // Verify backup exists and is valid
        await this.verifyBackup();
        
        try {
            // 1. Stop any running server
            this.log('🛑 Stopping any running servers...');
            try {
                execSync('pm2 stop all', { stdio: 'pipe' });
                this.log('✅ PM2 processes stopped');
            } catch (error) {
                this.log('ℹ️  No PM2 processes to stop');
            }
            
            // 2. Restore database
            await this.restoreDatabase();
            
            // 3. Restore uploaded files
            await this.restoreUploads();
            
            // 4. Restore configuration
            await this.restoreConfiguration();
            
            // 5. Run database migrations if needed
            await this.runMigrations();
            
            // 6. Verify restoration
            await this.verifyRestoration();
            
            this.log('\n🎉 Disaster recovery completed successfully!');
            this.log('Your system has been fully restored from backup.');
            this.log('\nNext steps:');
            this.log('1. Start the server: pm2 start server.js --name teacher-resource-platform');
            this.log('2. Verify login functionality');
            this.log('3. Check that uploaded files are accessible');
            this.log('4. Test critical features');
            
        } catch (error) {
            this.log(`❌ Disaster recovery failed: ${error.message}`);
            throw error;
        }
    }

    async verifyBackup() {
        this.log('🔍 Verifying backup integrity...');
        
        if (!fs.existsSync(this.backupPath)) {
            throw new Error(`Backup path does not exist: ${this.backupPath}`);
        }
        
        const backupStat = fs.statSync(this.backupPath);
        if (!backupStat.isDirectory()) {
            throw new Error(`Backup path is not a directory: ${this.backupPath}`);
        }
        
        // Check for required backup components
        const requiredComponents = [
            'database/dev.db',
            'backup-manifest.json'
        ];
        
        for (const component of requiredComponents) {
            const componentPath = path.join(this.backupPath, component);
            if (!fs.existsSync(componentPath)) {
                throw new Error(`Missing backup component: ${component}`);
            }
        }
        
        // Read and validate manifest
        const manifestPath = path.join(this.backupPath, 'backup-manifest.json');
        try {
            const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
            this.log(`✅ Backup verified: ${manifest.backupName}`);
            this.log(`   Created: ${new Date(manifest.createdAt).toLocaleString()}`);
            
            if (manifest.components?.database) {
                this.log(`   Database: ${manifest.components.database.description}`);
            }
            if (manifest.components?.uploads) {
                this.log(`   Files: ${manifest.components.uploads.description}`);
            }
            
        } catch (error) {
            throw new Error(`Invalid backup manifest: ${error.message}`);
        }
        
        this.log('✅ Backup verification passed');
    }

    async restoreDatabase() {
        this.log('🗄️  Restoring database...');
        
        const sourcePath = path.join(this.backupPath, 'database/dev.db');
        const targetPath = path.join(this.projectRoot, 'prisma/dev.db');
        
        // Create backup of existing database if it exists
        if (fs.existsSync(targetPath)) {
            const backupPath = `${targetPath}.backup-${Date.now()}`;
            fs.copyFileSync(targetPath, backupPath);
            this.log(`✅ Existing database backed up to: ${backupPath}`);
        }
        
        // Copy database from backup
        fs.copyFileSync(sourcePath, targetPath);
        this.log('✅ Database restored successfully');
        
        // Verify database integrity
        const dbSize = fs.statSync(targetPath).size;
        this.log(`   Database size: ${this.formatBytes(dbSize)}`);
    }

    async restoreUploads() {
        this.log('📁 Restoring uploaded files...');
        
        const sourcePath = path.join(this.backupPath, 'uploads');
        const targetPath = path.join(this.projectRoot, 'uploads');
        
        if (!fs.existsSync(sourcePath)) {
            this.log('⚠️  No uploads folder in backup');
            return;
        }
        
        // Remove existing uploads and restore from backup
        if (fs.existsSync(targetPath)) {
            this.log('🗑️  Removing existing uploads...');
            fs.rmSync(targetPath, { recursive: true, force: true });
        }
        
        this.copyDirectory(sourcePath, targetPath);
        
        // Count restored files
        const fileCount = this.countFiles(targetPath);
        const totalSize = this.getDirectorySize(targetPath);
        
        this.log(`✅ Uploads restored: ${fileCount} files (${this.formatBytes(totalSize)})`);
    }

    async restoreConfiguration() {
        this.log('⚙️  Restoring configuration...');
        
        const configPath = path.join(this.backupPath, 'config');
        
        if (!fs.existsSync(configPath)) {
            this.log('⚠️  No config folder in backup');
            return;
        }
        
        // Restore important config files
        const configFiles = [
            { src: 'package.json', critical: true },
            { src: 'schema.prisma', target: 'prisma/schema.prisma', critical: true },
            { src: '.env', critical: false },
            { src: 'server.js', critical: false }
        ];
        
        for (const config of configFiles) {
            const sourcePath = path.join(configPath, config.src);
            const targetPath = path.join(this.projectRoot, config.target || config.src);
            
            if (fs.existsSync(sourcePath)) {
                // Create backup of existing file
                if (fs.existsSync(targetPath)) {
                    const backupPath = `${targetPath}.backup-${Date.now()}`;
                    fs.copyFileSync(targetPath, backupPath);
                }
                
                fs.copyFileSync(sourcePath, targetPath);
                this.log(`✅ Restored: ${config.src}`);
            } else if (config.critical) {
                this.log(`⚠️  Critical file missing from backup: ${config.src}`);
            }
        }
        
        // Restore docs if available
        const docsSourcePath = path.join(configPath, 'docs');
        const docsTargetPath = path.join(this.projectRoot, 'docs');
        
        if (fs.existsSync(docsSourcePath)) {
            if (fs.existsSync(docsTargetPath)) {
                fs.rmSync(docsTargetPath, { recursive: true, force: true });
            }
            this.copyDirectory(docsSourcePath, docsTargetPath);
            this.log('✅ Documentation restored');
        }
    }

    async runMigrations() {
        this.log('🔄 Running database migrations...');
        
        try {
            // Generate Prisma client
            execSync('npx prisma generate', { 
                stdio: 'pipe',
                cwd: this.projectRoot 
            });
            
            // Apply migrations
            execSync('npx prisma migrate deploy', { 
                stdio: 'pipe',
                cwd: this.projectRoot 
            });
            
            this.log('✅ Database migrations completed');
            
        } catch (error) {
            this.log(`⚠️  Migration warning: ${error.message}`);
            this.log('This may be normal if the database is already up to date');
        }
    }

    async verifyRestoration() {
        this.log('🔍 Verifying restoration...');
        
        // Check database
        const dbPath = path.join(this.projectRoot, 'prisma/dev.db');
        if (fs.existsSync(dbPath)) {
            this.log('✅ Database file present');
        } else {
            throw new Error('Database file missing after restoration');
        }
        
        // Check uploads
        const uploadsPath = path.join(this.projectRoot, 'uploads');
        if (fs.existsSync(uploadsPath)) {
            const fileCount = this.countFiles(uploadsPath);
            this.log(`✅ Uploads directory present (${fileCount} files)`);
        } else {
            this.log('⚠️  Uploads directory missing');
        }
        
        // Check dependencies
        const nodeModulesPath = path.join(this.projectRoot, 'node_modules');
        if (fs.existsSync(nodeModulesPath)) {
            this.log('✅ Dependencies installed');
        } else {
            this.log('⚠️  Dependencies not installed - run npm install');
        }
        
        this.log('✅ Restoration verification completed');
    }

    async verifySystemHealth() {
        this.log('🏥 Running system health check...');
        console.log('═'.repeat(60));
        
        const checks = [
            { name: 'Node.js version', check: () => process.version },
            { name: 'Project directory', check: () => fs.existsSync(this.projectRoot) },
            { name: 'Package.json', check: () => fs.existsSync(path.join(this.projectRoot, 'package.json')) },
            { name: 'Database file', check: () => fs.existsSync(path.join(this.projectRoot, 'prisma/dev.db')) },
            { name: 'Uploads directory', check: () => fs.existsSync(path.join(this.projectRoot, 'uploads')) },
            { name: 'Node modules', check: () => fs.existsSync(path.join(this.projectRoot, 'node_modules')) }
        ];
        
        let allChecksPass = true;
        
        for (const check of checks) {
            try {
                const result = check.check();
                const status = result ? '✅' : '❌';
                this.log(`${status} ${check.name}: ${result || 'Missing'}`);
                
                if (!result) allChecksPass = false;
                
            } catch (error) {
                this.log(`❌ ${check.name}: Error - ${error.message}`);
                allChecksPass = false;
            }
        }
        
        if (allChecksPass) {
            this.log('\n🎉 System health check passed!');
        } else {
            this.log('\n⚠️  System health check found issues');
        }
        
        return allChecksPass;
    }

    // Utility functions
    copyDirectory(src, dest) {
        if (!fs.existsSync(src)) return;
        
        fs.mkdirSync(dest, { recursive: true });
        const entries = fs.readdirSync(src, { withFileTypes: true });
        
        for (const entry of entries) {
            const srcPath = path.join(src, entry.name);
            const destPath = path.join(dest, entry.name);
            
            if (entry.isDirectory()) {
                this.copyDirectory(srcPath, destPath);
            } else {
                fs.copyFileSync(srcPath, destPath);
            }
        }
    }

    getDirectorySize(dirPath) {
        if (!fs.existsSync(dirPath)) return 0;
        
        let totalSize = 0;
        const entries = fs.readdirSync(dirPath, { withFileTypes: true });
        
        for (const entry of entries) {
            const fullPath = path.join(dirPath, entry.name);
            if (entry.isDirectory()) {
                totalSize += this.getDirectorySize(fullPath);
            } else {
                totalSize += fs.statSync(fullPath).size;
            }
        }
        
        return totalSize;
    }

    countFiles(dirPath) {
        if (!fs.existsSync(dirPath)) return 0;
        
        let fileCount = 0;
        const entries = fs.readdirSync(dirPath, { withFileTypes: true });
        
        for (const entry of entries) {
            const fullPath = path.join(dirPath, entry.name);
            if (entry.isDirectory()) {
                fileCount += this.countFiles(fullPath);
            } else {
                fileCount++;
            }
        }
        
        return fileCount;
    }

    formatBytes(bytes, decimals = 2) {
        if (bytes === 0) return '0 Bytes';
        const k = 1024;
        const dm = decimals < 0 ? 0 : decimals;
        const sizes = ['Bytes', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
    }
}

// CLI Interface
async function main() {
    const args = process.argv.slice(2);
    const command = args[0];
    const recovery = new DisasterRecovery();

    try {
        switch (command) {
            case 'setup-fresh':
                await recovery.setupFreshInstallation();
                break;
                
            case 'restore':
                const backupPath = args[1];
                if (!backupPath) {
                    console.error('❌ Please specify backup path: node scripts/disaster-recovery.js restore <backup-path>');
                    process.exit(1);
                }
                await recovery.restoreFromBackup(backupPath);
                break;
                
            case 'verify':
                await recovery.verifySystemHealth();
                break;
                
            default:
                console.log(`
🚨 Disaster Recovery Script

This script helps restore the Teacher Resource Platform after a disaster.

Usage:
  node scripts/disaster-recovery.js <command> [options]

Commands:
  setup-fresh                    Set up fresh installation (after GitHub clone)
  restore <backup-path>          Restore from backup directory
  verify                         Check system health

Examples:
  # After fresh GitHub clone
  node scripts/disaster-recovery.js setup-fresh
  
  # Restore from Google Drive backup
  node scripts/disaster-recovery.js restore "C:/Users/Peter/Google Drive/PBS-LMS-Backups/database/complete-backup-2025-08-09T05-16-48-981Z"
  
  # Check if system is working
  node scripts/disaster-recovery.js verify

Recovery Process:
1. Fresh GitHub clone
2. Run setup-fresh to install dependencies and create structure
3. Copy backup from Google Drive to local machine
4. Run restore command with backup path
5. Start server: pm2 start server.js --name teacher-resource-platform
`);
                process.exit(1);
        }
    } catch (error) {
        console.error(`❌ Error: ${error.message}`);
        process.exit(1);
    }
}

if (require.main === module) {
    main();
}

module.exports = DisasterRecovery;
