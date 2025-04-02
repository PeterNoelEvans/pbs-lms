// Script to check if P4-1 students exist in the database
const sqlite3 = require('sqlite3').verbose();
const path = require('path');

// Database path
const dbPath = path.join(__dirname, '..', 'data', 'users.db');
console.log(`Using database at: ${dbPath}`);

// Open the database
const db = new sqlite3.Database(dbPath);

// Check for P4-1 students
db.all("SELECT * FROM users WHERE portfolio_path LIKE '%P4-1%'", [], (err, rows) => {
    if (err) {
        console.error('Error querying database:', err);
        db.close();
        return;
    }
    
    console.log(`Found ${rows.length} P4-1 students:`);
    rows.forEach((row, i) => {
        console.log(`${i+1}. ${row.username}: ${row.portfolio_path} (Public: ${row.is_public === 1 ? 'Yes' : 'No'})`);
    });
    
    db.close();
}); 