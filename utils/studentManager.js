const sqlite3 = require('sqlite3');
const { open } = require('sqlite');
const path = require('path');
const CredentialManager = require('./credentialManager');

class StudentManager {
    constructor(credentialManager) {
        this.credentialManager = credentialManager;
        this.dbPromise = this.initializeDatabase();
    }

    async initializeDatabase() {
        const sqlite = require('sqlite3').verbose();
        const { open } = require('sqlite');
        const path = require('path');
        const isProduction = process.env.NODE_ENV === 'production';
        const dbPath = isProduction ? '/opt/render/project/src/data/users.db' : 'users.db';

        // Create database directory if it doesn't exist (for production)
        if (isProduction) {
            const fs = require('fs');
            const dbDir = path.dirname(dbPath);
            if (!fs.existsSync(dbDir)) {
                fs.mkdirSync(dbDir, { recursive: true });
            }
        }

        // Open the database connection
        const db = await open({
            filename: dbPath,
            driver: sqlite.Database
        });

        // Create the users table if it doesn't exist
        await db.exec(`
            CREATE TABLE IF NOT EXISTS users (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                username TEXT UNIQUE NOT NULL,
                password TEXT NOT NULL,
                portfolio_path TEXT NOT NULL,
                avatar_path TEXT,
                is_public INTEGER DEFAULT 0,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);

        // Check if columns exist and add them if they don't
        try {
            console.log('Checking for missing columns in users table...');
            
            // Get current table info
            const tableInfo = await db.all(`PRAGMA table_info(users)`);
            const columns = tableInfo.map(col => col.name.toLowerCase());
            
            // Check for each column and add if missing
            if (!columns.includes('first_name')) {
                console.log('Adding first_name column...');
                await db.exec('ALTER TABLE users ADD COLUMN first_name TEXT');
            }
            
            if (!columns.includes('last_name')) {
                console.log('Adding last_name column...');
                await db.exec('ALTER TABLE users ADD COLUMN last_name TEXT');
            }
            
            if (!columns.includes('nickname')) {
                console.log('Adding nickname column...');
                await db.exec('ALTER TABLE users ADD COLUMN nickname TEXT');
            }
            
            console.log('Database schema is up to date.');
        } catch (error) {
            console.error('Error updating database schema:', error);
        }

        return db;
    }

    async addStudent(username, password, portfolioPath, firstName = '', lastName = '', nickname = '', avatarPath = null) {
        const db = await this.dbPromise;
        
        // Hash the password
        const hashedPassword = await this.credentialManager.hashPassword(password);

        try {
            // Insert the student
            await db.run(
                `INSERT INTO users (
                    username, 
                    password, 
                    portfolio_path, 
                    avatar_path, 
                    first_name, 
                    last_name, 
                    nickname
                ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
                [
                    username, 
                    hashedPassword, 
                    portfolioPath, 
                    avatarPath, 
                    firstName, 
                    lastName, 
                    nickname
                ]
            );
            
            return true;
        } catch (error) {
            console.error('Error adding student:', error.message);
            throw error;
        }
    }

    async verifyStudent(username, password) {
        const db = await this.dbPromise;
        const student = await db.get('SELECT * FROM users WHERE username = ?', [username]);

        if (!student) {
            return null;
        }

        const isValid = await this.credentialManager.verifyPassword(password, student.password);
        return isValid ? student : null;
    }

    async getStudentById(id) {
        const db = await this.dbPromise;
        return await db.get('SELECT * FROM users WHERE id = ?', [id]);
    }

    async updateStudentPrivacy(id, isPublic) {
        const db = await this.dbPromise;
        await db.run('UPDATE users SET is_public = ? WHERE id = ?', [isPublic ? 1 : 0, id]);
    }

    async resetPassword(username, newPassword) {
        const db = await this.dbPromise;
        const passwordHash = await this.credentialManager.hashPassword(newPassword);

        try {
            await db.run('BEGIN TRANSACTION');

            // Update password hash
            await db.run(
                'UPDATE users SET password = ? WHERE username = ?',
                [passwordHash, username]
            );

            // Get student ID
            const student = await db.get('SELECT id FROM users WHERE username = ?', [username]);

            // Get existing encrypted credentials
            const encryptedCreds = await db.get(
                'SELECT * FROM encrypted_credentials WHERE student_id = ?',
                [student.id]
            );

            // Decrypt existing credentials
            const credentials = await this.credentialManager.decryptCredentials(encryptedCreds);
            credentials.password = newPassword;

            // Re-encrypt updated credentials
            const newEncryptedCreds = await this.credentialManager.encryptCredentials(credentials);

            // Update encrypted credentials
            await db.run(
                'UPDATE encrypted_credentials SET iv = ?, encrypted_data = ?, auth_tag = ? WHERE student_id = ?',
                [newEncryptedCreds.iv, newEncryptedCreds.encryptedData, newEncryptedCreds.authTag, student.id]
            );

            await db.run('COMMIT');
        } catch (error) {
            await db.run('ROLLBACK');
            throw error;
        }
    }
}

module.exports = StudentManager; 