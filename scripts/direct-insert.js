// Direct SQL insertion script
const sqlite3 = require('sqlite3').verbose();
const path = require('path');

// Database path
const dbPath = path.join(__dirname, '..', 'data', 'users.db');
console.log(`Using database at: ${dbPath}`);

// Create a promise-based version of db.run
function run(db, sql, params = []) {
    return new Promise((resolve, reject) => {
        db.run(sql, params, function(err) {
            if (err) reject(err);
            else resolve(this);
        });
    });
}

// Create a promise-based version of db.all
function all(db, sql, params = []) {
    return new Promise((resolve, reject) => {
        db.all(sql, params, (err, rows) => {
            if (err) reject(err);
            else resolve(rows);
        });
    });
}

async function setupDatabase() {
    try {
        // Open the database
        const db = new sqlite3.Database(dbPath);
        
        // Create the users table if it doesn't exist
        await run(db, `CREATE TABLE IF NOT EXISTS users (
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
        )`);
        
        console.log('Users table created or already exists');
        
        // Insert Phumdham Class 4/1 students
        const students = [
            { username: 'Peter41', path: '/portfolios/P4-1/Peter/Peter.html' },
            { username: 'Peta', path: '/portfolios/P4-1/Peta/Peta.html' },
            { username: 'Uda', path: '/portfolios/P4-1/Uda/index.html' },
            { username: 'Nava', path: '/portfolios/P4-1/Nava/Nava.html' }
        ];
        
        for (const student of students) {
            await run(db, 
                `INSERT OR REPLACE INTO users (username, password, portfolio_path, is_public) VALUES (?, ?, ?, ?)`, 
                [student.username, 'password123', student.path, 0]
            );
            console.log(`Inserted or updated ${student.username}`);
        }
        
        // Get all users to verify
        const rows = await all(db, 'SELECT * FROM users');
        
        console.log('All users in the database:');
        rows.forEach(row => {
            console.log(`- ${row.username}: ${row.portfolio_path} (Public: ${row.is_public === 1})`);
        });
        
        // Specifically check for P4-1 students
        console.log('\nChecking for P4-1 students:');
        const p41Students = rows.filter(row => row.portfolio_path && row.portfolio_path.includes('P4-1'));
        if (p41Students.length > 0) {
            p41Students.forEach(student => {
                console.log(`- ${student.username}: ${student.portfolio_path}`);
            });
        } else {
            console.log('No P4-1 students found!');
        }
        
        // Close the database
        db.close();
        console.log('Database operations completed successfully');
        
    } catch (error) {
        console.error('Database error:', error);
    }
}

// Run the function
setupDatabase(); 