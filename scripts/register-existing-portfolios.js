require('dotenv').config();
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');
const schoolConfig = require('../config/schools');

// Database path
const dbPath = path.join(__dirname, '..', 'data', 'users.db');

// Class 4/1 students to register
const students41 = [
    { username: 'Peta', portfolio_path: '/portfolios/P4-1/Peta/Peta.html', is_public: false },
    { username: 'Peter41', portfolio_path: '/portfolios/P4-1/Peter/Peter.html', is_public: false },
    { username: 'Uda', portfolio_path: '/portfolios/P4-1/Uda/index.html', is_public: false },
    { username: 'Nava', portfolio_path: '/portfolios/P4-1/Nava/Nava.html', is_public: false },
    { username: 'Bonus', portfolio_path: '/portfolios/P4-1/Bonus/Bonus.html', is_public: false },
    { username: 'Nicha', portfolio_path: '/portfolios/P4-1/Nicha/index.html', is_public: false },
    { username: 'Copter', portfolio_path: '/portfolios/P4-1/Copter/Copter.html', is_public: false },
    { username: 'Khun', portfolio_path: '/portfolios/P4-1/Khun/Khun.html', is_public: false },
    { username: 'Kod', portfolio_path: '/portfolios/P4-1/Kod/Kod.html', is_public: false },
    { username: 'Phupha', portfolio_path: '/portfolios/P4-1/Phupha/Phupha.html', is_public: false },
    { username: 'Tar', portfolio_path: '/portfolios/P4-1/Tar/Tar.html', is_public: false },
    { username: 'Jiajia', portfolio_path: '/portfolios/P4-1/Jiajia/Jiajia.html', is_public: false },
    { username: 'Tigger', portfolio_path: '/portfolios/P4-1/Tigger/Tigger.html', is_public: false },
    { username: 'Dean', portfolio_path: '/portfolios/P4-1/Dean/Dean.html', is_public: false },
    { username: 'Uno', portfolio_path: '/portfolios/P4-1/Uno/Uno.html', is_public: false },
    { username: 'Namoun', portfolio_path: '/portfolios/P4-1/Nahmoun/Namoun.html', is_public: false },
    { username: 'Earth', portfolio_path: '/portfolios/P4-1/Earth/Earth.html', is_public: false }
];

// Function to register portfolios
async function registerPortfolios() {
    console.log('Registering existing portfolios...');
    
    const db = new sqlite3.Database(dbPath);
    
    // Enable foreign keys
    db.run('PRAGMA foreign_keys = ON');
    
    // Create the database tables if they don't exist
    await new Promise((resolve, reject) => {
        db.run(`CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT UNIQUE NOT NULL,
            password TEXT NOT NULL,
            portfolio_path TEXT NOT NULL,
            avatar_path TEXT,
            is_public INTEGER DEFAULT 0,
            first_name TEXT,
            last_name TEXT,
            nickname TEXT,
            is_super_user INTEGER DEFAULT 0,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )`, function(err) {
            if (err) reject(err);
            console.log('Users table created or already exists');
            resolve();
        });
    });
    
    // Register students
    for (const student of students41) {
        try {
            console.log(`Registering student: ${student.username}`);
            
            // Check if student already exists
            const exists = await new Promise((resolve, reject) => {
                db.get('SELECT id FROM users WHERE username = ?', [student.username], (err, row) => {
                    if (err) reject(err);
                    resolve(row !== undefined);
                });
            });
            
            if (exists) {
                console.log(`Student ${student.username} already exists, updating portfolio path`);
                await new Promise((resolve, reject) => {
                    db.run(
                        'UPDATE users SET portfolio_path = ?, is_public = ? WHERE username = ?',
                        [student.portfolio_path, student.is_public ? 1 : 0, student.username],
                        function(err) {
                            if (err) reject(err);
                            resolve(this.changes);
                        }
                    );
                });
            } else {
                console.log(`Adding new student: ${student.username}`);
                // Generate a secure default password
                const defaultPassword = `${student.username}2025`;
                
                await new Promise((resolve, reject) => {
                    db.run(
                        'INSERT INTO users (username, password, portfolio_path, is_public) VALUES (?, ?, ?, ?)',
                        [student.username, defaultPassword, student.portfolio_path, student.is_public ? 1 : 0],
                        function(err) {
                            if (err) reject(err);
                            resolve(this.lastID);
                        }
                    );
                });
            }
        } catch (error) {
            console.error(`Error registering ${student.username}:`, error);
        }
    }
    
    console.log('Registration completed');
    db.close();
}

// Execute the registration
registerPortfolios().catch(console.error); 