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
        const db = await open({
            filename: path.join(__dirname, '../database.sqlite'),
            driver: sqlite3.Database
        });

        // Create tables if they don't exist
        await db.exec(`
            CREATE TABLE IF NOT EXISTS students (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                username TEXT UNIQUE NOT NULL,
                password_hash TEXT NOT NULL,
                portfolio_path TEXT UNIQUE NOT NULL,
                is_public BOOLEAN DEFAULT 0,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP
            );

            CREATE TABLE IF NOT EXISTS encrypted_credentials (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                student_id INTEGER NOT NULL,
                iv TEXT NOT NULL,
                encrypted_data TEXT NOT NULL,
                auth_tag TEXT NOT NULL,
                FOREIGN KEY (student_id) REFERENCES students(id)
            );
        `);

        return db;
    }

    async addStudent(username, password, portfolioPath) {
        const db = await this.dbPromise;
        const passwordHash = await this.credentialManager.hashPassword(password);

        try {
            // Start transaction
            await db.run('BEGIN TRANSACTION');

            // Insert student
            const result = await db.run(
                'INSERT INTO students (username, password_hash, portfolio_path) VALUES (?, ?, ?)',
                [username, passwordHash, portfolioPath]
            );

            // Encrypt and store original credentials
            const encryptedCreds = await this.credentialManager.encryptCredentials({
                username,
                password,
                portfolioPath
            });

            // Store encrypted credentials
            await db.run(
                'INSERT INTO encrypted_credentials (student_id, iv, encrypted_data, auth_tag) VALUES (?, ?, ?, ?)',
                [result.lastID, encryptedCreds.iv, encryptedCreds.encryptedData, encryptedCreds.authTag]
            );

            await db.run('COMMIT');
            return result.lastID;

        } catch (error) {
            await db.run('ROLLBACK');
            throw error;
        }
    }

    async verifyStudent(username, password) {
        const db = await this.dbPromise;
        const student = await db.get('SELECT * FROM students WHERE username = ?', [username]);

        if (!student) {
            return null;
        }

        const isValid = await this.credentialManager.verifyPassword(password, student.password_hash);
        return isValid ? student : null;
    }

    async getStudentById(id) {
        const db = await this.dbPromise;
        return await db.get('SELECT * FROM students WHERE id = ?', [id]);
    }

    async updateStudentPrivacy(id, isPublic) {
        const db = await this.dbPromise;
        await db.run('UPDATE students SET is_public = ? WHERE id = ?', [isPublic ? 1 : 0, id]);
    }

    async resetPassword(username, newPassword) {
        const db = await this.dbPromise;
        const passwordHash = await this.credentialManager.hashPassword(newPassword);

        try {
            await db.run('BEGIN TRANSACTION');

            // Update password hash
            await db.run(
                'UPDATE students SET password_hash = ? WHERE username = ?',
                [passwordHash, username]
            );

            // Get student ID
            const student = await db.get('SELECT id FROM students WHERE username = ?', [username]);

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