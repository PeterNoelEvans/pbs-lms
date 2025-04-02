// Script to set a specific user's portfolio to public
const sqlite3 = require('sqlite3').verbose();
const path = require('path');

// Database path
const dbPath = path.join(__dirname, '..', 'data', 'users.db');
console.log(`Using database at: ${dbPath}`);

// User to update
const username = 'Peter41';

// Open the database
const db = new sqlite3.Database(dbPath);

// Update the user's privacy setting
db.run('UPDATE users SET is_public = 1 WHERE username = ?', [username], function(err) {
    if (err) {
        console.error(`Error updating ${username}'s privacy:`, err);
    } else {
        if (this.changes > 0) {
            console.log(`Successfully set ${username}'s portfolio to public`);
        } else {
            console.log(`No user found with username ${username}`);
        }
    }
    
    // Verify the update
    db.get('SELECT username, is_public, portfolio_path FROM users WHERE username = ?', [username], (err, user) => {
        if (err) {
            console.error('Error verifying update:', err);
        } else if (user) {
            console.log(`User ${user.username} privacy status: ${user.is_public === 1 ? 'Public' : 'Private'}`);
            console.log(`Portfolio path: ${user.portfolio_path}`);
        } else {
            console.log(`User ${username} not found`);
        }
        
        // Close the database
        db.close();
    });
}); 