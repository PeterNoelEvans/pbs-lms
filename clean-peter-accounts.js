const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('users.db');

// Check Peter-related accounts
db.serialize(() => {
    // Show current Peter-related accounts
    db.all("SELECT username, portfolio_path FROM users WHERE username LIKE ?", ['%Peter%'], (err, rows) => {
        if (err) {
            console.error('Error checking accounts:', err);
        } else {
            console.log('\nCurrent Peter-related accounts:');
            rows.forEach(row => {
                console.log(`Username: ${row.username}`);
                console.log(`Portfolio: ${row.portfolio_path}`);
                console.log('---');
            });
        }
        db.close();
    });
}); 