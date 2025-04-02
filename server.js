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
const dbPath = process.env.DATABASE_PATH || path.join(__dirname, 'data', 'users.db');

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
        dir: sessionDir,
        concurrentDB: true // Enable concurrent access
    }),
    secret: process.env.SESSION_SECRET || 'your-secret-key-here',
    resave: true,
    saveUninitialized: true,
    rolling: true, // Reset expiration with each request
    cookie: {
        secure: process.env.NODE_ENV === 'production',
        httpOnly: true,
        maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
        sameSite: 'lax'
    }
};

// Require the school configuration
const schoolConfig = require('./config/schools');

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
            const { username, password, remember } = req.body;

            try {
                const db = new sqlite3.Database(dbPath);
                
                // Get user
                const user = await new Promise((resolve, reject) => {
                    db.get('SELECT * FROM users WHERE username = ?', [username], (err, row) => {
                        if (err) reject(err);
                        else resolve(row);
                    });
                });

                if (!user) {
                    return res.status(401).json({ error: 'Invalid username or password' });
                }

                // Verify password
                const isValid = await bcrypt.compare(password, user.password);
                if (!isValid) {
                    return res.status(401).json({ error: 'Invalid username or password' });
                }

                // Update last login time
                await new Promise((resolve, reject) => {
                    db.run(
                        'UPDATE users SET last_login = CURRENT_TIMESTAMP WHERE id = ?',
                        [user.id],
                        function(err) {
                            if (err) reject(err);
                            else resolve();
                        }
                    );
                });

                // Set up session
                req.session.user = {
                    id: user.id,
                    username: user.username,
                    portfolio_path: user.portfolio_path,
                    email: user.email,
                    is_super_user: user.is_super_user
                };

                // If remember me is checked, set a longer session expiry
                if (remember) {
                    req.session.cookie.maxAge = 30 * 24 * 60 * 60 * 1000; // 30 days
                }

                res.json({ 
                    success: true,
                    redirect: '/dashboard'
                });
            } catch (error) {
                console.error('Login error:', error);
                res.status(500).json({ error: 'Server error' });
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

        app.post('/toggle-privacy', requireAuth, async (req, res) => {
            try {
                const userId = req.session.user.id;
                const username = req.session.user.username;
                
                if (!userId) {
                return res.status(401).json({ error: 'Not authenticated' });
            }

                console.log(`Toggling privacy for user: ${username} (ID: ${userId})`);
                
                const db = new sqlite3.Database(dbPath);
                
                // First, get the current state
                const currentState = await new Promise((resolve, reject) => {
                    db.get('SELECT is_public FROM users WHERE id = ?', [userId], (err, result) => {
                    if (err) {
                            reject(err);
                            return;
                        }
                        if (!result) {
                            reject(new Error('User not found'));
                            return;
                        }
                        resolve(result);
                    });
                });
                
                console.log('Current privacy state:', currentState.is_public);
                
                // Calculate new state (toggle)
                const newState = currentState.is_public ? 0 : 1;
                
                // Update the privacy setting
                await new Promise((resolve, reject) => {
                    db.run('UPDATE users SET is_public = ? WHERE id = ?', [newState, userId], function(err) {
                        if (err) {
                            reject(err);
                            return;
                        }
                        if (this.changes === 0) {
                            reject(new Error('User not found during update'));
                            return;
                        }
                        resolve();
                    });
                });
                
                db.close();
                
                // Return the new state
                res.json({ success: true, is_public: newState === 1 });
                
            } catch (error) {
                console.error('Error toggling privacy:', error);
                res.status(500).json({ error: 'Failed to update privacy setting' });
            }
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
            const db = new sqlite3.Database(dbPath);
            
            try {
                console.log('\n=== Getting All Privacy States ===');
                
                const privacyStates = await new Promise((resolve, reject) => {
                    db.all('SELECT portfolio_path, is_public FROM users', [], (err, rows) => {
                        if (err) {
                            console.error('Database error:', err);
                            reject(err);
                        } else {
                            const stateMap = {};
                            
                            // Group portfolios by class for better logging
                            const p41Portfolios = [];
                            const p42Portfolios = [];
                            const otherPortfolios = [];
                            
                            rows.forEach(row => {
                                // Ensure strict boolean values - only true if is_public is exactly 1
                                stateMap[row.portfolio_path] = row.is_public === 1;
                                
                                // Categorize for logging
                                const pathLower = row.portfolio_path.toLowerCase();
                                if (pathLower.includes('p4-1')) {
                                    p41Portfolios.push({
                                        path: row.portfolio_path,
                                        isPublic: row.is_public === 1
                                    });
                                } else if (pathLower.includes('p4-2')) {
                                    p42Portfolios.push({
                                        path: row.portfolio_path,
                                        isPublic: row.is_public === 1
                                    });
                                } else {
                                    otherPortfolios.push({
                                        path: row.portfolio_path,
                                        isPublic: row.is_public === 1
                                    });
                                }
                            });
                            
                            console.log(`Found privacy states for ${Object.keys(stateMap).length} portfolios`);
                            console.log(`Class 4/1: ${p41Portfolios.length} portfolios`);
                            p41Portfolios.forEach(p => {
                                console.log(`  - ${p.path}: ${p.isPublic ? 'Public' : 'Private'}`);
                            });
                            
                            console.log(`Class 4/2: ${p42Portfolios.length} portfolios`);
                            p42Portfolios.forEach(p => {
                                console.log(`  - ${p.path}: ${p.isPublic ? 'Public' : 'Private'}`);
                            });
                            
                            console.log(`Other classes: ${otherPortfolios.length} portfolios`);
                            
                            resolve(stateMap);
                        }
                    });
                });
                
                res.json(privacyStates);
            } catch (error) {
                console.error('Error getting privacy states:', error);
                res.status(500).json({ error: 'Error getting privacy states' });
            } finally {
                db.close();
            }
        });

        // Additional routes
        app.get('/check-auth', (req, res) => {
            console.log('\n=== Auth Check ===');
            console.log('Session:', req.session);
            console.log('User:', req.session?.user);
            console.log('Visitor:', req.session?.visitorId);
            
            // Set no-cache headers
            res.set({
                'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
                'Pragma': 'no-cache',
                'Expires': '0'
            });
            
            if (req.session?.user) {
                // Regular user
                res.json({
                    authenticated: true,
                    username: req.session.user.username,
                    portfolio_path: req.session.user.portfolio_path,
                    userType: 'user'
                });
            } else if (req.session?.authenticated && req.session?.visitorId) {
                // Visitor
                res.json({
                    authenticated: true,
                    username: req.session.fullName,
                    userType: 'visitor'
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
    const { username, password, portfolio_path, email } = req.body;

    if (!username || !password || !portfolio_path) {
        return res.status(400).json({ error: 'Missing required fields' });
    }

    try {
        // Hash the password
        const hashedPassword = await bcrypt.hash(password, 10);
        
        // Insert the user with email
        const db = new sqlite3.Database(dbPath);
        
        await new Promise((resolve, reject) => {
            db.run(
                'INSERT INTO users (username, email, password, portfolio_path, created_at) VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)',
                [username, email, hashedPassword, portfolio_path],
                function(err) {
                    if (err) {
                        if (err.message.includes('UNIQUE constraint failed')) {
                            if (err.message.includes('email')) {
                                reject(new Error('Email already registered'));
                            } else {
                                reject(new Error('Username already taken'));
                            }
                        } else {
                            reject(err);
                        }
                    } else {
                        resolve(this.lastID);
                    }
                }
            );
        });

        // Set up session
        req.session.user = {
            id: this.lastID,
            username,
            portfolio_path,
            email
        };
        
        // Update last login time
        await new Promise((resolve, reject) => {
            db.run(
                'UPDATE users SET last_login = CURRENT_TIMESTAMP WHERE id = ?',
                [this.lastID],
                function(err) {
                    if (err) reject(err);
                    else resolve();
                }
            );
        });

        res.json({ 
            success: true, 
            message: 'Registration successful',
            redirect: '/dashboard'
        });
    } catch (error) {
        console.error('Registration error:', error);
        res.status(500).json({ error: error.message || 'Error creating user' });
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
app.get(['/', '/index.html', '/login.html', '/register.html', '/dashboard.html', '/schools.html'], (req, res) => {
    res.sendFile(path.join(__dirname, req.path === '/' ? 'index.html' : req.path));
});

// Redirect old class pages to new class viewer
app.get(['/class1.html', '/class2.html'], (req, res) => {
    // Redirect to the new class viewer page
    return res.redirect('/classes');
});

// Dedicated class pages (do not redirect)
app.get(['/class-4-1.html', '/class-4-2.html'], (req, res) => {
    const filePath = path.join(__dirname, 'views', req.path);
    console.log('Serving dedicated class page:', filePath);
    res.sendFile(filePath);
});

// Redirect direct class-viewer.html access to /classes
app.get('/class-viewer.html', (req, res) => {
    const { school, class: classId } = req.query;
    return res.redirect(`/classes?school=${school}&class=${classId}`);
});

// Class viewer route - only for non-dedicated pages
app.get('/classes', (req, res) => {
    // Get query parameters
    const schoolId = req.query.school;
    const classId = req.query.class;
    
    console.log(`\n==== CLASS VIEWER REQUEST ====`);
    console.log(`URL: ${req.url}`);
    console.log(`Query parameters: school=${schoolId}, class=${classId}`);
    console.log('Session:', req.session);
    console.log('User type:', req.session?.userType);
    console.log('Authenticated:', req.session?.authenticated);
    
    // Check if this is a dedicated class page request
    if (classId === 'Class4-1') {
        return res.redirect('/class-4-1.html');
    }
    if (classId === 'Class4-2') {
        return res.redirect('/class-4-2.html');
    }
    
    // Allow access for both regular users and authenticated visitors
    if (!req.session?.authenticated && !req.session?.user && !req.session?.visitorId) {
        console.log('Unauthorized access attempt - redirecting to login');
        return res.redirect('/login.html');
    }
    
    // Validate the parameters if provided
    if (schoolId && classId) {
        console.log(`Validating parameters: school=${schoolId}, class=${classId}`);
        
        // Check if the school exists
        const school = schoolConfig.getSchool(schoolId);
        if (!school) {
            console.log(`School not found: ${schoolId}`);
            return res.status(404).send('School not found');
        }
        console.log(`School found: ${school.name}`);
        
        // Check if the class exists in the school
        const cls = schoolConfig.getClass(schoolId, classId);
        if (!cls) {
            console.log(`Class not found: ${classId} in school ${schoolId}`);
            return res.status(404).send('Class not found');
        }
        console.log(`Class found: ${cls.displayName} (${cls.id})`);
    }
    
    // Send the HTML file
    res.sendFile(path.join(__dirname, 'views/class-viewer.html'));
    console.log(`==== END CLASS VIEWER REQUEST ====\n`);
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
            const dataDir = path.dirname(dbPath);
                if (!fs.existsSync(dataDir)) {
                console.log(`Creating data directory: ${dataDir}`);
                fs.mkdirSync(dataDir, { recursive: true });
            }
        }
        
        // Create users table if it doesn't exist
        db.run(`CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT UNIQUE,
            email TEXT UNIQUE,
            password TEXT,
            portfolio_path TEXT UNIQUE,
            avatar_path TEXT,
            is_public INTEGER DEFAULT 0,
            is_super_user INTEGER DEFAULT 0,
            first_name TEXT,
            last_name TEXT,
            nickname TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            last_login TIMESTAMP
        )`, (err) => {
            if (err) {
                console.error('Error creating users table:', err);
                return;
            }
            console.log('Users table ready');
            
            // Check for missing columns
            db.all(`PRAGMA table_info(users)`, (err, rows) => {
                if (err) {
                    console.error('Error checking table info:', err);
                    return;
                }
                
                if (!rows) {
                    console.error('No table info returned');
                    return;
                }

                const columns = rows.map(row => row.name.toLowerCase());
                
                // Add email column if it doesn't exist
                if (!columns.includes('email')) {
                    db.run(`ALTER TABLE users ADD COLUMN email TEXT UNIQUE`, (err) => {
                        if (err && !err.message.includes('duplicate column')) {
                            console.error('Error adding email column:', err);
                        } else {
                            console.log('Added email column to users table');
                        }
                    });
                }

                // Add is_super_user column if it doesn't exist
                if (!columns.includes('is_super_user')) {
                    db.run(`ALTER TABLE users ADD COLUMN is_super_user INTEGER DEFAULT 0`, (err) => {
                        if (err && !err.message.includes('duplicate column')) {
                            console.error('Error adding is_super_user column:', err);
                        } else {
                            console.log('Added is_super_user column to users table');
                        }
                    });
                }

                // Set Peter42 as super user
                db.run('UPDATE users SET is_super_user = 1 WHERE username = ?', ['Peter42'], (err) => {
                    if (err) {
                        console.error('Error setting Peter42 as super user:', err);
                    } else {
                        console.log('Updated Peter42 super user status');
                    }
                });

                // Check if Peter42 exists and create if not
                db.get('SELECT id FROM users WHERE username = ?', ['Peter42'], (err, result) => {
                    if (err) {
                        console.error('Error checking for Peter42:', err);
                        return;
                    }
                    
                    if (!result) {
                        console.log('Peter42 not found, creating...');
                        // Create Peter42 with hashed password and all required fields
                        bcrypt.hash('Peter2025BB', 10).then(hashedPassword => {
                            db.run(
                                'INSERT INTO users (username, password, portfolio_path, avatar_path, is_public, is_super_user, email) VALUES (?, ?, ?, ?, ?, ?, ?)',
                                [
                                    'Peter42',
                                    hashedPassword,
                                    '/portfolios/P4-2/Peter/Peter.html',
                                    '/portfolios/P4-2/Peter/images/Peter42.jpg',
                                    1,
                                    1,
                                    'peter42@example.com'
                                ],
                                function(err) {
                                    if (err) {
                                        console.error('Error creating Peter42:', err);
                                    } else {
                                        console.log('Peter42 created successfully with ID:', this.lastID);
                                    }
                                }
                            );
                        }).catch(err => {
                            console.error('Error hashing password:', err);
                        });
                    }
                });
            });
        });
        
        // Create public_visitors table for visitor registration
        db.run(`CREATE TABLE IF NOT EXISTS public_visitors (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            full_name TEXT NOT NULL,
            email TEXT UNIQUE NOT NULL,
            password TEXT NOT NULL,
            reason TEXT,
            registration_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )`, (err) => {
            if (err) {
                console.error('Error creating public_visitors table:', err);
            } else {
                console.log('Public visitors table ready');
            }
        });
        
        // Create visitor_logins table to track visitor activity
        db.run(`CREATE TABLE IF NOT EXISTS visitor_logins (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            visitor_id INTEGER NOT NULL,
            login_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (visitor_id) REFERENCES public_visitors(id)
        )`, (err) => {
            if (err) {
                console.error('Error creating visitor_logins table:', err);
            } else {
                console.log('Visitor logins table ready');
            }
        });
        
        // Create visitor_views table to track portfolio viewing
        db.run(`CREATE TABLE IF NOT EXISTS visitor_views (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            visitor_id INTEGER NOT NULL,
            portfolio_path TEXT NOT NULL,
            view_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (visitor_id) REFERENCES public_visitors(id)
        )`, (err) => {
            if (err) {
                console.error('Error creating visitor_views table:', err);
            } else {
                console.log('Visitor views table ready');
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

// School and class API endpoints
app.get('/api/schools', (req, res) => {
    res.json(schoolConfig.getSchools());
});

app.get('/api/schools/:schoolId', (req, res) => {
    const school = schoolConfig.getSchool(req.params.schoolId);
    if (!school) {
        return res.status(404).json({ error: 'School not found' });
    }
    res.json(school);
});

app.get('/api/schools/:schoolId/classes', (req, res) => {
    const classes = schoolConfig.getClasses(req.params.schoolId);
    res.json(classes);
});

app.get('/api/schools/:schoolId/classes/:classId', (req, res) => {
    const cls = schoolConfig.getClass(req.params.schoolId, req.params.classId);
    if (!cls) {
        return res.status(404).json({ error: 'Class not found' });
    }
    res.json(cls);
});

app.get('/api/classes/:classId/students', async (req, res) => {
    const classId = req.params.classId;
    const portfolioPath = req.query.portfolioPath;
    const db = new sqlite3.Database(dbPath);
    
    try {
        // Log the request for debugging
        console.log(`\n==== STUDENT FETCH DEBUG ====`);
        console.log(`Class ID: ${classId}`);
        console.log(`Portfolio Path: ${portfolioPath}`);
        
        if (!portfolioPath) {
            return res.status(400).json({ error: 'portfolioPath parameter is required' });
        }
        
        // Special handling for Phumdham classes
        if (classId === 'Class4-1' || classId === 'Class4-2') {
            const classNumber = classId === 'Class4-1' ? '1' : '2';
            const searchPath = `P4-${classNumber}`;
            
            console.log(`Special handling for Phumdham class: ${classId}, searching for ${searchPath}`);
            
            // Direct query for P4-1 or P4-2 folders
            const students = await new Promise((resolve, reject) => {
                db.all('SELECT * FROM users WHERE portfolio_path LIKE ?', [`%${searchPath}%`], (err, rows) => {
                    if (err) {
                        console.error('Database error:', err);
                        reject(err);
                    }
                    
                    console.log(`Found ${rows.length} students for Phumdham ${classId}`);
                    if (rows.length > 0) {
                        console.log('Sample students:');
                        for (let i = 0; i < Math.min(5, rows.length); i++) {
                            console.log(` - ${rows[i].username}: ${rows[i].portfolio_path}`);
                        }
                    }
                    
                    resolve(rows || []);
                });
            });
            
            console.log(`==== END DEBUG ====\n`);
            return res.json(students);
        }
        
        // Special handling for M2 class
        if (classId === 'ClassM2-001') {
            console.log(`Special handling for PBSChonburi M2 class: ${classId}`);
            
            // Try all possible M2 paths
            const possiblePaths = ['ClassM2-001', 'M2', 'M2-001'];
            const likeQueries = possiblePaths.map(p => `portfolio_path LIKE '%${p}%'`).join(' OR ');
            
            // Direct query for M2 folders
            const students = await new Promise((resolve, reject) => {
                db.all(`SELECT * FROM users WHERE ${likeQueries}`, [], (err, rows) => {
                    if (err) {
                        console.error('Database error:', err);
                        reject(err);
                    }
                    
                    console.log(`Found ${rows.length} students for M2 class`);
                    if (rows.length > 0) {
                        console.log('Sample students:');
                        for (let i = 0; i < Math.min(5, rows.length); i++) {
                            console.log(` - ${rows[i].username}: ${rows[i].portfolio_path}`);
                        }
                    }
                    
                    resolve(rows || []);
                });
            });
            
            // If no students in database, check filesystem
            if (!students.length) {
                console.log('No M2 students found in database, checking filesystem');
                
                try {
                    for (const folderName of possiblePaths) {
                        const folderPath = path.join(__dirname, 'portfolios', folderName);
                        if (fs.existsSync(folderPath)) {
                            console.log(`Found M2 directory: ${folderPath}`);
                            
                            // Get files and directories
                            const entries = fs.readdirSync(folderPath, { withFileTypes: true });
                            const studentDirs = entries.filter(entry => entry.isDirectory());
                            
                            console.log(`Found ${studentDirs.length} student directories in ${folderPath}`);
                            
                            for (const dir of studentDirs) {
                                const studentName = dir.name;
                                const studentPath = path.join(folderPath, studentName);
                                
                                // Find HTML files
                                const files = fs.readdirSync(studentPath);
                                const htmlFiles = files.filter(file => file.toLowerCase().endsWith('.html'));
                                
                                if (htmlFiles.length) {
                                    const htmlFile = htmlFiles[0];
                                    students.push({
                                        username: studentName,
                                        portfolio_path: `/portfolios/${folderName}/${studentName}/${htmlFile}`,
                                        avatar_path: `/portfolios/${folderName}/${studentName}/images/${studentName}.jpg`,
                                        is_public: 1
                                    });
                                }
                            }
                        }
                    }
                } catch (error) {
                    console.error('Error reading filesystem for M2:', error);
                }
            }
            
            console.log(`==== END DEBUG ====\n`);
            return res.json(students);
        }
        
        // Regular handling for other classes
        const students = await new Promise((resolve, reject) => {
            db.all('SELECT * FROM users', [], (err, rows) => {
                if (err) {
                    console.error('Database error:', err);
                    reject(err);
                }
                console.log(`Total users in database: ${rows.length}`);
                
                // Print all portfolio paths for debugging
                console.log("All portfolio paths in database:");
                rows.forEach((user, i) => {
                    if (user.portfolio_path) {
                        console.log(`${i+1}. ${user.username}: ${user.portfolio_path}`);
                    }
                });
                
                // Extract the folder name from portfolioPath for more flexible matching
                const pathParts = portfolioPath.split('/');
                const folderName = pathParts[pathParts.length - 1];
                
                console.log(`Looking for portfolios with folder name: ${folderName}`);
                
                // Filter students based on the portfolio path (case-insensitive)
                // Try multiple matching strategies
                const filteredStudents = rows.filter(user => {
                    // Make sure user has a portfolio path before checking
                    if (!user.portfolio_path) return false;
                    
                    // Convert to lowercase for case-insensitive comparison
                    const userPath = user.portfolio_path.toLowerCase();
                    const searchPath = portfolioPath.toLowerCase();
                    const searchFolder = folderName.toLowerCase();
                    
                    // Try different matching strategies
                    return userPath.includes(searchPath) || 
                           userPath.includes(searchFolder) || 
                           userPath.includes(`portfolios/${searchFolder}`) ||
                           userPath.includes(`/portfolios/${searchFolder}`);
                });
                
                console.log(`Found ${filteredStudents.length} students for path: ${portfolioPath}`);
                
                if (filteredStudents.length > 0) {
                    // Log first 5 students for debugging
                    console.log('Sample students:');
                    for (let i = 0; i < Math.min(5, filteredStudents.length); i++) {
                        const s = filteredStudents[i];
                        console.log(` - ${s.username}: ${s.portfolio_path}`);
                    }
                } else {
                    console.log('No students found! Check database entries and portfolio paths.');
                }
                
                resolve(filteredStudents || []);
            });
        });
        
        console.log(`==== END DEBUG ====\n`);
        res.json(students);
    } catch (error) {
        console.error('Error getting students:', error);
        res.status(500).json({ error: 'Error getting students' });
    } finally {
        db.close();
    }
});

// Public visitor registration
app.post('/public-register', async (req, res) => {
    const { fullName, email, password, reason } = req.body;
    
    if (!fullName || !email || !password) {
        return res.status(400).json({ error: 'All fields are required' });
    }
    
    // Validate email format
    if (!email.includes('@')) {
        return res.status(400).json({ error: 'Invalid email format' });
    }
    
    const db = new sqlite3.Database(dbPath);
    
    try {
        // Check if email already exists
        const emailExists = await new Promise((resolve, reject) => {
            db.get('SELECT id FROM public_visitors WHERE email = ?', [email], (err, row) => {
                        if (err) reject(err);
                        else resolve(row);
                    });
                });

        if (emailExists) {
            return res.status(400).json({ error: 'Email already registered' });
        }
        
        // Hash the password
        const hashedPassword = await bcrypt.hash(password, 10);
        
        // Insert the visitor
                    await new Promise((resolve, reject) => {
                        db.run(
                'INSERT INTO public_visitors (full_name, email, password, reason, registration_date) VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)',
                [fullName, email, hashedPassword, reason || ''],
                            function(err) {
                                if (err) reject(err);
                    else resolve(this.lastID);
                            }
                        );
                    });
        
        // Success
        res.status(201).json({ success: true, message: 'Registration successful' });
    } catch (error) {
        console.error('Error registering public visitor:', error);
        res.status(500).json({ error: 'Server error' });
    } finally {
        db.close();
    }
});

// Public visitor login
app.post('/public-login', async (req, res) => {
    const { email, password } = req.body;
    
    if (!email || !password) {
        return res.status(400).json({ error: 'Email and password are required' });
    }
    
    const db = new sqlite3.Database(dbPath);
    
    try {
        // Get visitor by email
        const visitor = await new Promise((resolve, reject) => {
            db.get('SELECT id, full_name, email, password FROM public_visitors WHERE email = ?', [email], (err, row) => {
                if (err) reject(err);
                else resolve(row);
            });
        });
        
        if (!visitor) {
            return res.status(401).json({ error: 'Invalid email or password' });
        }
        
        // Check password
        const passwordMatch = await bcrypt.compare(password, visitor.password);
        
        if (!passwordMatch) {
            return res.status(401).json({ error: 'Invalid email or password' });
        }
        
        // Log activity
                        db.run(
            'INSERT INTO visitor_logins (visitor_id, login_date) VALUES (?, CURRENT_TIMESTAMP)',
            [visitor.id]
        );
        
        // Set session with all necessary flags
        req.session.authenticated = true;
        req.session.userType = 'visitor';
        req.session.visitorId = visitor.id;
        req.session.fullName = visitor.full_name;
        req.session.email = visitor.email;
        
        // Save session explicitly
        await new Promise((resolve, reject) => {
            req.session.save((err) => {
                                if (err) reject(err);
                else resolve();
            });
        });
        
        // Success
        res.json({ 
            success: true, 
            user: { 
                id: visitor.id, 
                fullName: visitor.full_name, 
                email: visitor.email,
                userType: 'visitor'
            }
        });
    } catch (error) {
        console.error('Error logging in public visitor:', error);
        res.status(500).json({ error: 'Server error' });
    } finally {
        db.close();
    }
});

// Special endpoint for Phumdham students
app.get('/api/phumdham-students/:classId', async (req, res) => {
    const classId = req.params.classId;
    const db = new sqlite3.Database(dbPath);
    
    try {
        console.log(`\n==== PHUMDHAM STUDENTS QUERY ====`);
        console.log(`Class ID: ${classId}`);
        console.log(`Session:`, req.session);
        
        // Check authentication
        const isAuthenticated = req.session?.authenticated || !!req.session?.user;
        const isVisitor = req.session?.userType === 'visitor' || req.session?.user?.userType === 'visitor';
        console.log('Auth status:', { isAuthenticated, isVisitor });
        
        // Get all students from the database first
        const dbStudents = await new Promise((resolve, reject) => {
            // Use multiple patterns to match both with and without leading slash
            const patterns = [
                'P4-1%',           // No slash
                '/P4-1%',          // With slash
                '%/P4-1/%',        // Full path with slashes
                'portfolios/P4-1%', // Standard format
                '/portfolios/P4-1%' // Standard format with leading slash
            ];
            
            // Build query to match any pattern
            const placeholders = patterns.map(() => 'portfolio_path LIKE ?').join(' OR ');
            const query = `
                SELECT username, portfolio_path, avatar_path, is_public, first_name, last_name, nickname 
                FROM users 
                WHERE ${placeholders}
            `;
            
            console.log('Executing query:', query);
            console.log('With patterns:', patterns);
            
            db.all(query, patterns, (err, rows) => {
                if (err) {
                    console.error('Database error:', err);
                    reject(err);
                    return;
                }
                
                if (rows?.length > 0) {
                    console.log(`Found ${rows.length} students in database`);
                    console.log('Sample students:');
                    rows.slice(0, 3).forEach(student => {
                        console.log(` - ${student.username}: ${student.portfolio_path} (${student.is_public ? 'Public' : 'Private'})`);
                    });
                } else {
                    console.log('No students found in database');
                }
                
                resolve(rows || []);
            });
        });
        
        // Then check the filesystem
        const folderPath = path.join(__dirname, 'portfolios', 'P4-1');
        let filesystemStudents = [];
        
        if (fs.existsSync(folderPath)) {
            console.log(`Checking filesystem path: ${folderPath}`);
            const files = fs.readdirSync(folderPath, { withFileTypes: true });
            filesystemStudents = files
                .filter(file => file.isDirectory())
                .map(dir => {
                    const nameParts = dir.name.split(/[_-]/);
                    const formattedName = nameParts
                        .map(part => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
                        .join(' ');
                    
                    const portfolioPath = `/portfolios/P4-1/${dir.name}/index.html`;
                    console.log(`Found student directory: ${dir.name} -> ${portfolioPath}`);
                    
                    return {
                        username: dir.name,
                        portfolio_path: portfolioPath,
                        avatar_path: `/portfolios/P4-1/${dir.name}/images/${dir.name}.png`,
                        is_public: true, // Filesystem portfolios are public by default
                        first_name: formattedName,
                        last_name: '',
                        nickname: ''
                    };
                });
            
            console.log(`Found ${filesystemStudents.length} students in filesystem`);
        } else {
            console.log(`Filesystem path not found: ${folderPath}`);
        }
        
        // Merge database and filesystem results, preferring database entries
        const dbUsernames = new Set(dbStudents.map(s => s.username));
        const allStudents = [
            ...dbStudents,
            ...filesystemStudents.filter(s => !dbUsernames.has(s.username))
        ];
        
        // Process each student
        const processedStudents = allStudents.map(student => ({
            ...student,
            is_public: student.is_public === 1 || student.is_public === true,
            first_name: student.first_name || student.username,
            nickname: student.nickname || student.first_name || student.username
        }));
        
        console.log(`Found ${processedStudents.length} total students`);
        if (processedStudents.length > 0) {
            console.log('First 3 students in response:');
            processedStudents.slice(0, 3).forEach(student => {
                console.log(` - ${student.username}: ${student.portfolio_path} (${student.is_public ? 'Public' : 'Private'})`);
            });
        }
        
        res.json(processedStudents);
        
    } catch (error) {
        console.error('Error in Phumdham students API:', error);
        res.status(500).json({ error: 'Internal server error' });
    } finally {
        db.close();
    }
});

// Direct filesystem-based endpoint for Phumdham portfolios
app.get('/api/filesystem-portfolios/:classId', (req, res) => {
    const classId = req.params.classId;
    console.log(`\n==== DIRECT FILESYSTEM PORTFOLIO CHECK ====`);
    console.log(`Checking portfolios for class: ${classId}`);
    
    // Map class ID to folder name (case-sensitive)
    const folderMap = {
        'Class4-1': 'P4-1',
        'Class4-2': 'P4-2',
        'ClassM2-001': 'ClassM2-001'
    };
    
    // List of alternative folders to check for each class
    const altFolders = {
        'ClassM2-001': ['ClassM2-001', 'M2', 'M2-001', 'M2-2025'],
        'Class4-1': ['P4-1', 'Class4-1', '4-1'],
        'Class4-2': ['P4-2', 'Class4-2', '4-2']
    };
    
    // Set initial folder name from map or use class ID as fallback
    const folderName = folderMap[classId] || classId;
    let resolvedFolderPath = path.join(__dirname, 'portfolios', folderName);
    
    console.log(`Looking for portfolios in: ${resolvedFolderPath}`);
    
    try {
        // Check if the directory exists
        if (!fs.existsSync(resolvedFolderPath)) {
            console.log(`Portfolio directory not found: ${resolvedFolderPath}`);
            
            // Try alternative folder names
            let foundAlternative = false;
            
            if (altFolders[classId]) {
                for (const altName of altFolders[classId]) {
                    if (altName === folderName) continue; // Skip the one we already tried
                    
                    const altPath = path.join(__dirname, 'portfolios', altName);
                    console.log(`Trying alternative path: ${altPath}`);
                    
                    if (fs.existsSync(altPath)) {
                        console.log(`Found alternative directory: ${altPath}`);
                        resolvedFolderPath = altPath;
                        foundAlternative = true;
                        break;
                    }
                }
            }
            
            // If we still haven't found a valid folder, return empty list
            if (!foundAlternative) {
                console.log(`No portfolio directories found for ${classId}`);
                return res.json([]);
            }
        }
        
        // Read directory with EXACT case from filesystem
        const files = fs.readdirSync(resolvedFolderPath, { withFileTypes: true });
        console.log(`Found ${files.length} items in ${resolvedFolderPath}`);
        
        // Process all files and directories as they exist in the filesystem (preserving case)
        const students = [];
        
        // Get base folder name for paths (e.g., 'P4-2' from full path)
        const baseFolderName = path.basename(resolvedFolderPath);

        files.forEach(entry => {
            console.log(` - Found: ${entry.name} (${entry.isDirectory() ? 'Directory' : 'File'})`);
            
            if (entry.isDirectory()) {
                // Use exact name from filesystem
                const studentName = entry.name;
                const studentPath = path.join(resolvedFolderPath, studentName);
                
                // Find HTML files in the directory
                try {
                    const studentFiles = fs.readdirSync(studentPath);
                    const htmlFiles = studentFiles.filter(file => file.toLowerCase().endsWith('.html') || file.toLowerCase() === 'index.html');
                    
                    // If found HTML files, add to students array
                    if (htmlFiles.length > 0) {
                        let htmlFile = htmlFiles[0]; // Default to first HTML file
                        
                        // Prefer index.html if available
                        const indexHtml = htmlFiles.find(file => file.toLowerCase() === 'index.html');
                        if (indexHtml) {
                            htmlFile = indexHtml;
                        }
                        
                        console.log(`   Found HTML file: ${htmlFile}`);
                        
                        // Look for an avatar image
                        let avatarPath = null;
                        try {
                            const imagesPath = path.join(studentPath, 'images');
                            if (fs.existsSync(imagesPath)) {
                                const imageFiles = fs.readdirSync(imagesPath).filter(file => 
                                    file.toLowerCase().endsWith('.jpg') || 
                                    file.toLowerCase().endsWith('.png') || 
                                    file.toLowerCase().endsWith('.jpeg')
                                );
                                
                                if (imageFiles.length > 0) {
                                    // Use exact filename from filesystem
                                    avatarPath = `/portfolios/${baseFolderName}/${studentName}/images/${imageFiles[0]}`;
                                    console.log(`   Found avatar: ${imageFiles[0]}`);
                                }
                            }
                        } catch (err) {
                            console.log(`   Error finding avatar for ${studentName}: ${err.message}`);
                        }
                        
                        // Format student name from directory
                        const nameParts = studentName.split('_');
                        let firstName = '', lastName = '', nickname = '';
                        
                        if (nameParts.length >= 2) {
                            // If format is like "firstname_lastname_id"
                            firstName = nameParts[0].charAt(0).toUpperCase() + nameParts[0].slice(1);
                            lastName = nameParts[1].charAt(0).toUpperCase() + nameParts[1].slice(1);
                            // Try to extract nickname from HTML file content
                            try {
                                const htmlContent = fs.readFileSync(path.join(studentPath, htmlFile), 'utf8');
                                const nicknameMatch = htmlContent.match(/<h1[^>]*>([^<]+)<\/h1>/);
                                if (nicknameMatch) {
                                    nickname = nicknameMatch[1].trim();
                                }
                            } catch (err) {
                                console.log(`Error reading HTML for nickname: ${err.message}`);
                            }
                        } else {
                            // Single word name
                            firstName = studentName.charAt(0).toUpperCase() + studentName.slice(1);
                        }

                        // Add student to list
                        students.push({
                            username: studentName,
                            portfolio_path: `/portfolios/${baseFolderName}/${studentName}/${htmlFile}`,
                            avatar_path: avatarPath || '/images/default-avatar.png',
                            is_public: false, // Default to private like other classes
                            first_name: firstName,
                            last_name: lastName,
                            nickname: nickname || firstName
                        });
                    }
                } catch (err) {
                    console.log(`   Error processing directory ${studentName}: ${err.message}`);
                }
            } else if (entry.name.toLowerCase().endsWith('.html')) {
                // Handle HTML files at root level
                const studentName = entry.name.replace('.html', '');
                
                console.log(`   Adding HTML file: ${entry.name}`);
                
                // Format student name from directory
                const nameParts = studentName.split('_');
                let firstName = '', lastName = '';
                
                if (nameParts.length >= 2) {
                    firstName = nameParts[0].charAt(0).toUpperCase() + nameParts[0].slice(1);
                    lastName = nameParts[1].charAt(0).toUpperCase() + nameParts[1].slice(1);
                } else {
                    firstName = studentName.charAt(0).toUpperCase() + studentName.slice(1);
                }

                students.push({
                    username: studentName,
                    portfolio_path: `/portfolios/${baseFolderName}/${entry.name}`,
                    avatar_path: '/images/default-avatar.png',
                    is_public: false, // Default to private like other classes
                    first_name: firstName,
                    last_name: lastName,
                    nickname: firstName
                });
            }
        });
        
        console.log(`\nReturning ${students.length} portfolios from filesystem`);
        if (students.length > 0) {
            for (let i = 0; i < Math.min(5, students.length); i++) {
                console.log(` - ${students[i].username}: ${students[i].portfolio_path} (${students[i].is_public ? 'Public' : 'Private'})`);
            }
        }
        
        res.json(students);
    } catch (error) {
        console.error('Error in filesystem-based endpoint:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});
