const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('users.db');

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