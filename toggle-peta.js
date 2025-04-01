const sqlite3 = require('sqlite3').verbose();
const dbPath = 'users.db';

// Open the database
const db = new sqlite3.Database(dbPath, (err) => {
  if (err) {
    console.error('Error opening database:', err.message);
    return;
  }
  console.log('Connected to the database');
  
  // First, get current privacy status
  db.get('SELECT id, username, is_public FROM users WHERE username = ?', ['Peta'], (err, row) => {
    if (err) {
      console.error('Error querying database:', err.message);
      db.close();
      return;
    }
    
    if (!row) {
      console.log('Peta not found in the database');
      db.close();
      return;
    }
    
    console.log('Current status:', row);
    const newStatus = row.is_public === 1 ? 0 : 1;
    console.log('Setting privacy to:', newStatus);
    
    // Update the privacy setting
    db.run('UPDATE users SET is_public = ? WHERE username = ?', [newStatus, 'Peta'], function(err) {
      if (err) {
        console.error('Error updating database:', err.message);
        db.close();
        return;
      }
      
      console.log(`Updated ${this.changes} row(s)`);
      
      // Verify the change
      db.get('SELECT id, username, is_public FROM users WHERE username = ?', ['Peta'], (err, updatedRow) => {
        if (err) {
          console.error('Error verifying update:', err.message);
        } else {
          console.log('New status:', updatedRow);
        }
        
        // Close the database
        db.close();
      });
    });
  });
}); 