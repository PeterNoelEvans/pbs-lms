// Script to set all portfolios to private by default
const sqlite3 = require('sqlite3').verbose();
const path = require('path');

// Database path
const dbPath = path.join(__dirname, '..', 'data', 'users.db');
console.log(`Using database at: ${dbPath}`);

// Open the database
const db = new sqlite3.Database(dbPath);

// Update all users to have is_public = 0 (private)
db.run('UPDATE users SET is_public = 0', function(err) {
    if (err) {
        console.error('Error updating privacy settings:', err);
    } else {
        console.log(`Set ${this.changes} portfolios to private`);
    }
    
    // Now verify the update
    db.all('SELECT username, is_public, portfolio_path FROM users', [], (err, users) => {
        if (err) {
            console.error('Error verifying update:', err);
        } else {
            console.log(`\nVerifying update: found ${users.length} users in the database`);
            users.forEach((user, i) => {
                console.log(`${i+1}. ${user.username}: ${user.portfolio_path} (Public: ${user.is_public === 1 ? 'Yes' : 'No'})`);
            });
        }
        
        // Close the database
        db.close();
    });
}); 