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

// Initialize Redis client first
let redisClient;
let redisStore;

// Initialize Redis and create store
async function initializeApp() {
    console.log('Initializing application...');
    try {
        // Essential middleware first
        app.use(express.json());
        app.use(express.urlencoded({ extended: true }));
        app.set('trust proxy', 1);

        // Health check endpoint - MUST be defined before any async initialization
        app.get('/health', (req, res) => {
            // Simple synchronous health check
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

        // Initialize Redis client with better error handling
        console.log('Connecting to Redis...');
        
        // Get Redis configuration from environment variables
        const redisUrl = process.env.REDIS_URL || process.env.REDIS_INTERNAL_URL;
        if (!redisUrl) {
            throw new Error('Redis URL not configured');
        }

        console.log('Redis URL protocol:', new URL(redisUrl).protocol);

        const redisConfig = {
            url: redisUrl,
            socket: {
                reconnectStrategy: (retries) => {
                    console.log(`Redis reconnection attempt ${retries}`);
                    if (retries > 10) {
                        console.error('Max Redis reconnection attempts reached');
                        return new Error('Max Redis reconnection attempts reached');
                    }
                    return Math.min(retries * 1000, 3000);
                },
                connectTimeout: 60000, // 60 seconds
                keepAlive: 30000, // 30 seconds
                tls: false // Disable TLS for redis:// URLs
            },
            // Remove retry_strategy as it's redundant with reconnectStrategy
        };

        // Log Redis connection attempt (but hide sensitive URL)
        console.log('Attempting to connect to Redis with config:', {
            hasUrl: !!redisConfig.url,
            urlProtocol: new URL(redisConfig.url).protocol,
            tls: redisConfig.socket.tls,
            timeout: redisConfig.socket.connectTimeout,
            keepAlive: redisConfig.socket.keepAlive
        });

        // Initialize Redis client
        redisClient = createClient(redisConfig);

        // Enhanced error logging
        redisClient.on('error', err => {
            console.error('Redis Client Error:', err);
            console.error('Redis connection details:', {
                ready: redisClient?.isReady,
                connected: redisClient?.isOpen,
                error: err.message
            });

            // If connection times out, log additional information
            if (err.message.includes('timeout')) {
                console.error('Connection timeout details:', {
                    url: redisUrl ? 'Configured' : 'Missing',
                    protocol: redisUrl ? new URL(redisUrl).protocol : 'N/A',
                    socketConfig: redisConfig.socket
                });
            }
        });

        redisClient.on('connect', () => {
            console.log('Redis client connecting...', {
                ready: redisClient?.isReady,
                connected: redisClient?.isOpen
            });
        });

        redisClient.on('ready', () => {
            console.log('Redis client ready and connected');
        });

        // Connect to Redis with timeout
        try {
            await Promise.race([
                redisClient.connect(),
                new Promise((_, reject) => 
                    setTimeout(() => reject(new Error('Redis connection timeout after 60s')), 60000)
                )
            ]);
            console.log('Redis connected successfully');

            // Test Redis connection
            const pingResult = await redisClient.ping();
            console.log('Redis PING result:', pingResult);
        } catch (err) {
            console.error('Redis connection failed:', err);
            throw err;
        }

        // Create Redis store with error handling
        redisStore = new RedisStore({
            client: redisClient,
            prefix: 'sess:',
            ttl: 24 * 60 * 60, // Session TTL in seconds (24 hours)
            disableTouch: false,
            logErrors: true,
            retryStrategy: function (options) {
                console.log('Redis store retry attempt:', options.attempt);
                return Math.min(options.attempt * 100, 3000);
            }
        });

        // Add Redis store error handler with reconnection logic
        redisStore.on('error', function(err) {
            console.error('Redis Store Error:', err);
            console.error('Redis Store Status:', {
                client: redisClient?.isOpen,
                error: err.message
            });
            
            // Attempt to reconnect if client is disconnected
            if (!redisClient?.isOpen) {
                console.log('Attempting to reconnect Redis client...');
                redisClient.connect().catch(err => {
                    console.error('Redis reconnection failed:', err);
                });
            }
        });

        // Add Redis store connect handler with status check
        redisStore.on('connect', function() {
            console.log('Redis Store connected');
            console.log('Redis Store Status:', {
                client: redisClient?.isOpen,
                ready: redisClient?.isReady
            });
        });

        console.log('Redis store created');

        // Session middleware with enhanced error handling
        app.use(session({
            store: redisStore,
            name: 'connect.sid',
            secret: process.env.SESSION_SECRET || 'your-secret-key',
            resave: true,
            saveUninitialized: false,
            proxy: true,
            rolling: true,
            cookie: {
                secure: true,
                httpOnly: true,
                sameSite: 'none',
                path: '/',
                maxAge: 24 * 60 * 60 * 1000
            }
        }));

        // Add session consistency middleware
        app.use((req, res, next) => {
            // If there's a cookie but no session, try to load from Redis
            if (req.headers.cookie?.includes('connect.sid') && !req.session?.user) {
                console.log('Attempting to restore session from Redis...');
                const sessionID = req.sessionID;
                if (sessionID) {
                    redisStore.get(sessionID, (err, sess) => {
                        if (err) {
                            console.error('Error loading session from Redis:', err);
                        } else if (sess) {
                            console.log('Found session in Redis, restoring...');
                            req.session.user = sess.user;
                            req.session.save();
                        }
                        next();
                    });
                    return;
                }
            }
            next();
        });

        // Add session store debug middleware with async/await
        app.use(async (req, res, next) => {
            console.log('\n=== Redis Store Debug ===');
            if (req.sessionID && redisStore) {
                try {
                    const sess = await new Promise((resolve, reject) => {
                        redisStore.get(req.sessionID, (err, sess) => {
                            if (err) reject(err);
                            else resolve(sess);
                        });
                    });
                    
                    console.log('Redis session data:', sess);
                    console.log('Redis store status:', {
                        sessionID: req.sessionID,
                        hasSession: !!sess,
                        redisConnected: redisClient?.isOpen
                    });
                } catch (err) {
                    console.error('Redis get session error:', err);
                }
            } else {
                console.log('No session ID or Redis store');
            }
            next();
        });

        // CORS configuration after session
        app.use((req, res, next) => {
            const origin = req.headers.origin || 'https://codinghtml-presentation.onrender.com';
            
            // Set CORS headers
            res.header('Access-Control-Allow-Origin', origin);
            res.header('Access-Control-Allow-Methods', 'GET,HEAD,PUT,PATCH,POST,DELETE');
            res.header('Access-Control-Allow-Credentials', 'true');
            res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization, Cache-Control');
            res.header('Access-Control-Expose-Headers', 'Set-Cookie');
            
            // Handle preflight
            if (req.method === 'OPTIONS') {
                return res.status(204).end();
            }
            
            next();
        });

        // Debug middleware after session
        app.use((req, res, next) => {
            console.log('\n=== Session Debug ===');
            console.log('URL:', req.url);
            console.log('Session ID:', req.sessionID);
            console.log('Session:', req.session);
            console.log('Cookies:', req.headers.cookie);
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

        // Serve static files
app.use(express.static(__dirname));
        app.use(express.static(path.join(__dirname, 'public')));

        // Define routes that use the middleware
        app.post('/login', async (req, res) => {
            console.log('\n=== Login Attempt ===');
            console.log('Raw request body:', req.body);

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

                // Clear any existing session
                if (req.session.user) {
                    console.log('Clearing existing session');
                    await new Promise((resolve) => {
                        req.session.destroy(() => {
                            resolve();
                        });
                    });
                    
                    // Create new session
                    await new Promise((resolve) => {
                        req.session.regenerate((err) => {
                            if (err) {
                                console.error('Error regenerating session:', err);
                                reject(err);
                            }
                            resolve();
                        });
                    });
                }

                // Create new session
                req.session.user = {
                    id: user.id,
                    username: user.username,
                    portfolio_path: user.portfolio_path
                };

                // Save session explicitly and wait for it
                await new Promise((resolve, reject) => {
                    req.session.save((err) => {
                        if (err) {
                            console.error('Session save error:', err);
                            reject(err);
                        } else {
                            console.log('Session saved successfully');
                            console.log('Final session state:', req.session);
                            console.log('Session ID:', req.sessionID);
                            resolve();
                        }
                    });
                });

                // Send success response with redirect
                res.json({
                    success: true,
                    redirect: '/dashboard',
                    user: {
                        username: user.username,
                        portfolio_path: user.portfolio_path
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

        app.get('/get-privacy-status', requireAuth, (req, res) => {
            db.get('SELECT is_public FROM users WHERE id = ?', [req.session.user.id], (err, result) => {
                if (err) {
                    res.status(500).json({ error: 'Error getting privacy status' });
                } else {
                    res.json({ is_public: result.is_public });
                }
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

        app.post('/admin/reset-password', requireAdmin, async (req, res) => {
            console.log('Password reset attempt for:', req.body.username);
            
            if (!req.body.username || !req.body.password) {
                return res.status(400).json({ error: 'Username and password are required' });
            }

            const { username, password } = req.body;
            
            try {
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

                const hashedPassword = await bcrypt.hash(password, 10);
                
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

        // Detailed health check endpoint for debugging
        app.get('/health/detailed', async (req, res) => {
            console.log('\n=== Detailed Health Check ===');
            console.log('Request received at:', new Date().toISOString());
            console.log('Environment:', isProduction ? 'production' : 'development');
            
            const health = {
                status: 'ok',
                timestamp: new Date().toISOString(),
                environment: isProduction ? 'production' : 'development',
                redis: {
                    status: 'unknown',
                    connected: false,
                    error: null,
                    client: {
                        ready: redisClient?.isReady || false,
                        connected: redisClient?.isOpen || false
                    }
                },
                session: {
                    exists: !!req.session,
                    id: req.sessionID || null,
                    cookie: req.session?.cookie || null
                }
            };

            try {
                console.log('Testing Redis connection...');
                if (!redisClient) {
                    throw new Error('Redis client is not initialized');
                }

                // Test Redis connection
                const pingResult = await redisClient.ping();
                console.log('Redis PING result:', pingResult);
                
                // Test Redis operations
                await redisClient.set('health_check', 'ok');
                const testValue = await redisClient.get('health_check');
                console.log('Redis test value:', testValue);

                health.redis = {
                    status: 'connected',
                    connected: true,
                    ping: pingResult,
                    testValue: testValue,
                    client: {
                        ready: redisClient.isReady,
                        connected: redisClient.isOpen
                    }
                };
            } catch (error) {
                console.error('Health check Redis error:', error);
                health.redis = {
                    status: 'error',
                    connected: false,
                    error: error.message,
                    stack: error.stack,
                    client: {
                        ready: redisClient?.isReady || false,
                        connected: redisClient?.isOpen || false
                    }
                };
                // Don't change overall status - Redis issues shouldn't fail the health check
            }

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
        // Close Redis connection
        new Promise((resolve) => {
            if (!redisClient) {
                resolve();
                return;
            }
            console.log('Closing Redis connection...');
            redisClient.quit().then(() => {
                console.log('Redis connection closed');
                resolve();
            }).catch((err) => {
                console.error('Error closing Redis connection:', err);
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
        // Ensure data directory exists in production
        if (isProduction) {
            const fs = require('fs');
            const dataDir = '/opt/render/project/src/data';
            try {
                if (!fs.existsSync(dataDir)) {
                    console.log('Creating data directory...');
                    fs.mkdirSync(dataDir, { recursive: true });
                }
                // Ensure we have write permissions
                fs.accessSync(dataDir, fs.constants.W_OK);
                console.log('Data directory is writable:', dataDir);
            } catch (error) {
                console.error('Error with data directory:', error);
                return res.status(500).json({ error: 'Server configuration error' });
            }
        }

        // Check if user already exists with more detailed error handling
        const existingUser = await new Promise((resolve, reject) => {
            db.get('SELECT id, username, portfolio_path FROM users WHERE username = ? OR portfolio_path = ?', 
                [username, portfolio_path], 
                (err, row) => {
                    if (err) {
                        console.error('Database error checking existing user:', err);
                        reject(err);
                    }
                    resolve(row);
                });
        });

        if (existingUser) {
            // Special case for Peter42 - allow re-registration with same portfolio path
            if (username === 'Peter42' && portfolio_path === '/portfolios/P4-1/Peter/Peter.html') {
                console.log('Allowing Peter42 re-registration...');
                // Delete existing Peter42 entry
                await new Promise((resolve, reject) => {
                    db.run('DELETE FROM users WHERE username = ?', ['Peter42'], (err) => {
                        if (err) reject(err);
                        else resolve();
                    });
                });
            } else {
                const errorMessage = existingUser.username === username ? 
                    'Username already exists' : 
                    'Portfolio path already exists';
                console.log('Registration conflict:', errorMessage);
                return res.status(400).json({ error: errorMessage });
            }
        }

        // Hash password
        const hashedPassword = await bcrypt.hash(password, 10);
        
        // Insert new user with better error handling
        const result = await new Promise((resolve, reject) => {
            db.run('INSERT INTO users (username, password, portfolio_path, is_public) VALUES (?, ?, ?, ?)',
                [username, hashedPassword, portfolio_path, true],
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

        // Set session immediately after registration
        req.session.user = {
            id: result,
            username: username,
            portfolio_path: portfolio_path
        };

        // Save session with error handling
        await new Promise((resolve, reject) => {
            req.session.save((err) => {
                if (err) {
                    console.error('Session save error:', err);
                    reject(err);
                } else {
                    console.log('Session saved after registration');
                    resolve();
                }
            });
        });

        // Set response headers to prevent caching
        res.set({
            'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
            'Pragma': 'no-cache',
            'Expires': '0'
        });

        // Send success response
        res.json({ 
            success: true, 
            message: 'Registration successful',
            redirect: '/login.html',
            user: {
                id: result,
                username: username,
                portfolio_path: portfolio_path
            }
        });
    } catch (error) {
        console.error('Registration error:', error);
        res.status(500).json({ 
            error: 'Error creating user. Please try again.',
            details: isProduction ? undefined : error.message
        });
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
app.get(['/', '/index.html'], (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
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
                if (!fs.existsSync(dataDir)) {
                    console.log('Creating data directory...');
                    fs.mkdirSync(dataDir, { recursive: true });
                }
                // Ensure we have write permissions
                fs.accessSync(dataDir, fs.constants.W_OK);
                console.log('Data directory is writable:', dataDir);
            } catch (error) {
                console.error('Error with data directory:', error);
                process.exit(1);
            }
        }

        db.run(`CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT UNIQUE,
            password TEXT,
            portfolio_path TEXT UNIQUE,
            is_public BOOLEAN DEFAULT 0
        )`, async (err) => {
            if (err) {
                console.error('Error creating users table:', err);
                return;
            }
            console.log('Users table ready');
            
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
                } else {
                    console.log('Peter42 not found, creating...');
                    // Create Peter42 with hashed password
                    const hashedPassword = await bcrypt.hash('Peter2025BB', 10);
                    await new Promise((resolve, reject) => {
                        db.run(
                            'INSERT INTO users (username, password, portfolio_path, is_public) VALUES (?, ?, ?, ?)',
                            ['Peter42', hashedPassword, '/portfolios/P4-1/Peter/Peter.html', true],
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