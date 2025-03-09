const express = require('express');
const path = require('path');
const session = require('express-session');
const RedisStore = require('connect-redis').default;
const { createClient } = require('redis');
const bcrypt = require('bcryptjs');
const sqlite3 = require('sqlite3').verbose();
const app = express();

// Use environment variables or defaults
const port = process.env.PORT || 10000;
const isProduction = process.env.NODE_ENV === 'production';
console.log('Running in', isProduction ? 'production mode' : 'development mode');

// Set database path based on environment
const dbPath = isProduction ? '/opt/render/project/src/data/users.db' : 'users.db';

// Create data directory in production
if (isProduction) {
    const fs = require('fs');
    const dataDir = '/opt/render/project/src/data';
    try {
        if (!fs.existsSync(dataDir)) {
            console.log('Creating data directory...');
            fs.mkdirSync(dataDir, { recursive: true, mode: 0o755 });
        }
        // Ensure we have write permissions
        fs.accessSync(dataDir, fs.constants.W_OK);
        console.log('Data directory is writable:', dataDir);
    } catch (error) {
        console.error('Error with data directory:', error);
        process.exit(1); // Exit if we can't access the data directory
    }
}

// Initialize Redis client
let redisClient;
let redisStore;

async function initializeRedis() {
    console.log('Initializing Redis client...');
    try {
        redisClient = createClient({
            url: 'redis://red-cv6hb9ij1k6c73e55rng:6379',
            socket: {
                reconnectStrategy: (retries) => {
                    console.log(`Redis reconnection attempt ${retries}`);
                    return Math.min(retries * 100, 3000);
                }
            }
        });

        redisClient.on('error', err => {
            console.error('Redis Client Error:', err);
        });

        redisClient.on('connect', () => {
            console.log('Redis client connected successfully');
        });

        redisClient.on('ready', () => {
            console.log('Redis client ready to accept commands');
            // Initialize Redis store
            redisStore = new RedisStore({
                client: redisClient,
                prefix: 'sess:',
                ttl: 24 * 60 * 60 // Session TTL in seconds (24 hours)
            });
            console.log('Redis store initialized');
            
            // Set up session middleware after Redis store is ready
            app.use(session({
                store: redisStore,
                name: 'connect.sid',
                secret: process.env.SESSION_SECRET || 'your-secret-key',
                resave: false,
                saveUninitialized: false,
                proxy: true,
                cookie: {
                    secure: isProduction,
                    httpOnly: true,
                    sameSite: 'none',
                    domain: '.onrender.com',
                    maxAge: 24 * 60 * 60 * 1000 // 24 hours
                }
            }));
            
            // Start the server only after Redis is ready
            app.listen(port, () => {
                console.log(`Server running on port ${port}`);
                if (isProduction) {
                    console.log('Running in production mode');
                } else {
                    console.log(`Local access: http://localhost:${port}`);
                }
            });
        });

        await redisClient.connect();
    } catch (err) {
        console.error('Failed to initialize Redis:', err);
        process.exit(1);
    }
}

// Initialize Redis and start server
initializeRedis().catch(err => {
    console.error('Failed to initialize application:', err);
    process.exit(1);
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
        db.run(`CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT UNIQUE,
            password TEXT,
            portfolio_path TEXT UNIQUE,
            is_public BOOLEAN DEFAULT 0
        )`, (err) => {
            if (err) {
                console.error('Error creating users table:', err);
                return;
            }
            console.log('Users table ready');
            
            // Check if Peter42 exists
            db.get('SELECT id FROM users WHERE username = ?', ['Peter42'], async (err, row) => {
                if (err) {
                    console.error('Error checking for Peter42:', err);
                    return;
                }

                // If Peter42 doesn't exist, create them
                if (!row) {
                    console.log('Creating Peter42 user...');
                    try {
                        const hashedPassword = await bcrypt.hash('Peter2025BB', 10);
                        db.run(
                            'INSERT INTO users (username, password, portfolio_path, is_public) VALUES (?, ?, ?, ?)',
                            ['Peter42', hashedPassword, '/portfolios/P4-1/Peter/Peter.html', true],
                            function(err) {
                                if (err) {
                                    console.error('Error creating Peter42:', err);
                                } else {
                                    console.log('Peter42 created successfully with ID:', this.lastID);
                                }
                            }
                        );
                    } catch (error) {
                        console.error('Failed to create Peter42:', error);
                    }
                } else {
                    console.log('Peter42 already exists with ID:', row.id);
                }
            });
        });
    });
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

    // Allow the specific origin
    const origin = req.headers.origin || 'https://codinghtml-presentation.onrender.com';
    res.header('Access-Control-Allow-Origin', origin);
    res.header('Access-Control-Allow-Credentials', 'true');
    res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');
    res.header('Access-Control-Expose-Headers', '*');
    
    // Handle preflight requests
    if (req.method === 'OPTIONS') {
        console.log('Handling OPTIONS preflight request');
        return res.status(200).end();
    }
    
    next();
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

// Security headers
app.use((req, res, next) => {
    res.set({
        'X-Content-Type-Options': 'nosniff',
        'X-Frame-Options': 'DENY',
        'X-XSS-Protection': '1; mode=block'
    });
    next();
});

// Serve static files from the current directory and public directory
app.use(express.static(__dirname));
app.use(express.static(path.join(__dirname, 'public')));

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
app.get('/health', async (req, res) => {
    console.log('Health check request received');
    
    let redisStatus = 'unknown';
    try {
        // Try to ping Redis
        await redisClient.ping();
        redisStatus = 'connected';
    } catch (error) {
        console.error('Redis health check failed:', error);
        redisStatus = 'disconnected';
    }
    
    res.json({
        status: 'ok',
        timestamp: new Date().toISOString(),
        environment: isProduction ? 'production' : 'development',
        redis: {
            status: redisStatus,
            connected: redisClient.isReady
        },
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
    console.log('Headers:', req.headers);

    const { username, password, portfolio_path } = req.body;
    
    if (!username || !password || !portfolio_path) {
        console.log('Missing registration data');
        return res.status(400).json({ error: 'All fields are required' });
    }

    try {
        // Ensure database exists
        if (isProduction) {
            const fs = require('fs');
            const dataDir = '/opt/render/project/src/data';
            if (!fs.existsSync(dataDir)) {
                console.log('Creating data directory...');
                fs.mkdirSync(dataDir, { recursive: true });
            }
        }

        // Check if user already exists
        const existingUser = await new Promise((resolve, reject) => {
            db.get('SELECT id, username, portfolio_path FROM users WHERE username = ? OR portfolio_path = ?', 
                [username, portfolio_path], 
                (err, row) => {
                    if (err) reject(err);
                    resolve(row);
                });
        });

        if (existingUser) {
            console.log('User or portfolio path already exists:', existingUser);
            const error = existingUser.username === username ? 
                'Username already exists' : 
                'Portfolio path already exists';
            return res.status(400).json({ error });
        }

        const hashedPassword = await bcrypt.hash(password, 10);
        
        // Insert new user
        const result = await new Promise((resolve, reject) => {
            db.run('INSERT INTO users (username, password, portfolio_path) VALUES (?, ?, ?)',
                [username, hashedPassword, portfolio_path],
                function(err) {
                    if (err) {
                        console.error('Database error during insert:', err);
                        reject(err);
                    } else {
                        console.log('User inserted with ID:', this.lastID);
                        resolve(this.lastID);
                    }
                });
        });

        console.log('User registered successfully:', username);
        console.log('New user ID:', result);

        // Set headers to prevent caching
        res.set({
            'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
            'Pragma': 'no-cache',
            'Expires': '0'
        });

        // Send success response
        res.json({ 
            success: true, 
            message: 'Registration successful',
            redirect: '/login.html'
        });
    } catch (error) {
        console.error('Registration error:', error);
        res.status(500).json({ error: 'Error creating user. Please try again.' });
    }
});

// Login route
app.post('/login', async (req, res) => {
    console.log('\n=== Login Attempt ===');
    console.log('Raw request body:', req.body);
    console.log('Headers:', req.headers);
    console.log('Session before login:', req.session);

    const { username, password } = req.body;
    
    if (!username || !password) {
        console.log('Missing credentials');
        return res.status(400).json({ error: 'Username and password are required' });
    }

    try {
        // Get user data
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

        // For Peter42, accept the hardcoded password
        const validPassword = username === 'Peter42' ? 
            password === 'Peter2025BB' : 
            await bcrypt.compare(password, user.password);

        if (!validPassword) {
            console.log('Invalid password for user:', username);
            return res.status(401).json({ error: 'Invalid credentials' });
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

            // Send success response with redirect
            res.json({
                success: true,
                redirect: '/dashboard'
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

// Protected dashboard route
app.get('/dashboard', requireAuth, (req, res) => {
    console.log('\n=== Dashboard Access ===');
    console.log('User:', req.session.user);
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

// Add session check endpoint
app.get('/check-session', (req, res) => {
    console.log('Session check:', {
        sessionID: req.sessionID,
        session: req.session,
        user: req.session?.user
    });
    res.json({
        authenticated: !!req.session?.user,
        user: req.session?.user
    });
}); 