const sqlite3 = require('sqlite3').verbose();
const fetch = require('node-fetch');
const db = new sqlite3.Database('users.db');

// First delete all Peter-related accounts
db.serialize(() => {
    // Delete all Peter accounts
    db.run('DELETE FROM users WHERE username IN (?, ?, ?)', ['Peter Evans', 'Peter42', 'parent-peter42'], (err) => {
        if (err) {
            console.error('Error deleting accounts:', err);
            return;
        }
        console.log('Successfully deleted old Peter accounts');
        
        // Register Peter42 fresh
        setTimeout(async () => {
            try {
                const response = await fetch('http://localhost:3002/register', {
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
                    console.log('Successfully registered Peter42');
                    
                    // Register parent account
                    setTimeout(async () => {
                        const parentResponse = await fetch('http://localhost:3002/register', {
                            method: 'POST',
                            headers: {
                                'Content-Type': 'application/json',
                            },
                            body: JSON.stringify({
                                username: 'parent-peter42',
                                password: 'Peter2024BB',
                                portfolio_path: '/portfolios/P4-2/Peter/Peter-parent.html'
                            }),
                            redirect: 'manual'
                        });

                        if (parentResponse.status === 302 || parentResponse.ok) {
                            console.log('Successfully registered parent-peter42');
                        } else {
                            console.error('Failed to register parent account');
                        }
                        
                        // Show final state
                        db.all("SELECT username, portfolio_path FROM users WHERE username LIKE ?", ['%Peter%'], (err, rows) => {
                            if (err) {
                                console.error('Error checking final state:', err);
                            } else {
                                console.log('\nFinal Peter-related accounts:');
                                rows.forEach(row => {
                                    console.log(`Username: ${row.username}`);
                                    console.log(`Portfolio: ${row.portfolio_path}`);
                                    console.log('---');
                                });
                            }
                            db.close();
                        });
                    }, 1000);
                } else {
                    console.error('Failed to register Peter42');
                    db.close();
                }
            } catch (error) {
                console.error('Error:', error.message);
                db.close();
            }
        }, 1000);
    });
}); 