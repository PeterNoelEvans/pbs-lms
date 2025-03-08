const sqlite3 = require('sqlite3').verbose();
const fetch = require('node-fetch');

const isProduction = process.env.NODE_ENV === 'production';
const dbPath = isProduction ? '/opt/render/project/src/users.db' : 'users.db';
const BASE_URL = isProduction ? 'https://codinghtml-presentation.onrender.com' : 'http://localhost:3002';
const db = new sqlite3.Database(dbPath);

// First check what users exist with similar names
db.all("SELECT username, portfolio_path FROM users WHERE username LIKE ?", ['%Peter%'], (err, rows) => {
    if (err) {
        console.error('Error checking users:', err);
        return;
    }

    console.log('Found users:', rows);

    // Delete any Peter42-related accounts
    db.run('DELETE FROM users WHERE username LIKE ?', ['%Peter42%'], async (err) => {
        if (err) {
            console.error('Error deleting Peter42:', err);
            return;
        }
        
        console.log('Successfully deleted Peter42 accounts');
        
        // Also delete by portfolio path to be sure
        db.run('DELETE FROM users WHERE portfolio_path LIKE ?', ['%/P4-2/Peter/%'], async (err) => {
            if (err) {
                console.error('Error deleting by portfolio path:', err);
                return;
            }

            console.log('Successfully deleted by portfolio path');
            
            // Wait a bit
            await new Promise(resolve => setTimeout(resolve, 1000));
            
            // Now register Peter42 again
            try {
                const response = await fetch(`${BASE_URL}/register`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({
                        username: 'Peter42',
                        password: 'Peter2024BB',
                        portfolio_path: '/portfolios/P4-2/Peter/Peter.html'
                    }),
                    redirect: 'manual'
                });

                if (response.status === 302 || response.ok) {
                    console.log('Successfully re-registered Peter42');
                } else {
                    const error = await response.json();
                    console.error('Failed to register Peter42:', error.error);
                }
            } catch (error) {
                console.error('Error:', error.message);
            }
            
            // Check final state
            db.all("SELECT username, portfolio_path FROM users WHERE username LIKE ?", ['%Peter%'], (err, rows) => {
                if (err) {
                    console.error('Error checking final state:', err);
                } else {
                    console.log('Final state users:', rows);
                }
                db.close();
            });
        });
    });
});