const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const dbPath = path.join(__dirname, '..', 'data', 'users.db');

console.log('Adding is_super_user column to users table...');

const db = new sqlite3.Database(dbPath);

// Add the is_super_user column if it doesn't exist
db.run(`ALTER TABLE users ADD COLUMN is_super_user INTEGER DEFAULT 0`, (err) => {
    if (err) {
        if (err.message.includes('duplicate column name')) {
            console.log('Column is_super_user already exists');
        } else {
            console.error('Error adding column:', err);
            db.close();
            return;
        }
    } else {
        console.log('Added is_super_user column successfully');
    }

    // Set Peter42 as super user
    db.run('UPDATE users SET is_super_user = 1 WHERE username = ?', ['Peter42'], function(err) {
        if (err) {
            console.error('Error setting Peter42 as super user:', err);
        } else {
            console.log('Set Peter42 as super user successfully');
        }
        
        // Verify the changes
        db.get('SELECT username, is_super_user FROM users WHERE username = ?', ['Peter42'], (err, row) => {
            if (err) {
                console.error('Error verifying super user status:', err);
            } else {
                console.log('Verification:', row);
            }
            db.close();
        });
    });
}); 