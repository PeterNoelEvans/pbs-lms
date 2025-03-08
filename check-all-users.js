const sqlite3 = require('sqlite3').verbose();
const isProduction = process.env.NODE_ENV === 'production';
const dbPath = isProduction ? '/opt/render/project/src/users.db' : 'users.db';
const db = new sqlite3.Database(dbPath);

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