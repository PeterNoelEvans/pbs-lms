const sqlite3 = require('sqlite3').verbose();
const isProduction = process.env.NODE_ENV === 'production';
const dbPath = isProduction ? '/opt/render/project/src/users.db' : 'users.db';

console.log('Setting some portfolios to public...');

const db = new sqlite3.Database(dbPath);

// Get all students
db.all('SELECT id, username, portfolio_path FROM users WHERE portfolio_path LIKE "%ClassM2-001%"', [], (err, students) => {
    if (err) {
        console.error('Error fetching students:', err);
        db.close();
        return;
    }
    
    console.log(`Found ${students.length} students in ClassM2-001`);
    
    // Set approximately half of the portfolios to public
    const studentsToMakePublic = students.filter((_, index) => index % 2 === 0);
    
    console.log(`Setting ${studentsToMakePublic.length} portfolios to public...`);
    
    // Create a promise for each update
    const updatePromises = studentsToMakePublic.map(student => {
        return new Promise((resolve, reject) => {
            db.run('UPDATE users SET is_public = 1 WHERE id = ?', [student.id], function(err) {
                if (err) {
                    console.error(`Error updating ${student.username}:`, err);
                    reject(err);
                } else {
                    console.log(`Set ${student.username} (${student.portfolio_path}) to public`);
                    resolve();
                }
            });
        });
    });
    
    // Execute all updates
    Promise.all(updatePromises)
        .then(() => {
            console.log('All updates completed');
            // Verify the changes
            return new Promise((resolve, reject) => {
                db.all('SELECT username, portfolio_path, is_public FROM users WHERE portfolio_path LIKE "%ClassM2-001%"', [], (err, rows) => {
                    if (err) {
                        reject(err);
                    } else {
                        console.log('\nVerifying updates:');
                        rows.forEach(row => {
                            console.log(`${row.username} (${row.portfolio_path}): ${row.is_public ? 'Public' : 'Private'}`);
                        });
                        resolve();
                    }
                });
            });
        })
        .catch(error => {
            console.error('Error during updates:', error);
        })
        .finally(() => {
            db.close();
            console.log('Done!');
        });
}); 