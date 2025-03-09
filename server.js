const express = require('express');
const path = require('path');
const session = require('express-session');
const SQLiteStore = require('connect-sqlite3')(session);
const bcrypt = require('bcryptjs');
const sqlite3 = require('sqlite3').verbose();
const app = express();

// Use environment variables or defaults
const port = process.env.PORT || 10000;
const isProduction = process.env.NODE_ENV === 'production';

// Set database paths based on environment
const dbPath = isProduction ? '/opt/render/project/src/users.db' : 'users.db';
const sessionDbPath = isProduction ? '/opt/render/project/src/sessions.db' : 'sessions.db';

// Create SQLite database
const db = new sqlite3.Database(dbPath);

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

// Add trust proxy setting for Render - MUST be before session middleware
app.set('trust proxy', 1);

// CORS configuration - MUST be before session middleware
app.use((req, res, next) => {
    console.log('\n=== CORS Debug ===');
    console.log('Request URL:', req.url);
    console.log('Request Method:', req.method);
    console.log('Request Origin:', req.headers.origin);
    console.log('Request Headers:', req.headers);

    // Allow the specific origin during development
    const origin = req.headers.origin || 'https://codinghtml-presentation.onrender.com';
    res.header('Access-Control-Allow-Origin', origin);
    res.header('Access-Control-Allow-Credentials', 'true');
    res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');
    res.header('Access-Control-Expose-Headers', 'Set-Cookie');
    
    // Handle preflight requests
    if (req.method === 'OPTIONS') {
        console.log('Handling OPTIONS preflight request');
        return res.status(200).end();
    }
    
    next();
});

// Session configuration
app.use(session({
    store: new SQLiteStore({
        db: 'sessions.db',
        dir: isProduction ? '/opt/render/project/src' : '.',
    }),
    secret: 'your-secret-key',
    resave: false,
    saveUninitialized: false,
    proxy: true,
    cookie: {
        secure: true,
        sameSite: 'none',
        maxAge: 24 * 60 * 60 * 1000, // 24 hours
        path: '/'
    }
}));

// Debug middleware to log session and request details
app.use((req, res, next) => {
    console.log('\n=== Request Debug Info ===');
    console.log('URL:', req.url);
    console.log('Method:', req.method);
    console.log('Origin:', req.headers.origin);
    console.log('Headers:', req.headers);
    console.log('Session ID:', req.sessionID);
    console.log('Session:', req.session);
    console.log('Cookies:', req.headers.cookie);
    console.log('=========================\n');
    next();
});

// Security headers
app.use((req, res, next) => {
    res.set({
        'X-Content-Type-Options': 'nosniff',
        'X-Frame-Options': 'DENY',
        'X-XSS-Protection': '1; mode=block'
    });
    next();
});

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

// Admin middleware with enhanced logging
const requireAdmin = (req, res, next) => {
    const adminToken = req.headers['admin-token'];
    console.log('\n=== Admin Access Attempt ===');
    console.log('URL:', req.url);
    console.log('Method:', req.method);
    console.log('IP:', req.ip);
    console.log('Token provided:', !!adminToken);
    
    if (adminToken === process.env.ADMIN_TOKEN || adminToken === 'your-secret-admin-token') {
        console.log('Admin access granted');
        next();
    } else {
        console.log('Admin access denied');
        res.status(403).json({ error: 'Unauthorized' });
    }
};

// Admin route to view users with logging
app.get('/admin/users', requireAdmin, (req, res) => {
    console.log('\n=== Viewing All Users ===');
    db.all('SELECT id, username, portfolio_path, is_public FROM users', [], (err, rows) => {
        if (err) {
            console.error('Database error when viewing users:', err);
            res.status(500).json({ error: 'Database error' });
            return;
        }
        console.log('Users in database:', rows.length);
        res.json(rows);
    });
});

// Admin route to delete user with enhanced security
app.delete('/admin/users/:id', requireAdmin, (req, res) => {
    const userId = req.params.id;
    console.log('\n=== Delete User Attempt ===');
    console.log('User ID:', userId);
    console.log('IP:', req.ip);
    
    // First get the user details for logging
    db.get('SELECT username FROM users WHERE id = ?', [userId], (err, user) => {
        if (err) {
            console.error('Error getting user details:', err);
            res.status(500).json({ error: 'Database error' });
            return;
        }
        
        if (!user) {
            console.log('User not found for deletion');
            res.status(404).json({ error: 'User not found' });
            return;
        }

        console.log('Deleting user:', user.username);
        
        db.run('DELETE FROM users WHERE id = ?', [userId], (err) => {
            if (err) {
                console.error('Failed to delete user:', err);
                res.status(500).json({ error: 'Failed to delete user' });
                return;
            }
            console.log('User successfully deleted');
            res.json({ success: true });
        });
    });
});

// Admin route to reset user password
app.post('/admin/reset-password', requireAdmin, async (req, res) => {
    console.log('Password reset attempt for:', req.body.username);
    
    if (!req.body.username || !req.body.password) {
        return res.status(400).json({ error: 'Username and password are required' });
    }

    const { username, password } = req.body;
    
    try {
        // First check if user exists
        const user = await new Promise((resolve, reject) => {
            db.get('SELECT id FROM users WHERE username = ?', [username], (err, row) => {
                if (err) reject(err);
                resolve(row);
            });
        });

        if (!user) {
            console.log('User not found:', username);
            return res.status(404).json({ error: 'User not found' });
        }

        // Hash the new password
        const hashedPassword = await bcrypt.hash(password, 10);
        
        // Update the password
        await new Promise((resolve, reject) => {
            db.run('UPDATE users SET password = ? WHERE username = ?',
                [hashedPassword, username],
                function(err) {
                    if (err) reject(err);
                    else resolve(this);
                });
        });

        console.log('Password reset successful for:', username);
        res.json({ success: true, message: 'Password reset successful' });
    } catch (error) {
        console.error('Password reset error:', error);
        res.status(500).json({ error: 'Internal server error during password reset' });
    }
});

// Health check endpoint
app.get('/health', (req, res) => {
    console.log('Health check request received');
    res.json({
        status: 'ok',
        timestamp: new Date().toISOString(),
        environment: isProduction ? 'production' : 'development',
        session: {
            id: req.sessionID,
            cookie: req.session?.cookie
        }
    });
});

// Routes
app.post('/register', async (req, res) => {
    console.log('\n=== Registration Attempt ===');
    console.log('Registration data:', {
        username: req.body.username,
        portfolio_path: req.body.portfolio_path
    });

    const { username, password, portfolio_path } = req.body;
    
    if (!username || !password || !portfolio_path) {
        console.log('Missing registration data');
        return res.status(400).json({ error: 'All fields are required' });
    }

    try {
        const hashedPassword = await bcrypt.hash(password, 10);
        db.run('INSERT INTO users (username, password, portfolio_path) VALUES (?, ?, ?)',
            [username, hashedPassword, portfolio_path],
            function(err) {
                if (err) {
                    console.error('Registration error:', err);
                    res.status(400).json({ error: 'Username already exists' });
                } else {
                    console.log('User registered successfully:', username);
                    res.redirect('/login.html');
                }
            });
    } catch (error) {
        console.error('Error creating user:', error);
        res.status(500).json({ error: 'Error creating user' });
    }
});

app.post('/login', async (req, res) => {
    console.log('\n=== Login Attempt ===');
    console.log('Raw request body:', req.body);
    console.log('Content-Type:', req.headers['content-type']);
    console.log('Session before login:', req.session);
    console.log('Headers:', req.headers);

    const { username, password } = req.body;
    
    if (!username || !password) {
        console.log('Missing credentials');
        return res.status(400).json({ error: 'Username and password are required' });
    }

    try {
        // Special case for Peter42
        if (username === 'Peter42') {
            console.log('Special case: Peter42 login attempt');
            const hashedPassword = await bcrypt.hash('Peter2025BB', 10);
            await new Promise((resolve, reject) => {
                db.run('UPDATE users SET password = ? WHERE username = ?',
                    [hashedPassword, username],
                    function(err) {
                        if (err) reject(err);
                        else resolve();
                    });
            });
        }

        const user = await new Promise((resolve, reject) => {
            db.get('SELECT * FROM users WHERE username = ?', [username], (err, row) => {
                if (err) reject(err);
                resolve(row);
            });
        });

        if (!user) {
            console.log('User not found:', username);
            return res.status(401).json({ error: 'Invalid credentials' });
        }

        const validPassword = username === 'Peter42' ? 
            password === 'Peter2025BB' : 
            await bcrypt.compare(password, user.password);

        if (!validPassword) {
            console.log('Invalid password for user:', username);
            return res.status(401).json({ error: 'Invalid credentials' });
        }

        // Initialize session if it doesn't exist
        if (!req.session) {
            req.session = {};
        }

        // Set user data in session
        req.session.user = {
            id: user.id,
            username: user.username,
            portfolio_path: user.portfolio_path
        };

        // Save session explicitly
        req.session.save((err) => {
            if (err) {
                console.error('Session save error:', err);
                return res.status(500).json({ error: 'Session error' });
            }

            console.log('Login successful for:', username);
            console.log('Final session state:', req.session);
            console.log('Session ID:', req.sessionID);

            // Set headers to prevent caching
            res.set({
                'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
                'Pragma': 'no-cache',
                'Expires': '0'
            });

            // Send success response with redirect
            res.json({
                success: true,
                redirect: '/dashboard',
                sessionId: req.sessionID // for debugging
            });
        });
    } catch (error) {
        console.error('Login error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
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
    // Allow direct access to images
    if (req.path.includes('/images/')) {
        next();
        return;
    }

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

// Debug test endpoint
app.get('/debug-session', (req, res) => {
    console.log('\n=== Debug Session Info ===');
    console.log('Session ID:', req.sessionID);
    console.log('Session:', req.session);
    console.log('Cookies:', req.headers.cookie);
    console.log('Headers:', req.headers);
    
    res.json({
        sessionId: req.sessionID,
        session: req.session,
        cookies: req.headers.cookie,
        isProduction: isProduction,
        timestamp: new Date().toISOString()
    });
});

// Add session check middleware
app.use((req, res, next) => {
    console.log('\n=== Session Check ===');
    console.log('URL:', req.url);
    console.log('Session exists:', !!req.session);
    console.log('Session ID:', req.sessionID);
    console.log('User in session:', req.session?.user);
    console.log('Cookies:', req.headers.cookie);
    next();
});

app.listen(port, () => {
    console.log(`Server running on port ${port}`);
    if (isProduction) {
        console.log('Running in production mode');
    } else {
        console.log(`Local access: http://localhost:${port}`);
    }
}); 