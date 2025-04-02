// Script to manually insert P4-1 students with correct info
const sqlite3 = require('sqlite3').verbose();
const path = require('path');

// Database path
const dbPath = path.join(__dirname, '..', 'data', 'users.db');
console.log(`Using database at: ${dbPath}`);

// Sample P4-1 students
const p4_1_students = [
    { name: 'Peter41', path: '/portfolios/P4-1/Peter/Peter.html', public: true },
    { name: 'Peta', path: '/portfolios/P4-1/Peta/Peta.html', public: true },
    { name: 'Uda', path: '/portfolios/P4-1/Uda/index.html', public: true },
    { name: 'Nava', path: '/portfolios/P4-1/Nava/Nava.html', public: true }
];

// Open the database
const db = new sqlite3.Database(dbPath);

// Function to check and update a student
async function checkAndUpdateStudent(student) {
    return new Promise((resolve, reject) => {
        // First check if student exists
        db.get('SELECT id, is_public FROM users WHERE username = ?', [student.name], (err, user) => {
            if (err) {
                console.error(`Error checking student ${student.name}:`, err);
                resolve(false);
                return;
            }
            
            if (user) {
                // Update existing student
                db.run(
                    'UPDATE users SET portfolio_path = ?, is_public = ? WHERE username = ?',
                    [student.path, student.public ? 1 : 0, student.name],
                    function(err) {
                        if (err) {
                            console.error(`Error updating student ${student.name}:`, err);
                            resolve(false);
                        } else {
                            console.log(`Updated student ${student.name} (ID: ${user.id}), set public: ${student.public}`);
                            resolve(true);
                        }
                    }
                );
            } else {
                // Insert new student
                db.run(
                    'INSERT INTO users (username, password, portfolio_path, is_public) VALUES (?, ?, ?, ?)',
                    [student.name, `${student.name}2025`, student.path, student.public ? 1 : 0],
                    function(err) {
                        if (err) {
                            console.error(`Error inserting student ${student.name}:`, err);
                            resolve(false);
                        } else {
                            console.log(`Inserted new student ${student.name} (ID: ${this.lastID}), public: ${student.public}`);
                            resolve(true);
                        }
                    }
                );
            }
        });
    });
}

// Process all students sequentially
async function processStudents() {
    for (const student of p4_1_students) {
        await checkAndUpdateStudent(student);
    }
    
    // Verify the database state after updates
    db.all('SELECT username, portfolio_path, is_public FROM users WHERE portfolio_path LIKE ?', ['%P4-1%'], (err, rows) => {
        if (err) {
            console.error('Error verifying database:', err);
        } else {
            console.log(`\nFound ${rows.length} P4-1 students in database:`);
            rows.forEach((row, i) => {
                console.log(`${i+1}. ${row.username}: ${row.portfolio_path} (Public: ${row.is_public === 1 ? 'Yes' : 'No'})`);
            });
        }
        
        // Close the database
        db.close();
    });
}

// Run the process
processStudents(); 