const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('users.db');

// Show all users in the database
db.all("SELECT username, portfolio_path FROM users", [], (err, rows) => {
    if (err) {
        console.error('Error:', err);
        return;
    }
    
    console.log('All users in database:');
    rows.forEach(row => {
        console.log(`Username: ${row.username}`);
        console.log(`Portfolio: ${row.portfolio_path}`);
        console.log('---');
    });
    
    db.close();
}); 