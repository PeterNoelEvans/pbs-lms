const sqlite3 = require('sqlite3').verbose();
const path = require('path');

// Connect to the database
const db = new sqlite3.Database('users.db');

// Update Peter41's portfolio path
db.run(
    'UPDATE users SET portfolio_path = ? WHERE username = ?',
    ['/portfolios/P4-2/Peter/Peter.html', 'Peter41'],
    function(err) {
        if (err) {
            console.error('Error updating Peter41:', err);
        } else {
            console.log('Successfully updated Peter41\'s portfolio path');
            console.log('Changes made:', this.changes);
        }
        db.close();
    }
); 