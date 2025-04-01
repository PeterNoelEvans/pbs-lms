const express = require('express');
const path = require('path');
const session = require('express-session');
const bcrypt = require('bcryptjs');
const fs = require('fs');
const sqlite3 = require('sqlite3').verbose();
const app = express();
const SQLiteStore = require('connect-sqlite3')(session);
require('dotenv').config();

const CredentialManager = require('./utils/credentialManager');
const StudentManager = require('./utils/studentManager');

// Use environment variables or defaults
const port = process.env.PORT || 10000;
const isProduction = process.env.NODE_ENV === 'production';
console.log('Running in', isProduction ? 'production mode' : 'development mode');

// Set database path based on environment
const dbPath = isProduction ? '/opt/render/project/src/data/users.db' : 'users.db';

// Create data directory in production
if (isProduction) {
    const dataDir = '/opt/render/project/src/data';
    try {
        if (!fs.existsSync(dataDir)) {
            console.log('Creating data directory...');
            fs.mkdirSync(dataDir, { recursive: true, mode: 0o755 });
        }
        fs.accessSync(dataDir, fs.constants.W_OK);
        console.log('Data directory is writable');
    } catch (error) {
        console.error('Error with directory setup:', error);
        process.exit(1);
    }
}

// Initialize managers
const credentialManager = new CredentialManager(process.env.CREDENTIAL_KEY);
const studentManager = new StudentManager(credentialManager);

// Create data directory for SQLite session store
const sessionDir = './data';
if (!fs.existsSync(sessionDir)) {
    fs.mkdirSync(sessionDir, { recursive: true });
}

// Session configuration with better security
const sessionConfig = {
    store: new SQLiteStore({
        db: 'sessions.db',
        dir: sessionDir
    }),
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    cookie: {
        secure: process.env.NODE_ENV === 'production',
        httpOnly: true,
        maxAge: 24 * 60 * 60 * 1000 // 24 hours
    }
};

// Initialize application
async function initializeApp() {
    console.log('Initializing application...');
    try {
        // Essential middleware first
        app.use(express.json());
        app.use(express.urlencoded({ extended: true }));
        
        // Trust proxy settings - MUST be before session middleware
        app.set('trust proxy', 1);
        
        // Trust Cloudflare headers
        app.use((req, res, next) => {
            if (req.headers['cf-visitor']) {
                try {
                    const cfVisitor = JSON.parse(req.headers['cf-visitor']);
                    req.protocol = cfVisitor.scheme;
                } catch (e) {
                    console.error('Error parsing cf-visitor header:', e);
                }
            }
            next();
        });

        // Initialize session middleware
        app.use(session(sessionConfig));

        // Health check endpoint
        app.get('/health', (req, res) => {
            res.status(200).json({
                status: 'ok',
                timestamp: new Date().toISOString()
            });
        });

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

        // Authentication middleware
        const requireAuth = (req, res, next) => {
            console.log('\n=== Auth Check ===');
            console.log('Session:', req.session);
            console.log('User:', req.session?.user);
            
            if (!req.session || !req.session.user) {
                console.log('No valid session, redirecting to login');
                return res.redirect('/login.html');
            }
            next();
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

        // Set up static file serving with enhanced options
        app.use(express.static(__dirname, {
            dotfiles: 'allow',
            etag: true,
            extensions: ['htm', 'html', 'png', 'jpg', 'jpeg', 'gif'],
            index: false,
            maxAge: '1d',
            redirect: false,
            setHeaders: function (res, path, stat) {
                res.set('x-timestamp', Date.now());
                res.set('Cache-Control', 'public, max-age=86400');
            }
        }));
        app.use('/portfolios', express.static(path.join(__dirname, 'portfolios'), {
            dotfiles: 'allow',
            etag: true,
            extensions: ['htm', 'html', 'png', 'jpg', 'jpeg', 'gif'],
            index: false,
            maxAge: '1d',
            redirect: false,
            setHeaders: function (res, path, stat) {
                res.set('x-timestamp', Date.now());
                res.set('Cache-Control', 'public, max-age=86400');
            }
        }));

        // Rate limiting for login attempts
        const rateLimit = require('express-rate-limit');
        const loginLimiter = rateLimit({
            windowMs: 5 * 60 * 1000, // 5 minutes instead of 15
            max: 20, // Allow 20 requests instead of 5
            message: { error: 'Too many login attempts, please try again later' },
            standardHeaders: true,
            legacyHeaders: false,
            handler: (req, res) => {
                res.status(429).json({
                    error: 'Too many login attempts. Please wait 5 minutes before trying again.',
                    retryAfter: Math.ceil(req.rateLimit.resetTime / 1000)
                });
            }
        });

        // Login route with rate limiting
        app.post('/login', loginLimiter, async (req, res) => {
            const { username, password } = req.body;

            try {
                const student = await studentManager.verifyStudent(username, password);
                
                if (!student) {
                    return res.status(401).json({ error: 'Invalid credentials' });
                }

                // Set session data
                req.session.user = {
                    id: student.id,
                    username: student.username,
                    portfolio_path: student.portfolio_path
                };

                // Save session
                await new Promise((resolve, reject) => {
                    req.session.save((err) => {
                        if (err) reject(err);
                        else resolve();
                    });
                });

                res.json({
                    success: true,
                    redirect: '/dashboard',
                    user: {
                        username: student.username,
                        portfolio_path: student.portfolio_path
                    }
                });
            } catch (error) {
                console.error('Login error:', error);
                res.status(500).json({ error: 'Internal server error' });
            }
        });

        app.get('/dashboard', requireAuth, (req, res) => {
            console.log('\n=== Dashboard Access Attempt ===');
            console.log('Session:', req.session);
            console.log('User:', req.session?.user);
            console.log('Cookies:', req.headers.cookie);
            
            console.log('Valid session found, serving dashboard');
            res.sendFile(path.join(__dirname, 'dashboard.html'));
        });

        app.post('/toggle-privacy', requireAuth, (req, res) => {
            console.log('Toggle privacy request received');
            console.log('Session:', req.session);
            
            if (!req.session || !req.session.user || !req.session.user.id) {
                console.log('Not authenticated:', req.session);
                return res.status(401).json({ error: 'Not authenticated' });
            }

            console.log('Updating privacy for user:', req.session.user.username);
            
            const db = new sqlite3.Database(dbPath);
            
            // First, get the current state
            db.get('SELECT is_public FROM users WHERE id = ?', [req.session.user.id], (err, currentState) => {
                if (err) {
                    console.error('Error getting current state:', err);
                    return res.status(500).json({ error: 'Error getting current privacy state' });
                }
                
                if (!currentState) {
                    console.log('User not found when getting current state');
                    return res.status(404).json({ error: 'User not found' });
                }
                
                console.log('Current privacy state:', currentState.is_public);
                
                // Now toggle the state
                db.run('UPDATE users SET is_public = ? WHERE id = ?',
                    [currentState.is_public ? 0 : 1, req.session.user.id],
                    function(err) {
                        if (err) {
                            console.error('Error updating privacy:', err);
                            return res.status(500).json({ error: 'Error updating privacy settings' });
                        }

                        console.log('Privacy updated, rows affected:', this.changes);

                        // Get the new status after toggle
                        db.get('SELECT is_public FROM users WHERE id = ?', [req.session.user.id], (err, result) => {
                            if (err) {
                                console.error('Error getting updated status:', err);
                                return res.status(500).json({ error: 'Error getting updated status' });
                            }
                            if (!result) {
                                console.log('User not found after update');
                                return res.status(404).json({ error: 'User not found' });
                            }
                            console.log('New privacy status:', result.is_public);
                            res.json({ success: true, is_public: result.is_public });
                        });
                    });
            });
        });

        app.get('/get-privacy-status', requireAuth, (req, res) => {
            if (!req.session || !req.session.user || !req.session.user.id) {
                return res.status(401).json({ error: 'Not authenticated' });
            }

            const db = new sqlite3.Database(dbPath);
            db.get('SELECT is_public FROM users WHERE id = ?', [req.session.user.id], (err, result) => {
                if (err) {
                    console.error('Error getting privacy status:', err);
                    return res.status(500).json({ error: 'Error getting privacy status' });
                }
                if (!result) {
                    return res.status(404).json({ error: 'User not found' });
                }
                res.json({ is_public: result.is_public });
            });
        });

        app.get('/get-all-privacy-states', async (req, res) => {
            console.log('\n=== Get All Privacy States ===');
            const db = new sqlite3.Database(dbPath);
            db.all('SELECT id, username, portfolio_path, is_public FROM users', [], (err, rows) => {
                if (err) {
                    console.error('Error getting privacy states:', err);
                    return res.status(500).json({ error: 'Error getting privacy states' });
                }
                
                console.log('Privacy states from database:');
                rows.forEach(row => {
                    console.log(`${row.id}: ${row.username} - ${row.portfolio_path}: ${row.is_public}`);
                });
                
                // Convert array of rows to object with portfolio_path as key
                const privacyStates = rows.reduce((acc, row) => {
                    acc[row.portfolio_path] = row.is_public === 1;
                    return acc;
                }, {});
                
                console.log('Sending privacy states to client:', privacyStates);
                res.json(privacyStates);
            });
        });

        // Additional routes
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

        // Admin routes
        app.get('/admin/users', requireAdmin, (req, res) => {
            console.log('\n=== Viewing All Users ===');
            db.all('SELECT id, username, portfolio_path, avatar_path, is_public FROM users', [], (err, rows) => {
                if (err) {
                    console.error('Database error when viewing users:', err);
                    res.status(500).json({ error: 'Database error' });
                    return;
                }
                console.log('Users in database:', rows.length);
                res.json(rows);
            });
        });

        app.delete('/admin/users/:id', requireAdmin, (req, res) => {
            const userId = req.params.id;
            console.log('\n=== Delete User Attempt ===');
            console.log('User ID:', userId);
            console.log('IP:', req.ip);
            
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

        // Admin routes with secure token verification
        const adminLimiter = rateLimit({
            windowMs: 60 * 60 * 1000, // 1 hour
            max: 10 // limit each IP to 10 requests per windowMs
        });

        app.post('/admin/reset-password', adminLimiter, async (req, res) => {
            const adminToken = req.headers['admin-token'];
            
            if (adminToken !== process.env.ADMIN_TOKEN) {
                return res.status(403).json({ error: 'Unauthorized' });
            }

            const { username, newPassword } = req.body;

            try {
                await studentManager.resetPassword(username, newPassword);
                res.json({ success: true, message: 'Password reset successful' });
            } catch (error) {
                console.error('Password reset error:', error);
                res.status(500).json({ error: 'Internal server error' });
            }
        });

        // Detailed health check endpoint for debugging
        app.get('/health/detailed', async (req, res) => {
            console.log('\n=== Detailed Health Check ===');
            console.log('Request received at:', new Date().toISOString());
            console.log('Environment:', isProduction ? 'production' : 'development');
            
            const health = {
                status: 'ok',
                timestamp: new Date().toISOString(),
                environment: isProduction ? 'production' : 'development',
                session: {
                    exists: !!req.session,
                    id: req.sessionID || null,
                    cookie: req.session?.cookie || null
                }
            };

            // Log the complete health status
            console.log('Health check result:', JSON.stringify(health, null, 2));

            // Always return 200 - detailed health check is for debugging
            res.status(200).json(health);
        });

        // Create server instance
        app.server = app.listen(port, () => {
            console.log(`Server running on port ${port}`);
            console.log('Running in', isProduction ? 'production mode' : 'development mode');
        });

    } catch (err) {
        console.error('Failed to initialize application:', err);
        process.exit(1);
    }
}

// Initialize the application
initializeApp().catch(err => {
    console.error('Application startup failed:', err);
    process.exit(1);
});

// Graceful shutdown handling
process.on('SIGTERM', () => {
    console.log('SIGTERM signal received. Starting graceful shutdown...');
    
    // Track shutdown state
    let shutdownComplete = false;
    
    // Set a timeout for forceful shutdown
    const forceShutdown = setTimeout(() => {
        console.error('Forceful shutdown initiated after timeout');
        process.exit(1);
    }, 25000); // 25 seconds timeout (Render gives 30 seconds)
    
    Promise.all([
        // Close the HTTP server
        new Promise((resolve) => {
            if (!app.server) {
                resolve();
                return;
            }
            console.log('Closing HTTP server...');
            app.server.close(() => {
                console.log('HTTP server closed');
                resolve();
            });
        }),
        // Close database connection
        new Promise((resolve) => {
            if (!db) {
                resolve();
                return;
            }
            console.log('Closing database connection...');
            db.close((err) => {
                if (err) {
                    console.error('Error closing database:', err);
                } else {
                    console.log('Database connection closed');
                }
                resolve();
            });
        })
    ]).then(() => {
        console.log('Graceful shutdown completed');
        clearTimeout(forceShutdown);
        shutdownComplete = true;
        process.exit(0);
    }).catch((err) => {
        console.error('Error during graceful shutdown:', err);
        if (!shutdownComplete) {
            process.exit(1);
        }
    });
});

// Routes
app.post('/register', async (req, res) => {
    const { username, password, portfolio_path } = req.body;

    try {
        const studentId = await studentManager.addStudent(username, password, portfolio_path);
        
        if (!studentId) {
            return res.status(400).json({ error: 'Registration failed' });
        }

        const student = await studentManager.getStudentById(studentId);

        // Set session
        req.session.user = {
            id: student.id,
            username: student.username,
            portfolio_path: student.portfolio_path
        };

        res.json({ 
            success: true, 
            message: 'Registration successful',
            redirect: '/dashboard'
        });
    } catch (error) {
        console.error('Registration error:', error);
        res.status(500).json({ error: 'Error creating user' });
    }
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
app.get(['/', '/index.html', '/login.html', '/register.html', '/dashboard.html', '/class1.html', '/class2.html'], (req, res) => {
    // Redirect old class URLs to new class1.html
    if (req.path === '/class-4-1.html' || req.path === '/class-4-2.html') {
        return res.redirect('/class1.html');
    }
    res.sendFile(path.join(__dirname, req.path === '/' ? 'index.html' : req.path));
});

// Protected portfolio access
app.get('/portfolios/*', async (req, res, next) => {
    const portfolioPath = req.path;
    
    // Check if this is a static file request (images, css, js, etc)
    const staticFileExtensions = ['.jpg', '.jpeg', '.png', '.gif', '.mp4', '.css', '.js', '.webp', '.ico', '.svg'];
    if (staticFileExtensions.some(ext => portfolioPath.toLowerCase().endsWith(ext))) {
        // Skip validation for static files
        return next();
    }
    
    console.log('\n=== Portfolio Access Attempt ===');
    console.log('Accessing portfolio:', portfolioPath);
    console.log('Current directory:', __dirname);

    try {
        // First check if the portfolios directory exists
        const portfoliosDir = path.join(__dirname, 'portfolios');
        if (!fs.existsSync(portfoliosDir)) {
            console.log('Portfolios directory does not exist:', portfoliosDir);
            fs.mkdirSync(portfoliosDir, { recursive: true });
            console.log('Created portfolios directory');
        }

        // Create Class1 directory if it doesn't exist (for current students)
        const class1Dir = path.join(portfoliosDir, 'Class1');
        if (!fs.existsSync(class1Dir)) {
            console.log('Class1 directory does not exist:', class1Dir);
            fs.mkdirSync(class1Dir, { recursive: true });
            console.log('Created Class1 directory');
        }

        // Create Class2 directory if it doesn't exist (for future students)
        const class2Dir = path.join(portfoliosDir, 'Class2');
        if (!fs.existsSync(class2Dir)) {
            console.log('Class2 directory does not exist:', class2Dir);
            fs.mkdirSync(class2Dir, { recursive: true });
            console.log('Created Class2 directory');
        }

        // Check if the file exists
        const fullPath = path.join(__dirname, portfolioPath);
        console.log('Full path:', fullPath);
        
        const fileExists = fs.existsSync(fullPath);
        console.log('File exists:', fileExists);

        if (!fileExists) {
            console.log('Portfolio file not found:', fullPath);
            return res.status(404).send('Portfolio not found');
        }

        const result = await new Promise((resolve, reject) => {
            db.get('SELECT is_public, username FROM users WHERE portfolio_path = ?',
                [portfolioPath],
                (err, row) => {
                    if (err) {
                        console.error('Database error:', err);
                        reject(err);
                    } else {
                        console.log('Database result:', row);
                        resolve(row);
                    }
                });
        });

        // If portfolio is not registered, deny access
        if (!result) {
            console.log('Portfolio not registered in database:', portfolioPath);
            return res.status(404).send('Portfolio not found');
        }

        // If user is logged in
        if (req.session?.user) {
            console.log('Authenticated access attempt by:', req.session.user.username);
            console.log('Portfolio owner:', result.username);
            console.log('Is public:', result.is_public);
            
            // Check if the user is a parent
            const isParent = req.session.user.username.toLowerCase().startsWith('parent-');
            
            if (isParent) {
                const childName = req.session.user.username.substring('parent-'.length);
                if (result.is_public || result.username === childName) {
                    console.log('Access granted to parent');
                    return next();
                }
            } else if (result.is_public || result.username === req.session.user.username) {
                console.log('Access granted to user');
                return next();
            }
        } else if (result.is_public) {
            console.log('Access granted to public portfolio');
            return next();
        }

        console.log('Access denied to portfolio:', portfolioPath);
        res.status(403).send('Access denied');
    } catch (error) {
        console.error('Error checking portfolio access:', error);
        console.error('Stack trace:', error.stack);
        res.status(500).send('Server error');
    }
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

// Add session check endpoint
app.get('/check-session', (req, res) => {
    console.log('\n=== Detailed Session Check ===');
    console.log('Headers:', req.headers);
    console.log('Session ID:', req.sessionID);
    console.log('Session:', req.session);
    console.log('Cookies:', req.headers.cookie);
    
    // Set no-cache headers
    res.set({
        'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
        'Pragma': 'no-cache',
        'Expires': '0'
    });
    
    res.json({
        authenticated: !!req.session?.user,
        user: req.session?.user,
        sessionExists: !!req.session,
        sessionID: req.sessionID,
        hasCookies: !!req.headers.cookie
    });
});

// Create SQLite database with proper error handling
console.log('Initializing database at:', dbPath);
const db = new sqlite3.Database(dbPath, (err) => {
    if (err) {
        console.error('Error opening database:', err);
        process.exit(1);
    }
    console.log('Successfully connected to database');
    
    // Create tables and initial user
    db.serialize(() => {
        // Ensure data directory exists in production
        if (isProduction) {
            const fs = require('fs');
            const dataDir = '/opt/render/project/src/data';
            
            try {
                // Create data directory only
                if (!fs.existsSync(dataDir)) {
                    console.log('Creating data directory...');
                    fs.mkdirSync(dataDir, { recursive: true, mode: 0o755 });
                }

                // Ensure we have write permissions for data directory
                fs.accessSync(dataDir, fs.constants.W_OK);
                console.log('Data directory is writable');
            } catch (error) {
                console.error('Error with directory setup:', error);
                process.exit(1);
            }
        }

        db.run(`CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT UNIQUE,
            password TEXT,
            portfolio_path TEXT UNIQUE,
            avatar_path TEXT,
            is_public BOOLEAN DEFAULT 0,
            is_super_user BOOLEAN DEFAULT 0
        )`, async (err) => {
            if (err) {
                console.error('Error creating users table:', err);
                return;
            }
            console.log('Users table ready');
            
            // Add super_user column if it doesn't exist
            db.run(`ALTER TABLE users ADD COLUMN is_super_user BOOLEAN DEFAULT 0;`, (err) => {
                if (err && !err.message.includes('duplicate column')) {
                    console.error('Error adding is_super_user column:', err);
                }
            });

            // Set Peter42 as super user
            db.run('UPDATE users SET is_super_user = 1 WHERE username = ?', ['Peter42'], (err) => {
                if (err) {
                    console.error('Error setting Peter42 as super user:', err);
                }
            });

            // Add avatar_path column if it doesn't exist
            db.run(`ALTER TABLE users ADD COLUMN avatar_path TEXT;`, (err) => {
                if (err && !err.message.includes('duplicate column')) {
                    console.error('Error adding avatar_path column:', err);
                }
            });
            
            try {
                // Check if Peter42 exists
                const row = await new Promise((resolve, reject) => {
                    db.get('SELECT id, username FROM users WHERE username = ?', ['Peter42'], (err, row) => {
                        if (err) reject(err);
                        else resolve(row);
                    });
                });

                if (row) {
                    console.log('Peter42 exists with ID:', row.id);
                    // Update Peter42's avatar path
                    await new Promise((resolve, reject) => {
                        db.run(
                            'UPDATE users SET avatar_path = ?, portfolio_path = ? WHERE username = ?',
                            ['/portfolios/P4-2/Peter/images/Peter42.jpg', '/portfolios/P4-2/Peter/Peter.html', 'Peter42'],
                            function(err) {
                                if (err) reject(err);
                                else {
                                    console.log('Updated Peter42 avatar path and portfolio path');
                                    resolve();
                                }
                            }
                        );
                    });
                } else {
                    console.log('Peter42 not found, creating...');
                    // Create Peter42 with hashed password and avatar path
                    const hashedPassword = await bcrypt.hash('Peter2025BB', 10);
                    await new Promise((resolve, reject) => {
                        db.run(
                            'INSERT INTO users (username, password, portfolio_path, avatar_path, is_public) VALUES (?, ?, ?, ?, ?)',
                            ['Peter42', hashedPassword, '/portfolios/P4-2/Peter/Peter.html', '/portfolios/P4-2/Peter/images/Peter42.jpg', true],
                            function(err) {
                                if (err) reject(err);
                                else {
                                    console.log('Peter42 created successfully with ID:', this.lastID);
                                    resolve(this.lastID);
                                }
                            }
                        );
                    });
                }
            } catch (error) {
                console.error('Error handling Peter42 user:', error);
            }
        });
    });
});

app.get('/debug-privacy/:username', (req, res) => {
    const username = req.params.username;
    console.log('\n=== Debug Privacy Status ===');
    console.log('Checking privacy for:', username);
    
    const db = new sqlite3.Database(dbPath);
    db.get('SELECT username, is_public, portfolio_path FROM users WHERE username = ?', [username], (err, result) => {
        if (err) {
            console.error('Error getting privacy status:', err);
            return res.status(500).json({ error: 'Error getting privacy status' });
        }
        if (!result) {
            return res.status(404).json({ error: 'User not found' });
        }
        res.json(result);
    });
});