const sqlite3 = require('sqlite3').verbose();
const isProduction = process.env.NODE_ENV === 'production';
const dbPath = isProduction ? '/opt/render/project/src/users.db' : 'users.db';
const db = new sqlite3.Database(dbPath);

// Check if Peter42 exists
db.get('SELECT id, username, portfolio_path FROM users WHERE username = ?', ['Peter42'], (err, user) => {
    if (err) {
        console.error('Error:', err);
        return;
    }
    
    if (user) {
        console.log('User Peter42 exists:', user);
    } else {
        console.log('User Peter42 not found in database');
    }
    db.close();
}); 