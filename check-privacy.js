const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('users.db');

// Check Peter41's privacy status
db.get('SELECT id, username, is_public FROM users WHERE username = ?', ['Peter41'], (err, user) => {
    if (err) {
        console.error('Error:', err);
        return;
    }
    
    if (user) {
        console.log('Current status for Peter41:', user.is_public ? 'Public' : 'Private');
        
        // Set it to public
        db.run('UPDATE users SET is_public = 1 WHERE username = ?', ['Peter41'], (err) => {
            if (err) {
                console.error('Error updating:', err);
            } else {
                console.log('Successfully set Peter41 to public');
            }
            db.close();
        });
    } else {
        console.log('User Peter41 not found');
        db.close();
    }
}); 