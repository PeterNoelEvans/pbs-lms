// Script to add Class 4/2 students to the database
const sqlite3 = require('sqlite3').verbose();
const path = require('path');

// Database path
const dbPath = path.join(__dirname, '..', 'data', 'users.db');
console.log(`Using database at: ${dbPath}`);

// Class 4/2 students
const class42Students = [
    { username: 'Peter42', password: 'password123', portfolio_path: '/portfolios/P4-2/Peter/Peter.html', is_public: true },
    { username: 'Darin', password: 'password123', portfolio_path: '/portfolios/P4-2/Darin/Darin.html', is_public: false },
    { username: 'Sky', password: 'password123', portfolio_path: '/portfolios/P4-2/Sky/Sky.html', is_public: false },
    { username: 'Perth', password: 'password123', portfolio_path: '/portfolios/P4-2/Perth/Perth.html', is_public: false },
    { username: 'Tin', password: 'password123', portfolio_path: '/portfolios/P4-2/Tin/Tin.html', is_public: false },
    { username: 'Tonmali', password: 'password123', portfolio_path: '/portfolios/P4-2/Tonmali/Tonmali.html', is_public: false },
    { username: 'Zeno', password: 'password123', portfolio_path: '/portfolios/P4-2/Zeno/Zeno.html', is_public: false },
    { username: 'Chapter', password: 'password123', portfolio_path: '/portfolios/P4-2/Chapter/Chapter.html', is_public: false }
];

// Open the database
const db = new sqlite3.Database(dbPath);

// Function to add or update a student
function addOrUpdateStudent(student) {
    return new Promise((resolve, reject) => {
        // Check if student already exists
        db.get('SELECT id FROM users WHERE username = ?', [student.username], (err, row) => {
            if (err) {
                reject(err);
                return;
            }
            
            if (row) {
                // Update existing student
                db.run(
                    'UPDATE users SET portfolio_path = ?, is_public = ? WHERE username = ?',
                    [student.portfolio_path, student.is_public ? 1 : 0, student.username],
                    function(err) {
                        if (err) {
                            reject(err);
                        } else {
                            console.log(`Updated student ${student.username}`);
                            resolve();
                        }
                    }
                );
            } else {
                // Insert new student
                db.run(
                    'INSERT INTO users (username, password, portfolio_path, is_public) VALUES (?, ?, ?, ?)',
                    [student.username, student.password, student.portfolio_path, student.is_public ? 1 : 0],
                    function(err) {
                        if (err) {
                            reject(err);
                        } else {
                            console.log(`Added new student ${student.username}`);
                            resolve();
                        }
                    }
                );
            }
        });
    });
}

// Process all students and then close the database
async function processAllStudents() {
    try {
        // Create table if it doesn't exist
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
                else resolve();
            });
        });
        
        // Process each student
        for (const student of class42Students) {
            await addOrUpdateStudent(student);
        }
        
        // Get all students
        const students = await new Promise((resolve, reject) => {
            db.all('SELECT username, portfolio_path, is_public FROM users WHERE portfolio_path LIKE ?', ['%P4-2%'], (err, rows) => {
                if (err) reject(err);
                else resolve(rows);
            });
        });
        
        console.log(`\nFound ${students.length} Class 4/2 students in database:`);
        students.forEach((student, i) => {
            console.log(`${i+1}. ${student.username}: ${student.portfolio_path} (Public: ${student.is_public === 1 ? 'Yes' : 'No'})`);
        });
    } catch (err) {
        console.error('Error:', err);
    } finally {
        db.close();
    }
}

// Run the process
processAllStudents(); 