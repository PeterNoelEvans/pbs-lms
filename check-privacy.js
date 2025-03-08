const sqlite3 = require('sqlite3').verbose();
const isProduction = process.env.NODE_ENV === 'production';
const dbPath = isProduction ? '/opt/render/project/src/users.db' : 'users.db';
const db = new sqlite3.Database(dbPath);

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