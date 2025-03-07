const express = require('express');
const path = require('path');
const session = require('express-session');
const bcrypt = require('bcryptjs');
const sqlite3 = require('sqlite3').verbose();
const app = express();
const port = process.env.PORT || 3002;

// Create SQLite database
const db = new sqlite3.Database('users.db');

// Create tables
db.serialize(() => {
    db.run(`CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT UNIQUE,
        password TEXT,
        portfolio_path TEXT UNIQUE,
        is_public BOOLEAN DEFAULT 0
    )`);
});

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(session({
    secret: 'your-secret-key',
    resave: false,
    saveUninitialized: false,
    cookie: { secure: process.env.NODE_ENV === 'production' }
}));

// Serve static files from the current directory
app.use(express.static(__dirname));

// Authentication middleware
const requireAuth = (req, res, next) => {
    if (req.session.user) {
        next();
    } else {
        res.redirect('/login.html');
    }
};

// Admin route to view users
app.get('/admin/users', (req, res) => {
    db.all('SELECT id, username, portfolio_path, is_public FROM users', [], (err, rows) => {
        if (err) {
            res.status(500).json({ error: 'Database error' });
            return;
        }
        res.json(rows);
    });
});

// Admin route to delete user
app.delete('/admin/users/:id', (req, res) => {
    const userId = req.params.id;
    db.run('DELETE FROM users WHERE id = ?', [userId], (err) => {
        if (err) {
            res.status(500).json({ error: 'Failed to delete user' });
            return;
        }
        res.json({ success: true });
    });
});

// Routes
app.post('/register', async (req, res) => {
    const { username, password, portfolio_path } = req.body;
    try {
        const hashedPassword = await bcrypt.hash(password, 10);
        db.run('INSERT INTO users (username, password, portfolio_path) VALUES (?, ?, ?)',
            [username, hashedPassword, portfolio_path],
            (err) => {
                if (err) {
                    res.status(400).json({ error: 'Username already exists' });
                } else {
                    res.redirect('/login.html');
                }
            });
    } catch (error) {
        res.status(500).json({ error: 'Error creating user' });
    }
});

app.post('/login', async (req, res) => {
    const { username, password } = req.body;
    db.get('SELECT * FROM users WHERE username = ?', [username], async (err, user) => {
        if (user && await bcrypt.compare(password, user.password)) {
            req.session.user = { id: user.id, username: user.username, portfolio_path: user.portfolio_path };
            res.redirect('/dashboard');
        } else {
            res.status(401).json({ error: 'Invalid credentials' });
        }
    });
});

app.post('/toggle-privacy', requireAuth, (req, res) => {
    db.run('UPDATE users SET is_public = NOT is_public WHERE id = ?',
        [req.session.user.id],
        function(err) {
            if (err) {
                res.status(500).json({ error: 'Error updating privacy settings' });
            } else {
                // Get the new status after toggle
                db.get('SELECT is_public FROM users WHERE id = ?', [req.session.user.id], (err, result) => {
                    if (err) {
                        res.status(500).json({ error: 'Error getting updated status' });
                    } else {
                        res.json({ success: true, is_public: result.is_public });
                    }
                });
            }
        });
});

// New endpoint to get privacy status
app.get('/get-privacy-status', requireAuth, (req, res) => {
    db.get('SELECT is_public FROM users WHERE id = ?', [req.session.user.id], (err, result) => {
        if (err) {
            res.status(500).json({ error: 'Error getting privacy status' });
        } else {
            res.json({ is_public: result.is_public });
        }
    });
});

app.get('/check-access/*', (req, res) => {
    // Remove /check-access from the start of the path
    const portfolioPath = req.path.replace('/check-access', '');
    
    db.get('SELECT is_public, username FROM users WHERE portfolio_path = ?',
        [portfolioPath],
        (err, result) => {
            if (err) {
                res.status(500).json({ error: 'Database error' });
                return;
            }
            
            // If portfolio is not registered, default to private
            if (!result) {
                res.json({ hasAccess: false });
                return;
            }

            // If user is logged in
            if (req.session.user) {
                // Check if the user is a parent
                const isParent = req.session.user.username.toLowerCase().startsWith('parent-');
                
                if (isParent) {
                    // Get the student's name from parent's username (after 'parent-')
                    const childName = req.session.user.username.substring('parent-'.length);
                    // Parents can only see public portfolios and their child's portfolio
                    const hasAccess = result.is_public || result.username === childName;
                    res.json({ hasAccess });
                    return;
                }

                // For students, check if they own the portfolio
                db.get('SELECT username FROM users WHERE id = ?', [req.session.user.id], (err, user) => {
                    if (err) {
                        res.status(500).json({ error: 'Database error' });
                        return;
                    }
                    
                    // Allow access if:
                    // 1. Portfolio is public, OR
                    // 2. User owns any portfolio (same username)
                    const hasAccess = result.is_public || (user && result.username === user.username);
                    res.json({ hasAccess });
                });
            } else {
                // Not logged in, only allow access to public portfolios
                res.json({ hasAccess: result.is_public });
            }
        });
});

// Serve the main pages
app.get(['/', '/index.html'], (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

app.get('/dashboard', requireAuth, (req, res) => {
    res.sendFile(path.join(__dirname, 'dashboard.html'));
});

// Protected portfolio access
app.get('/portfolios/*', async (req, res, next) => {
    const portfolioPath = req.path;
    db.get('SELECT is_public, username FROM users WHERE portfolio_path = ?',
        [portfolioPath],
        (err, result) => {
            if (err) {
                res.status(500).send('Database error');
                return;
            }
            
            // If portfolio is not registered, deny access
            if (!result) {
                res.status(403).send('Access denied');
                return;
            }

            // If user is logged in
            if (req.session.user) {
                // Check if the user is a parent
                const isParent = req.session.user.username.toLowerCase().startsWith('parent-');
                
                if (isParent) {
                    // Get the student's name from parent's username (after 'parent-')
                    const childName = req.session.user.username.substring('parent-'.length);
                    // Parents can only see public portfolios and their child's portfolio
                    if (result.is_public || result.username === childName) {
                        next();
                    } else {
                        res.status(403).send('Access denied');
                    }
                    return;
                }

                // For students, check if they own the portfolio
                db.get('SELECT username FROM users WHERE id = ?', [req.session.user.id], (err, user) => {
                    if (err) {
                        res.status(500).send('Database error');
                        return;
                    }
                    
                    // Allow access if:
                    // 1. Portfolio is public, OR
                    // 2. User owns any portfolio (same username)
                    if (result.is_public || (user && result.username === user.username)) {
                        next();
                    } else {
                        res.status(403).send('Access denied');
                    }
                });
            } else {
                // Not logged in, only allow access to public portfolios
                if (result.is_public) {
                    next();
                } else {
                    res.status(403).send('Access denied');
                }
            }
        });
});

app.get('/check-auth', (req, res) => {
    if (req.session.user) {
        res.json({
            authenticated: true,
            username: req.session.user.username,
            portfolio_path: req.session.user.portfolio_path
        });
    } else {
        res.json({ authenticated: false });
    }
});

app.get('/logout', (req, res) => {
    req.session.destroy();
    res.redirect('/');
});

app.listen(port, () => {
    console.log(`Server running on port ${port}`);
    console.log(`Local network access: http://<your-computer-ip>:${port}`);
}); 