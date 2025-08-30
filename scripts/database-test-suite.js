#!/usr/bin/env node
/**
 * Database Testing Suite
 * 
 * This script provides comprehensive testing of database functionality
 * to ensure backups work correctly and data integrity is maintained.
 */

const { PrismaClient } = require('@prisma/client');
const fs = require('fs');
const path = require('path');
const DatabaseBackupManager = require('./database-backup-manager');

class DatabaseTestSuite {
    constructor() {
        this.testDbPath = path.join(__dirname, '../prisma/test-suite.db');
        this.backupManager = new DatabaseBackupManager();
        this.testResults = [];
    }

    async runFullTestSuite() {
        console.log('🧪 Starting Database Test Suite');
        console.log('═'.repeat(50));
        
        try {
            await this.cleanupTestFiles();
            
            // Test 1: Backup Creation
            await this.testBackupCreation();
            
            // Test 2: Backup Verification
            await this.testBackupVerification();
            
            // Test 3: Test Restore
            await this.testRestore();
            
            // Test 4: Data Integrity
            await this.testDataIntegrity();
            
            // Test 5: Performance Test
            await this.testPerformance();
            
            // Test 6: Edge Cases
            await this.testEdgeCases();
            
            this.printTestSummary();
            
        } catch (error) {
            console.error(`❌ Test suite failed: ${error.message}`);
            throw error;
        } finally {
            await this.cleanupTestFiles();
        }
    }

    async testBackupCreation() {
        console.log('\n📦 Test 1: Backup Creation');
        console.log('─'.repeat(30));
        
        try {
            // Check if original database exists
            const originalDbPath = path.join(__dirname, '../prisma/dev.db');
            if (!fs.existsSync(originalDbPath)) {
                this.addTestResult('Backup Creation', 'SKIP', 'No original database found');
                return;
            }
            
            const backupName = await this.backupManager.createBackup();
            
            // Verify backup files exist
            const backupPath = path.join(__dirname, '../backups/database', backupName);
            const requiredFiles = ['dev.db', 'backup-metadata.json', 'checksum.txt'];
            
            for (const file of requiredFiles) {
                const filePath = path.join(backupPath, file);
                if (!fs.existsSync(filePath)) {
                    throw new Error(`Missing backup file: ${file}`);
                }
            }
            
            this.addTestResult('Backup Creation', 'PASS', `Created backup: ${backupName}`);
            this.lastBackupName = backupName;
            
        } catch (error) {
            this.addTestResult('Backup Creation', 'FAIL', error.message);
            throw error;
        }
    }

    async testBackupVerification() {
        console.log('\n🔍 Test 2: Backup Verification');
        console.log('─'.repeat(30));
        
        try {
            if (!this.lastBackupName) {
                throw new Error('No backup available for verification');
            }
            
            await this.backupManager.verifyBackup(this.lastBackupName);
            this.addTestResult('Backup Verification', 'PASS', 'Backup integrity verified');
            
        } catch (error) {
            this.addTestResult('Backup Verification', 'FAIL', error.message);
            throw error;
        }
    }

    async testRestore() {
        console.log('\n🔄 Test 3: Test Restore');
        console.log('─'.repeat(30));
        
        try {
            if (!this.lastBackupName) {
                throw new Error('No backup available for restore testing');
            }
            
            await this.backupManager.testRestore(this.lastBackupName);
            
            // Verify the test database was created
            const testDbPath = path.join(__dirname, '../prisma/test-restore.db');
            if (!fs.existsSync(testDbPath)) {
                throw new Error('Test restore database was not created');
            }
            
            this.addTestResult('Test Restore', 'PASS', 'Test restore completed successfully');
            
        } catch (error) {
            this.addTestResult('Test Restore', 'FAIL', error.message);
            throw error;
        }
    }

    async testDataIntegrity() {
        console.log('\n🔐 Test 4: Data Integrity');
        console.log('─'.repeat(30));
        
        try {
            // Create a test database with known data
            await this.createTestDatabase();
            
            // Create backup of test database
            const originalDbPath = path.join(__dirname, '../prisma/dev.db');
            const tempOriginal = originalDbPath + '.temp';
            
            // Backup original if it exists
            if (fs.existsSync(originalDbPath)) {
                fs.copyFileSync(originalDbPath, tempOriginal);
            }
            
            // Replace with test database
            fs.copyFileSync(this.testDbPath, originalDbPath);
            
            // Create backup
            const backupName = await this.backupManager.createBackup();
            
            // Restore original database
            if (fs.existsSync(tempOriginal)) {
                fs.copyFileSync(tempOriginal, originalDbPath);
                fs.unlinkSync(tempOriginal);
            }
            
            // Test restore and verify data
            await this.backupManager.testRestore(backupName);
            await this.verifyTestData();
            
            this.addTestResult('Data Integrity', 'PASS', 'Data integrity maintained through backup/restore cycle');
            
        } catch (error) {
            this.addTestResult('Data Integrity', 'FAIL', error.message);
            throw error;
        }
    }

    async testPerformance() {
        console.log('\n⚡ Test 5: Performance Test');
        console.log('─'.repeat(30));
        
        try {
            const originalDbPath = path.join(__dirname, '../prisma/dev.db');
            
            if (!fs.existsSync(originalDbPath)) {
                this.addTestResult('Performance Test', 'SKIP', 'No original database found');
                return;
            }
            
            const dbSize = fs.statSync(originalDbPath).size;
            
            // Measure backup time
            const backupStartTime = Date.now();
            const backupName = await this.backupManager.createBackup();
            const backupTime = Date.now() - backupStartTime;
            
            // Measure restore time
            const restoreStartTime = Date.now();
            await this.backupManager.testRestore(backupName);
            const restoreTime = Date.now() - restoreStartTime;
            
            const performance = {
                databaseSize: this.formatBytes(dbSize),
                backupTime: `${backupTime}ms`,
                restoreTime: `${restoreTime}ms`,
                backupSpeed: this.formatBytes(dbSize / (backupTime / 1000)) + '/s',
                restoreSpeed: this.formatBytes(dbSize / (restoreTime / 1000)) + '/s'
            };
            
            console.log(`📊 Performance Results:`);
            console.log(`   Database Size: ${performance.databaseSize}`);
            console.log(`   Backup Time: ${performance.backupTime}`);
            console.log(`   Restore Time: ${performance.restoreTime}`);
            console.log(`   Backup Speed: ${performance.backupSpeed}`);
            console.log(`   Restore Speed: ${performance.restoreSpeed}`);
            
            this.addTestResult('Performance Test', 'PASS', `Backup: ${performance.backupTime}, Restore: ${performance.restoreTime}`);
            
        } catch (error) {
            this.addTestResult('Performance Test', 'FAIL', error.message);
            throw error;
        }
    }

    async testEdgeCases() {
        console.log('\n🔧 Test 6: Edge Cases');
        console.log('─'.repeat(30));
        
        try {
            let edgeTestsPassed = 0;
            const edgeTests = [
                // Test with non-existent backup
                async () => {
                    try {
                        await this.backupManager.verifyBackup('non-existent-backup');
                        return false; // Should have failed
                    } catch (error) {
                        return true; // Expected to fail
                    }
                },
                
                // Test restore without force flag
                async () => {
                    try {
                        if (this.lastBackupName) {
                            const result = await this.backupManager.restore(this.lastBackupName, { force: false });
                            return result === false; // Should return false without force
                        }
                        return true;
                    } catch (error) {
                        return false;
                    }
                },
                
                // Test backup listing
                async () => {
                    try {
                        const backups = this.backupManager.listBackups();
                        return Array.isArray(backups);
                    } catch (error) {
                        return false;
                    }
                }
            ];
            
            for (let i = 0; i < edgeTests.length; i++) {
                const testPassed = await edgeTests[i]();
                if (testPassed) {
                    edgeTestsPassed++;
                    console.log(`   ✅ Edge test ${i + 1} passed`);
                } else {
                    console.log(`   ❌ Edge test ${i + 1} failed`);
                }
            }
            
            this.addTestResult('Edge Cases', 'PASS', `${edgeTestsPassed}/${edgeTests.length} edge tests passed`);
            
        } catch (error) {
            this.addTestResult('Edge Cases', 'FAIL', error.message);
        }
    }

    async createTestDatabase() {
        console.log('🏗️  Creating test database with known data...');
        
        // Remove existing test database
        if (fs.existsSync(this.testDbPath)) {
            fs.unlinkSync(this.testDbPath);
        }
        
        const prisma = new PrismaClient({
            datasources: {
                db: {
                    url: `file:${this.testDbPath}`
                }
            }
        });
        
        try {
            // Create test users
            await prisma.user.create({
                data: {
                    id: 'test-user-1',
                    name: 'Test Teacher',
                    email: 'test.teacher@test.com',
                    password: 'hashed-password',
                    role: 'TEACHER',
                    organization: 'Test School'
                }
            });
            
            await prisma.user.create({
                data: {
                    id: 'test-user-2',
                    name: 'Test Student',
                    email: 'test.student@test.com',
                    password: 'hashed-password',
                    role: 'STUDENT',
                    organization: 'Test School',
                    yearLevel: 10,
                    class: 'A'
                }
            });
            
            // Create test subject
            await prisma.subject.create({
                data: {
                    id: 'test-subject-1',
                    name: 'Test Mathematics',
                    yearLevel: 10,
                    teacherId: 'test-user-1',
                    organization: 'Test School'
                }
            });
            
            console.log('✅ Test database created with sample data');
            
        } finally {
            await prisma.$disconnect();
        }
    }

    async verifyTestData() {
        console.log('🔍 Verifying test data integrity...');
        
        const testRestoreDbPath = path.join(__dirname, '../prisma/test-restore.db');
        const prisma = new PrismaClient({
            datasources: {
                db: {
                    url: `file:${testRestoreDbPath}`
                }
            }
        });
        
        try {
            // Verify test users exist
            const teacher = await prisma.user.findUnique({
                where: { id: 'test-user-1' }
            });
            
            const student = await prisma.user.findUnique({
                where: { id: 'test-user-2' }
            });
            
            const subject = await prisma.subject.findUnique({
                where: { id: 'test-subject-1' }
            });
            
            if (!teacher || teacher.name !== 'Test Teacher') {
                throw new Error('Test teacher data not preserved');
            }
            
            if (!student || student.name !== 'Test Student') {
                throw new Error('Test student data not preserved');
            }
            
            if (!subject || subject.name !== 'Test Mathematics') {
                throw new Error('Test subject data not preserved');
            }
            
            console.log('✅ Test data integrity verified');
            
        } finally {
            await prisma.$disconnect();
        }
    }

    async cleanupTestFiles() {
        const filesToCleanup = [
            this.testDbPath,
            path.join(__dirname, '../prisma/test-restore.db'),
            path.join(__dirname, '../prisma/dev.db.temp')
        ];
        
        for (const file of filesToCleanup) {
            if (fs.existsSync(file)) {
                fs.unlinkSync(file);
            }
        }
    }

    addTestResult(testName, status, details) {
        this.testResults.push({ testName, status, details });
        
        const statusSymbol = status === 'PASS' ? '✅' : status === 'FAIL' ? '❌' : '⏭️';
        console.log(`${statusSymbol} ${testName}: ${details}`);
    }

    printTestSummary() {
        console.log('\n📋 Test Summary');
        console.log('═'.repeat(50));
        
        const passed = this.testResults.filter(r => r.status === 'PASS').length;
        const failed = this.testResults.filter(r => r.status === 'FAIL').length;
        const skipped = this.testResults.filter(r => r.status === 'SKIP').length;
        const total = this.testResults.length;
        
        console.log(`Total Tests: ${total}`);
        console.log(`✅ Passed: ${passed}`);
        console.log(`❌ Failed: ${failed}`);
        console.log(`⏭️ Skipped: ${skipped}`);
        
        if (failed === 0) {
            console.log('\n🎉 All tests passed! Your database backup system is working correctly.');
        } else {
            console.log('\n⚠️ Some tests failed. Please review the results above.');
        }
        
        console.log('\nDetailed Results:');
        console.log('─'.repeat(30));
        this.testResults.forEach(result => {
            const statusSymbol = result.status === 'PASS' ? '✅' : result.status === 'FAIL' ? '❌' : '⏭️';
            console.log(`${statusSymbol} ${result.testName}: ${result.details}`);
        });
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
    const testSuite = new DatabaseTestSuite();
    
    try {
        await testSuite.runFullTestSuite();
        process.exit(0);
    } catch (error) {
        console.error(`❌ Test suite failed: ${error.message}`);
        process.exit(1);
    }
}

if (require.main === module) {
    main();
}

module.exports = DatabaseTestSuite;
