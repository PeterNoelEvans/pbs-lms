// Script to set all Class 4/2 students to public
const sqlite3 = require('sqlite3').verbose();
const path = require('path');

// Database path
const dbPath = path.join(__dirname, '..', 'data', 'users.db');
console.log(`Using database at: ${dbPath}`);

// Open the database
const db = new sqlite3.Database(dbPath);

// Update all users with P4-2 in their portfolio path to be public
db.run('UPDATE users SET is_public = 1 WHERE portfolio_path LIKE ?', ['%P4-2%'], function(err) {
    if (err) {
        console.error('Error updating Class 4/2 students:', err);
    } else {
        console.log(`Set ${this.changes} Class 4/2 students to public`);
    }
    
    // Verify the update
    db.all('SELECT username, portfolio_path, is_public FROM users WHERE portfolio_path LIKE ?', 
      ['%P4-2%'], (err, rows) => {
        if (err) {
            console.error('Error verifying update:', err);
        } else {
            console.log(`\nVerified ${rows.length} Class 4/2 students in database:`);
            rows.forEach((row, i) => {
                console.log(`${i+1}. ${row.username}: ${row.portfolio_path} (Public: ${row.is_public === 1 ? 'Yes' : 'No'})`);
            });
        }
        
        // Close the database
        db.close();
    });
}); 