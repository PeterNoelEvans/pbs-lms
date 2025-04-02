// Script to set all Class 4/1 students to public
const sqlite3 = require('sqlite3').verbose();
const path = require('path');

// Database path
const dbPath = path.join(__dirname, '..', 'data', 'users.db');
console.log(`Using database at: ${dbPath}`);

// Open the database
const db = new sqlite3.Database(dbPath);

// Update all users with P4-1 in their portfolio path to be public (case-insensitive)
db.run('UPDATE users SET is_public = 1 WHERE LOWER(portfolio_path) LIKE ?', ['%p4-1%'], function(err) {
    if (err) {
        console.error('Error updating Class 4/1 students:', err);
    } else {
        console.log(`Set ${this.changes} Class 4/1 students to public`);
    }
    
    // Verify the update with case-insensitive search
    db.all('SELECT username, portfolio_path, is_public FROM users WHERE LOWER(portfolio_path) LIKE ?', 
      ['%p4-1%'], (err, rows) => {
        if (err) {
            console.error('Error verifying update:', err);
        } else {
            console.log(`\nVerified ${rows.length} Class 4/1 students in database:`);
            rows.forEach((row, i) => {
                console.log(`${i+1}. ${row.username}: ${row.portfolio_path} (Public: ${row.is_public === 1 ? 'Yes' : 'No'})`);
            });
        }
        
        // Close the database
        db.close();
    });
}); 