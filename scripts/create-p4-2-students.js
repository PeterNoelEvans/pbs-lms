// Script to create Class 4/2 students in the database
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');

// Database path
const dbPath = path.join(__dirname, '..', 'data', 'users.db');
console.log(`Using database at: ${dbPath}`);

// Open the database
const db = new sqlite3.Database(dbPath);

// Ensure P4-2 folder exists
const p42Dir = path.join(__dirname, '..', 'portfolios', 'P4-2');
if (!fs.existsSync(p42Dir)) {
    console.log(`Creating P4-2 directory at: ${p42Dir}`);
    fs.mkdirSync(p42Dir, { recursive: true });
}

// List of students from class-4-2.html
const students = [
    { username: 'Peter42', displayName: 'Peter42', path: '/portfolios/P4-2/Peter/Peter.html', avatar: '/portfolios/P4-2/Peter/images/Peter42.jpg', isPublic: true },
    { username: 'Darin', displayName: 'Darin', path: '/portfolios/P4-2/Darin/Darin.html', avatar: '/portfolios/P4-2/Darin/images/Darin.jpg', isPublic: true },
    { username: 'Sky', displayName: 'Sky', path: '/portfolios/P4-2/Sky/index.html', avatar: '/portfolios/P4-2/Sky/images/Sky.jpg', isPublic: true },
    { username: 'Perth', displayName: 'Perth', path: '/portfolios/P4-2/Perth/Perth.html', avatar: '/portfolios/P4-2/Perth/images/Perth.jpg', isPublic: true },
    { username: 'Tin', displayName: 'Tin', path: '/portfolios/P4-2/Tin/Tin.html', avatar: '/portfolios/P4-2/Tin/images/Tin.jpg', isPublic: true },
    { username: 'Tonmali', displayName: 'Tonmali', path: '/portfolios/P4-2/Tonmali/Tonmali.html', avatar: '/portfolios/P4-2/Tonmali/images/Tonmali.jpg', isPublic: true },
    { username: 'Zeno', displayName: 'Zeno', path: '/portfolios/P4-2/Zeno/Zeno.html', avatar: '/portfolios/P4-2/Zeno/images/Zeno.jpg', isPublic: true },
    { username: 'Chapter', displayName: 'Chapter', path: '/portfolios/P4-2/Chapter/Chapter.html', avatar: '/portfolios/P4-2/Chapter/images/Chapter.jpg', isPublic: true },
    { username: 'copter', displayName: 'Copter', path: '/portfolios/P4-2/copter/copter.html', avatar: '/portfolios/P4-2/copter/images/copter.jpg', isPublic: true },
    { username: 'Jdi', displayName: 'Jdi', path: '/portfolios/P4-2/Jdi/Jdi.html', avatar: '/portfolios/P4-2/Jdi/images/Jdi.jpg', isPublic: true },
    { username: 'nicha', displayName: 'Nicha', path: '/portfolios/P4-2/nicha.html', avatar: '/images/default-avatar.png', isPublic: true },
    { username: 'Ounjai', displayName: 'Ounjai', path: '/portfolios/P4-2/Ounjai/Ounjai.html', avatar: '/portfolios/P4-2/Ounjai/images/Ounjai.jpg', isPublic: true },
    { username: 'Paul', displayName: 'Paul', path: '/portfolios/P4-2/Paul/Paul.html', avatar: '/portfolios/P4-2/Paul/images/Paul.jpg', isPublic: true },
    { username: 'Peso', displayName: 'Peso', path: '/portfolios/P4-2/Peso/Peso.html', avatar: '/portfolios/P4-2/Peso/images/Peso.jpg', isPublic: true },
    { username: 'Peter', displayName: 'Peter', path: '/portfolios/P4-2/Peter/Peter.html', avatar: '/portfolios/P4-2/Peter/images/Peter.jpg', isPublic: true },
    { username: 'Pleng', displayName: 'Pleng', path: '/portfolios/P4-2/Pleng/Pleng.html', avatar: '/portfolios/P4-2/Pleng/images/Pleng.jpg', isPublic: true },
    { username: 'PoonPoon', displayName: 'PoonPoon', path: '/portfolios/P4-2/PoonPoon/PoonPoon.html', avatar: '/portfolios/P4-2/PoonPoon/images/PoonPoon.jpg', isPublic: true }
];

// Create student folders and index.html files
students.forEach(student => {
    // Extract student folder path from portfolio path
    const pathParts = student.path.split('/');
    const folderName = pathParts[pathParts.length - 2]; // Get the folder name
    const isRootHtmlFile = student.path.split('/').length === 4; // For cases like /portfolios/P4-2/nicha.html
    
    if (!isRootHtmlFile) {
        // Create student folder
        const studentDir = path.join(p42Dir, folderName);
        if (!fs.existsSync(studentDir)) {
            console.log(`Creating directory for ${student.username}: ${studentDir}`);
            fs.mkdirSync(studentDir, { recursive: true });
        }
        
        // Create images folder
        const imagesDir = path.join(studentDir, 'images');
        if (!fs.existsSync(imagesDir)) {
            console.log(`Creating images directory for ${student.username}`);
            fs.mkdirSync(imagesDir, { recursive: true });
        }
        
        // Create simple HTML file
        const htmlFilename = student.path.split('/').pop();
        const htmlPath = path.join(studentDir, htmlFilename);
        
        if (!fs.existsSync(htmlPath)) {
            console.log(`Creating HTML file for ${student.username}: ${htmlPath}`);
            const htmlContent = `<!DOCTYPE html>
<html>
<head>
    <title>${student.displayName}'s Portfolio</title>
</head>
<body>
    <h1>Welcome to ${student.displayName}'s Portfolio</h1>
    <p>This is a placeholder for ${student.displayName}'s portfolio.</p>
</body>
</html>`;
            fs.writeFileSync(htmlPath, htmlContent);
        }
    } else {
        // Handle HTML files at the root of P4-2
        const htmlFilename = student.path.split('/').pop();
        const htmlPath = path.join(p42Dir, htmlFilename);
        
        if (!fs.existsSync(htmlPath)) {
            console.log(`Creating HTML file at root for ${student.username}: ${htmlPath}`);
            const htmlContent = `<!DOCTYPE html>
<html>
<head>
    <title>${student.displayName}'s Portfolio</title>
</head>
<body>
    <h1>Welcome to ${student.displayName}'s Portfolio</h1>
    <p>This is a placeholder for ${student.displayName}'s portfolio.</p>
</body>
</html>`;
            fs.writeFileSync(htmlPath, htmlContent);
        }
    }
});

// Check for existing students and insert them into database if they don't exist
let insertedCount = 0;
let skippedCount = 0;

// Process each student sequentially with promises
const processStudents = async () => {
    for (const student of students) {
        try {
            // Check if student already exists
            const exists = await new Promise((resolve, reject) => {
                db.get('SELECT id FROM users WHERE username = ? OR portfolio_path = ?', 
                    [student.username, student.path], 
                    (err, row) => {
                        if (err) reject(err);
                        else resolve(row);
                    });
            });
            
            if (!exists) {
                // Insert the new student
                await new Promise((resolve, reject) => {
                    db.run(
                        'INSERT INTO users (username, portfolio_path, avatar_path, is_public) VALUES (?, ?, ?, ?)',
                        [student.username, student.path, student.avatar, student.isPublic ? 1 : 0],
                        function(err) {
                            if (err) reject(err);
                            else resolve(this.lastID);
                        }
                    );
                });
                console.log(`Inserted ${student.username} with path ${student.path}`);
                insertedCount++;
            } else {
                // Update existing student to be public
                await new Promise((resolve, reject) => {
                    db.run(
                        'UPDATE users SET is_public = 1 WHERE username = ? OR portfolio_path = ?',
                        [student.username, student.path],
                        function(err) {
                            if (err) reject(err);
                            else resolve(this.changes);
                        }
                    );
                });
                console.log(`Updated ${student.username} to be public`);
                skippedCount++;
            }
        } catch (error) {
            console.error(`Error processing student ${student.username}:`, error);
        }
    }
    
    console.log(`\nInserted ${insertedCount} new students`);
    console.log(`Updated ${skippedCount} existing students`);
    
    // Verify students in database
    const allStudents = await new Promise((resolve, reject) => {
        db.all('SELECT username, portfolio_path, is_public FROM users WHERE portfolio_path LIKE ?', 
            ['%P4-2%'], 
            (err, rows) => {
                if (err) reject(err);
                else resolve(rows);
            });
    });
    
    console.log(`\nVerified ${allStudents.length} P4-2 students in database:`);
    allStudents.forEach((row, i) => {
        console.log(`${i+1}. ${row.username}: ${row.portfolio_path} (Public: ${row.is_public === 1 ? 'Yes' : 'No'})`);
    });
    
    // Close the database
    db.close();
};

// Run the script
processStudents().catch(error => {
    console.error('Error in script:', error);
    db.close();
}); 