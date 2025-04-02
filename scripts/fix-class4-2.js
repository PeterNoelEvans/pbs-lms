// Script to properly add Class 4/2 students with exact case matching
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');

// Database path
const dbPath = path.join(__dirname, '..', 'data', 'users.db');
console.log(`Using database at: ${dbPath}`);

// Check what's actually in the filesystem
const p42Path = path.join(__dirname, '..', 'portfolios', 'P4-2');
console.log(`Checking directory: ${p42Path}`);

// Get actual folder names with correct case
let students = [];

try {
    if (fs.existsSync(p42Path)) {
        const entries = fs.readdirSync(p42Path, { withFileTypes: true });
        
        console.log(`Found ${entries.length} entries in P4-2 directory:`);
        
        entries.forEach(entry => {
            console.log(` - ${entry.name} (${entry.isDirectory() ? 'Directory' : 'File'})`);
            
            if (entry.isDirectory()) {
                // Use exact name from filesystem
                const studentName = entry.name;
                
                // Try to find HTML files in the directory
                let htmlFile = `${studentName}.html`;
                try {
                    const files = fs.readdirSync(path.join(p42Path, studentName));
                    const htmlFiles = files.filter(file => file.endsWith('.html'));
                    if (htmlFiles.length > 0) {
                        htmlFile = htmlFiles[0];
                    }
                } catch (err) {
                    console.log(`  Could not read files for ${studentName}: ${err.message}`);
                }
                
                // Check for avatar images
                let avatarPath = null;
                try {
                    const imagesPath = path.join(p42Path, studentName, 'images');
                    if (fs.existsSync(imagesPath)) {
                        const imageFiles = fs.readdirSync(imagesPath).filter(file => 
                            file.toLowerCase().endsWith('.jpg') || 
                            file.toLowerCase().endsWith('.png') || 
                            file.toLowerCase().endsWith('.jpeg')
                        );
                        if (imageFiles.length > 0) {
                            avatarPath = `/portfolios/P4-2/${studentName}/images/${imageFiles[0]}`;
                            console.log(`  Found avatar: ${imageFiles[0]}`);
                        }
                    }
                } catch (err) {
                    console.log(`  Could not find avatar for ${studentName}: ${err.message}`);
                }
                
                students.push({
                    username: studentName,
                    portfolio_path: `/portfolios/P4-2/${studentName}/${htmlFile}`,
                    avatar_path: avatarPath,
                    is_public: studentName === 'Peter' // Only Peter is public
                });
            } else if (entry.name.endsWith('.html')) {
                // Handle HTML files at root
                const studentName = entry.name.replace('.html', '');
                students.push({
                    username: studentName,
                    portfolio_path: `/portfolios/P4-2/${entry.name}`,
                    avatar_path: null,
                    is_public: false
                });
            }
        });
    } else {
        console.log('Directory P4-2 not found!');
    }
    
    // Add Peter42 manually if not found
    if (!students.some(s => s.username === 'Peter' || s.username === 'Peter42')) {
        students.push({
            username: 'Peter42',
            portfolio_path: '/portfolios/P4-2/Peter/Peter.html',
            avatar_path: '/portfolios/P4-2/Peter/images/Peter42.jpg',
            is_public: true
        });
    }
    
} catch (err) {
    console.error('Error reading filesystem:', err);
}

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
            
            const params = [
                student.portfolio_path,
                student.avatar_path,
                student.is_public ? 1 : 0,
                student.username
            ];
            
            if (row) {
                // Update existing student
                db.run(
                    'UPDATE users SET portfolio_path = ?, avatar_path = ?, is_public = ? WHERE username = ?',
                    params,
                    function(err) {
                        if (err) {
                            console.error(`Error updating ${student.username}:`, err);
                            reject(err);
                        } else {
                            console.log(`Updated student ${student.username} (ID: ${row.id})`);
                            resolve();
                        }
                    }
                );
            } else {
                // Insert new student
                db.run(
                    'INSERT INTO users (username, password, portfolio_path, avatar_path, is_public) VALUES (?, ?, ?, ?, ?)',
                    [student.username, 'password123', student.portfolio_path, student.avatar_path, student.is_public ? 1 : 0],
                    function(err) {
                        if (err) {
                            console.error(`Error inserting ${student.username}:`, err);
                            reject(err);
                        } else {
                            console.log(`Added new student ${student.username} (ID: ${this.lastID})`);
                            resolve();
                        }
                    }
                );
            }
        });
    });
}

// Process all students and then close the database
async function processStudents() {
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
        
        console.log(`\nProcessing ${students.length} students:`);
        for (const student of students) {
            await addOrUpdateStudent(student);
        }
        
        // Verify database state
        const dbStudents = await new Promise((resolve, reject) => {
            db.all('SELECT username, portfolio_path, avatar_path, is_public FROM users WHERE portfolio_path LIKE ?', ['%P4-2%'], (err, rows) => {
                if (err) reject(err);
                else resolve(rows);
            });
        });
        
        console.log(`\nFound ${dbStudents.length} Class 4/2 students in database:`);
        dbStudents.forEach((s, i) => {
            console.log(`${i+1}. ${s.username}: ${s.portfolio_path} (Public: ${s.is_public === 1 ? 'Yes' : 'No'})`);
        });
    } catch (err) {
        console.error('Error processing students:', err);
    } finally {
        db.close();
    }
}

processStudents(); 