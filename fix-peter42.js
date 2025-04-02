const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const bcrypt = require('bcryptjs');

// Connect to the database
const db = new sqlite3.Database(path.join(__dirname, 'data', 'users.db'));

// Function to create Peter42
async function createPeter42() {
    const hashedPassword = await bcrypt.hash('Peter2025BB', 10);
    const portfolioPath = '/portfolios/P4-2/Peter/Peter.html';
    const avatarPath = '/portfolios/P4-2/Peter/images/Peter42.jpg';

    return new Promise((resolve, reject) => {
        db.run(
            'INSERT INTO users (username, password, portfolio_path, avatar_path, is_public, is_super_user) VALUES (?, ?, ?, ?, ?, ?)',
            ['Peter42', hashedPassword, portfolioPath, avatarPath, 1, 1],
            function(err) {
                if (err) {
                    console.error('Error creating Peter42:', err);
                    reject(err);
                } else {
                    console.log('Successfully created Peter42 with ID:', this.lastID);
                    resolve(this.lastID);
                }
            }
        );
    });
}

// Check if Peter42 exists and update their portfolio path
db.get('SELECT * FROM users WHERE username = ?', ['Peter42'], async (err, row) => {
    if (err) {
        console.error('Error checking Peter42:', err);
        db.close();
        return;
    }

    if (!row) {
        console.log('Peter42 not found in database, creating...');
        try {
            await createPeter42();
            console.log('Peter42 created successfully');
        } catch (error) {
            console.error('Failed to create Peter42:', error);
        }
        db.close();
        return;
    }

    console.log('Current Peter42 data:', row);

    // Update portfolio path if needed
    const correctPath = '/portfolios/P4-2/Peter/Peter.html';
    if (row.portfolio_path !== correctPath) {
        db.run('UPDATE users SET portfolio_path = ? WHERE username = ?', 
            [correctPath, 'Peter42'],
            function(err) {
                if (err) {
                    console.error('Error updating Peter42:', err);
                } else {
                    console.log('Successfully updated Peter42\'s portfolio path');
                }
                db.close();
            });
    } else {
        console.log('Peter42\'s portfolio path is already correct');
        db.close();
    }
}); 