require('dotenv').config();
const express = require('express');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const path = require('path');
const cors = require('cors');
const auth = require('./middleware/auth');
const { PrismaClient } = require('@prisma/client');
const multer = require('multer');
const fs = require('fs');
const { getActiveQuarter, setActiveQuarter } = require('./utils/configManager');
const logger = require('./utils/logger');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Request logging middleware
app.use(logger.requestLogger);

// Simple redirect for trailing slashes
app.use((req, res, next) => {
    if (req.path.length > 1 && req.path.endsWith('/')) {
        res.redirect(301, req.path.slice(0, -1));
    } else {
        next();
    }
});

// Serve static files
app.use(express.static(path.join(__dirname, 'public'), {
    extensions: ['html', 'htm']
}));

// Serve uploaded files
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Serve documentation files
app.use('/docs', express.static(path.join(__dirname, 'docs'), {
    setHeaders: (res, path) => {
        if (path.endsWith('.md')) {
            res.setHeader('Content-Type', 'text/markdown');
        }
    }
}));

// Initialize Prisma Client
const prisma = new PrismaClient();

// Resource management endpoints
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, 'uploads/resources')
    },
    filename: function (req, file, cb) {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9)
        cb(null, uniqueSuffix + path.extname(file.originalname))
    }
});
const upload = multer({ storage: storage });

// Ensure uploads/course-docs directory exists
const courseDocsDir = path.join(__dirname, 'uploads', 'course-docs');
if (!fs.existsSync(courseDocsDir)) {
    fs.mkdirSync(courseDocsDir, { recursive: true });
}

// Save course docs (teacher only)
app.post('/api/course-docs', auth, async (req, res) => {
    try {
        const user = await prisma.user.findUnique({ where: { id: req.user.userId } });
        if (!user || user.role !== 'TEACHER') {
            return res.status(403).json({ error: 'Not authorized' });
        }
        const { structure, outline } = req.body;
        if (typeof structure !== 'string' || typeof outline !== 'string') {
            return res.status(400).json({ error: 'Invalid input' });
        }
        fs.writeFileSync(path.join(courseDocsDir, 'structure.md'), structure, 'utf8');
        fs.writeFileSync(path.join(courseDocsDir, 'outline.md'), outline, 'utf8');
        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ error: 'Failed to save documents' });
    }
});

// Fetch course docs (students and teachers)
app.get('/api/course-docs', auth, async (req, res) => {
    try {
        const structurePath = path.join(courseDocsDir, 'structure.md');
        const outlinePath = path.join(courseDocsDir, 'outline.md');
        const structure = fs.existsSync(structurePath) ? fs.readFileSync(structurePath, 'utf8') : '';
        const outline = fs.existsSync(outlinePath) ? fs.readFileSync(outlinePath, 'utf8') : '';
        res.json({ structure, outline });
    } catch (e) {
        res.status(500).json({ error: 'Failed to fetch documents' });
    }
});

// Login endpoint
app.post('/api/login', async (req, res) => {
    try {
        const { email, password, organization } = req.body;
        if (!organization) {
            return res.status(400).json({ success: false, error: 'Organization is required.' });
        }
        // Find all users with this email and organization
        const users = await prisma.user.findMany({
            where: { email, organization },
            select: {
                id: true,
                name: true,
                email: true,
                password: true,
                role: true,
                class: true,
                yearLevel: true,
                nickname: true,
                organization: true
            }
        });

        if (users.length === 0) {
            return res.status(400).json({ 
                success: false, 
                error: 'Invalid email or password' 
            });
        }

        // If multiple users found with the same email, check passwords for each
        let authenticatedUser = null;

        for (const user of users) {
            const isValidPassword = await bcrypt.compare(password, user.password);
            if (isValidPassword) {
                authenticatedUser = user;
                break;
            }
        }

        if (!authenticatedUser) {
            return res.status(400).json({ 
                success: false, 
                error: 'Invalid email or password' 
            });
        }

        // If class is M1/1 but year level is 1, update it to 7
        if (authenticatedUser.class === 'M1/1' && authenticatedUser.yearLevel === 1) {
            await prisma.user.update({
                where: { id: authenticatedUser.id },
                data: { yearLevel: 7 }
            });
            authenticatedUser.yearLevel = 7;
        }

        // Generate token
        const token = jwt.sign(
            { userId: authenticatedUser.id },
            process.env.JWT_SECRET || 'your-secret-key',
            { expiresIn: '24h' }
        );

        // Update lastLogin for the user
        await prisma.user.update({
            where: { id: authenticatedUser.id },
            data: { lastLogin: new Date() }
        });

        // Create a new session record
        const session = await prisma.userSession.create({
            data: {
                userId: authenticatedUser.id,
                ipAddress: req.ip || req.connection.remoteAddress,
                userAgent: req.headers['user-agent']
            }
        });

        res.json({
            success: true,
            token,
            user: {
                id: authenticatedUser.id,
                name: authenticatedUser.name,
                email: authenticatedUser.email,
                role: authenticatedUser.role.toUpperCase(),
                class: authenticatedUser.class,
                yearLevel: authenticatedUser.yearLevel,
                nickname: authenticatedUser.nickname,
                organization: authenticatedUser.organization
            }
        });
    } catch (error) {
        logger.logError(error, 'User login failed');
        res.status(500).json({ 
            success: false, 
            error: error.message 
        });
    }
});

// Logout endpoint
app.post('/api/logout', auth, async (req, res) => {
    try {
        // Find the most recent active session for this user
        const activeSession = await prisma.userSession.findFirst({
            where: {
                userId: req.user.userId,
                endTime: null // Session is still active
            },
            orderBy: {
                startTime: 'desc'
            }
        });

        if (activeSession) {
            // End the session
            const endTime = new Date();
            const duration = Math.floor((endTime.getTime() - activeSession.startTime.getTime()) / 1000);
            
            await prisma.userSession.update({
                where: { id: activeSession.id },
                data: {
                    endTime: endTime,
                    duration: duration
                }
            });
        }

        res.json({ success: true, message: 'Logged out successfully' });
    } catch (error) {
        logger.logError(error, 'User logout failed');
        res.status(500).json({ 
            success: false, 
            error: error.message 
        });
    }
});

// Get user session statistics
app.get('/api/user-sessions/:userId', auth, async (req, res) => {
    try {
        const { userId } = req.params;
        const { startDate, endDate } = req.query;

        // Check if user has permission to view this data
        const requestingUser = await prisma.user.findUnique({
            where: { id: req.user.userId }
        });

        if (!requestingUser || 
            (requestingUser.role !== 'ADMIN' && 
             requestingUser.role !== 'TEACHER' && 
             req.user.userId !== userId)) {
            return res.status(403).json({ error: 'Not authorized to view session data' });
        }

        // Build where clause
        const whereClause = { userId };
        if (startDate && endDate) {
            whereClause.startTime = {
                gte: new Date(startDate),
                lte: new Date(endDate)
            };
        }

        // Get completed sessions (with endTime)
        const sessions = await prisma.userSession.findMany({
            where: {
                ...whereClause,
                endTime: { not: null }
            },
            orderBy: {
                startTime: 'desc'
            }
        });

        // Calculate statistics
        const totalSessions = sessions.length;
        const totalDuration = sessions.reduce((sum, session) => sum + (session.duration || 0), 0);
        const averageDuration = totalSessions > 0 ? Math.round(totalDuration / totalSessions) : 0;
        const longestSession = sessions.length > 0 ? Math.max(...sessions.map(s => s.duration || 0)) : 0;

        res.json({
            sessions,
            statistics: {
                totalSessions,
                totalDuration, // in seconds
                averageDuration, // in seconds
                longestSession, // in seconds
                totalHours: Math.round(totalDuration / 3600 * 100) / 100
            }
        });
    } catch (error) {
        logger.logError(error, 'Session data fetch failed');
        res.status(500).json({ error: 'Failed to fetch session data' });
    }
});

// Get login frequency analysis for a user
app.get('/api/user-sessions/:userId/frequency', auth, async (req, res) => {
    try {
        const { userId } = req.params;
        const { hours = 24 } = req.query; // Default to 24 hours

        // Check if user has permission to view this data
        const requestingUser = await prisma.user.findUnique({
            where: { id: req.user.userId }
        });

        if (!requestingUser || 
            (requestingUser.role !== 'ADMIN' && 
             requestingUser.role !== 'TEACHER' && 
             req.user.userId !== userId)) {
            return res.status(403).json({ error: 'Not authorized to view session data' });
        }

        // Calculate time range
        const endTime = new Date();
        const startTime = new Date(endTime.getTime() - (parseInt(hours) * 60 * 60 * 1000));

        // Get all sessions in the time range
        const sessions = await prisma.userSession.findMany({
            where: {
                userId,
                startTime: {
                    gte: startTime,
                    lte: endTime
                }
            },
            orderBy: {
                startTime: 'asc'
            }
        });

        // Analyze login patterns
        const loginFrequency = sessions.length;
        const shortSessions = sessions.filter(s => s.duration && s.duration < 300); // Sessions under 5 minutes
        const veryShortSessions = sessions.filter(s => s.duration && s.duration < 60); // Sessions under 1 minute
        
        // Group sessions by hour to see patterns
        const hourlyPatterns = {};
        sessions.forEach(session => {
            const hour = new Date(session.startTime).getHours();
            hourlyPatterns[hour] = (hourlyPatterns[hour] || 0) + 1;
        });

        // Calculate average time between logins
        let averageTimeBetweenLogins = 0;
        if (sessions.length > 1) {
            let totalTimeBetween = 0;
            for (let i = 1; i < sessions.length; i++) {
                if (!sessions[i-1].endTime) continue;
                const timeBetween = sessions[i].startTime.getTime() - new Date(sessions[i-1].endTime).getTime();
                totalTimeBetween += timeBetween;
            }
            averageTimeBetweenLogins = Math.round(totalTimeBetween / (sessions.length - 1) / 1000 / 60); // in minutes
        }

        // Identify potential gaming/activity switching patterns
        const suspiciousPatterns = [];
        for (let i = 1; i < sessions.length; i++) {
            if (!sessions[i-1].endTime) continue;
            const timeBetween = sessions[i].startTime.getTime() - new Date(sessions[i-1].endTime).getTime();
            const minutesBetween = timeBetween / 1000 / 60;
            
            // Flag patterns that might indicate switching to games/other activities
            if (minutesBetween >= 5 && minutesBetween <= 30 && sessions[i-1].duration < 600) {
                suspiciousPatterns.push({
                    sessionIndex: i,
                    timeBetween: Math.round(minutesBetween),
                    previousSessionDuration: sessions[i-1].duration,
                    timestamp: sessions[i].startTime
                });
            }
        }

        res.json({
            timeRange: {
                start: startTime,
                end: endTime,
                hours: parseInt(hours)
            },
            loginFrequency: {
                totalLogins: loginFrequency,
                shortSessions: shortSessions.length,
                veryShortSessions: veryShortSessions.length,
                averageTimeBetweenLogins, // in minutes
                suspiciousPatterns: suspiciousPatterns.length
            },
            patterns: {
                hourlyDistribution: hourlyPatterns,
                suspiciousPatterns
            },
            sessions: sessions.map(s => ({
                id: s.id,
                startTime: s.startTime,
                endTime: s.endTime,
                duration: s.duration,
                durationMinutes: s.duration ? Math.round(s.duration / 60) : null
            }))
        });
    } catch (error) {
        logger.logError(error, 'Login frequency analysis failed');
        res.status(500).json({ error: 'Failed to analyze login frequency' });
    }
});

// Get class-wide login frequency analysis (for teachers)
app.get('/api/class-sessions/frequency', auth, async (req, res) => {
    try {
        const { class: className, hours = 24 } = req.query;

        // Check if user is a teacher
        const requestingUser = await prisma.user.findUnique({
            where: { id: req.user.userId }
        });

        if (!requestingUser || requestingUser.role !== 'TEACHER') {
            return res.status(403).json({ error: 'Only teachers can view class session data' });
        }

        if (!className) {
            return res.status(400).json({ error: 'Class parameter is required' });
        }

        // Calculate time range
        const endTime = new Date();
        const startTime = new Date(endTime.getTime() - (parseInt(hours) * 60 * 60 * 1000));

        // Get all students in the class
        const students = await prisma.user.findMany({
            where: {
                class: className,
                role: 'STUDENT',
                active: true
            },
            select: {
                id: true,
                name: true,
                nickname: true
            }
        });

        const studentIds = students.map(s => s.id);

        // Get sessions for all students in the class
        const sessions = await prisma.userSession.findMany({
            where: {
                userId: { in: studentIds },
                startTime: {
                    gte: startTime,
                    lte: endTime
                }
            },
            include: {
                user: {
                    select: {
                        name: true,
                        nickname: true
                    }
                }
            },
            orderBy: {
                startTime: 'asc'
            }
        });

        // Group sessions by student
        const studentSessions = {};
        students.forEach(student => {
            studentSessions[student.id] = {
                student: student,
                sessions: sessions.filter(s => s.userId === student.id),
                totalLogins: 0,
                shortSessions: 0,
                suspiciousPatterns: 0,
                totalDuration: 0
            };
        });

        // Analyze each student's patterns
        Object.values(studentSessions).forEach(studentData => {
            const sessions = studentData.sessions;
            studentData.totalLogins = sessions.length;
            studentData.shortSessions = sessions.filter(s => s.duration && s.duration < 300).length;
            studentData.totalDuration = sessions.reduce((sum, s) => sum + (s.duration || 0), 0);

            // Count suspicious patterns
            let suspiciousCount = 0;
            for (let i = 1; i < sessions.length; i++) {
                if (!sessions[i-1].endTime) continue;
                const timeBetween = sessions[i].startTime.getTime() - new Date(sessions[i-1].endTime).getTime();
                const minutesBetween = timeBetween / 1000 / 60;
                
                if (minutesBetween >= 5 && minutesBetween <= 30 && sessions[i-1].duration < 600) {
                    suspiciousCount++;
                }
            }
            studentData.suspiciousPatterns = suspiciousCount;
        });

        // Sort by suspicious patterns (highest first)
        const sortedStudents = Object.values(studentSessions).sort((a, b) => 
            b.suspiciousPatterns - a.suspiciousPatterns
        );

        // For each student, get total assignment/assessment time
        const assessmentTimes = {};
        for (const student of students) {
            const totalTime = await prisma.assessmentSubmission.aggregate({
                _sum: { totalTime: true },
                where: {
                    studentId: student.id,
                    totalTime: { not: null }
                }
            });
            assessmentTimes[student.id] = totalTime._sum.totalTime || 0;
        }

        res.json({
            timeRange: {
                start: startTime,
                end: endTime,
                hours: parseInt(hours)
            },
            class: className,
            totalStudents: students.length,
            students: sortedStudents.map(s => ({
                name: s.student.name,
                nickname: s.student.nickname,
                totalLogins: s.totalLogins,
                shortSessions: s.shortSessions,
                suspiciousPatterns: s.suspiciousPatterns,
                totalDurationMinutes: Math.round(s.totalDuration / 60),
                averageSessionMinutes: s.totalLogins > 0 ? Math.round(s.totalDuration / s.totalLogins / 60) : 0,
                assignmentTimeSeconds: assessmentTimes[s.student.id] || 0
            }))
        });
    } catch (error) {
        logger.logError(error, 'Class session frequency analysis failed');
        res.status(500).json({ error: 'Failed to analyze class session frequency' });
    }
});

// Auth check endpoint
app.get('/api/auth/check', auth, async (req, res) => {
    try {
        const user = await prisma.user.findUnique({
            where: { id: req.user.userId },
            select: {
                id: true,
                role: true,
                name: true,
                email: true
            }
        });

        if (!user) {
            return res.json({ 
                authenticated: false,
                role: null
            });
        }

        res.json({
            authenticated: true,
            role: user.role.toUpperCase(),
            name: user.name,
            email: user.email
        });
    } catch (error) {
        logger.logError(error, 'Authentication check failed');
        res.status(500).json({ 
            authenticated: false,
            error: 'Failed to check authentication status'
        });
    }
});

// CoreSubject routes
app.post('/api/core-subjects', auth, async (req, res) => {
    try {
        const user = await prisma.user.findUnique({
            where: { id: req.user.userId }
        });

        if (!user || (user.role !== 'ADMIN' && user.role !== 'TEACHER')) {
            return res.status(403).json({ error: 'Only administrators and teachers can create core subjects' });
        }

        const { name, description } = req.body;

        // Check if CoreSubject already exists
        const existingSubject = await prisma.coreSubject.findUnique({
            where: { name }
        });

        if (existingSubject) {
            return res.status(400).json({ error: 'A core subject with this name already exists' });
        }

        // Create new CoreSubject
        const coreSubject = await prisma.coreSubject.create({
            data: {
                name,
                description
            }
        });

        res.json(coreSubject);
    } catch (error) {
        logger.logError(error, 'Core subject creation failed');
        res.status(500).json({ error: 'Failed to create core subject' });
    }
});

app.get('/api/core-subjects', auth, async (req, res) => {
    try {
        const coreSubjects = await prisma.coreSubject.findMany({
            orderBy: {
                name: 'asc'
            }
        });
        res.json(coreSubjects);
    } catch (error) {
        logger.logError(error, 'Core subjects fetch failed');
        res.status(500).json({ error: 'Failed to fetch core subjects' });
    }
});

// Registration endpoint
app.post('/api/register', async (req, res) => {
    try {
        const { name, nickname, email, password, role, year, class: studentClass, organization } = req.body;
        if (!organization) {
            return res.status(400).json({ success: false, error: 'Organization is required.' });
        }
        // Check if nickname is already used (if provided)
        if (nickname) {
            const existingUser = await prisma.user.findFirst({
                where: { nickname }
            });

            if (existingUser) {
                return res.status(400).json({ 
                    success: false, 
                    error: 'Nickname already in use. Please choose a different nickname.' 
                });
            }
        }

        // For teachers/admins, ensure email is unique
        if (role.toUpperCase() !== 'STUDENT') {
            const existingUser = await prisma.user.findFirst({
                where: { email }
            });

            if (existingUser) {
                return res.status(400).json({ 
                    success: false, 
                    error: 'Email already in use. Please use a different email address.' 
                });
            }
        } else {
            // For students, ensure no teacher/admin has this email
            const existingNonStudent = await prisma.user.findFirst({
                where: { 
                    email,
                    role: {
                        not: 'STUDENT'
                    }
                }
            });

            if (existingNonStudent) {
                return res.status(400).json({ 
                    success: false, 
                    error: 'This email is already registered to a teacher or administrator. Please use a different email address.' 
                });
            }
        }

        // Restrict teacher registration to only peter@pbs.ac.th
        if (role.toUpperCase() === 'TEACHER' && email.toLowerCase() !== 'peter@pbs.ac.th') {
            return res.status(403).json({ success: false, error: 'Teacher registration is restricted. Please contact the administrator.' });
        }

        // Hash password
        const hashedPassword = await bcrypt.hash(password, 10);

        // Create new user
        const user = await prisma.user.create({
            data: {
                name,
                nickname,
                email,
                password: hashedPassword,
                role: role.toUpperCase(),
                yearLevel: year,
                class: studentClass,
                active: true,
                organization
            }
        });

        // Generate token
        const token = jwt.sign(
            { userId: user.id },
            process.env.JWT_SECRET || 'your-secret-key',
            { expiresIn: '24h' }
        );

        res.json({
            success: true,
            token,
            user: {
                id: user.id,
                name: user.name,
                email: user.email,
                role: user.role,
                class: user.class,
                yearLevel: user.yearLevel,
                nickname: user.nickname,
                organization: user.organization
            }
        });
    } catch (error) {
        logger.logError(error, 'User registration failed');
        res.status(500).json({ 
            success: false, 
            error: error.message 
        });
    }
});

// Teacher Request Submission Endpoint
app.post('/api/teacher-request', async (req, res) => {
    try {
        const { name, email, password, organization, message } = req.body;
        
        // Validate required fields
        if (!name || !email || !password || !organization) {
            return res.status(400).json({ 
                success: false, 
                error: 'Name, email, password, and organization are required.' 
            });
        }
        
        // Check if email is already in use
        const existingUser = await prisma.user.findFirst({
            where: { email }
        });
        
        if (existingUser) {
            return res.status(400).json({ 
                success: false, 
                error: 'Email already in use. Please use a different email address.' 
            });
        }
        
        // Check if there's already a pending request for this email
        const existingRequest = await prisma.teacherApprovalRequest.findUnique({
            where: { email }
        });
        
        if (existingRequest) {
            return res.status(400).json({ 
                success: false, 
                error: 'A teacher request with this email already exists. Please check your request status.' 
            });
        }
        
        // Hash password for storage
        const hashedPassword = await bcrypt.hash(password, 10);
        
        // Create teacher approval request
        const request = await prisma.teacherApprovalRequest.create({
            data: {
                name,
                email,
                password: hashedPassword,
                organization,
                message: message || null,
                status: 'PENDING'
            }
        });
        
        console.log(`New teacher request submitted: ${name} (${email})`);
        
        res.json({
            success: true,
            message: 'Teacher request submitted successfully. You will be notified when reviewed.',
            requestId: request.id
        });
        
    } catch (error) {
        console.error('Teacher request error:', error);
        res.status(500).json({ 
            success: false, 
            error: 'Failed to submit teacher request. Please try again.' 
        });
    }
});

// Backup Management API (Peter Evans only)
app.post('/api/admin/create-backup', auth, async (req, res) => {
    try {
        // Check if user is Peter Evans
        const user = await prisma.user.findUnique({ 
            where: { id: req.user.userId } 
        });
        
        if (!user || user.email.toLowerCase() !== 'peter@pbs.ac.th') {
            return res.status(403).json({ error: 'Only Peter Evans can create backups' });
        }

        const { type } = req.body; // 'database' or 'complete'
        
        try {
            let backupName, size;
            
            if (type === 'complete') {
                // Use complete backup manager
                const { execSync } = require('child_process');
                const output = execSync('node scripts/complete-backup-manager.js backup', { 
                    encoding: 'utf8',
                    cwd: __dirname 
                });
                
                // Parse backup name from output
                const nameMatch = output.match(/complete-backup-[\d\-TZ]+/);
                backupName = nameMatch ? nameMatch[0] : 'unknown';
                
                // Estimate size (complete backups are ~600MB)
                size = '~600 MB';
                
            } else {
                // Use database backup manager
                const { execSync } = require('child_process');
                const output = execSync('node scripts/database-backup-manager.js backup', { 
                    encoding: 'utf8',
                    cwd: __dirname 
                });
                
                // Parse backup name from output
                const nameMatch = output.match(/backup-[\d\-TZ]+/);
                backupName = nameMatch ? nameMatch[0] : 'unknown';
                
                // Estimate size (database backups are ~3MB)
                size = '~3 MB';
            }
            
            res.json({ 
                success: true, 
                backupName,
                size,
                type,
                message: `${type} backup created successfully` 
            });
            
        } catch (error) {
            console.error('Backup creation error:', error);
            res.status(500).json({ 
                success: false, 
                error: `Failed to create ${type} backup: ${error.message}` 
            });
        }
        
    } catch (error) {
        console.error('Error in backup creation endpoint:', error);
        res.status(500).json({ error: 'Failed to create backup' });
    }
});

app.get('/api/admin/backups', auth, async (req, res) => {
    try {
        // Check if user is Peter Evans
        const user = await prisma.user.findUnique({ 
            where: { id: req.user.userId } 
        });
        
        if (!user || user.email.toLowerCase() !== 'peter@pbs.ac.th') {
            return res.status(403).json({ error: 'Only Peter Evans can view backups' });
        }

        const fs = require('fs');
        const path = require('path');
        
        const backups = [];
        
        // Get database backups
        const dbBackupDir = path.join(__dirname, 'backups/database');
        if (fs.existsSync(dbBackupDir)) {
            const dbBackups = fs.readdirSync(dbBackupDir)
                .filter(item => item.startsWith('backup-'))
                .map(backup => {
                    const backupPath = path.join(dbBackupDir, backup);
                    const stats = fs.statSync(backupPath);
                    const metadataPath = path.join(backupPath, 'backup-metadata.json');
                    
                    let metadata = null;
                    if (fs.existsSync(metadataPath)) {
                        try {
                            metadata = JSON.parse(fs.readFileSync(metadataPath, 'utf8'));
                        } catch (error) {
                            console.warn(`Could not read metadata for ${backup}`);
                        }
                    }
                    
                    return {
                        name: backup,
                        type: 'database',
                        created: stats.mtime,
                        size: getDirectorySize(backupPath),
                        metadata
                    };
                });
            backups.push(...dbBackups);
        }
        
        // Get complete backups
        const completeBackupDir = path.join(__dirname, 'backups/complete');
        if (fs.existsSync(completeBackupDir)) {
            const completeBackups = fs.readdirSync(completeBackupDir)
                .filter(item => item.startsWith('complete-backup-'))
                .map(backup => {
                    const backupPath = path.join(completeBackupDir, backup);
                    const stats = fs.statSync(backupPath);
                    const manifestPath = path.join(backupPath, 'backup-manifest.json');
                    
                    let metadata = null;
                    if (fs.existsSync(manifestPath)) {
                        try {
                            const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
                            metadata = {
                                totalRecords: manifest.components?.database?.records || 0,
                                fileCount: manifest.components?.uploads?.fileCount || 0
                            };
                        } catch (error) {
                            console.warn(`Could not read manifest for ${backup}`);
                        }
                    }
                    
                    return {
                        name: backup,
                        type: 'complete',
                        created: stats.mtime,
                        size: getDirectorySize(backupPath),
                        metadata
                    };
                });
            backups.push(...completeBackups);
        }
        
        // Sort by creation date (newest first)
        backups.sort((a, b) => b.created - a.created);
        
        res.json({ success: true, backups });
        
    } catch (error) {
        console.error('Error listing backups:', error);
        res.status(500).json({ error: 'Failed to list backups' });
    }
});

app.post('/api/admin/test-restore', auth, async (req, res) => {
    try {
        // Check if user is Peter Evans
        const user = await prisma.user.findUnique({ 
            where: { id: req.user.userId } 
        });
        
        if (!user || user.email.toLowerCase() !== 'peter@pbs.ac.th') {
            return res.status(403).json({ error: 'Only Peter Evans can test restores' });
        }

        const { backupName } = req.body;
        
        try {
            const { execSync } = require('child_process');
            
            if (backupName.startsWith('complete-backup-')) {
                // Test complete backup (placeholder - would need implementation)
                res.json({ 
                    success: true, 
                    message: `Complete backup ${backupName} test completed` 
                });
            } else {
                // Test database backup restore
                const output = execSync(`node scripts/database-backup-manager.js test-restore ${backupName}`, { 
                    encoding: 'utf8',
                    cwd: __dirname 
                });
                
                res.json({ 
                    success: true, 
                    message: `Database backup ${backupName} test completed successfully` 
                });
            }
            
        } catch (error) {
            console.error('Test restore error:', error);
            res.status(500).json({ 
                success: false, 
                error: `Test restore failed: ${error.message}` 
            });
        }
        
    } catch (error) {
        console.error('Error in test restore endpoint:', error);
        res.status(500).json({ error: 'Failed to test restore' });
    }
});

// Helper function to calculate directory size
function getDirectorySize(dirPath) {
    const fs = require('fs');
    const path = require('path');
    
    if (!fs.existsSync(dirPath)) return 0;
    
    let totalSize = 0;
    const entries = fs.readdirSync(dirPath, { withFileTypes: true });
    
    for (const entry of entries) {
        const fullPath = path.join(dirPath, entry.name);
        if (entry.isDirectory()) {
            totalSize += getDirectorySize(fullPath);
        } else {
            totalSize += fs.statSync(fullPath).size;
        }
    }
    
    return totalSize;
}

// Admin endpoint to list pending teacher requests (Peter Evans only)
app.get('/api/admin/teacher-requests', auth, async (req, res) => {
    try {
        // Check if user is Peter Evans
        const user = await prisma.user.findUnique({
            where: { id: req.user.userId }
        });
        
        if (!user || user.email.toLowerCase() !== 'peter@pbs.ac.th') {
            return res.status(403).json({ 
                success: false, 
                error: 'Access denied. Only the administrator can view teacher requests.' 
            });
        }
        
        // Get all teacher requests
        const requests = await prisma.teacherApprovalRequest.findMany({
            orderBy: { requestedAt: 'desc' },
            select: {
                id: true,
                name: true,
                email: true,
                organization: true,
                message: true,
                status: true,
                requestedAt: true,
                reviewedAt: true,
                reviewNotes: true
            }
        });
        
        res.json({
            success: true,
            requests
        });
        
    } catch (error) {
        console.error('Error fetching teacher requests:', error);
        res.status(500).json({ 
            success: false, 
            error: 'Failed to fetch teacher requests.' 
        });
    }
});

// Admin endpoint to approve teacher request (Peter Evans only)
app.post('/api/admin/approve-teacher/:requestId', auth, async (req, res) => {
    try {
        const { requestId } = req.params;
        const { notes } = req.body;
        
        // Check if user is Peter Evans
        const admin = await prisma.user.findUnique({
            where: { id: req.user.userId }
        });
        
        if (!admin || admin.email.toLowerCase() !== 'peter@pbs.ac.th') {
            return res.status(403).json({ 
                success: false, 
                error: 'Access denied. Only the administrator can approve teacher requests.' 
            });
        }
        
        // Get the teacher request
        const request = await prisma.teacherApprovalRequest.findUnique({
            where: { id: requestId }
        });
        
        if (!request) {
            return res.status(404).json({ 
                success: false, 
                error: 'Teacher request not found.' 
            });
        }
        
        if (request.status !== 'PENDING') {
            return res.status(400).json({ 
                success: false, 
                error: 'This request has already been reviewed.' 
            });
        }
        
        // Create the teacher account
        const teacher = await prisma.user.create({
            data: {
                name: request.name,
                email: request.email,
                password: request.password, // Already hashed
                role: 'TEACHER',
                organization: request.organization,
                active: true
            }
        });
        
        // Update the request status
        await prisma.teacherApprovalRequest.update({
            where: { id: requestId },
            data: {
                status: 'APPROVED',
                reviewedAt: new Date(),
                reviewedBy: admin.id,
                reviewNotes: notes || null
            }
        });
        
        console.log(`Teacher request approved: ${request.name} (${request.email}) by ${admin.name}`);
        
        res.json({
            success: true,
            message: 'Teacher request approved. Account created successfully.',
            teacherId: teacher.id
        });
        
    } catch (error) {
        console.error('Error approving teacher request:', error);
        res.status(500).json({ 
            success: false, 
            error: 'Failed to approve teacher request.' 
        });
    }
});

// Admin endpoint to reject teacher request (Peter Evans only)
app.post('/api/admin/reject-teacher/:requestId', auth, async (req, res) => {
    try {
        const { requestId } = req.params;
        const { notes } = req.body;
        
        // Check if user is Peter Evans
        const admin = await prisma.user.findUnique({
            where: { id: req.user.userId }
        });
        
        if (!admin || admin.email.toLowerCase() !== 'peter@pbs.ac.th') {
            return res.status(403).json({ 
                success: false, 
                error: 'Access denied. Only the administrator can reject teacher requests.' 
            });
        }
        
        // Get the teacher request
        const request = await prisma.teacherApprovalRequest.findUnique({
            where: { id: requestId }
        });
        
        if (!request) {
            return res.status(404).json({ 
                success: false, 
                error: 'Teacher request not found.' 
            });
        }
        
        if (request.status !== 'PENDING') {
            return res.status(400).json({ 
                success: false, 
                error: 'This request has already been reviewed.' 
            });
        }
        
        // Update the request status
        await prisma.teacherApprovalRequest.update({
            where: { id: requestId },
            data: {
                status: 'REJECTED',
                reviewedAt: new Date(),
                reviewedBy: admin.id,
                reviewNotes: notes || null
            }
        });
        
        console.log(`Teacher request rejected: ${request.name} (${request.email}) by ${admin.name}`);
        
        res.json({
            success: true,
            message: 'Teacher request rejected.',
            reason: notes || 'No reason provided'
        });
        
    } catch (error) {
        console.error('Error rejecting teacher request:', error);
        res.status(500).json({ 
            success: false, 
            error: 'Failed to reject teacher request.' 
        });
    }
});

// Debug endpoint for checking user role
app.get('/api/debug/user-role', auth, async (req, res) => {
    try {
        const user = await prisma.user.findUnique({
            where: { id: req.user.userId },
            select: {
                id: true,
                name: true,
                email: true,
                role: true
            }
        });
        
        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }
        
        res.json(user);
    } catch (error) {
        console.error('Error retrieving user role:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Subject routes
app.get('/api/subjects/available', auth, async (req, res) => {
    try {
        console.log('Fetching available subjects for user:', req.user.userId);
        
        const user = await prisma.user.findUnique({
            where: { id: req.user.userId },
            select: {
                yearLevel: true,
                studentCourses: {
                    select: {
                        subjectId: true
                    }
                }
            }
        });

        console.log('User details:', {
            userId: req.user.userId,
            yearLevel: user?.yearLevel,
            hasStudentCourses: user?.studentCourses?.length > 0
        });

        if (!user || !user.yearLevel) {
            console.log('User or year level not found:', user);
            return res.status(400).json({ success: false, message: 'User or year level not found' });
        }

        // Get enrolled subject IDs
        const enrolledSubjectIds = user.studentCourses.map(course => course.subjectId);
        console.log('Currently enrolled subject IDs:', enrolledSubjectIds);

        // First, get all subjects for the user's year level
        const allSubjectsForYear = await prisma.subject.findMany({
            where: {
                yearLevel: user.yearLevel
            },
            include: {
                coreSubject: true
            }
        });
        console.log('All subjects for year level', user.yearLevel, ':', 
            allSubjectsForYear.map(s => ({
                id: s.id,
                name: s.name,
                coreSubject: s.coreSubject.name
            }))
        );

        // Then filter out enrolled ones
        const availableSubjects = await prisma.subject.findMany({
            where: {
                yearLevel: user.yearLevel,
                id: {
                    notIn: enrolledSubjectIds
                }
            },
            include: {
                coreSubject: true
            }
        });

        console.log('Available subjects after filtering:', 
            availableSubjects.map(s => ({
                id: s.id,
                name: s.name,
                coreSubject: s.coreSubject.name
            }))
        );

        res.json({ success: true, subjects: availableSubjects });
    } catch (error) {
        console.error('Error fetching available subjects:', error);
        res.status(500).json({ success: false, message: 'Error fetching available subjects' });
    }
});

app.get('/api/subjects', auth, async (req, res) => {
    try {
        const { coreSubjectId } = req.query;
        
        const whereClause = {
                OR: [
                    {
                        teachers: {
                            some: {
                                teacherId: req.user.userId
                            }
                        }
                    },
                    {
                        isArchived: false
                    }
                ]
        };
        
        // Add coreSubjectId filter if provided
        if (coreSubjectId) {
            whereClause.coreSubjectId = coreSubjectId;
        }
        
        const subjects = await prisma.subject.findMany({
            include: {
                coreSubject: true,
                teachers: {
                    include: {
                        teacher: true
                    }
                }
            },
            where: whereClause,
            orderBy: {
                name: 'asc'
            }
        });
        res.json(subjects);
    } catch (error) {
        console.error('Error fetching subjects:', error);
        res.status(500).json({ error: 'Failed to fetch subjects' });
    }
});

app.post('/api/subjects', auth, async (req, res) => {
    try {
        const { name, description, yearLevel, coreSubjectId } = req.body;

        // Validate input
        if (!name || !yearLevel || !coreSubjectId) {
            return res.status(400).json({ error: 'Name, year level, and core subject are required' });
        }

        // Check if core subject exists
        const coreSubject = await prisma.coreSubject.findUnique({
            where: { id: coreSubjectId }
        });

        if (!coreSubject) {
            return res.status(404).json({ error: 'Core subject not found' });
        }

        // Create the subject
        const subject = await prisma.subject.create({
            data: {
                name,
                description,
                yearLevel,
                coreSubject: {
                    connect: { id: coreSubjectId }
                },
                teachers: {
                    create: {
                        teacherId: req.user.userId
                    }
                }
            },
            include: {
                coreSubject: true,
                teachers: {
                    include: {
                        teacher: true
                    }
                }
            }
        });

        res.json(subject);
    } catch (error) {
        console.error('Error creating subject:', error);
        if (error.code === 'P2002') {
            res.status(400).json({ error: 'A subject with this name already exists for this core subject and year level' });
        } else {
            res.status(500).json({ error: 'Failed to create subject' });
        }
    }
});

// Get a single subject by ID
app.get('/api/subjects/:subjectId', auth, async (req, res) => {
    try {
        const { subjectId } = req.params;
        
        const subject = await prisma.subject.findUnique({
            where: { id: subjectId },
            include: {
                coreSubject: true,
                teachers: {
                    include: {
                        teacher: true
                    }
                },
                topics: {
                    orderBy: {
                        order: 'asc'
                    }
                }
            }
        });

        if (!subject) {
            return res.status(404).json({ error: 'Subject not found' });
        }

        res.json(subject);
    } catch (error) {
        console.error('Error fetching subject:', error);
        res.status(500).json({ error: 'Failed to fetch subject' });
    }
});

// Get units for a subject
app.get('/api/subjects/:subjectId/units', auth, async (req, res) => {
    try {
        const { subjectId } = req.params;

        const subject = await prisma.subject.findUnique({
            where: { id: subjectId },
            include: {
                units: {
                    include: {
                        parts: {
                            include: {
                                sections: true
                            }
                        }
                    },
                    orderBy: {
                        order: 'asc'
                    }
                }
            }
        });

        if (!subject) {
            return res.status(404).json({ error: 'Subject not found' });
        }

        res.json(subject.units);
    } catch (error) {
        console.error('Error fetching units:', error);
        res.status(500).json({ error: 'Failed to fetch units' });
    }
});

// Create a unit for a subject
app.post('/api/subjects/:subjectId/units', auth, async (req, res) => {
    try {
        const { subjectId } = req.params;
        const { name, description } = req.body;

        // Get the current highest order number
        const highestOrder = await prisma.unit.findFirst({
            where: { subjectId },
            orderBy: { order: 'desc' },
            select: { order: true }
        });

        const newOrder = (highestOrder?.order || 0) + 1;

        const unit = await prisma.unit.create({
            data: {
                name,
                description,
                order: newOrder,
                subject: {
                    connect: { id: subjectId }
                }
            }
        });

        res.json(unit);
    } catch (error) {
        console.error('Error creating unit:', error);
        res.status(500).json({ error: 'Failed to create unit' });
    }
});

// Update a unit
app.put('/api/units/:unitId', auth, async (req, res) => {
    try {
        const { unitId } = req.params;
        const { name, description, order } = req.body;

        const unit = await prisma.unit.update({
            where: { id: unitId },
            data: { 
                name, 
                description,
                order: order ? parseInt(order) : undefined
            }
        });

        res.json(unit);
    } catch (error) {
        console.error('Error updating unit:', error);
        res.status(500).json({ error: 'Failed to update unit' });
    }
});

// Delete a unit
app.delete('/api/units/:unitId', auth, async (req, res) => {
    try {
        const { unitId } = req.params;

        await prisma.unit.delete({
            where: { id: unitId }
        });

        res.json({ success: true });
    } catch (error) {
        console.error('Error deleting unit:', error);
        res.status(500).json({ error: 'Failed to delete unit' });
    }
});

// Update a subject
app.put('/api/subjects/:subjectId', auth, async (req, res) => {
    try {
        const { subjectId } = req.params;
        const { name, description, yearLevel, coreSubjectId } = req.body;

        // Check if subject exists
        const existingSubject = await prisma.subject.findUnique({
            where: { id: subjectId }
        });

        if (!existingSubject) {
            return res.status(404).json({ error: 'Subject not found' });
        }

        // Update the subject
        const subject = await prisma.subject.update({
            where: { id: subjectId },
            data: {
            name,
                description,
                yearLevel,
                coreSubject: coreSubjectId ? {
                    connect: { id: coreSubjectId }
                } : undefined
            },
            include: {
                coreSubject: true,
                teachers: {
                    include: {
                        teacher: true
                    }
                }
            }
        });

        res.json(subject);
    } catch (error) {
        console.error('Error updating subject:', error);
        if (error.code === 'P2002') {
            res.status(400).json({ error: 'A subject with this name already exists for this core subject and year level' });
        } else {
            res.status(500).json({ error: 'Failed to update subject' });
        }
    }
});

// Get resources for a subject
app.get('/api/subjects/:subjectId/resources', auth, async (req, res) => {
    try {
        const { subjectId } = req.params;
        const { quarter } = req.query;
        const activeQuarter = quarter || await getActiveQuarter();
        
        // Get the requesting user to check their class
        const user = await prisma.user.findUnique({
            where: { id: req.user.userId },
            include: { studentCourses: true }
        });

        // Check for multi-quarter access
        let allowedQuarters = [activeQuarter];
        if (user && user.role === 'STUDENT') {
            const multiQuarterAccess = await prisma.multiQuarterAccess.findUnique({
                where: {
                    subjectId_className: {
                        subjectId: subjectId,
                        className: user.class || ''
                    }
                }
            });
            
            if (multiQuarterAccess && multiQuarterAccess.isEnabled) {
                allowedQuarters = ['Q1', 'Q2'];
            }
        }
        
        // Get the subject structure with units
        const subject = await prisma.subject.findUnique({
            where: { id: subjectId },
            include: {
                units: {
                    include: {
                        parts: {
                            include: {
                                sections: true
                            }
                        }
                    }
                },
                topics: {
                    include: {
                        resources: {
                            include: {
                                createdBy: true
                            }
                        }
                    }
                }
            }
        });

        if (!subject) {
            return res.status(404).json({ error: 'Subject not found' });
        }

        // Check if topics exist, if not, create them based on units
        if (subject.topics.length === 0 && subject.units.length > 0) {
            console.log('No topics found. Creating topics based on units...');
            const topicPromises = subject.units.map(async (unit) => {
                return prisma.topic.create({
                    data: {
                        name: unit.name,
                        description: unit.description,
                        order: unit.order,
                        subject: {
                            connect: { id: subjectId }
                        }
                    }
                });
            });
            
            await Promise.all(topicPromises);
            
            // Reload the subject with the newly created topics
            const updatedSubject = await prisma.subject.findUnique({
                where: { id: subjectId },
                include: {
                    units: {
                        include: {
                            parts: {
                                include: {
                                    sections: true
                                }
                            }
                        }
                    },
                    topics: {
                        include: {
                            resources: {
                                include: {
                                    createdBy: true
                                }
                            }
                        }
                    }
                }
            });
            
            subject.topics = updatedSubject.topics;
        }

        // Create a map of unit names to their structure
        const unitMap = {};
        subject.units.forEach(unit => {
            unitMap[unit.name] = {
                unitId: unit.id,
                parts: unit.parts
            };
        });

        // Map resources to their units, parts, and sections
        const resources = [];
        for (const topic of subject.topics) {
            const unitInfo = unitMap[topic.name];
            if (unitInfo) {
                for (const resource of topic.resources) {
                    // Only include resources that match allowed quarters (respects multi-quarter access)
                    if (!allowedQuarters.includes(resource.quarter)) {
                        continue;
                    }
                    
                    // Fetch linked assessments for this resource, filtered by active quarter
                    const resourceWithAssessments = await prisma.resource.findUnique({
                        where: { id: resource.id },
                        include: { 
                            assessments: {
                                where: {
                                    quarter: { in: allowedQuarters },
                                    published: true
                                }
                            }
                        }
                    });
                    
                    // Include all resources, but mark those without Q2 assessments
                    const hasQ2Assessments = resourceWithAssessments.assessments && resourceWithAssessments.assessments.length > 0;
                    
                    // Extract audioPath from metadata if it exists
                    let audioPath = null;
                    if (resource.metadata && typeof resource.metadata === 'object' && resource.metadata.audioPath) {
                        audioPath = resource.metadata.audioPath;
                    }
                    
                    resources.push({
                        ...resource,
                        unitId: resource.unitId,
                        partId: resource.partId,
                        sectionId: resource.sectionId,
                        audioPath: audioPath,
                        hasQ2Assessments: hasQ2Assessments,
                        assessments: resourceWithAssessments.assessments.map(a => ({
                            id: a.id,
                            title: a.title,
                            type: a.type,
                            dueDate: a.dueDate,
                            quarter: a.quarter
                        }))
                    });
                }
            }
        }

        console.log(`Found ${resources.length} resources for quarter ${activeQuarter}`); // Debug log
        res.json(resources);
    } catch (error) {
        console.error('Error fetching resources:', error);
        res.status(500).json({ error: 'Failed to fetch resources' });
    }
});

// Add a new resource
app.post('/api/resources', auth, upload.fields([
    { name: 'file', maxCount: 1 },
    { name: 'audioFile', maxCount: 1 }
]), async (req, res) => {
    try {
        const { title, description, type, url, subjectId, unitId, partId, sectionId } = req.body;
        
        if (!unitId) {
            return res.status(400).json({ error: 'unitId is required to create a resource.' });
        }

        // First, get the unit name
        const unit = await prisma.unit.findUnique({
            where: { id: unitId }
        });

        if (!unit) {
            return res.status(404).json({ error: 'Unit not found' });
        }

        // Create or find topic based on the unit name
        let topic = await prisma.topic.findFirst({
            where: {
                name: unit.name,
                subjectId: subjectId
            }
        });

        if (!topic) {
            topic = await prisma.topic.create({
                data: {
                    name: unit.name,
                    description: unit.description,
                    order: unit.order,
                    subject: {
                        connect: { id: subjectId }
                    }
                }
            });
        }

        // Handle file path for uploaded resources
        let filePath = null;
        let audioPath = null;
        
        if (req.files && req.files.file && req.files.file.length > 0) {
            filePath = `/uploads/resources/${req.files.file[0].filename}`;
        } else if (type === 'link' && url) {
            filePath = url;
        }
        
        // Handle audio file for image-with-audio type
        if (type === 'image-with-audio' && req.files && req.files.audioFile && req.files.audioFile.length > 0) {
            audioPath = `/uploads/resources/${req.files.audioFile[0].filename}`;
        }
        
        // Prepare metadata object
        const metadata = {};
        if (audioPath) {
            metadata.audioPath = audioPath;
        }
        
        // Get the active quarter for the new resource
        const activeQuarter = await getActiveQuarter();
        
        const resource = await prisma.resource.create({
            data: {
                title,
                description,
                type,
                url: filePath,
                quarter: activeQuarter, // Set the quarter for the new resource
                topic: {
                    connect: { id: topic.id }
                },
                createdBy: { connect: { id: req.user.userId } },
                unit: unitId ? { connect: { id: unitId } } : undefined,
                part: partId ? { connect: { id: partId } } : undefined,
                section: sectionId ? { connect: { id: sectionId } } : undefined,
                metadata: Object.keys(metadata).length > 0 ? metadata : undefined
            }
        });

        res.json(resource);
    } catch (error) {
        console.error('Error creating resource:', error);
        res.status(500).json({ error: 'Failed to create resource' });
    }
});

// Delete a resource
app.delete('/api/resources/:resourceId', auth, async (req, res) => {
    try {
        const { resourceId } = req.params;
        
        await prisma.resource.delete({
            where: { id: resourceId }
        });

        res.json({ message: 'Resource deleted successfully' });
    } catch (error) {
        console.error('Error deleting resource:', error);
        res.status(500).json({ error: 'Failed to delete resource' });
    }
});

// Get units, parts, and sections for a subject
app.get('/api/subjects/:subjectId/structure', auth, async (req, res) => {
    try {
        const { subjectId } = req.params;
        
        const structure = await prisma.subject.findUnique({
            where: { id: subjectId },
            include: {
                units: {
                    include: {
                        parts: {
                            include: {
                                sections: true
                            }
                        }
                    }
                }
            }
        });

        if (!structure) {
            return res.status(404).json({ error: 'Subject not found' });
        }

        res.json(structure);
    } catch (error) {
        console.error('Error fetching subject structure:', error);
        res.status(500).json({ error: 'Failed to fetch subject structure' });
    }
});

// User Info endpoint
app.get('/api/user/info', auth, async (req, res) => {
    try {
        const user = await prisma.user.findUnique({
            where: { id: req.user.userId },
            select: {
                id: true,
                name: true,
                email: true,
                role: true,
                yearLevel: true,
                class: true,
                studentCourses: {
                    include: {
                        subject: {
                            include: {
                                coreSubject: true
                            }
                        }
                    }
                }
            }
        });

        if (!user) {
            return res.status(404).json({ success: false, message: 'User not found' });
        }

        // Format the response
        const userInfo = {
            id: user.id,
            name: user.name,
            email: user.email,
            role: user.role,
            yearLevel: user.yearLevel,
            class: user.class,
            subjects: user.studentCourses.map(course => ({
                id: course.subject.id,
                name: course.subject.name,
                description: course.subject.description,
                yearLevel: course.subject.yearLevel,
                coreSubject: course.subject.coreSubject
            }))
        };

        res.json({ success: true, user: userInfo });
    } catch (error) {
        console.error('Error fetching user info:', error);
        res.status(500).json({ success: false, message: 'Error fetching user information' });
    }
});

// Enroll in a subject
app.post('/api/subjects/enroll', auth, async (req, res) => {
    try {
        const { subjectId } = req.body;

        if (!subjectId) {
            return res.status(400).json({ success: false, message: 'Subject ID is required' });
        }

        // Check if subject exists and matches student's year level
        const user = await prisma.user.findUnique({
            where: { id: req.user.userId },
            select: {
                yearLevel: true,
                studentCourses: {
                    where: {
                        subjectId: subjectId
                    }
                }
            }
        });

        const subject = await prisma.subject.findUnique({
            where: { id: subjectId }
        });

        if (!subject || !user) {
            return res.status(404).json({ success: false, message: 'Subject or user not found' });
        }

        if (subject.yearLevel !== user.yearLevel) {
            return res.status(400).json({ 
                success: false, 
                message: 'This subject is not available for your year level' 
            });
        }

        // Check if already enrolled
        if (user.studentCourses.length > 0) {
            return res.status(400).json({ 
                success: false, 
                message: 'Already enrolled in this subject' 
            });
        }

        // Create enrollment
        const enrollment = await prisma.studentCourse.create({
            data: {
                studentId: req.user.userId,
                subjectId: subject.id
            }
        });

        res.json({ success: true, enrollment });
    } catch (error) {
        console.error('Error enrolling in subject:', error);
        res.status(500).json({ success: false, message: 'Error enrolling in subject' });
    }
});

// Save student course selections
app.post('/api/student/courses', auth, async (req, res) => {
    try {
        const { courseIds } = req.body;
        console.log('Received course selection request:', { courseIds });
        
        if (!Array.isArray(courseIds)) {
            console.log('Invalid courseIds format:', courseIds);
            return res.status(400).json({ 
                success: false, 
                message: 'Course IDs must be provided as an array' 
            });
        }

        // Get user's current year level
        const user = await prisma.user.findUnique({
            where: { id: req.user.userId },
            select: { 
                yearLevel: true,
                studentCourses: true
            }
        });
        console.log('User info:', { userId: req.user.userId, yearLevel: user?.yearLevel });

        if (!user || !user.yearLevel) {
            console.log('User or year level not found:', user);
            return res.status(400).json({
                success: false,
                message: 'User year level not found'
            });
        }

        // Verify all courses exist and match user's year level
        const courses = await prisma.subject.findMany({
            where: {
                id: { in: courseIds },
                yearLevel: user.yearLevel
            }
        });
        console.log('Found courses:', courses.map(c => ({ id: c.id, name: c.name, yearLevel: c.yearLevel })));

        if (courses.length !== courseIds.length) {
            console.log('Course count mismatch:', {
                requestedCount: courseIds.length,
                foundCount: courses.length,
                requestedIds: courseIds,
                foundIds: courses.map(c => c.id)
            });
            return res.status(400).json({
                success: false,
                message: 'One or more selected courses are not available for your year level'
            });
        }

        // Remove existing enrollments
        const deleteResult = await prisma.studentCourse.deleteMany({
            where: { studentId: req.user.userId }
        });
        console.log('Deleted existing enrollments:', deleteResult);

        // Create new enrollments
        const enrollments = await Promise.all(
            courseIds.map(courseId =>
                prisma.studentCourse.create({
                    data: {
                        studentId: req.user.userId,
                        subjectId: courseId
                    }
                })
            )
        );
        console.log('Created new enrollments:', enrollments);

        res.json({ success: true, enrollments });
    } catch (error) {
        console.error('Error saving course selections:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Failed to save course selections' 
        });
    }
});

// Debug endpoint to check all subjects
app.get('/api/debug/subjects', auth, async (req, res) => {
    try {
        const user = await prisma.user.findUnique({
            where: { id: req.user.userId },
            select: {
                yearLevel: true,
                role: true
            }
        });

        const allSubjects = await prisma.subject.findMany({
            include: {
                coreSubject: true
            }
        });

        const subjectsForUserYear = await prisma.subject.findMany({
            where: {
                yearLevel: user.yearLevel
            },
            include: {
                coreSubject: true
            }
        });

        res.json({
            userYearLevel: user.yearLevel,
            userRole: user.role,
            totalSubjects: allSubjects.length,
            subjectsForUserYear: subjectsForUserYear,
            allSubjects: allSubjects
        });
    } catch (error) {
        console.error('Debug error:', error);
        res.status(500).json({ error: 'Debug endpoint error' });
    }
});

// Debug endpoint to check M1 subjects
app.get('/api/debug/m1subjects', auth, async (req, res) => {
    try {
        const m1Subjects = await prisma.subject.findMany({
            where: {
                yearLevel: 7  // M1 corresponds to year level 7
            },
            include: {
                coreSubject: true
            }
        });

        console.log('Found M1 subjects:', m1Subjects);

        res.json({
            success: true,
            totalM1Subjects: m1Subjects.length,
            subjects: m1Subjects.map(s => ({
                id: s.id,
                name: s.name,
                yearLevel: s.yearLevel,
                coreSubject: s.coreSubject.name
            }))
        });
    } catch (error) {
        console.error('Error checking M1 subjects:', error);
        res.status(500).json({ success: false, message: 'Error checking M1 subjects' });
    }
});

// Debug endpoint to check all subjects and year levels
app.get('/api/debug/all-subjects', async (req, res) => {
    try {
        const subjects = await prisma.subject.findMany({
            include: {
                coreSubject: true
            }
        });
        
        res.json({
            totalSubjects: subjects.length,
            subjects: subjects.map(s => ({
                id: s.id,
                name: s.name,
                yearLevel: s.yearLevel,
                coreSubject: s.coreSubject.name
            }))
        });
    } catch (error) {
        console.error('Debug error:', error);
        res.status(500).json({ error: 'Debug endpoint error' });
    }
});

// Debug endpoint to update student year level
app.post('/api/debug/update-year-level', auth, async (req, res) => {
    try {
        const user = await prisma.user.update({
            where: { id: req.user.userId },
            data: {
                yearLevel: 7  // Set to M1
            },
            select: {
                id: true,
                name: true,
                email: true,
                role: true,
                yearLevel: true,
                class: true
            }
        });
        
        res.json({
            success: true,
            message: 'Year level updated to M1 (7)',
            user
        });
    } catch (error) {
        console.error('Debug error:', error);
        res.status(500).json({ error: 'Failed to update year level' });
    }
});

// Debug endpoint to update student info
app.get('/api/debug/update-student-info', auth, async (req, res) => {
    try {
        const user = await prisma.user.findUnique({
            where: { id: req.user.userId },
            select: {
                id: true,
                name: true,
                email: true,
                role: true,
                yearLevel: true,
                class: true
            }
        });
        
        // Create a form to update the user info
        res.send(`
            <form method="POST">
                <h2>Update Student Info</h2>
                <p>Current year level: ${user.yearLevel ? (user.yearLevel <= 6 ? `P${user.yearLevel}` : `M${user.yearLevel - 6}`) : 'Not set'}</p>
                <p>Current class: ${user.class || 'Not set'}</p>
                <p style="color: red;">Note: Your class is set to M1/1 but your year level is P1. This needs to be fixed.</p>
                <input type="hidden" name="yearLevel" value="7">
                <button type="submit">Update to M1 (Year 7)</button>
            </form>
        `);
    } catch (error) {
        console.error('Debug error:', error);
        res.status(500).json({ error: 'Failed to load student info' });
    }
});

app.post('/api/debug/update-student-info', auth, async (req, res) => {
    try {
        const yearLevel = 7; // M1
        const user = await prisma.user.update({
            where: { id: req.user.userId },
            data: {
                yearLevel: yearLevel,
                class: 'M1/1'  // Keep their existing M1/1 class
            }
        });
        
        res.send(`
            <h2>Update Successful!</h2>
            <p>Your year level has been updated to M1 (Year 7) to match your class M1/1.</p>
            <p>Please:</p>
            <ol>
                <li>Log out</li>
                <li>Clear your browser's localStorage</li>
                <li>Log back in</li>
            </ol>
            <p><a href="/student/dashboard">Go to Dashboard</a></p>
        `);
    } catch (error) {
        console.error('Debug error:', error);
        res.status(500).json({ error: 'Failed to update student info' });
    }
});

// Handle favicon.ico requests
app.get('/favicon.ico', (req, res) => {
    res.status(204).end(); // No content response
});

// Create a part for a unit
app.post('/api/units/:unitId/parts', auth, async (req, res) => {
    try {
        const { unitId } = req.params;
        const { name, description, order } = req.body;

        // Validate input
        if (!name || !order) {
            return res.status(400).json({ error: 'Name and order are required' });
        }

        // Check if unit exists
        const unit = await prisma.unit.findUnique({
            where: { id: unitId }
        });

        if (!unit) {
            return res.status(404).json({ error: 'Unit not found' });
        }

        // Create the part
        const part = await prisma.part.create({
            data: {
                name,
                description,
                order,
                unit: {
                    connect: { id: unitId }
                }
            }
        });

        res.json(part);
    } catch (error) {
        console.error('Error creating part:', error);
        res.status(500).json({ error: 'Failed to create part' });
    }
});

// Get a single unit
app.get('/api/units/:unitId', auth, async (req, res) => {
    try {
        const { unitId } = req.params;
        
        const unit = await prisma.unit.findUnique({
            where: { id: unitId },
            include: {
                parts: {
                    include: {
                        sections: true
                    }
                }
            }
        });

        if (!unit) {
            return res.status(404).json({ error: 'Unit not found' });
        }

        res.json(unit);
    } catch (error) {
        console.error('Error fetching unit:', error);
        res.status(500).json({ error: 'Failed to fetch unit' });
    }
});

// Get parts for a unit
app.get('/api/units/:unitId/parts', auth, async (req, res) => {
    try {
        const { unitId } = req.params;
        
        const parts = await prisma.part.findMany({
            where: { unitId },
            orderBy: { order: 'asc' },
            include: {
                sections: true
            }
        });

        res.json(parts);
    } catch (error) {
        console.error('Error fetching parts:', error);
        res.status(500).json({ error: 'Failed to fetch parts' });
    }
});

// Get a single part by ID
app.get('/api/parts/:partId', auth, async (req, res) => {
    try {
        const { partId } = req.params;
        
        const part = await prisma.part.findUnique({
            where: { id: partId },
            include: {
                sections: true,
                unit: true
            }
        });

        if (!part) {
            return res.status(404).json({ error: 'Part not found' });
        }

        res.json(part);
    } catch (error) {
        console.error('Error fetching part:', error);
        res.status(500).json({ error: 'Failed to fetch part' });
    }
});

// Get sections for a part
app.get('/api/parts/:partId/sections', auth, async (req, res) => {
    try {
        const { partId } = req.params;
        
        const sections = await prisma.section.findMany({
            where: { partId },
            orderBy: { order: 'asc' }
        });

        res.json(sections);
    } catch (error) {
        console.error('Error fetching sections:', error);
        res.status(500).json({ error: 'Failed to fetch sections' });
    }
});

// Create a section for a part
app.post('/api/parts/:partId/sections', auth, async (req, res) => {
    try {
        const { partId } = req.params;
        const { name, description, order } = req.body;

        // Validate input
        if (!name || !order) {
            return res.status(400).json({ error: 'Name and order are required' });
        }

        // Check if part exists
        const part = await prisma.part.findUnique({
            where: { id: partId }
        });

        if (!part) {
            return res.status(404).json({ error: 'Part not found' });
        }

        // Create the section
        const section = await prisma.section.create({
            data: {
                name,
                description,
                order,
                part: {
                    connect: { id: partId }
                }
            }
        });

        res.json(section);
    } catch (error) {
        console.error('Error creating section:', error);
        res.status(500).json({ error: 'Failed to create section' });
    }
});

// Update a section by ID
app.put('/api/sections/:sectionId', auth, async (req, res) => {
    try {
        const { sectionId } = req.params;
        const { name, description, order } = req.body;

        // Validate input
        if (!name) {
            return res.status(400).json({ error: 'Name is required' });
        }

        // Check if section exists
        const existingSection = await prisma.section.findUnique({
            where: { id: sectionId }
        });

        if (!existingSection) {
            return res.status(404).json({ error: 'Section not found' });
        }

        // Update the section
        const updatedSection = await prisma.section.update({
            where: { id: sectionId },
            data: {
                name,
                description,
                order: order !== undefined ? order : existingSection.order
            }
        });

        res.json(updatedSection);
    } catch (error) {
        console.error('Error updating section:', error);
        res.status(500).json({ error: 'Failed to update section' });
    }
});

// Get a single section by ID
app.get('/api/sections/:sectionId', auth, async (req, res) => {
    try {
        const { sectionId } = req.params;
        
        const section = await prisma.section.findUnique({
            where: { id: sectionId },
            include: {
                part: {
                    include: {
                        unit: true
                    }
                }
            }
        });

        if (!section) {
            return res.status(404).json({ error: 'Section not found' });
        }

        res.json(section);
    } catch (error) {
        console.error('Error fetching section:', error);
        res.status(500).json({ error: 'Failed to fetch section' });
    }
});

// Get assessments for a section
app.get('/api/sections/:sectionId/assessments', auth, async (req, res) => {
    try {
        const { sectionId } = req.params;
        
        const assessments = await prisma.assessment.findMany({
            where: {
                type: { in: ['speaking', 'writing', 'writing-long', 'assignment'] }
            },
            include: {
                section: {
                    include: {
                        part: {
                            include: {
                                unit: {
                                    include: {
                                        subject: true
                                    }
                                }
                            }
                        }
                    }
                },
                mediaFiles: true,
                resources: { select: { id: true } }
            },
            orderBy: {
                createdAt: 'desc'
            },
            distinct: ['id'] // Ensure we only get unique assessments
        });

        const uniqueAssessments = Array.from(
            new Map(assessments.map(item => [item.id, item])).values()
        );

        // Add unattached flag for each assessment
        const assessmentsWithUnattached = uniqueAssessments.map(a => {
            const unattached = !a.resources || a.resources.length === 0;
            return { ...a, unattached };
        });

        console.log('Returning assessmentsWithUnattached:', JSON.stringify(assessmentsWithUnattached, null, 2));
        console.log(`Found ${assessments.length} assessments, ${uniqueAssessments.length} are unique`);
        res.json(assessmentsWithUnattached);
    } catch (error) {
        console.error('Error fetching section assessments:', error);
        res.status(500).json({ error: 'Failed to fetch section assessments' });
    }
});

// Get total resources count for student's enrolled subjects
app.get('/api/student/resources/count', auth, async (req, res) => {
    try {
        const activeQuarter = await getActiveQuarter();
        
        // Get student's enrolled subjects
        const user = await prisma.user.findUnique({
            where: { id: req.user.userId },
            include: {
                studentCourses: {
                    include: {
                        subject: true
                    }
                }
            }
        });

        if (!user || !user.studentCourses) {
            return res.json({ count: 0 });
        }

        // Get all topics for enrolled subjects
        const subjectIds = user.studentCourses.map(course => course.subject.id);
        const topics = await prisma.topic.findMany({
            where: {
                subjectId: {
                    in: subjectIds
                }
            },
            include: {
                resources: {
                    include: {
                        assessments: {
                            where: {
                                quarter: activeQuarter,
                                published: true
                            }
                        }
                    }
                }
            }
        });

        // Count all resources (not just those with Q2 assessments)
        const totalResources = topics.reduce((total, topic) => {
            return total + topic.resources.length;
        }, 0);

        res.json({ count: totalResources });
    } catch (error) {
        console.error('Error getting resource count:', error);
        res.status(500).json({ error: 'Failed to get resource count' });
    }
});

// Create a topic for a subject
app.post('/api/subjects/:subjectId/topics', auth, async (req, res) => {
    try {
        const { subjectId } = req.params;
        const { name, description } = req.body;

        // Get the current highest order number
        const highestOrder = await prisma.topic.findFirst({
            where: { subjectId },
            orderBy: { order: 'desc' },
            select: { order: true }
        });

        const newOrder = (highestOrder?.order || 0) + 1;

        const topic = await prisma.topic.create({
            data: {
                name,
                description,
                order: newOrder,
                subject: {
                    connect: { id: subjectId }
                }
            }
        });

        res.json(topic);
    } catch (error) {
        console.error('Error creating topic:', error);
        res.status(500).json({ error: 'Failed to create topic' });
    }
});

// Get a single topic by ID
app.get('/api/topics/:topicId', auth, async (req, res) => {
    try {
        const { topicId } = req.params;
        
        const topic = await prisma.topic.findUnique({
            where: { id: topicId },
            include: {
                resources: {
                    include: {
                        createdBy: true
                    }
                },
                subject: {
                    include: {
                        coreSubject: true
                    }
                }
            }
        });

        if (!topic) {
            return res.status(404).json({ error: 'Topic not found' });
        }

        res.json(topic);
    } catch (error) {
        console.error('Error fetching topic:', error);
        res.status(500).json({ error: 'Failed to fetch topic' });
    }
});

// Delete a topic
app.delete('/api/topics/:topicId', auth, async (req, res) => {
    try {
        const { topicId } = req.params;
        
        await prisma.topic.delete({
            where: { id: topicId }
        });

        res.json({ success: true, message: 'Topic deleted successfully' });
    } catch (error) {
        console.error('Error deleting topic:', error);
        res.status(500).json({ error: 'Failed to delete topic' });
    }
});

// Delete all topics for a subject
app.delete('/api/subjects/:subjectId/topics', auth, async (req, res) => {
    try {
        const { subjectId } = req.params;
        
        await prisma.topic.deleteMany({
            where: { subjectId }
        });

        res.json({ success: true, message: 'All topics deleted successfully' });
    } catch (error) {
        console.error('Error deleting topics:', error);
        res.status(500).json({ error: 'Failed to delete topics' });
    }
});

// Get resources for a topic
app.get('/api/topics/:topicId/resources', auth, async (req, res) => {
    try {
        const { topicId } = req.params;
        const activeQuarter = await getActiveQuarter();
        
        const topic = await prisma.topic.findUnique({
            where: { id: topicId },
            include: {
                resources: {
                    include: {
                        createdBy: true
                    }
                }
            }
        });

        if (!topic) {
            return res.status(404).json({ error: 'Topic not found' });
        }

        // For each resource, include its linked assessments filtered by active quarter
        const resourcesWithAssessments = await Promise.all(topic.resources
            .filter(resource => resource.quarter === activeQuarter) // Only include resources for active quarter
            .map(async resource => {
                const resourceWithAssessments = await prisma.resource.findUnique({
                    where: { id: resource.id },
                    include: { 
                        assessments: {
                            where: {
                                quarter: activeQuarter,
                                published: true
                            }
                        }
                    }
                });
                
                // Include all resources, but mark those without Q2 assessments
                const hasQ2Assessments = resourceWithAssessments.assessments && resourceWithAssessments.assessments.length > 0;
                
                // Extract audioPath from metadata if it exists
                let audioPath = null;
                if (resource.metadata && typeof resource.metadata === 'object' && resource.metadata.audioPath) {
                    audioPath = resource.metadata.audioPath;
                }
                return {
                    ...resource,
                    audioPath: audioPath,
                    hasQ2Assessments: hasQ2Assessments,
                    assessments: resourceWithAssessments.assessments.map(a => ({
                        id: a.id,
                        title: a.title,
                        type: a.type,
                        dueDate: a.dueDate,
                        quarter: a.quarter
                    }))
                };
            }));

        // Filter out null resources and sort by order field
        const filteredResources = resourcesWithAssessments.filter(r => r !== null);
        filteredResources.sort((a, b) => (a.order ?? 0) - (b.order ?? 0));

        res.json(filteredResources);
    } catch (error) {
        console.error('Error fetching topic resources:', error);
        res.status(500).json({ error: 'Failed to fetch topic resources' });
    }
});

// Get questions for a topic
app.get('/api/topics/:topicId/questions', auth, async (req, res) => {
    try {
        const { topicId } = req.params;
        
        const topic = await prisma.topic.findUnique({
            where: { id: topicId },
            include: {
                assessments: {
                    include: {
                        mediaFiles: true
                    }
                }
            }
        });

        if (!topic) {
            return res.status(404).json({ error: 'Topic not found' });
        }

        // Transform assessments into questions format
        const questions = topic.assessments
            .filter(assessment => assessment.type === 'quiz' || assessment.type === 'multiple-choice')
            .map(assessment => ({
                id: assessment.id,
                title: assessment.title,
                questions: assessment.questions,
                mediaFiles: assessment.mediaFiles
            }));

        res.json(questions);
    } catch (error) {
        console.error('Error fetching topic questions:', error);
        res.status(500).json({ error: 'Failed to fetch topic questions' });
    }
});

// Update a part
app.put('/api/parts/:partId', auth, async (req, res) => {
    try {
        const { partId } = req.params;
        const { name, description, order } = req.body;

        // Validate input
        if (!name || !order) {
            return res.status(400).json({ error: 'Name and order are required' });
        }

        const part = await prisma.part.update({
            where: { id: partId },
            data: {
                name,
                description,
                order
            }
        });

        res.json(part);
    } catch (error) {
        console.error('Error updating part:', error);
        res.status(500).json({ error: 'Failed to update part' });
    }
});

// Get a single assessment by ID
app.get('/api/assessments/:assessmentId', auth, async (req, res) => {
    try {
        const { assessmentId } = req.params;
        
        const assessment = await prisma.assessment.findUnique({
            where: { id: assessmentId },
            include: {
                mediaFiles: true,
                section: {
                    include: {
                        part: {
                            include: {
                                unit: {
                                    include: {
                                        subject: true
                                    }
                                }
                            }
                        }
                    }
                },
                createdBy: true
            }
        });

        if (!assessment) {
            return res.status(404).json({ error: 'Assessment not found' });
        }

        // Enforce availability for students: block access after due date
        if (req.user && req.user.role === 'STUDENT') {
            if (assessment.dueDate && new Date(assessment.dueDate) < new Date()) {
                return res.status(403).json({ error: 'This assessment is no longer available.' });
            }
        }

        // Normalize questions to an array for all types (questions may be a string or single object)
        if (assessment.questions) {
            let questions = assessment.questions;
            if (typeof questions === 'string') {
                try {
                    questions = JSON.parse(questions);
                } catch (e) {
                    console.error('Error parsing questions string:', e);
                }
            }
            if (questions && !Array.isArray(questions)) {
                questions = [questions];
            }
            if (questions) assessment.questions = questions;
        }

        // Process matching type assessments to ensure pairs data is properly formatted
        if (assessment.type === 'matching' && assessment.questions) {
            let questions = assessment.questions;
            
            // Ensure questions is an array
            if (!Array.isArray(questions)) {
                if (typeof questions === 'string') {
                    try {
                        questions = JSON.parse(questions);
                    } catch (e) {
                        console.error('Error parsing questions string:', e);
                        questions = [{ type: 'matching' }];
                    }
                } else {
                    questions = [questions];
                }
            }
            
            // Process each question to extract matching pairs
            questions = questions.map(question => {
                if (question.type === 'matching') {
                    // If pairs is available, use it directly
                    if (question.pairs && Array.isArray(question.pairs)) {
                        console.log(`Assessment has ${question.pairs.length} matching pairs`);
                    }
                    // If no pairs but expressions and meanings are available, create pairs
                    else if (!question.pairs && question.expressions && question.meanings && 
                             Array.isArray(question.expressions) && Array.isArray(question.meanings)) {
                        question.pairs = [];
                        for (let i = 0; i < Math.min(question.expressions.length, question.meanings.length); i++) {
                            if (question.expressions[i] && question.meanings[i]) {
                                question.pairs.push({
                                    expression: question.expressions[i],
                                    meaning: question.meanings[i]
                                });
                            }
                        }
                        console.log(`Created ${question.pairs.length} pairs from expressions and meanings`);
                    }
                }
                return question;
            });
            
            // Update assessment with processed questions
            assessment.questions = questions;
        }

        // Process line-match assessments to ensure pairs exist (from left/right arrays if needed)
        if (assessment.type === 'line-match' && assessment.questions) {
            let questions = assessment.questions;
            // Ensure array already handled above
            questions = questions.map(q => {
                if (!q) return q;
                if (Array.isArray(q.pairs) && q.pairs.length > 0) {
                    return q;
                }
                if (Array.isArray(q.left) && Array.isArray(q.right)) {
                    const minLen = Math.min(q.left.length, q.right.length);
                    q.pairs = [];
                    for (let i = 0; i < minLen; i++) {
                        if (q.left[i] && q.right[i]) {
                            q.pairs.push({ left: q.left[i], right: q.right[i] });
                        }
                    }
                    return q;
                }
                return q;
            });
            assessment.questions = questions;
        }

        // Normalize drag-and-drop questions to always be an array; also handle legacy subtype spelling
        if (assessment.type === 'drag-and-drop' && assessment.questions) {
            let questions = assessment.questions;
            // Ensure questions is an array
            if (!Array.isArray(questions)) {
                if (typeof questions === 'string') {
                    try {
                        questions = JSON.parse(questions);
                    } catch (e) {
                        console.error('Error parsing drag-and-drop questions string:', e);
                        questions = [ { type: 'drag-and-drop' } ];
                    }
                } else {
                    questions = [questions];
                }
            }
            // Normalize subtype spelling across questions
            questions = questions.map(q => {
                if (q && q.subtype === 'image-fill-in-blank') {
                    q.subtype = 'image-fill-blank';
                }
                return q;
            });
            assessment.questions = questions;
            // Also normalize top-level subtype if present
            if (assessment.subtype === 'image-fill-in-blank') {
                assessment.subtype = 'image-fill-blank';
            }
        }

        // Add subjectName, unitName, partName, sectionName to the response if available
        const subjectName = assessment.section?.part?.unit?.subject?.name || null;
        const unitName = assessment.section?.part?.unit?.name || null;
        const partName = assessment.section?.part?.name || null;
        const sectionName = assessment.section?.name || null;
        
        res.json({ ...assessment, subjectName, unitName, partName, sectionName });
    } catch (error) {
        console.error('Error fetching assessment:', error);
        res.status(500).json({ error: 'Failed to fetch assessment' });
    }
});

// Get student's assessment submissions
app.get('/api/assessments/:assessmentId/submissions', auth, async (req, res) => {
    try {
        const { assessmentId } = req.params;
        
        const submissions = await prisma.assessmentSubmission.findMany({
            where: {
                assessmentId,
                studentId: req.user.userId
            },
            orderBy: {
                submittedAt: 'desc'
            }
        });

        res.json(submissions);
    } catch (error) {
        console.error('Error fetching assessment submissions:', error);
        res.status(500).json({ error: 'Failed to fetch assessment submissions' });
    }
});

// Create/Save an assessment
app.post('/api/sections/:sectionId/assessments', auth, upload.any(), async (req, res) => {
    try {
        const { sectionId } = req.params;
        const { title, description, type, questions, dueDate, maxAttempts, category, topicId, weeklyScheduleId, criteria, audioFile, quarter } = req.body;
        console.log('[CREATE ASSESSMENT] req.body:', req.body);

        if (!sectionId) {
            return res.status(400).json({ error: 'sectionId is required to create an assessment.' });
        }

        // Validate required fields
        if (!title || !title.trim()) {
            return res.status(400).json({ error: 'Title is required' });
        }

        if (!type) {
            return res.status(400).json({ error: 'Assessment type is required' });
        }

        // Check if section exists
        const section = await prisma.section.findUnique({
            where: { id: sectionId }
        });

        if (!section) {
            return res.status(404).json({ error: 'Section not found' });
        }

        // Handle file uploads if any (accept any field name)
        const mediaFiles = req.files ? req.files.map(file => ({
            filePath: `/uploads/resources/${file.filename}`,
            type: file.mimetype,
            label: file.fieldname
        })) : [];
        
        // Handle audioFile parameter from the form
        if (audioFile && typeof audioFile === 'string' && audioFile.startsWith('/uploads/resources/')) {
            console.log(`[AUDIO] Adding audio file from URL: ${audioFile}`);
            // Add audio file from URL to mediaFiles
            mediaFiles.push({
                filePath: audioFile,
                type: audioFile.toLowerCase().endsWith('.mp3') ? 'audio/mpeg' : 
                      audioFile.toLowerCase().endsWith('.wav') ? 'audio/wav' : 
                      audioFile.toLowerCase().endsWith('.ogg') ? 'audio/ogg' : 'audio/mpeg',
                label: 'audio'
            });
        }

        // Parse and prepare questions
        let parsedQuestions = [];
        if (questions) {
            try {
                parsedQuestions = JSON.parse(questions);
                
                // Log the parsed questions for debugging
                console.log('Parsed questions:', JSON.stringify(parsedQuestions, null, 2));
                
                // Special handling for matching questions
                if (type === 'matching' && Array.isArray(parsedQuestions)) {
                    parsedQuestions = parsedQuestions.map(question => {
                        if (question.type === 'matching') {
                            console.log('Processing matching question:', JSON.stringify(question));
                            
                            // Ensure pairs is available and properly structured
                            if (question.pairs && Array.isArray(question.pairs)) {
                                console.log(`Found ${question.pairs.length} pairs in question`);
                            }
                            // If no pairs but expressions and meanings exist, create pairs
                            else if (question.expressions && question.meanings &&
                                    Array.isArray(question.expressions) && Array.isArray(question.meanings)) {
                                question.pairs = [];
                                for (let i = 0; i < Math.min(question.expressions.length, question.meanings.length); i++) {
                                    if (question.expressions[i] && question.meanings[i]) {
                                        question.pairs.push({
                                            expression: question.expressions[i],
                                            meaning: question.meanings[i]
                                        });
                                    }
                                }
                                console.log(`Created ${question.pairs.length} pairs from expressions and meanings`);
                            }
                        }
                        return question;
                    });
                }
                
                // Special handling for line-match assessments to process uploaded images
                if (type === 'line-match' && Array.isArray(parsedQuestions)) {
                    console.log('[LINE-MATCH] Processing line-match questions with file uploads');
                    parsedQuestions = parsedQuestions.map((question, qIndex) => {
                        if (question.type === 'line-match' && Array.isArray(question.pairs)) {
                            question.pairs = question.pairs.map((pair, pIndex) => {
                                // Check if this pair has image files that were uploaded
                                const leftFileKey = `line_match_left_${qIndex}_${pIndex}`;
                                const rightFileKey = `line_match_right_${qIndex}_${pIndex}`;
                                
                                // Find uploaded files for this pair
                                const leftFile = req.files?.find(f => f.fieldname === leftFileKey);
                                const rightFile = req.files?.find(f => f.fieldname === rightFileKey);
                                
                                // Update the pair with actual file paths if images were uploaded
                                const updatedPair = { ...pair };
                                if (leftFile && pair.left.kind === 'image') {
                                    updatedPair.left = { 
                                        kind: 'image', 
                                        value: `/uploads/resources/${leftFile.filename}` 
                                    };
                                    // Add to mediaFiles for database storage
                                    mediaFiles.push({
                                        filePath: `/uploads/resources/${leftFile.filename}`,
                                        type: leftFile.mimetype,
                                        label: `line_match_left_${qIndex}_${pIndex}`
                                    });
                                }
                                if (rightFile && pair.right.kind === 'image') {
                                    updatedPair.right = { 
                                        kind: 'image', 
                                        value: `/uploads/resources/${rightFile.filename}` 
                                    };
                                    // Add to mediaFiles for database storage
                                    mediaFiles.push({
                                        filePath: `/uploads/resources/${rightFile.filename}`,
                                        type: rightFile.mimetype,
                                        label: `line_match_right_${qIndex}_${pIndex}`
                                    });
                                }
                                
                                return updatedPair;
                            });
                        }
                        return question;
                    });
                }
                
                // Fix empty multiple choice questions that only have type property
                if (type === 'multiple-choice' && Array.isArray(parsedQuestions)) {
                    console.log('[DEBUG MC] Multiple choice questions before processing:', JSON.stringify(parsedQuestions));
                    
                    parsedQuestions = parsedQuestions.map((question, index) => {
                        // Check if it's an empty multiple choice question (only has type property)
                        if (question.type === 'multiple-choice') {
                            console.log(`[DEBUG MC] Question ${index} keys:`, Object.keys(question));
                            
                            if (Object.keys(question).length === 1) {
                                console.log('[DEBUG MC] Found empty multiple choice question, adding default values');
                                // This is an empty question object, add missing properties
                                return {
                                    ...question,
                                    options: question.options || [],
                                    text: question.text || '',
                                    correctOption: question.correctOption || 0
                                };
                            } else {
                                console.log(`[DEBUG MC] Question ${index} has ${Object.keys(question).length} properties`);
                                // Make sure the important properties exist
                                if (!question.options && !question.choices) {
                                    console.log(`[DEBUG MC] Question ${index} has no options/choices, adding empty array`);
                                    question.options = [];
                                }
                                
                                // Normalize correctAnswer to correctOption for consistency
                                if (question.correctAnswer !== undefined && question.correctOption === undefined) {
                                    console.log(`[DEBUG MC] Converting correctAnswer (${question.correctAnswer}) to correctOption`);
                                    question.correctOption = question.correctAnswer;
                                }
                            }
                        }
                        return question;
                    });
                    
                    console.log('[DEBUG MC] Multiple choice questions after processing:', JSON.stringify(parsedQuestions));
                }
            } catch (error) {
                console.error('Error parsing questions:', error);
                return res.status(400).json({ error: 'Invalid questions format' });
            }
        }

        // Special handling for listening exercises
        if (type === 'listening' || type === 'multiple-choice' && 
            (category === 'Listening' || title.toLowerCase().includes('listening'))) {
            console.log('[AUDIO] Detected listening exercise, ensuring audio is properly attached');
            
            // Check if we have any audio files to attach
            const hasAudioFiles = mediaFiles.some(file => 
                file.type && file.type.startsWith('audio/') || 
                file.label === 'audio' ||
                file.filePath && (file.filePath.endsWith('.mp3') || file.filePath.endsWith('.wav') || file.filePath.endsWith('.ogg'))
            );
            
            console.log(`[AUDIO] Audio files found for listening exercise: ${hasAudioFiles ? 'Yes' : 'No'}`);
            if (hasAudioFiles) {
                console.log('[AUDIO] Audio files to be attached:', mediaFiles.filter(f => 
                    f.type && f.type.startsWith('audio/') || 
                    f.label === 'audio' ||
                    f.filePath && (f.filePath.endsWith('.mp3') || f.filePath.endsWith('.wav') || f.filePath.endsWith('.ogg'))
                ));
            }
        }
        
        // Create the assessment
        console.log('[CREATE ASSESSMENT] Creating assessment with data:', {
            title: title.trim(),
            description,
            type,
            category,
            criteria,
            sectionId,
            userId: req.user.userId,
            mediaFilesCount: mediaFiles.length,
            maxAttempts: maxAttempts ? parseInt(maxAttempts) : null,
            topicId,
            weeklyScheduleId
        });
        
        const assessment = await prisma.assessment.create({
            data: {
                title: title.trim(),
                description,
                type,
                category: category,
                criteria, // Ensure criteria is included
                questions: parsedQuestions,
                dueDate: dueDate ? new Date(dueDate) : null,
                quarter: quarter || "Q1", // Use quarter from form or default to Q1
                published: true, // Explicitly set published to ensure it's visible
                section: {
                    connect: { id: sectionId }
                },
                createdBy: {
                    connect: { id: req.user.userId }
                },
                mediaFiles: mediaFiles.length > 0 ? {
                    create: mediaFiles
                } : undefined,
                maxAttempts: maxAttempts ? parseInt(maxAttempts) : null,
                topic: topicId ? {
                    connect: { id: topicId }
                } : undefined,
                weeklySchedule: weeklyScheduleId ? {
                    connect: { id: weeklyScheduleId }
                } : undefined
            },
            include: {
                mediaFiles: true,
                section: true,
                topic: true,
                weeklySchedule: true
            }
        });
        
        console.log('[CREATE ASSESSMENT] Assessment created successfully:', {
            id: assessment.id,
            title: assessment.title,
            quarter: assessment.quarter,
            published: assessment.published
        });
        
        // Log whether media files were successfully attached
        console.log(`[AUDIO] Assessment created with ${assessment.mediaFiles?.length || 0} media files`);
        if (assessment.mediaFiles && assessment.mediaFiles.length > 0) {
            console.log('[AUDIO] Attached media files:', JSON.stringify(assessment.mediaFiles));
        }

        res.json(assessment);
    } catch (error) {
        console.error('Error creating assessment:', error);
        res.status(500).json({ error: 'Failed to create assessment' });
    }
});

// Update an assessment
app.put('/api/assessments/:assessmentId', auth, upload.any(), async (req, res) => {
    try {
        const { assessmentId } = req.params;
        const { title, description, type, questions, dueDate, maxAttempts, category, topicId, weeklyScheduleId, criteria, quarter } = req.body;
        console.log('[UPDATE ASSESSMENT] req.body:', req.body);
        console.log('[UPDATE ASSESSMENT] Category value:', category);
        console.log('[UPDATE ASSESSMENT] req.files:', req.files);

        // Validate required fields
        if (!title || !title.trim()) {
            return res.status(400).json({ error: 'Title is required' });
        }

        if (!type) {
            return res.status(400).json({ error: 'Assessment type is required' });
        }

        // Check if assessment exists
        const existingAssessment = await prisma.assessment.findUnique({
            where: { id: assessmentId },
            include: { mediaFiles: true }
        });

        if (!existingAssessment) {
            return res.status(404).json({ error: 'Assessment not found' });
        }

        // Log existing media files
        console.log(`[UPDATE] Existing media files: ${existingAssessment.mediaFiles?.length || 0}`);
        
        // Handle file uploads if any (accept any field name)
        const mediaFiles = req.files ? req.files.map(file => ({
            filePath: `/uploads/resources/${file.filename}`,
            type: file.mimetype,
            label: file.fieldname
        })) : [];

        // Parse and prepare questions
        let parsedQuestions;
        if (questions) {
            try {
                parsedQuestions = JSON.parse(questions);
                
                // Special handling for matching questions
                if (type === 'matching' && Array.isArray(parsedQuestions)) {
                    parsedQuestions = parsedQuestions.map(question => {
                        if (question.type === 'matching') {
                            console.log('Processing matching question for update:', JSON.stringify(question));
                            
                            // Ensure pairs is available and properly structured
                            if (question.pairs && Array.isArray(question.pairs)) {
                                console.log(`Found ${question.pairs.length} pairs in question for update`);
                            }
                            // If no pairs but expressions and meanings exist, create pairs
                            else if (question.expressions && question.meanings &&
                                    Array.isArray(question.expressions) && Array.isArray(question.meanings)) {
                                question.pairs = [];
                                for (let i = 0; i < Math.min(question.expressions.length, question.meanings.length); i++) {
                                    if (question.expressions[i] && question.meanings[i]) {
                                        question.pairs.push({
                                            expression: question.expressions[i],
                                            meaning: question.meanings[i]
                                        });
                                    }
                                }
                                console.log(`Created ${question.pairs.length} pairs from expressions and meanings for update`);
                            }
                        }
                        return question;
                    });
                }
                
                // Special handling for line-match assessments to process uploaded images
                if (type === 'line-match' && Array.isArray(parsedQuestions)) {
                    console.log('[LINE-MATCH UPDATE] Processing line-match questions with file uploads');
                    parsedQuestions = parsedQuestions.map((question, qIndex) => {
                        if (question.type === 'line-match' && Array.isArray(question.pairs)) {
                            question.pairs = question.pairs.map((pair, pIndex) => {
                                // Check if this pair has image files that were uploaded
                                const leftFileKey = `line_match_left_${qIndex}_${pIndex}`;
                                const rightFileKey = `line_match_right_${qIndex}_${pIndex}`;
                                
                                // Find uploaded files for this pair
                                const leftFile = req.files?.find(f => f.fieldname === leftFileKey);
                                const rightFile = req.files?.find(f => f.fieldname === rightFileKey);
                                
                                // Update the pair with actual file paths if images were uploaded
                                const updatedPair = { ...pair };
                                if (leftFile && pair.left.kind === 'image') {
                                    updatedPair.left = { 
                                        kind: 'image', 
                                        value: `/uploads/resources/${leftFile.filename}` 
                                    };
                                    // Add to mediaFiles for database storage
                                    mediaFiles.push({
                                        filePath: `/uploads/resources/${leftFile.filename}`,
                                        type: leftFile.mimetype,
                                        label: `line_match_left_${qIndex}_${pIndex}`
                                    });
                                }
                                if (rightFile && pair.right.kind === 'image') {
                                    updatedPair.right = { 
                                        kind: 'image', 
                                        value: `/uploads/resources/${rightFile.filename}` 
                                    };
                                    // Add to mediaFiles for database storage
                                    mediaFiles.push({
                                        filePath: `/uploads/resources/${rightFile.filename}`,
                                        type: rightFile.mimetype,
                                        label: `line_match_right_${qIndex}_${pIndex}`
                                    });
                                }
                                
                                return updatedPair;
                            });
                        }
                        return question;
                    });
                }
                
                // Fix empty multiple choice questions that only have type property
                if (type === 'multiple-choice' && Array.isArray(parsedQuestions)) {
                    parsedQuestions = parsedQuestions.map(question => {
                        // Check if it's an empty multiple choice question (only has type property)
                        if (question.type === 'multiple-choice' && Object.keys(question).length === 1) {
                            console.log('Found empty multiple choice question, adding default values for update');
                            // This is an empty question object, add missing properties
                            return {
                                ...question,
                                options: question.options || [],
                                text: question.text || '',
                                correctOption: question.correctOption || 0
                            };
                        }
                        
                        // Normalize correctAnswer to correctOption for consistency
                        if (question.type === 'multiple-choice' && question.correctAnswer !== undefined && question.correctOption === undefined) {
                            console.log(`Converting correctAnswer (${question.correctAnswer}) to correctOption for update`);
                            question.correctOption = question.correctAnswer;
                        }
                        
                        return question;
                    });
                }
            } catch (error) {
                console.error('Error parsing questions:', error);
                return res.status(400).json({ error: 'Invalid questions format' });
            }
        }

        // Update the assessment
        const assessment = await prisma.assessment.update({
            where: { id: assessmentId },
            data: {
                title: title.trim(),
                description,
                type,
                category: category,
                criteria, // Ensure criteria is included
                questions: parsedQuestions,
                dueDate: dueDate ? new Date(dueDate) : null,
                quarter: quarter || "Q1", // Use quarter from form or default to Q1
                mediaFiles: mediaFiles.length > 0 ? {
                    create: mediaFiles
                } : undefined,
                maxAttempts: maxAttempts ? parseInt(maxAttempts) : null,
                topic: topicId ? {
                    connect: { id: topicId }
                } : topicId === null ? {
                    disconnect: true
                } : undefined,
                weeklySchedule: weeklyScheduleId ? {
                    connect: { id: weeklyScheduleId }
                } : weeklyScheduleId === null ? {
                    disconnect: true
                } : undefined
            },
            include: {
                mediaFiles: true,
                section: true,
                topic: true,
                weeklySchedule: true
            }
        });

        res.json(assessment);
    } catch (error) {
        console.error('Error updating assessment:', error);
        res.status(500).json({ error: 'Failed to update assessment' });
    }
});

// Get all assessments for a teacher (now shows all assessments for all teachers)
app.get('/api/teacher/assessments', auth, async (req, res) => {
    try {
        const { quarter, attachment } = req.query;
        // Show all assessment types for teachers (match student view)
        const where = {};
        if (quarter) {
            where.quarter = quarter;
        }
        // Handle attachment filtering - we'll filter after the query since it involves related data
        const assessments = await prisma.assessment.findMany({
            where,
            include: {
                section: {
                    include: {
                        part: {
                            include: {
                                unit: {
                                    include: {
                                        subject: true
                                    }
                                }
                            }
                        }
                    }
                },
                mediaFiles: true,
                resources: { select: { id: true } }
            },
            orderBy: {
                createdAt: 'desc'
            },
            distinct: ['id'] // Ensure we only get unique assessments
        });

        // Since 'distinct' might not be enough in some complex queries,
        // we'll also ensure uniqueness using a Map
        const uniqueAssessments = Array.from(
            new Map(assessments.map(item => [item.id, item])).values()
        );

        // Add ungradedCount, unattached flag, and flatten subject info for each assessment
        let assessmentsWithUngraded = uniqueAssessments.map(a => {
            const unattached = !a.resources || a.resources.length === 0;
            // Flatten subject information for easier filtering
            const subjectId = a.section?.part?.unit?.subject?.id || null;
            const subjectName = a.section?.part?.unit?.subject?.name || null;
            
            return { 
                ...a, 
                unattached,
                subjectId,      // Add flattened subjectId for filtering
                subjectName     // Add flattened subjectName for display/search
            };
        });

        // Apply attachment filtering if specified
        if (attachment === 'attached') {
            assessmentsWithUngraded = assessmentsWithUngraded.filter(a => !a.unattached);
        } else if (attachment === 'unattached') {
            assessmentsWithUngraded = assessmentsWithUngraded.filter(a => a.unattached);
        }

        console.log(`Found ${assessments.length} assessments, ${uniqueAssessments.length} are unique, ${assessmentsWithUngraded.length} after filtering`);
        res.json(assessmentsWithUngraded);
    } catch (error) {
        console.error('Error fetching teacher assessments:', error);
        res.status(500).json({ error: 'Failed to fetch assessments' });
    }
});

// Get all assessments for a specific subject
console.log('HIT /api/subjects/:subjectId/assessments');
app.get('/api/subjects/:subjectId/assessments', auth, async (req, res) => {
    try {
        const { subjectId } = req.params;
        const { quarter, attachment } = req.query;
        // Find all assessments that belong to this subject
        // We need to go through the section -> part -> unit -> subject relationship
        const assessments = await prisma.assessment.findMany({
            where: {
                section: {
                    part: {
                        unit: {
                            subjectId: subjectId
                        }
                    }
                },
                ...(quarter ? { quarter } : {})
            },
            include: {
                section: {
                    include: {
                        part: {
                            include: {
                                unit: {
                                    include: {
                                        subject: true
                                    }
                                }
                            }
                        }
                    }
                },
                mediaFiles: true,
                resources: true // <-- Include full resource info
            },
            orderBy: {
                createdAt: 'desc'
            },
            distinct: ['id'] // Ensure we only get unique assessments
        });

        const uniqueAssessments = Array.from(
            new Map(assessments.map(item => [item.id, item])).values()
        );

        // Add ungradedCount and unattached flag for each assessment
        let assessmentsWithExtras = await Promise.all(uniqueAssessments.map(async (a) => {
            const ungradedCount = await prisma.assessmentSubmission.count({
                where: { assessmentId: a.id, score: null }
            });
            const unattached = !a.resources || a.resources.length === 0;
            return { ...a, ungradedCount, unattached };
        }));

        // Optional attachment filtering
        if (attachment === 'attached') {
            assessmentsWithExtras = assessmentsWithExtras.filter(a => !a.unattached);
        } else if (attachment === 'unattached') {
            assessmentsWithExtras = assessmentsWithExtras.filter(a => a.unattached);
        }

        console.log(`Found ${assessments.length} assessments, ${uniqueAssessments.length} are unique`);
        console.log('[SUBJECT ASSESSMENTS] Assessment IDs:', uniqueAssessments.map(a => ({ id: a.id, title: a.title, quarter: a.quarter, published: a.published })));
        res.json(assessmentsWithExtras);
    } catch (error) {
        console.error('Error fetching subject assessments:', error);
        res.status(500).json({ error: 'Failed to fetch subject assessments', details: error.message });
    }
});

// Update assessment due date only
app.patch('/api/assessments/:assessmentId/due-date', auth, async (req, res) => {
    try {
        const { assessmentId } = req.params;
        const { dueDate } = req.body;

        // Validate user is teacher or admin
        const user = await prisma.user.findUnique({
            where: { id: req.user.userId }
        });

        console.log('User role check:', {
            userId: req.user.userId,
            userRole: user?.role,
            userRoleUpper: user?.role?.toUpperCase(),
            isTeacher: user?.role?.toUpperCase() === 'TEACHER',
            isAdmin: user?.role?.toUpperCase() === 'ADMIN'
        });

        if (user.role.toUpperCase() !== 'TEACHER' && user.role.toUpperCase() !== 'ADMIN') {
            return res.status(403).json({ error: 'Access denied. Teachers and admins only.' });
        }

        // Validate date format if provided
        if (dueDate && isNaN(new Date(dueDate).getTime())) {
            return res.status(400).json({ error: 'Invalid date format' });
        }

        // Update the assessment
        const updatedAssessment = await prisma.assessment.update({
            where: { id: assessmentId },
            data: { 
                dueDate: dueDate ? new Date(dueDate) : null,
                updatedAt: new Date()
            },
            select: {
                id: true,
                title: true,
                dueDate: true,
                quarter: true,
                updatedAt: true
            }
        });

        logger.info(`Assessment due date updated: ${assessmentId} -> ${dueDate}`, {
            assessmentId,
            newDueDate: dueDate,
            userId: req.user.userId,
            userName: user.name
        });

        res.json({ 
            success: true, 
            assessment: updatedAssessment,
            message: 'Due date updated successfully'
        });

    } catch (error) {
        logger.logError(error, 'Failed to update assessment due date', {
            assessmentId: req.params.assessmentId,
            userId: req.user.userId
        });
        
        if (error.code === 'P2025') {
            return res.status(404).json({ error: 'Assessment not found' });
        }
        
        res.status(500).json({ error: 'Failed to update due date' });
    }
});

// Delete an assessment
app.delete('/api/assessments/:assessmentId', auth, async (req, res) => {
    try {
        const { assessmentId } = req.params;

        // Check if assessment exists
        const assessment = await prisma.assessment.findUnique({
            where: { id: assessmentId },
            include: {
                mediaFiles: true,
                submissions: true
            }
        });

        if (!assessment) {
            return res.status(404).json({ error: 'Assessment not found' });
        }

        // First, remove all resource connections (many-to-many relationship)
        await prisma.assessment.update({
            where: { id: assessmentId },
            data: {
                resources: {
                    set: [] // This removes all resource connections without deleting the resources
                }
            }
        });

        // Delete all related assessment submissions
        if (assessment.submissions && assessment.submissions.length > 0) {
            await prisma.assessmentSubmission.deleteMany({
                where: { assessmentId }
            });
        }

        // Delete all related media files
        if (assessment.mediaFiles && assessment.mediaFiles.length > 0) {
            await prisma.mediaFile.deleteMany({
                where: { 
                    id: { 
                        in: assessment.mediaFiles.map(file => file.id)
                    }
                }
            });
        }

        // Remove topic and weekly schedule connections
        await prisma.assessment.update({
            where: { id: assessmentId },
            data: {
                topic: {
                    disconnect: true
                },
                weeklySchedule: {
                    disconnect: true
                }
            }
        });

        // Finally delete the assessment itself
        await prisma.assessment.delete({
            where: { id: assessmentId }
        });

        res.json({ success: true, message: 'Assessment deleted successfully' });
    } catch (error) {
        console.error('Error deleting assessment:', error);
        res.status(500).json({ error: 'Failed to delete assessment', details: error.message });
    }
});

// Delete a specific media file from an assessment
app.delete('/api/assessments/:assessmentId/media/:mediaFileId', auth, async (req, res) => {
    try {
        const { assessmentId, mediaFileId } = req.params;

        // Check if assessment exists
        const assessment = await prisma.assessment.findUnique({
            where: { id: assessmentId },
            include: { mediaFiles: true }
        });

        if (!assessment) {
            return res.status(404).json({ error: 'Assessment not found' });
        }

        // Check if media file exists and belongs to this assessment
        const mediaFile = assessment.mediaFiles.find(file => file.id === mediaFileId);
        if (!mediaFile) {
            return res.status(404).json({ error: 'Media file not found' });
        }

        // Delete the media file
        await prisma.mediaFile.delete({
            where: { id: mediaFileId }
        });

        res.json({ success: true, message: 'Media file deleted successfully' });
    } catch (error) {
        console.error('Error deleting media file:', error);
        res.status(500).json({ error: 'Failed to delete media file', details: error.message });
    }
});

// Delete assessment audio
app.delete('/api/assessments/:assessmentId/audio', auth, async (req, res) => {
    try {
        const { assessmentId } = req.params;

        // Check if assessment exists
        const assessment = await prisma.assessment.findUnique({
            where: { id: assessmentId }
        });

        if (!assessment) {
            return res.status(404).json({ error: 'Assessment not found' });
        }

        // Update the assessment to remove the audio field
        await prisma.assessment.update({
            where: { id: assessmentId },
            data: {
                audio: null
            }
        });

        res.json({ success: true, message: 'Assessment audio deleted successfully' });
    } catch (error) {
        console.error('Error deleting assessment audio:', error);
        res.status(500).json({ error: 'Failed to delete assessment audio', details: error.message });
    }
});

// Delete a part
app.delete('/api/parts/:partId', auth, async (req, res) => {
    try {
        const { partId } = req.params;
        
        // First, get all sections for this part
        const sections = await prisma.section.findMany({
            where: { partId },
            include: {
                assessments: true
            }
        });

        // For each section
        for (const section of sections) {
            // Delete all assessments first
            await prisma.assessment.deleteMany({
                where: { sectionId: section.id }
            });
            
            // Remove resource connections (many-to-many relationship)
            await prisma.section.update({
                where: { id: section.id },
                data: {
                    resources: {
                        set: [] // This removes all resource connections without deleting the resources
                    }
                }
            });
        }

        // Now delete all sections
        await prisma.section.deleteMany({
            where: { partId }
        });
        
        // Finally delete the part
        await prisma.part.delete({
            where: { id: partId }
        });

        res.json({ success: true });
    } catch (error) {
        console.error('Error deleting part:', error);
        res.status(500).json({ error: 'Failed to delete part' });
    }
});

// Get all assessments linked to a resource
app.get('/api/resources/:resourceId/assessments', auth, async (req, res) => {
    try {
        const { resourceId } = req.params;
        console.log('[GET RESOURCE ASSESSMENTS] Fetching assessments for resource:', resourceId);
        
        const resource = await prisma.resource.findUnique({
            where: { id: resourceId },
            include: { assessments: true }
        });
        if (!resource) return res.status(404).json({ error: 'Resource not found' });
        
        console.log('[GET RESOURCE ASSESSMENTS] Found assessments:', resource.assessments.map(a => ({ id: a.id, title: a.title })));
        res.json(resource.assessments);
    } catch (error) {
        console.error('Error fetching resource assessments:', error);
        res.status(500).json({ error: 'Failed to fetch resource assessments' });
    }
});

// Link/unlink assessments to a resource
app.post('/api/resources/:resourceId/assessments', auth, async (req, res) => {
    try {
        const { resourceId } = req.params;
        const { assessmentIds } = req.body;
        console.log('[LINK ASSESSMENTS] Linking assessments to resource:', { resourceId, assessmentIds });
        
        if (!Array.isArray(assessmentIds)) return res.status(400).json({ error: 'assessmentIds must be an array' });
        
        const resource = await prisma.resource.update({
            where: { id: resourceId },
            data: { assessments: { set: assessmentIds.map(id => ({ id })) } },
            include: { assessments: true }
        });
        
        console.log('[LINK ASSESSMENTS] Successfully linked assessments:', resource.assessments.map(a => ({ id: a.id, title: a.title })));
        res.json(resource.assessments);
    } catch (error) {
        console.error('Error updating resource assessments:', error);
        res.status(500).json({ error: 'Failed to update resource assessments' });
    }
});

// Submit an assessment (non-drag-and-drop)
app.post('/api/assessments/:assessmentId/submit', auth, async (req, res) => {
    try {
        const { assessmentId } = req.params;
        let { answers, score } = req.body;
        const studentId = req.user.userId;

        console.log('[SUBMIT] assessmentId:', assessmentId);
        console.log('[SUBMIT] studentId:', studentId);
        console.log('[SUBMIT] answers:', answers);
        console.log('[SUBMIT] score:', score);

        // Check if assessment exists
        const assessment = await prisma.assessment.findUnique({
            where: { id: assessmentId }
        });
        if (!assessment) {
            return res.status(404).json({ error: 'Assessment not found' });
        }

        // Enforce availability for students: block submissions after due date
        if (assessment.dueDate && new Date(assessment.dueDate) < new Date()) {
            return res.status(403).json({ error: 'Submissions are closed for this assessment.' });
        }

        // Enforce maxAttempts
        if (assessment.maxAttempts) {
            const submissionCount = await prisma.assessmentSubmission.count({
                where: {
                    assessmentId,
                    studentId
                }
            });
            if (submissionCount >= assessment.maxAttempts) {
                return res.status(403).json({ error: `You have reached the maximum number of attempts (${assessment.maxAttempts}) for this assessment.` });
            }
        }

        // Auto-grade for matching, multiple-choice, and drag-and-drop
        let calculatedScore = null;
        if (score === undefined || score === null) {
            if (assessment.type === 'matching' && Array.isArray(assessment.questions)) {
                // Only grade first question for matching
                const q = assessment.questions[0];
                if (q && q.pairs && answers && answers[0]) {
                    let correct = 0;
                    const total = q.pairs.length;
                    for (let i = 0; i < total; i++) {
                        const correctIndex = i;
                        const userIndex = answers[0][`option-${i}`] ? parseInt(answers[0][`option-${i}`].replace('match-', '')) : null;
                        if (userIndex === correctIndex) correct++;
                    }
                    calculatedScore = Math.round((correct / total) * 100);
                }
            } else if ((assessment.type === 'quiz' || assessment.type === 'multiple-choice') && Array.isArray(assessment.questions)) {
                // Multiple choice quiz
                let correct = 0;
                const total = assessment.questions.length;
                for (let i = 0; i < total; i++) {
                    const q = assessment.questions[i];
                    if (q && typeof q.correctAnswerIndex === 'number' && answers && answers[i] !== undefined) {
                        if (parseInt(answers[i]) === q.correctAnswerIndex) correct++;
                    }
                }
                calculatedScore = Math.round((correct / total) * 100);
            } else if (assessment.type === 'text-input' && Array.isArray(assessment.questions)) {
                // Text input assessment - auto-graded
                let correct = 0;
                const total = assessment.questions.length;
                
                for (let i = 0; i < total; i++) {
                    const question = assessment.questions[i];
                    const studentAnswer = answers && answers[i] ? answers[i].trim() : '';
                    
                    if (question && Array.isArray(question.answers) && studentAnswer) {
                        // Check if student answer matches any of the acceptable answers
                        const isCorrect = question.answers.some(correctAnswer => {
                            if (question.caseSensitive) {
                                return studentAnswer === correctAnswer.trim();
                            } else {
                                return studentAnswer.toLowerCase() === correctAnswer.trim().toLowerCase();
                            }
                        });
                        
                        if (isCorrect) correct++;
                    }
                }
                
                if (total > 0) {
                    calculatedScore = Math.round((correct / total) * 100);
                }
                
                logger.info(`Text-input grading result: ${correct}/${total} = ${calculatedScore}%`, {
                    assessmentId,
                    studentId,
                    correct,
                    total,
                    score: calculatedScore
                });
            } else if (assessment.type === 'drag-and-drop' && Array.isArray(assessment.questions)) {
                // Support all subtypes: sequence, fill-in-blank, image-fill-blank (and legacy image-fill-in-blank), long-paragraph-fill-in-blank
                const q = assessment.questions[0];
                let correct = 0;
                let total = 0;
                if (q && q.subtype) {
                    if (q.subtype === 'sequence' && Array.isArray(answers[0])) {
                        // Use correctSequence if present, otherwise correct
                        const correctArr = Array.isArray(q.correctSequence) ? q.correctSequence : q.correct;
                        total = correctArr.length;
                        for (let i = 0; i < total; i++) {
                            if (answers[0][i] === correctArr[i]) correct++;
                        }
                    } else if ((q.subtype === 'fill-in-blank' || q.subtype === 'long-paragraph-fill-in-blank') && Array.isArray(q.correct) && answers[0] && answers[0].dragAndDrop) {
                        total = q.correct.length;
                        for (let i = 0; i < total; i++) {
                            if (answers[0].dragAndDrop[i] === q.correct[i]) correct++;
                        }
                    } else if ((q.subtype === 'image-fill-in-blank' || q.subtype === 'image-fill-blank') && answers[0]) {
                        console.log('Grading image-fill-in-blank:', { question: q, answers: answers[0] });
                        
                        // Handle different possible data structures for image-fill-in-blank
                        if (Array.isArray(q.pairs) && q.pairs.length > 0) {
                            total = q.pairs.length;
                            for (let i = 0; i < total; i++) {
                                // Check standard format
                                if (answers[0][`option-${i}`] === `match-${i}`) {
                                    correct++;
                                }
                                // Check alternative format where the answer might be an array
                                else if (Array.isArray(answers[0]) && answers[0][i] === i) {
                                    correct++;
                                }
                                // Also try direct property mapping
                                else if (answers[0][i] === i) {
                                    correct++;
                                }
                            }
                        } 
                        // If question has correct array instead of pairs
                        else if (Array.isArray(q.correct) && q.correct.length > 0) {
                            total = q.correct.length;
                            
                            // Try to match answers to correct values
                            if (Array.isArray(answers[0])) {
                                // If answer is array, compare positions
                                for (let i = 0; i < total; i++) {
                                    if (answers[0][i] === q.correct[i]) {
                                        correct++;
                                    }
                                }
                            } else if (answers[0].dragAndDrop) {
                                // If using dragAndDrop format
                                for (let i = 0; i < total; i++) {
                                    if (answers[0].dragAndDrop[i] === q.correct[i]) {
                                        correct++;
                                    }
                                }
                            } else {
                                // Check for direct property mapping or other formats
                                for (let i = 0; i < total; i++) {
                                    const key = Object.keys(answers[0]).find(k => 
                                        k === `option-${i}` || k === `${i}` || k === i.toString());
                                    
                                    if (key && (answers[0][key] === q.correct[i] || 
                                               answers[0][key] === `match-${i}` || 
                                               answers[0][key] === i.toString())) {
                                        correct++;
                                    }
                                }
                            }
                        }
                        
                        console.log('Image-fill-in-blank grading result:', { total, correct });
                    }
                }
                if (total > 0) {
                    calculatedScore = Math.round((correct / total) * 100);
                }
            } else if (assessment.type === 'change-sequence' && Array.isArray(assessment.questions)) {
                // Grading logic for change-sequence
                const q = assessment.questions[0];
                let correct = 0;
                let total = 0;
                if (q && Array.isArray(q.correctSequence) && Array.isArray(answers[0])) {
                    total = q.correctSequence.length;
                    for (let i = 0; i < total; i++) {
                        if (answers[0][i] === q.correctSequence[i]) correct++;
                    }
                }
                if (total > 0) {
                    calculatedScore = Math.round((correct / total) * 100);
                }
            } else if (assessment.type === 'table-completion' && Array.isArray(assessment.questions)) {
                // Grading logic for table completion
                const q = assessment.questions[0];
                let correct = 0;
                let total = 0;
                
                if (q && q.table && q.table.correctAnswers && answers[0] && answers[0].tableAnswers) {
                    const correctAnswers = q.table.correctAnswers;
                    const userAnswers = answers[0].tableAnswers;
                    const caseSensitive = q.table.caseSensitive || false;
                    const allowPartialCredit = q.table.allowPartialCredit !== false; // Default to true
                    
                    // Count total correct answers
                    total = Object.keys(correctAnswers).length;
                    
                    // Check each correct answer
                    for (const [cellKey, correctAnswer] of Object.entries(correctAnswers)) {
                        const userAnswer = userAnswers[cellKey];
                        
                        if (userAnswer) {
                            // Normalize answers for comparison
                            let normalizedUserAnswer = userAnswer.toString().trim();
                            let normalizedCorrectAnswer = correctAnswer.toString().trim();
                            
                            if (!caseSensitive) {
                                normalizedUserAnswer = normalizedUserAnswer.toLowerCase();
                                normalizedCorrectAnswer = normalizedCorrectAnswer.toLowerCase();
                            }
                            
                            // Check for exact match
                            if (normalizedUserAnswer === normalizedCorrectAnswer) {
                                correct++;
                            } else if (allowPartialCredit) {
                                // Check for partial credit (contains correct answer)
                                if (normalizedUserAnswer.includes(normalizedCorrectAnswer) || 
                                    normalizedCorrectAnswer.includes(normalizedUserAnswer)) {
                                    correct += 0.5; // Half credit for partial match
                                }
                            }
                        }
                    }
                    
                    // Round partial credit to whole numbers
                    if (allowPartialCredit) {
                        correct = Math.round(correct);
                    }
                }
                
                if (total > 0) {
                    calculatedScore = Math.round((correct / total) * 100);
                }
                
                logger.info(`Table completion grading result: ${correct}/${total} = ${calculatedScore}%`, {
                    assessmentId,
                    studentId,
                    correct,
                    total,
                    score: calculatedScore
                });
            }
        }
        if (calculatedScore !== null) score = calculatedScore;

        // Upsert submission (create new or update latest)
        const submission = await prisma.assessmentSubmission.create({
            data: {
                assessmentId,
                studentId,
                answers,
                score: typeof score === 'number' ? score : null,
                submittedAt: new Date(),
                totalTime: req.body.timeTaken ? Math.round(Number(req.body.timeTaken)) : undefined
            }
        });

        // Create/Update Student Progress Record (Skills-Based)
        try {
            // Get assessment details to find subject and skill category
            const assessmentDetails = await prisma.assessment.findUnique({
                where: { id: assessmentId },
                include: {
                    section: {
                        include: {
                            part: {
                                include: {
                                    unit: {
                                        include: {
                                            subject: true
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            });

            if (assessmentDetails && assessmentDetails.section?.part?.unit?.subject && assessmentDetails.category) {
                const subjectId = assessmentDetails.section.part.unit.subject.id;
                const skillCategory = assessmentDetails.category;
                
                // Normalize skill categories (clean up variations)
                const normalizedSkill = skillCategory
                    .replace(/Practice\.?/gi, '')
                    .replace(/and /gi, '& ')
                    .trim();
                
                // Determine status based on score
                let status = 'in_progress';
                if (typeof score === 'number') {
                    if (score >= 80) status = 'completed';
                    else if (score >= 60) status = 'in_progress';
                    else status = 'needs_review';
                }

                // Upsert student progress by skill category
                await prisma.studentProgress.upsert({
                    where: {
                        studentId_subjectId_skillCategory: {
                            studentId,
                            subjectId,
                            skillCategory: normalizedSkill
                        }
                    },
                    update: {
                        status,
                        score: typeof score === 'number' ? Math.max(score, 0) : undefined,
                        lastUpdated: new Date()
                    },
                    create: {
                        studentId,
                        subjectId,
                        skillCategory: normalizedSkill,
                        status,
                        score: typeof score === 'number' ? Math.max(score, 0) : undefined
                    }
                });
                
                console.log(`Student skill progress updated: ${studentId} - ${assessmentDetails.section.part.unit.subject.name} - ${normalizedSkill} - ${status} (${score}%)`);
            }
        } catch (progressError) {
            console.error('Error updating student progress:', progressError);
            // Don't fail the submission if progress update fails
        }

        res.json({ success: true, submission, score, timeTaken: req.body.timeTaken });
    } catch (error) {
        console.error('[SUBMIT ERROR]', error);
        res.status(500).json({ error: 'Failed to submit assessment', details: error.message });
    }
});

// Submit a speaking assessment
app.post('/api/assessments/:assessmentId/submit-speaking', auth, upload.single('audio'), async (req, res) => {
    try {
        const { assessmentId } = req.params;
        const studentId = req.user.userId;
        if (!req.file) {
            return res.status(400).json({ error: 'No audio file uploaded' });
        }
        // Check if assessment exists
        const assessment = await prisma.assessment.findUnique({ where: { id: assessmentId } });
        if (!assessment) {
            return res.status(404).json({ error: 'Assessment not found' });
        }
        // Enforce availability for students: block submissions after due date
        if (assessment.dueDate && new Date(assessment.dueDate) < new Date()) {
            return res.status(403).json({ error: 'Submissions are closed for this assessment.' });
        }
        // Save the audio file as a mediaFile
        console.log('[SPEAKING SUBMIT] assessmentId:', assessmentId);
        console.log('[SPEAKING SUBMIT] studentId:', studentId);
        console.log('[SPEAKING SUBMIT] file:', req.file);
        const mediaFile = await prisma.mediaFile.create({
            data: {
                filePath: `/uploads/resources/${req.file.filename}`,
                type: req.file.mimetype,
                label: 'speaking_response',
                assessment: { connect: { id: assessmentId } }
            }
        });
        // Create an assessment submission referencing the audio file
        const submission = await prisma.assessmentSubmission.create({
            data: {
                assessmentId,
                studentId,
                answers: { audioFile: mediaFile.filePath },
                score: null,
                submittedAt: new Date()
            }
        });
        res.json({ success: true, submission });
    } catch (error) {
        console.error('[SUBMIT SPEAKING ERROR]', error);
        console.error('[SUBMIT SPEAKING ERROR STACK]', error.stack);
        res.status(500).json({ error: 'Failed to submit speaking assessment', details: error.message });
    }
});

// Enhanced: Get all assessments for a student's enrolled subjects with progress data
app.get('/api/student/assessments', auth, async (req, res) => {
    try {
        const activeQuarter = await getActiveQuarter();
        const now = new Date();
        // Get student's enrolled subjects
        const user = await prisma.user.findUnique({
            where: { id: req.user.userId },
            include: {
                studentCourses: {
                    include: {
                        subject: {
                            include: {
                                units: {
                                    include: {
                                        parts: {
                                            include: {
                                                sections: {
                                                    include: {
                                                        assessments: true
                                                    }
                                                }
                                            }
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            }
        });

        if (!user || !user.studentCourses) {
            return res.json({ assessments: [] });
        }

        const assessments = [];
        for (const course of user.studentCourses) {
            const subject = course.subject;
            if (!subject || !subject.units) continue;
            for (const unit of subject.units) {
                if (!unit.parts) continue;
                for (const part of unit.parts) {
                    if (!part.sections) continue;
                    for (const section of part.sections) {
                        if (section.assessments && section.assessments.length > 0) {
                            for (const assessment of section.assessments) {
                                // Get assessment with its linked resources and quarter/published fields
                                const assessmentWithResources = await prisma.assessment.findUnique({
                                    where: { id: assessment.id },
                                    include: {
                                        resources: {
                                            select: {
                                                id: true,
                                                title: true,
                                                description: true
                                            }
                                        }
                                    }
                                });
                                // Check if multi-quarter access is enabled for this student's class and subject
                                const multiQuarterAccess = await prisma.multiQuarterAccess.findUnique({
                                    where: {
                                        subjectId_className: {
                                            subjectId: subject.id,
                                            className: user.class || ''
                                        }
                                    }
                                });

                                // Filter by quarter and published status
                                let includeAssessment = false;
                                if (multiQuarterAccess && multiQuarterAccess.isEnabled) {
                                    // Multi-quarter access enabled: include Q1 and Q2 assessments
                                    if ((assessment.quarter === 'Q1' || assessment.quarter === 'Q2') && assessment.published) {
                                        includeAssessment = true;
                                    }
                                } else {
                                    // Normal behavior: only current quarter
                                    if (assessment.quarter === activeQuarter && assessment.published) {
                                        includeAssessment = true;
                                    }
                                }
                                
                                if (!includeAssessment) continue;
                                // Check if assessment is overdue but still include it for display
                                const isOverdue = assessment.dueDate && new Date(assessment.dueDate) < now;

                                
                                // Get all submissions for this student and assessment
                                const submissions = await prisma.assessmentSubmission.findMany({
                                    where: {
                                        assessmentId: assessment.id,
                                        studentId: req.user.userId
                                    },
                                    orderBy: { submittedAt: 'desc' }
                                });
                                const attempts = submissions.length;
                                const bestScore = submissions.length > 0 ? Math.max(...submissions.map(s => s.score || 0)) : null;
                                const lastScore = submissions.length > 0 ? submissions[0].score : null;
                                const lastAttempt = submissions.length > 0 ? submissions[0].submittedAt : null;
                                // New logic: completed if any submission is graded (score !== null)
                                const hasGraded = submissions.some(s => s.score !== null && s.score !== undefined);
                                let status = 'Not Started';
                                if (hasGraded) status = 'Completed';
                                else if (attempts > 0) status = 'In Progress';
                                // Only include assessments that are attached to at least one resource
                                if (!assessmentWithResources.resources || assessmentWithResources.resources.length === 0) continue;
                                assessments.push({
                                    id: assessment.id,
                                    title: assessment.title || assessment.name,
                                    description: assessment.description || '',
                                    type: assessment.type,
                                    category: assessment.category, // Add category for skills grouping
                                    quarter: assessment.quarter, // Add quarter for multi-quarter display
                                    attempts,
                                    maxAttempts: assessment.maxAttempts || '-',
                                    bestScore,
                                    lastScore,
                                    lastAttempt,
                                    status,
                                    completed: hasGraded, // <-- new flag
                                    isOverdue: isOverdue, // Add overdue flag
                                    dueDate: assessment.dueDate, // Include due date for display
                                    subjectName: subject.name || null,
                                    unitName: unit.name || null,
                                    partName: part.name || null,
                                    sectionName: section.name || null,
                                    submissionId: submissions.length > 0 ? submissions[0].id : null,
                                    resourceTitle: assessmentWithResources?.resources?.[0]?.title || null,
                                    resourceDescription: assessmentWithResources?.resources?.[0]?.description || null,
                                    multiQuarterEnabled: multiQuarterAccess ? multiQuarterAccess.isEnabled : false,
                                    catchUpDeadline: multiQuarterAccess ? multiQuarterAccess.deadline : null
                                });
                            }
                        }
                    }
                }
            }
        }
        res.json({ assessments });
    } catch (error) {
        console.error('Error fetching student progress:', error);
        res.status(500).json({ error: 'Failed to fetch student progress' });
    }
});

// New: Teacher progress endpoint
app.get('/api/teacher/progress', auth, async (req, res) => {
    try {
        const classFilter = req.query.class;
        const quarterFilter = req.query.quarter;
        const teacher = await prisma.user.findUnique({
            where: { id: req.user.userId },
            include: {
                subjectTeacher: {
                    include: {
                        subject: {
                            include: {
                                studentCourses: {
                                    include: {
                                        student: true
                                    }
                                },
                                units: {
                                    include: {
                                        parts: {
                                            include: {
                                                sections: {
                                                    include: {
                                                        assessments: quarterFilter ? {
                                                            where: { quarter: quarterFilter }
                                                        } : true
                                                    }
                                                }
                                            }
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            }
        });
        if (!teacher || !teacher.subjectTeacher) {
            return res.json({ progress: [] });
        }
        const progress = [];
        for (const subjT of teacher.subjectTeacher) {
            const subject = subjT.subject;
            if (!subject || !subject.units) continue;
            // Get all students in this subject
            const students = (subject.studentCourses || []).map(sc => sc.student).filter(Boolean);
            for (const unit of subject.units) {
                if (!unit.parts) continue;
                for (const part of unit.parts) {
                    if (!part.sections) continue;
                    for (const section of part.sections) {
                        if (section.assessments && section.assessments.length > 0) {
                            for (const assessment of section.assessments) {
                                for (const student of students) {
                                    if (classFilter && student.class !== classFilter) continue;
                                    if (!student.active) continue; // Skip inactive students
                                    // Get all submissions for this student and assessment
                                    const submissions = await prisma.assessmentSubmission.findMany({
            where: {
                                            assessmentId: assessment.id,
                                            studentId: student.id
                                        },
                                        orderBy: { submittedAt: 'desc' }
                                    });
                                    const attempts = submissions.length;
                                    let bestScore = null;
                                    let lastScore = null;
                                    let lastAttempt = null;
                                    let status = 'Not Started';
                                    if (attempts > 0) {
                                        // Filter out null scores for bestScore
                                        const scoredSubmissions = submissions.filter(s => s.score !== null && s.score !== undefined);
                                        bestScore = scoredSubmissions.length > 0 ? Math.max(...scoredSubmissions.map(s => s.score)) : null;
                                        lastScore = submissions[0].score !== null && submissions[0].score !== undefined ? submissions[0].score : null;
                                        lastAttempt = submissions[0].submittedAt;
                                        if (scoredSubmissions.length > 0) {
                                            status = bestScore === 100 ? 'Completed' : 'In Progress';
                                        } else {
                                            status = 'Ungraded';
                                        }
                                    }
                                    progress.push({
                studentName: student.name,
                                        studentNickname: student.nickname,
                                        studentClass: student.class,
                                        studentPhoto: student.profilePicture,
                                        assessmentTitle: assessment.title || assessment.name,
                                        assessmentQuarter: assessment.quarter, // Add quarter info
                                        attempts,
                                        maxAttempts: assessment.maxAttempts || '-',
                                        bestScore,
                                        lastScore,
                                        lastAttempt,
                                        status,
                                        subjectId: subject.id, // Add subjectId for frontend filtering
                                        studentActive: student.active // <-- Add this line
                                    });
                                }
                            }
                        }
                    }
                }
            }
        }
        res.json({ progress });
    } catch (error) {
        console.error('Error fetching teacher progress:', error);
        res.status(500).json({ error: 'Failed to fetch teacher progress' });
    }
});

// Teacher progress by submissions endpoint (sorted by submission count)
app.get('/api/teacher/progress-by-submissions', auth, async (req, res) => {
    try {
        const classFilter = req.query.class;
        const quarterFilter = req.query.quarter;
        
        const teacher = await prisma.user.findUnique({
            where: { id: req.user.userId },
            include: {
                subjectTeacher: {
                    include: {
                        subject: {
                            include: {
                                studentCourses: {
                                    include: {
                                        student: true
                                    }
                                },
                                units: {
                                    include: {
                                        parts: {
                                            include: {
                                                sections: {
                                                    include: {
                                                        assessments: quarterFilter ? {
                                                            where: { quarter: quarterFilter }
                                                        } : true
                                                    }
                                                }
                                            }
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            }
        });

        if (!teacher || !teacher.subjectTeacher) {
            return res.json({ students: [] });
        }

        // Get all students for this teacher's organization (same as /api/teacher/students)
        const students = await prisma.user.findMany({
            where: {
                role: 'STUDENT',
                organization: teacher.organization
            },
            select: { id: true, name: true, nickname: true, class: true, active: true, profilePicture: true, studentNumber: true }
        });

        // Create student map from the students we fetched
        const studentMap = new Map();
        
        for (const student of students) {
            // Apply class filter
            if (classFilter && student.class !== classFilter) {
                continue;
            }
            
            studentMap.set(student.id, {
                id: student.id,
                name: student.name,
                nickname: student.nickname,
                class: student.class,
                photo: student.profilePicture,
                studentId: student.studentNumber,
                totalSubmissions: 0,
                completed: 0,
                inProgress: 0,
                notStarted: 0,
                averageScore: null,
                scores: []
            });
        }

        const studentIds = students.map(s => s.id);
        if (studentIds.length === 0) {
            return res.json({ students: [] });
        }

        // Get student course enrollments
        const studentCourses = await prisma.studentCourse.findMany({
            where: { studentId: { in: studentIds } },
            select: { studentId: true, subjectId: true }
        });

        const studentSubjectMap = studentCourses.reduce((map, sc) => {
            if (!map[sc.studentId]) map[sc.studentId] = [];
            map[sc.studentId].push(sc.subjectId);
            return map;
        }, {});

        const allSubjectIds = [...new Set(studentCourses.map(sc => sc.subjectId))];

        // Get assessments for enrolled subjects with quarter filter
        const assessments = await prisma.assessment.findMany({
            where: {
                section: { part: { unit: { subjectId: { in: allSubjectIds } } } },
                ...(quarterFilter ? { quarter: quarterFilter } : {})
            },
            include: {
                resources: true,
                section: {
                    select: {
                        part: {
                            select: {
                                unit: {
                                    select: {
                                        subjectId: true
                                    }
                                }
                            }
                        }
                    }
                }
            },
        });

        // Only count assessments that are attached to at least one resource
        const attachedAssessments = assessments.filter(a => a.resources && a.resources.length > 0);
        
        // Create subject-to-assessment mapping
        const subjectAssessmentMap = attachedAssessments.reduce((map, a) => {
            const subjectId = a.section?.part?.unit?.subjectId;
            if (subjectId) {
                if (!map[subjectId]) map[subjectId] = [];
                map[subjectId].push(a.id);
            }
            return map;
        }, {});

        // Calculate total assessments for each student based on their enrolled subjects
        const studentTotalAssessments = {};
        for (const studentId of studentIds) {
            const enrolledSubjectIds = studentSubjectMap[studentId] || [];
            const enrolledAssessmentsSet = new Set();
            enrolledSubjectIds.forEach(subjectId => {
                const assessmentIds = subjectAssessmentMap[subjectId] || [];
                assessmentIds.forEach(id => enrolledAssessmentsSet.add(id));
            });
            studentTotalAssessments[studentId] = enrolledAssessmentsSet.size;
        }

        const assessmentIds = attachedAssessments.map(a => a.id);

        // Now count submissions for each student
        for (const [studentId, student] of studentMap) {
            // Get all submissions for this student across all assessments
            const submissions = await prisma.assessmentSubmission.findMany({
                where: {
                    studentId: studentId,
                    assessmentId: { in: assessmentIds }
                }
            });

            // Group submissions by assessment to handle multiple attempts
            const submissionsByAssessment = {};
            submissions.forEach(submission => {
                if (!submissionsByAssessment[submission.assessmentId]) {
                    submissionsByAssessment[submission.assessmentId] = [];
                }
                submissionsByAssessment[submission.assessmentId].push(submission);
            });

            // Count completed, in-progress, and not started assessments
            student.totalSubmissions = submissions.length;
            
            // Get the student's enrolled assessments (same logic as /api/teacher/students)
            const enrolledSubjectIds = studentSubjectMap[studentId] || [];
            const enrolledAssessmentsSet = new Set();
            enrolledSubjectIds.forEach(subjectId => {
                const assessmentIds = subjectAssessmentMap[subjectId] || [];
                assessmentIds.forEach(id => enrolledAssessmentsSet.add(id));
            });
            
            // Only count assessments that the student is enrolled in
            for (const assessmentId of enrolledAssessmentsSet) {
                const studentSubmissions = submissionsByAssessment[assessmentId] || [];
                
                if (studentSubmissions.length === 0) {
                    student.notStarted++;
                } else {
                    // Check if any submission is completed (has a score)
                    const hasCompletedSubmission = studentSubmissions.some(s => s.score !== null);
                    if (hasCompletedSubmission) {
                        student.completed++;
                        // Use the best score for average calculation
                        const bestScore = Math.max(...studentSubmissions.filter(s => s.score !== null).map(s => s.score));
                        student.scores.push(bestScore);
                    } else {
                        student.inProgress++;
                    }
                }
            }
        }

        // Calculate average scores and convert to array
        const studentsWithProgress = Array.from(studentMap.values()).map(student => {
            if (student.scores.length > 0) {
                student.averageScore = Math.round(
                    student.scores.reduce((sum, score) => sum + score, 0) / student.scores.length
                );
            }
            delete student.scores; // Remove scores array from response
            
            // Add total assessments for debugging (based on student's enrolled subjects)
            student.totalAssessments = studentTotalAssessments[student.id] || 0;
            return student;
        });

        console.log(`[Progress by Submissions] Quarter: ${quarterFilter || 'All'}, Students processed: ${studentsWithProgress.length}`);
        console.log(`[Progress by Submissions] Sample student totals:`, Object.entries(studentTotalAssessments).slice(0, 3));
        if (studentsWithProgress.length > 0) {
            console.log(`[Progress by Submissions] Sample student data:`, {
                name: studentsWithProgress[0].name,
                studentId: studentsWithProgress[0].studentId,
                class: studentsWithProgress[0].class
            });
            console.log(`[Progress by Submissions] Raw student data from DB:`, {
                name: students[0]?.name,
                studentNumber: students[0]?.studentNumber
            });
        }

        // Sort by total submissions (highest to lowest)
        studentsWithProgress.sort((a, b) => b.totalSubmissions - a.totalSubmissions);

        res.json({ students: studentsWithProgress });
    } catch (error) {
        console.error('Error fetching teacher progress by submissions:', error);
        res.status(500).json({ error: 'Failed to fetch teacher progress by submissions' });
    }
});

// Endpoint to get the active quarter
app.get('/api/config/active-quarter', auth, async (req, res) => {
    try {
        const activeQuarter = await getActiveQuarter();
        res.json({ activeQuarter });
    } catch (error) {
        console.error('Error fetching active quarter:', error);
        res.status(500).json({ error: 'Failed to fetch active quarter' });
    }
});

// Debug endpoint to check user role
app.get('/api/debug/user-role', auth, async (req, res) => {
    try {
        const user = await prisma.user.findUnique({
            where: { id: req.user.userId },
            select: {
                id: true,
                name: true,
                email: true,
                role: true,
                active: true
            }
        });
        
        res.json({
            userId: req.user.userId,
            userRole: user?.role,
            userRoleUpper: user?.role?.toUpperCase(),
            isTeacher: user?.role?.toUpperCase() === 'TEACHER',
            isAdmin: user?.role?.toUpperCase() === 'ADMIN',
            user: user
        });
    } catch (error) {
        console.error('Error fetching user role:', error);
        res.status(500).json({ error: 'Failed to fetch user role' });
    }
});

// Individual student report with quarter filtering
app.get('/api/teacher/student-report/:studentId', auth, async (req, res) => {
    try {
        const { studentId } = req.params;
        const { quarter } = req.query;
        
        // Verify user is teacher or admin
        const user = await prisma.user.findUnique({
            where: { id: req.user.userId }
        });
        
        if (user.role.toUpperCase() !== 'TEACHER' && user.role.toUpperCase() !== 'ADMIN') {
            return res.status(403).json({ error: 'Access denied. Teachers and admins only.' });
        }
        
        // Get student details
        const student = await prisma.user.findUnique({
            where: { id: studentId },
            include: {
                studentCourses: {
                    include: {
                        subject: true
                    }
                }
            }
        });
        
        if (!student) {
            return res.status(404).json({ error: 'Student not found' });
        }
        
        // Get student's assessment submissions with quarter filtering
        const submissionsQuery = {
            where: {
                studentId: studentId
            },
            include: {
                assessment: {
                    include: {
                        section: {
                            include: {
                                part: {
                                    include: {
                                        unit: {
                                            include: {
                                                subject: true
                                            }
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            },
            orderBy: { submittedAt: 'desc' }
        };
        
        // Add quarter filter if specified
        if (quarter) {
            submissionsQuery.where.assessment = {
                quarter: quarter
            };
        }
        
        const submissions = await prisma.assessmentSubmission.findMany(submissionsQuery);
        
        // Get student's progress data
        const progressQuery = {
            where: {
                studentId: studentId
            },
            include: {
                subject: true,
                topic: true
            }
        };
        
        const progress = await prisma.studentProgress.findMany(progressQuery);
        
        // Calculate statistics
        const totalSubmissions = submissions.length;
        const completedSubmissions = submissions.filter(s => s.score !== null).length;
        const averageScore = completedSubmissions > 0 
            ? (submissions.reduce((sum, s) => sum + (s.score || 0), 0) / completedSubmissions).toFixed(2)
            : 0;
        
        // Group by quarter
        const submissionsByQuarter = {};
        submissions.forEach(submission => {
            const quarter = submission.assessment.quarter || 'Unknown';
            if (!submissionsByQuarter[quarter]) {
                submissionsByQuarter[quarter] = [];
            }
            submissionsByQuarter[quarter].push(submission);
        });
        
        // Group by subject
        const submissionsBySubject = {};
        submissions.forEach(submission => {
            const subjectName = submission.assessment.section?.part?.unit?.subject?.name || 'Unknown';
            if (!submissionsBySubject[subjectName]) {
                submissionsBySubject[subjectName] = [];
            }
            submissionsBySubject[subjectName].push(submission);
        });
        
        // Calculate quarter-specific statistics
        const quarterStats = {};
        Object.keys(submissionsByQuarter).forEach(quarter => {
            const quarterSubmissions = submissionsByQuarter[quarter];
            const completed = quarterSubmissions.filter(s => s.score !== null).length;
            const avgScore = completed > 0 
                ? (quarterSubmissions.reduce((sum, s) => sum + (s.score || 0), 0) / completed).toFixed(2)
                : 0;
            
            quarterStats[quarter] = {
                totalSubmissions: quarterSubmissions.length,
                completedSubmissions: completed,
                averageScore: avgScore,
                completionRate: quarterSubmissions.length > 0 ? ((completed / quarterSubmissions.length) * 100).toFixed(1) : 0
            };
        });
        
        // Calculate subject-specific statistics
        const subjectStats = {};
        Object.keys(submissionsBySubject).forEach(subjectName => {
            const subjectSubmissions = submissionsBySubject[subjectName];
            const completed = subjectSubmissions.filter(s => s.score !== null).length;
            const avgScore = completed > 0 
                ? (subjectSubmissions.reduce((sum, s) => sum + (s.score || 0), 0) / completed).toFixed(2)
                : 0;
            
            subjectStats[subjectName] = {
                totalSubmissions: subjectSubmissions.length,
                completedSubmissions: completed,
                averageScore: avgScore,
                completionRate: subjectSubmissions.length > 0 ? ((completed / subjectSubmissions.length) * 100).toFixed(1) : 0
            };
        });
        
        const report = {
            student: {
                id: student.id,
                name: student.name,
                email: student.email,
                class: student.class,
                yearLevel: student.yearLevel,
                enrolledSubjects: student.studentCourses.map(sc => sc.subject.name)
            },
            filter: {
                quarter: quarter || 'All Quarters'
            },
            summary: {
                totalSubmissions,
                completedSubmissions,
                averageScore,
                completionRate: totalSubmissions > 0 ? ((completedSubmissions / totalSubmissions) * 100).toFixed(1) : 0
            },
            quarterStats,
            subjectStats,
            submissions: submissions.map(submission => ({
                id: submission.id,
                assessmentId: submission.assessment.id,
                assessmentTitle: submission.assessment.title,
                assessmentType: submission.assessment.type,
                quarter: submission.assessment.quarter,
                subject: submission.assessment.section?.part?.unit?.subject?.name || 'Unknown',
                score: submission.score,
                attempts: submission.attempts,
                status: submission.status,
                submittedAt: submission.submittedAt,
                totalTime: submission.totalTime
            })),
            progress: progress.map(p => ({
                id: p.id,
                subject: p.subject.name,
                topic: p.topic.name,
                status: p.status,
                score: p.score,
                lastUpdated: p.lastUpdated
            }))
        };
        
        res.json(report);
        
    } catch (error) {
        console.error('Error generating student report:', error);
        res.status(500).json({ error: 'Failed to generate student report' });
    }
});

// Helper function: Normalize category to first word
function normalizeCategory(category) {
    if (!category) return 'Other';
    
    const firstWord = category.trim().split(/\s+/)[0];
    const capitalized = firstWord.charAt(0).toUpperCase() + firstWord.slice(1).toLowerCase();
    
    // Map TEST to Test Practice
    if (capitalized.toLowerCase() === 'test') return 'Test Practice';
    
    // Return the capitalized first word (all categories are dynamic)
    return capitalized;
}

// Helper function: Generate comment based on completion and score
function generateCategoryComment(completed, total, progressPercent, averageScore) {
    const remaining = total - completed;
    
    if (progressPercent === 100) {
        if (averageScore < 50) {
            return "Excellent completion! Please review your materials carefully, re-read the textbook pages, ask your teacher questions to clarify concepts, and consider retaking past assessments to improve your understanding.";
        } else if (averageScore < 70) {
            return "All assessments completed. Please review your incorrect answers, practice more, and ask your teacher for help on challenging topics.";
        } else {
            return "Excellent work! You have shown strong performance with complete participation.";
        }
    } else if (progressPercent >= 80) {
        return `Nearly complete - please finish the remaining ${remaining} assessment${remaining > 1 ? 's' : ''}.`;
    } else if (progressPercent >= 50) {
        return `More practice needed. Please complete ${remaining} more assessment${remaining > 1 ? 's' : ''} to reach your target.`;
    } else {
        return `This area needs attention. You have completed only ${completed}/${total} assessments. Please prioritize completing this work.`;
    }
}

// Individual Student Report Endpoint
app.get('/api/teacher/individual-student-report/:studentId', auth, async (req, res) => {
    try {
        const { studentId } = req.params;
        const { subjectId, quarter } = req.query;

        if (!subjectId) {
            return res.status(400).json({ error: 'Subject ID is required' });
        }

        // Get student information
        const student = await prisma.user.findFirst({
            where: {
                id: studentId,
                role: 'STUDENT',
                active: true
            },
            select: {
                id: true,
                name: true,
                studentNumber: true,
                class: true,
                profilePicture: true
            }
        });

        if (!student) {
            return res.status(404).json({ error: 'Student not found' });
        }

        // Get subject information
        const subject = await prisma.subject.findUnique({
            where: { id: subjectId },
            select: {
                id: true,
                name: true,
                coreSubject: true
            }
        });

        if (!subject) {
            return res.status(404).json({ error: 'Subject not found' });
        }

        // Check if student is enrolled in this subject
        const enrollment = await prisma.studentCourse.findFirst({
            where: {
                studentId: studentId,
                subjectId: subjectId
            }
        });

        if (!enrollment) {
            return res.status(400).json({ error: 'Student is not enrolled in this subject' });
        }

        // Get assessments with attached resources (same logic as progress page)
        const whereClause = {
            subjectId: subjectId,
            resources: {
                some: {}
            }
        };

        if (quarter) {
            whereClause.quarter = quarter;
        }

        const assessments = await prisma.assessment.findMany({
            where: whereClause,
            include: {
                resources: true,
                submissions: {
                    where: {
                        studentId: studentId
                    }
                }
            }
        });

        // Group assessments by quarter and category
        const assessmentsByQuarter = {};
        const categoriesSet = new Set();

        assessments.forEach(assessment => {
            const q = assessment.quarter;
            if (!assessmentsByQuarter[q]) {
                assessmentsByQuarter[q] = {};
            }

            const normalizedCategory = normalizeCategory(assessment.category);
            categoriesSet.add(normalizedCategory);

            if (!assessmentsByQuarter[q][normalizedCategory]) {
                assessmentsByQuarter[q][normalizedCategory] = [];
            }

            assessmentsByQuarter[q][normalizedCategory].push(assessment);
        });

        const categories = Array.from(categoriesSet).sort();

        // Calculate student data by quarter and category
        const quarterData = {};
        const quarters = Object.keys(assessmentsByQuarter).sort();

        quarters.forEach(q => {
            const categoriesData = {};
            
            categories.forEach(category => {
                const categoryAssessments = assessmentsByQuarter[q][category] || [];
                const totalAssessments = categoryAssessments.length;
                
                let completedAssessments = 0;
                let totalScore = 0;
                let validScores = 0;

                categoryAssessments.forEach(assessment => {
                    const submission = assessment.submissions.find(sub => sub.studentId === studentId);
                    if (submission && submission.score !== null && submission.score !== undefined) {
                        completedAssessments++;
                        totalScore += submission.score;
                        validScores++;
                    }
                });

                const progressPercent = totalAssessments > 0 ? Math.round((completedAssessments / totalAssessments) * 100) : 0;
                const averageScore = validScores > 0 ? Math.round(totalScore / validScores) : 0;
                const finalGrade = Math.round((progressPercent * averageScore) / 100);
                const comment = generateCategoryComment(completedAssessments, totalAssessments, progressPercent, averageScore);

                categoriesData[category] = {
                    completed: completedAssessments,
                    total: totalAssessments,
                    progressPercent,
                    averageScore,
                    finalGrade,
                    comment
                };
            });

            quarterData[q] = { categories: categoriesData };
        });

        res.json({
            student: {
                id: student.id,
                name: student.name,
                studentId: student.studentNumber,
                class: student.class,
                profilePicture: student.profilePicture
            },
            subject: subject,
            quarter: quarter || 'All Quarters',
            quarters: quarters,
            categories: categories,
            quarterData: quarterData
        });

    } catch (error) {
        console.error('Error generating individual student report:', error);
        res.status(500).json({ error: 'Failed to generate individual student report' });
    }
});

// Multi-Quarter Access Management Endpoints

// Get multi-quarter access settings for all classes/subjects
app.get('/api/teacher/multi-quarter-access', auth, async (req, res) => {
    try {
        // Verify user is teacher or admin
        const user = await prisma.user.findUnique({
            where: { id: req.user.userId }
        });

        if (!user || (user.role !== 'TEACHER' && user.role !== 'ADMIN')) {
            return res.status(403).json({ error: 'Access denied' });
        }

        // Get all multi-quarter access settings with subject and user info
        const multiQuarterSettings = await prisma.multiQuarterAccess.findMany({
            include: {
                subject: {
                    select: {
                        id: true,
                        name: true,
                        coreSubject: {
                            select: {
                                name: true
                            }
                        }
                    }
                },
                enabledByUser: {
                    select: {
                        name: true,
                        email: true
                    }
                }
            },
            orderBy: [
                { subject: { name: 'asc' } },
                { className: 'asc' }
            ]
        });

        res.json({ settings: multiQuarterSettings });

    } catch (error) {
        console.error('Error fetching multi-quarter access settings:', error);
        res.status(500).json({ error: 'Failed to fetch multi-quarter access settings' });
    }
});

// Create or update multi-quarter access setting
app.post('/api/teacher/multi-quarter-access', auth, async (req, res) => {
    try {
        const { subjectId, className, isEnabled, deadline, description } = req.body;

        // Verify user is teacher or admin
        const user = await prisma.user.findUnique({
            where: { id: req.user.userId }
        });

        if (!user || (user.role !== 'TEACHER' && user.role !== 'ADMIN')) {
            return res.status(403).json({ error: 'Access denied' });
        }

        // Validate required fields
        if (!subjectId || !className) {
            return res.status(400).json({ error: 'Subject ID and class name are required' });
        }

        // Check if setting already exists
        const existingSetting = await prisma.multiQuarterAccess.findUnique({
            where: {
                subjectId_className: {
                    subjectId: subjectId,
                    className: className
                }
            }
        });

        let setting;
        if (existingSetting) {
            // Update existing setting
            setting = await prisma.multiQuarterAccess.update({
                where: {
                    subjectId_className: {
                        subjectId: subjectId,
                        className: className
                    }
                },
                data: {
                    isEnabled: isEnabled,
                    deadline: deadline ? new Date(deadline) : null,
                    description: description,
                    enabledBy: req.user.userId,
                    enabledAt: new Date()
                },
                include: {
                    subject: {
                        select: {
                            id: true,
                            name: true,
                            coreSubject: {
                                select: {
                                    name: true
                                }
                            }
                        }
                    },
                    enabledByUser: {
                        select: {
                            name: true,
                            email: true
                        }
                    }
                }
            });
        } else {
            // Create new setting
            setting = await prisma.multiQuarterAccess.create({
                data: {
                    subjectId: subjectId,
                    className: className,
                    isEnabled: isEnabled,
                    deadline: deadline ? new Date(deadline) : null,
                    description: description,
                    enabledBy: req.user.userId
                },
                include: {
                    subject: {
                        select: {
                            id: true,
                            name: true,
                            coreSubject: {
                                select: {
                                    name: true
                                }
                            }
                        }
                    },
                    enabledByUser: {
                        select: {
                            name: true,
                            email: true
                        }
                    }
                }
            });
        }

        console.log(`[Multi-Quarter Access] ${user.name} ${isEnabled ? 'enabled' : 'disabled'} multi-quarter access for ${className} in ${setting.subject.name}`);
        
        res.json({ 
            message: `Multi-quarter access ${isEnabled ? 'enabled' : 'disabled'} successfully`,
            setting: setting 
        });

    } catch (error) {
        console.error('Error updating multi-quarter access setting:', error);
        res.status(500).json({ error: 'Failed to update multi-quarter access setting' });
    }
});

// Delete multi-quarter access setting
app.delete('/api/teacher/multi-quarter-access/:subjectId/:className', auth, async (req, res) => {
    try {
        const { subjectId, className } = req.params;

        // Verify user is teacher or admin
        const user = await prisma.user.findUnique({
            where: { id: req.user.userId }
        });

        if (!user || (user.role !== 'TEACHER' && user.role !== 'ADMIN')) {
            return res.status(403).json({ error: 'Access denied' });
        }

        // Delete the setting
        await prisma.multiQuarterAccess.delete({
            where: {
                subjectId_className: {
                    subjectId: subjectId,
                    className: className
                }
            }
        });

        console.log(`[Multi-Quarter Access] ${user.name} deleted multi-quarter access setting for ${className} in subject ${subjectId}`);
        
        res.json({ message: 'Multi-quarter access setting deleted successfully' });

    } catch (error) {
        console.error('Error deleting multi-quarter access setting:', error);
        res.status(500).json({ error: 'Failed to delete multi-quarter access setting' });
    }
});

// Class Category Report Endpoint
app.get('/api/teacher/class-category-report', auth, async (req, res) => {
    try {
        const { subjectId, class: className, quarter } = req.query;
        
        // Verify user is teacher or admin
        const user = await prisma.user.findUnique({
            where: { id: req.user.userId }
        });
        
        if (user.role.toUpperCase() !== 'TEACHER' && user.role.toUpperCase() !== 'ADMIN') {
            return res.status(403).json({ error: 'Access denied. Teachers and admins only.' });
        }
        
        if (!subjectId || !className) {
            return res.status(400).json({ error: 'subjectId and class are required parameters' });
        }
        
        console.log(`[Category Report] Generating for Subject: ${subjectId}, Class: ${className}, Quarter: ${quarter || 'All'}`);
        
        // Get all students in the specified class who are enrolled in this subject
        const students = await prisma.user.findMany({
            where: {
                role: 'STUDENT',
                class: className,
                active: true,
                studentCourses: {
                    some: {
                        subjectId: subjectId
                    }
                }
            },
            select: {
                id: true,
                name: true,
                studentNumber: true,
                class: true,
                profilePicture: true
            },
            orderBy: {
                name: 'asc'
            }
        });
        
        if (students.length === 0) {
            return res.json({
                class: className,
                subject: null,
                quarter: quarter || 'All',
                students: [],
                summary: {
                    totalStudents: 0,
                    totalAssessments: 0,
                    categoryBreakdown: {}
                }
            });
        }
        
        console.log(`[Category Report] Found ${students.length} students enrolled in subject`);
        
        // Get subject details
        const subject = await prisma.subject.findUnique({
            where: { id: subjectId },
            include: {
                coreSubject: true
            }
        });
        
        // Get all assessments for this subject with attached resources
        const assessments = await prisma.assessment.findMany({
            where: {
                section: { 
                    part: { 
                        unit: { 
                            subjectId: subjectId 
                        } 
                    } 
                },
                ...(quarter ? { quarter: quarter } : {})
            },
            include: {
                resources: true,
                section: {
                    select: {
                        part: {
                            select: {
                                unit: {
                                    select: {
                                        subjectId: true
                                    }
                                }
                            }
                        }
                    }
                }
            }
        });
        
        // Only count assessments with attached resources (same as progress.html)
        const attachedAssessments = assessments.filter(a => a.resources && a.resources.length > 0);
        
        console.log(`[Category Report] Total assessments: ${assessments.length}, With resources: ${attachedAssessments.length}`);
        
        const studentIds = students.map(s => s.id);
        
        // Get all submissions for these students and assessments
        const submissions = await prisma.assessmentSubmission.findMany({
            where: {
                studentId: { in: studentIds },
                assessmentId: { in: attachedAssessments.map(a => a.id) }
            },
            select: {
                id: true,
                studentId: true,
                assessmentId: true,
                score: true,
                submittedAt: true
            }
        });
        
        console.log(`[Category Report] Found ${submissions.length} submissions`);
        
        // Group submissions by student and assessment
        const submissionsByStudent = {};
        submissions.forEach(sub => {
            if (!submissionsByStudent[sub.studentId]) {
                submissionsByStudent[sub.studentId] = {};
            }
            if (!submissionsByStudent[sub.studentId][sub.assessmentId]) {
                submissionsByStudent[sub.studentId][sub.assessmentId] = [];
            }
            submissionsByStudent[sub.studentId][sub.assessmentId].push(sub);
        });
        
        // Extract all unique categories from assessments
        const allCategories = new Set();
        const assessmentsByCategory = {};
        const assessmentsByQuarter = {};
        
        attachedAssessments.forEach(assessment => {
            const normalizedCategory = normalizeCategory(assessment.category);
            allCategories.add(normalizedCategory);
            
            const assessmentQuarter = assessment.quarter || 'Q1';
            
            // Group by category
            if (!assessmentsByCategory[normalizedCategory]) {
                assessmentsByCategory[normalizedCategory] = [];
            }
            assessmentsByCategory[normalizedCategory].push(assessment);
            
            // Group by quarter and category
            if (!assessmentsByQuarter[assessmentQuarter]) {
                assessmentsByQuarter[assessmentQuarter] = {};
            }
            if (!assessmentsByQuarter[assessmentQuarter][normalizedCategory]) {
                assessmentsByQuarter[assessmentQuarter][normalizedCategory] = [];
            }
            assessmentsByQuarter[assessmentQuarter][normalizedCategory].push(assessment);
        });
        
        console.log(`[Category Report] Found categories:`, Array.from(allCategories));
        console.log(`[Category Report] Quarters:`, Object.keys(assessmentsByQuarter));
        
        // Build student data
        const studentData = students.map(student => {
            const studentSubmissions = submissionsByStudent[student.id] || {};
            const quarterData = {};
            
            // Process each quarter
            Object.keys(assessmentsByQuarter).forEach(q => {
                const quarterCategories = assessmentsByQuarter[q];
                const categories = {};
                
                // Process each category in this quarter
                Object.keys(quarterCategories).forEach(category => {
                    const categoryAssessments = quarterCategories[category];
                    const total = categoryAssessments.length;
                    
                    let completed = 0;
                    let scores = [];
                    
                    categoryAssessments.forEach(assessment => {
                        const assessmentSubmissions = studentSubmissions[assessment.id] || [];
                        
                        if (assessmentSubmissions.length > 0) {
                            // Check if any submission has a score
                            const scoredSubmissions = assessmentSubmissions.filter(s => s.score !== null);
                            if (scoredSubmissions.length > 0) {
                                completed++;
                                // Use best score
                                const bestScore = Math.max(...scoredSubmissions.map(s => s.score));
                                scores.push(bestScore);
                            }
                        }
                    });
                    
                    const progressPercent = total > 0 ? Math.round((completed / total) * 100) : 0;
                    const averageScore = scores.length > 0 
                        ? Math.round(scores.reduce((sum, s) => sum + s, 0) / scores.length)
                        : 0;
                    const finalGrade = total > 0 
                        ? Math.round((completed / total) * averageScore)
                        : 0;
                    
                    categories[category] = {
                        completed,
                        total,
                        progressPercent,
                        averageScore: scores.length > 0 ? averageScore : null,
                        finalGrade: scores.length > 0 ? finalGrade : null,
                        comment: generateCategoryComment(completed, total, progressPercent, averageScore)
                    };
                });
                
                quarterData[q] = { categories };
            });
            
            return {
                id: student.id,
                name: student.name,
                studentId: student.studentNumber,
                class: student.class,
                profilePicture: student.profilePicture,
                quarterData
            };
        });
        
        // Build summary with per-quarter breakdowns
        const categoryBreakdown = {};
        Object.keys(assessmentsByCategory).forEach(category => {
            categoryBreakdown[category] = assessmentsByCategory[category].length;
        });
        
        // Build per-quarter category breakdowns
        const quarterlyBreakdowns = {};
        Object.keys(assessmentsByQuarter).forEach(q => {
            quarterlyBreakdowns[q] = {};
            Object.keys(assessmentsByQuarter[q]).forEach(category => {
                quarterlyBreakdowns[q][category] = assessmentsByQuarter[q][category].length;
            });
        });
        
        // Calculate class averages per quarter for comparison
        const quarterComparison = {};
        Object.keys(assessmentsByQuarter).forEach(q => {
            const quarterCategories = assessmentsByQuarter[q];
            let totalCompleted = 0;
            let totalAvailable = 0;
            let totalScores = [];
            
            studentData.forEach(student => {
                if (student.quarterData[q]) {
                    Object.keys(student.quarterData[q].categories).forEach(category => {
                        const catData = student.quarterData[q].categories[category];
                        totalCompleted += catData.completed;
                        totalAvailable += catData.total;
                        if (catData.averageScore !== null) {
                            totalScores.push(catData.averageScore);
                        }
                    });
                }
            });
            
            const classProgressPercent = totalAvailable > 0 ? Math.round((totalCompleted / totalAvailable) * 100) : 0;
            const classAverageScore = totalScores.length > 0 
                ? Math.round(totalScores.reduce((sum, s) => sum + s, 0) / totalScores.length)
                : 0;
            
            quarterComparison[q] = {
                totalAssessments: Object.values(quarterlyBreakdowns[q]).reduce((sum, val) => sum + val, 0),
                classProgressPercent,
                classAverageScore,
                classFinalGrade: Math.round((classProgressPercent / 100) * classAverageScore),
                categoryBreakdown: quarterlyBreakdowns[q]
            };
        });
        
        const response = {
            class: className,
            subject: {
                id: subject.id,
                name: subject.name,
                coreSubject: subject.coreSubject?.name
            },
            quarter: quarter || 'All',
            quarters: Object.keys(assessmentsByQuarter).sort(),
            categories: Array.from(allCategories).sort(),
            students: studentData,
            summary: {
                totalStudents: students.length,
                totalAssessments: attachedAssessments.length,
                categoryBreakdown,
                quarterlyBreakdowns,
                quarterComparison
            }
        };
        
        res.json(response);
        
    } catch (error) {
        console.error('Error generating class category report:', error);
        res.status(500).json({ error: 'Failed to generate class category report', details: error.message });
    }
});

// Advanced Category Report Endpoint - Flexible quarter selection
app.get('/api/teacher/advanced-category-report', auth, async (req, res) => {
    try {
        const { subjectId, class: className, quarters } = req.query;
        
        // Verify user is teacher or admin
        const user = await prisma.user.findUnique({
            where: { id: req.user.userId }
        });
        
        if (user.role.toUpperCase() !== 'TEACHER' && user.role.toUpperCase() !== 'ADMIN') {
            return res.status(403).json({ error: 'Access denied. Teachers and admins only.' });
        }
        
        if (!subjectId || !className || !quarters) {
            return res.status(400).json({ error: 'subjectId, class, and quarters are required parameters' });
        }
        
        // Parse quarters parameter
        const quarterArray = quarters.split(',').map(q => q.trim()).filter(q => q);
        if (quarterArray.length === 0) {
            return res.status(400).json({ error: 'At least one quarter must be specified' });
        }
        
        console.log(`[Advanced Category Report] Generating for Subject: ${subjectId}, Class: ${className}, Quarters: ${quarterArray.join(', ')}`);
        
        // Get all students in the specified class who are enrolled in this subject
        const students = await prisma.user.findMany({
            where: {
                role: 'STUDENT',
                class: className,
                active: true,
                studentCourses: {
                    some: {
                        subjectId: subjectId
                    }
                }
            },
            select: {
                id: true,
                name: true,
                studentNumber: true,
                class: true,
                profilePicture: true
            },
            orderBy: {
                name: 'asc'
            }
        });
        
        if (students.length === 0) {
            return res.json({
                students: [],
                metadata: {
                    quarters: quarterArray,
                    categories: [],
                    totalStudents: 0,
                    className: className,
                    subjectName: null
                }
            });
        }
        
        console.log(`[Advanced Category Report] Found ${students.length} students enrolled in subject`);
        
        // Get subject details
        const subject = await prisma.subject.findUnique({
            where: { id: subjectId },
            include: {
                coreSubject: true
            }
        });
        
        // Get all assessments for this subject with attached resources for selected quarters
        const assessments = await prisma.assessment.findMany({
            where: {
                section: { 
                    part: { 
                        unit: { 
                            subjectId: subjectId 
                        } 
                    } 
                },
                quarter: { in: quarterArray }
            },
            include: {
                resources: true,
                section: {
                    select: {
                        part: {
                            select: {
                                unit: {
                                    select: {
                                        subjectId: true
                                    }
                                }
                            }
                        }
                    }
                }
            }
        });
        
        // Only count assessments with attached resources
        const attachedAssessments = assessments.filter(a => a.resources && a.resources.length > 0);
        
        console.log(`[Advanced Category Report] Total assessments: ${assessments.length}, With resources: ${attachedAssessments.length}`);
        
        const studentIds = students.map(s => s.id);
        
        // Get all submissions for these students and assessments
        const submissions = await prisma.assessmentSubmission.findMany({
            where: {
                studentId: { in: studentIds },
                assessmentId: { in: attachedAssessments.map(a => a.id) }
            },
            select: {
                id: true,
                studentId: true,
                assessmentId: true,
                score: true,
                submittedAt: true
            }
        });
        
        console.log(`[Advanced Category Report] Found ${submissions.length} submissions`);
        
        // Group submissions by student and assessment
        const submissionsByStudent = {};
        submissions.forEach(sub => {
            if (!submissionsByStudent[sub.studentId]) {
                submissionsByStudent[sub.studentId] = {};
            }
            if (!submissionsByStudent[sub.studentId][sub.assessmentId]) {
                submissionsByStudent[sub.studentId][sub.assessmentId] = [];
            }
            submissionsByStudent[sub.studentId][sub.assessmentId].push(sub);
        });
        
        // Extract all unique categories from assessments
        const allCategories = new Set();
        const assessmentsByCategory = {};
        const assessmentsByQuarter = {};
        
        attachedAssessments.forEach(assessment => {
            const normalizedCategory = normalizeCategory(assessment.category);
            allCategories.add(normalizedCategory);
            
            const assessmentQuarter = assessment.quarter || 'Q1';
            
            // Group by category (combined across quarters)
            if (!assessmentsByCategory[normalizedCategory]) {
                assessmentsByCategory[normalizedCategory] = [];
            }
            assessmentsByCategory[normalizedCategory].push(assessment);
            
            // Group by quarter and category (for quarter-specific data)
            if (!assessmentsByQuarter[assessmentQuarter]) {
                assessmentsByQuarter[assessmentQuarter] = {};
            }
            if (!assessmentsByQuarter[assessmentQuarter][normalizedCategory]) {
                assessmentsByQuarter[assessmentQuarter][normalizedCategory] = [];
            }
            assessmentsByQuarter[assessmentQuarter][normalizedCategory].push(assessment);
        });
        
        console.log(`[Advanced Category Report] Found categories:`, Array.from(allCategories));
        console.log(`[Advanced Category Report] Quarters:`, Object.keys(assessmentsByQuarter));
        
        // Build student data
        const studentData = students.map(student => {
            const studentSubmissions = submissionsByStudent[student.id] || {};
            const categories = {};
            let totalCompletedAll = 0;
            let totalAvailableAll = 0;
            
            // Process each category (combined across selected quarters)
            Object.keys(assessmentsByCategory).forEach(category => {
                const categoryAssessments = assessmentsByCategory[category];
                const total = categoryAssessments.length;
                
                let completed = 0;
                let scores = [];
                const quarterData = {};
                
                categoryAssessments.forEach(assessment => {
                    const assessmentSubmissions = studentSubmissions[assessment.id] || [];
                    const assessmentQuarter = assessment.quarter || 'Q1';
                    
                    if (assessmentSubmissions.length > 0) {
                        // Check if any submission has a score
                        const scoredSubmissions = assessmentSubmissions.filter(s => s.score !== null);
                        if (scoredSubmissions.length > 0) {
                            completed++;
                            // Use best score
                            const bestScore = Math.max(...scoredSubmissions.map(s => s.score));
                            scores.push(bestScore);
                        }
                    }
                    
                    // Track quarter-specific data
                    if (!quarterData[assessmentQuarter]) {
                        quarterData[assessmentQuarter] = { completed: 0, total: 0, scores: [] };
                    }
                    quarterData[assessmentQuarter].total++;
                    if (assessmentSubmissions.length > 0) {
                        const scoredSubmissions = assessmentSubmissions.filter(s => s.score !== null);
                        if (scoredSubmissions.length > 0) {
                            quarterData[assessmentQuarter].completed++;
                            const bestScore = Math.max(...scoredSubmissions.map(s => s.score));
                            quarterData[assessmentQuarter].scores.push(bestScore);
                        }
                    }
                });
                
                const completionPercent = total > 0 ? Math.round((completed / total) * 100) : 0;
                const averageScore = scores.length > 0 
                    ? Math.round(scores.reduce((sum, s) => sum + s, 0) / scores.length)
                    : 0;
                
                // Calculate quarter-specific completion and scores
                const processedQuarterData = {};
                Object.keys(quarterData).forEach(q => {
                    const qData = quarterData[q];
                    processedQuarterData[q] = {
                        completed: qData.completed,
                        total: qData.total,
                        completionPercent: qData.total > 0 ? Math.round((qData.completed / qData.total) * 100) : 0,
                        averageScore: qData.scores.length > 0 
                            ? Math.round(qData.scores.reduce((sum, s) => sum + s, 0) / qData.scores.length)
                            : 0
                    };
                });
                
                categories[category] = {
                    completed,
                    total,
                    completionPercent,
                    averageScore: scores.length > 0 ? averageScore : 0,
                    quarterData: processedQuarterData
                };
                
                totalCompletedAll += completed;
                totalAvailableAll += total;
            });
            
            // Calculate overall completion percentage (average of category completion percentages)
            const categoryCompletionPercentages = Object.values(categories).map(cat => cat.completionPercent);
            const overallCompletion = categoryCompletionPercentages.length > 0 
                ? Math.round(categoryCompletionPercentages.reduce((sum, p) => sum + p, 0) / categoryCompletionPercentages.length)
                : 0;
            
            return {
                id: student.id,
                name: student.name,
                studentNumber: student.studentNumber,
                class: student.class,
                profilePicture: student.profilePicture,
                overallCompletion,
                categories
            };
        });
        
        // Sort students by overall completion percentage (descending)
        studentData.sort((a, b) => {
            if (b.overallCompletion !== a.overallCompletion) {
                return b.overallCompletion - a.overallCompletion;
            }
            // Tie-breaker: sort by name alphabetically
            return a.name.localeCompare(b.name);
        });
        
        const response = {
            students: studentData,
            metadata: {
                quarters: quarterArray.sort(),
                categories: Array.from(allCategories).sort(),
                totalStudents: students.length,
                className: className,
                subjectName: subject ? subject.name : null
            }
        };
        
        res.json(response);
        
    } catch (error) {
        console.error('Error generating advanced category report:', error);
        res.status(500).json({ error: 'Failed to generate advanced category report', details: error.message });
    }
});

// Endpoint to get all classes for teacher's students
app.get('/api/teacher/classes', auth, async (req, res) => {
    try {
        // More robust method: fetch all students and derive classes from them.
        const allStudents = await prisma.user.findMany({
            where: {
                role: 'STUDENT',
                class: {
                    not: null,
                },
            },
            select: {
                class: true,
            },
        });

        // Use a Set to ensure uniqueness, then sort the result with custom logic.
        const classSet = new Set(allStudents.map(s => s.class));
        const classes = Array.from(classSet).sort((a, b) => {
            const matchA = a.match(/([PM])(\d+)\/(\d+)/);
            const matchB = b.match(/([PM])(\d+)\/(\d+)/);

            // If a class name doesn't match the expected pattern, sort it to the end.
            if (!matchA) return 1;
            if (!matchB) return -1;

            const prefixA = matchA[1];
            const yearA = parseInt(matchA[2], 10);
            const roomA = parseInt(matchA[3], 10);

            const prefixB = matchB[1];
            const yearB = parseInt(matchB[2], 10);
            const roomB = parseInt(matchB[3], 10);

            // 'P' (Prathom) should come before 'M' (Mattayom)
            if (prefixA === 'P' && prefixB === 'M') return -1;
            if (prefixA === 'M' && prefixB === 'P') return 1;
            
            // If prefixes are the same, sort by year level
            if (yearA !== yearB) return yearA - yearB;
            
            // If year levels are the same, sort by room number
            return roomA - roomB;
        });

        res.json({ classes });

    } catch (error) {
        console.error('Error fetching teacher classes:', error);
        res.status(500).json({ error: 'Failed to fetch classes' });
    }
});

// New endpoint to update student statuses
app.post('/api/teacher/students/status', auth, async (req, res) => {
    try {
        const { changes } = req.body; // Expects an object like { studentId: newStatus, ... }

        if (!changes || typeof changes !== 'object' || Object.keys(changes).length === 0) {
            return res.status(400).json({ error: 'No changes provided.' });
        }

        const updatePromises = Object.entries(changes).map(async ([studentId, active]) => {
            // If deactivating (active = false), also remove student number
            if (active === false) {
                return prisma.user.update({
                    where: { id: studentId },
                    data: { 
                        active: false,
                        studentNumber: null  // Remove student number when deactivating
                    },
                });
            } else {
                // If reactivating, just update the active status
                return prisma.user.update({
                    where: { id: studentId },
                    data: { active: true },
                });
            }
        });

        await Promise.all(updatePromises);

        const deactivatedCount = Object.values(changes).filter(status => status === false).length;
        const reactivatedCount = Object.values(changes).filter(status => status === true).length;
        
        let message = 'Student statuses updated successfully.';
        if (deactivatedCount > 0) {
            message += ` ${deactivatedCount} student(s) deactivated and student numbers removed.`;
        }
        if (reactivatedCount > 0) {
            message += ` ${reactivatedCount} student(s) reactivated.`;
        }

        res.json({ success: true, message });

    } catch (error) {
        console.error('Error updating student statuses:', error);
        res.status(500).json({ error: 'Failed to update student statuses.' });
    }
});

// Update students' class seat numbers (sequence within class)
app.post('/api/teacher/students/seat-numbers', auth, async (req, res) => {
    try {
        const user = await prisma.user.findUnique({ where: { id: req.user.userId } });
        if (!user || user.role !== 'TEACHER') {
            return res.status(403).json({ success: false, error: 'Not authorized' });
        }
        const { updates } = req.body; // { studentId: classSeat }
        if (!updates || typeof updates !== 'object' || Object.keys(updates).length === 0) {
            return res.status(400).json({ success: false, error: 'No updates provided' });
        }
        const ops = Object.entries(updates).map(([studentId, classSeat]) =>
            prisma.user.update({ where: { id: studentId }, data: { classSeat: Number(classSeat) || null } })
        );
        await Promise.all(ops);
        res.json({ success: true, updated: Object.keys(updates).length });
    } catch (error) {
        console.error('Error updating class seat numbers:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Endpoint for writing assignment submission (long/short answer)
app.post('/api/assessments/:assessmentId/submit-writing', auth, upload.single('file'), async (req, res) => {
    try {
        const { assessmentId } = req.params;
        const studentId = req.user.userId;
        const { text } = req.body;
        let filePath = null;
        
        // Verify the assessment exists
        const assessment = await prisma.assessment.findUnique({
            where: { id: assessmentId }
        });
        
        if (!assessment) {
            return res.status(404).json({ 
                success: false, 
                error: 'Assessment not found' 
            });
        }
        // Enforce availability for students: block submissions after due date
        if (assessment.dueDate && new Date(assessment.dueDate) < new Date()) {
            return res.status(403).json({
                success: false,
                error: 'Submissions are closed for this assessment.'
            });
        }
        
        if (req.file) {
            // Validate file type - accept a wider range of document types
            const validMimeTypes = [
                'application/pdf', 
                'application/msword', 
                'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
                'text/plain',
                'text/markdown',
                'image/jpeg',
                'image/png',
                'image/gif'
            ];
            
            if (!validMimeTypes.includes(req.file.mimetype)) {
                return res.status(400).json({
                    success: false,
                    error: 'Invalid file type. Please upload a document, text, or image file.'
                });
            }
            
            filePath = `/uploads/resources/${req.file.filename}`;
        }
        
        // Ensure either text or file is provided
        if (!text && !filePath) {
            return res.status(400).json({
                success: false,
                error: 'Either text or a file must be submitted'
            });
        }
        
        // Save submission
        const submission = await prisma.assessmentSubmission.create({
            data: {
                assessmentId,
                studentId,
                answers: { 
                    text: text || null, 
                    file: filePath,
                    fileType: req.file ? req.file.mimetype : null,
                    fileName: req.file ? req.file.originalname : null,
                    submittedAt: new Date().toISOString() // Add submission timestamp
                },
                score: null,
                submittedAt: new Date()
            }
        });
        
        // Return the created submission with a success status
        res.json({ 
            success: true, 
            submission,
            status: 'Submitted'  // Explicitly return the status
        });
    } catch (error) {
        console.error('Error submitting writing assignment:', error);
        res.status(500).json({ 
            success: false, 
            error: 'Failed to submit writing assignment. ' + error.message 
        });
    }
});

// Delete a section by ID
app.delete('/api/sections/:sectionId', auth, async (req, res) => {
    try {
        const { sectionId } = req.params;

        // Delete all assessments for this section
        await prisma.assessment.deleteMany({
            where: { sectionId }
        });

        // Remove resource connections (many-to-many relationship)
        await prisma.section.update({
            where: { id: sectionId },
            data: {
                resources: {
                    set: []
                }
            }
        });

        // Delete the section itself
        await prisma.section.delete({
            where: { id: sectionId }
        });

        res.json({ success: true });
    } catch (error) {
        console.error('Error deleting section:', error);
        res.status(500).json({ error: 'Failed to delete section' });
    }
});

// Start server
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});

// Get a single resource by ID
app.get('/api/resources/:resourceId', auth, async (req, res) => {
    try {
        const { resourceId } = req.params;
        
        const resource = await prisma.resource.findUnique({
            where: { id: resourceId },
            include: {
                createdBy: true,
                assessments: true
            }
        });

        if (!resource) {
            return res.status(404).json({ error: 'Resource not found' });
        }
        
        // Extract audioPath from metadata if it exists
        let audioPath = null;
        if (resource.metadata && typeof resource.metadata === 'object' && resource.metadata.audioPath) {
            audioPath = resource.metadata.audioPath;
        }
        
        // Format the response
        const formattedResource = {
            ...resource,
            audioPath: audioPath,
            filePath: resource.url  // For consistency with other endpoints
        };
        
        res.json(formattedResource);
    } catch (error) {
        console.error('Error fetching resource:', error);
        res.status(500).json({ error: 'Failed to fetch resource' });
    }
});

// Serve audio files for assessments using the assessment ID
app.get('/audio/:assessmentId.:ext', async (req, res) => {
    try {
        const { assessmentId, ext } = req.params;
        console.log(`[AUDIO] Request for assessment ${assessmentId} with extension ${ext}`);
        
        // Lookup assessment and its media files
        const assessment = await prisma.assessment.findUnique({
            where: { id: assessmentId },
            include: { mediaFiles: true }
        });
        
        console.log(`[AUDIO] Found assessment: ${assessment ? 'Yes' : 'No'}`);
        console.log(`[AUDIO] Media files: ${assessment?.mediaFiles?.length || 0}`);
        
        if (!assessment || !assessment.mediaFiles || assessment.mediaFiles.length === 0) {
            console.log(`[AUDIO] No media files found for assessment ${assessmentId}`);
            return res.status(404).send('Audio file not found');
        }
        
        // Find audio media files
        const audioFiles = assessment.mediaFiles.filter(file => 
            (file.type && file.type.startsWith('audio/')) || 
            (file.filePath && (file.filePath.endsWith('.mp3') || file.filePath.endsWith('.wav') || file.filePath.endsWith('.ogg')))
        );
        
        console.log(`[AUDIO] Audio files found: ${audioFiles.length}`);
        if (audioFiles.length > 0) {
            console.log(`[AUDIO] First audio file:`, JSON.stringify(audioFiles[0]));
        }
        
        if (audioFiles.length === 0) {
            console.log(`[AUDIO] No audio files matched the filter criteria`);
            return res.status(404).send('No audio files found for this assessment');
        }
        
        // Use the first audio file
        const audioFile = audioFiles[0];
        
        // Get the file path - remove leading slash if needed
        let filePath = audioFile.filePath;
        if (filePath.startsWith('/')) {
            filePath = filePath.substring(1);
        }
        
        // Set appropriate content type based on extension
        let contentType = audioFile.type || 'audio/mpeg';
        if (ext === 'wav') contentType = 'audio/wav';
        if (ext === 'ogg') contentType = 'audio/ogg';
        
        // Check if file exists before trying to send it
        let fullPath = path.join(__dirname, filePath);
        console.log(`[AUDIO] Checking file path: ${fullPath}`);
        
        // If file doesn't exist at the direct path, try the uploads/resources folder
        if (!fs.existsSync(fullPath)) {
            console.log(`[AUDIO] File not found at primary path, trying alternative path`);
            // Extract just the filename (everything after the last slash)
            const filename = filePath.substring(filePath.lastIndexOf('/') + 1);
            const altPath = path.join(__dirname, 'uploads', 'resources', filename);
            console.log(`[AUDIO] Alternative path: ${altPath}`);
            
            if (fs.existsSync(altPath)) {
                fullPath = altPath;
                console.log(`[AUDIO] Using alternative path for audio: ${fullPath}`);
            } else {
                console.error(`[AUDIO] Audio file not found on disk: ${fullPath} or ${altPath}`);
                
                // List files in the uploads/resources directory to help debug
                try {
                    const files = fs.readdirSync(path.join(__dirname, 'uploads', 'resources'));
                    console.log(`[AUDIO] Files in uploads/resources:`, files.slice(0, 10)); // Show first 10 files
                } catch (err) {
                    console.error(`[AUDIO] Error listing files:`, err);
                }
                
                return res.status(404).send('Audio file not found on disk');
            }
        }
        
        // Set appropriate headers and send the file
        res.setHeader('Content-Type', contentType);
        res.sendFile(fullPath);
        
    } catch (error) {
        console.error('Error serving audio file:', error);
        res.status(500).send('Error serving audio file');
    }
});

// Add a new API endpoint for uploading audio files for assessments
app.post('/api/assessments/upload-audio', auth, upload.single('file'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ error: 'No audio file provided' });
        }

        const audioFile = req.file;
        const filePath = `/uploads/resources/${audioFile.filename}`;

        // Return the file path for the client to use
        res.json({
            success: true,
            filePath,
            fileName: audioFile.originalname,
            fileType: audioFile.mimetype
        });
    } catch (error) {
        console.error('Error uploading audio file:', error);
        res.status(500).json({ error: 'Failed to upload audio file' });
    }
});

// Upload image for assessments (e.g., Connect Match)
app.post('/api/assessments/upload-image', auth, upload.single('file'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ error: 'No image file provided' });
        }
        const imageFile = req.file;
        const filePath = `/uploads/resources/${imageFile.filename}`;
        res.json({ success: true, filePath, fileName: imageFile.originalname, fileType: imageFile.mimetype });
    } catch (error) {
        console.error('Error uploading image file:', error);
        res.status(500).json({ error: 'Failed to upload image file' });
    }
});

// Add a new API endpoint for attaching audio to an existing assessment
app.post('/api/assessments/:assessmentId/attach-audio', auth, upload.single('audio'), async (req, res) => {
    try {
        const { assessmentId } = req.params;

        if (!req.file) {
            return res.status(400).json({ error: 'No audio file provided' });
        }

        // Check if assessment exists
        const assessment = await prisma.assessment.findUnique({
            where: { id: assessmentId },
            include: { mediaFiles: true }
        });

        if (!assessment) {
            return res.status(404).json({ error: 'Assessment not found' });
        }

        // Create a new media file record
        const mediaFile = await prisma.mediaFile.create({
            data: {
                filePath: `/uploads/resources/${req.file.filename}`,
                type: req.file.mimetype,
                label: req.file.fieldname || 'audio',
                assessment: {
                    connect: { id: assessmentId }
                }
            }
        });

        res.json({
            success: true,
            mediaFile,
            message: 'Audio file attached to assessment successfully'
        });
    } catch (error) {
        console.error('Error attaching audio to assessment:', error);
        res.status(500).json({ error: 'Failed to attach audio file' });
    }
});

// Clone a complete resource + assessment package to another course location
app.post('/api/packages/clone', auth, async (req, res) => {
    try {
        const { sourceResourceId, targetSubjectId, targetUnitId, targetPartId, targetSectionId } = req.body;
        
        console.log('[CLONE PACKAGE] Request:', { sourceResourceId, targetSubjectId, targetUnitId, targetPartId, targetSectionId });

        // Validate required fields
        if (!sourceResourceId || !targetSubjectId || !targetUnitId || !targetPartId || !targetSectionId) {
            return res.status(400).json({ error: 'All target location fields are required' });
        }

        // Get the source resource with its assessments
        const sourceResource = await prisma.resource.findUnique({
            where: { id: sourceResourceId },
            include: {
                assessments: {
                    include: {
                        mediaFiles: true
                    }
                }
            }
        });

        if (!sourceResource) {
            return res.status(404).json({ error: 'Source resource not found' });
        }

        // Verify target location exists
        const targetSection = await prisma.section.findUnique({
            where: { id: targetSectionId },
            include: {
                part: {
                    include: {
                        unit: {
                            include: {
                                subject: true
                            }
                        }
                    }
                }
            }
        });

        if (!targetSection) {
            return res.status(404).json({ error: 'Target section not found' });
        }

        // Get or create the target topic (based on unit name)
        const targetUnit = targetSection.part.unit;
        let targetTopic = await prisma.topic.findFirst({
            where: {
                name: targetUnit.name,
                subjectId: targetSubjectId
            }
        });

        if (!targetTopic) {
            targetTopic = await prisma.topic.create({
                data: {
                    name: targetUnit.name,
                    description: targetUnit.description,
                    order: targetUnit.order,
                    subject: {
                        connect: { id: targetSubjectId }
                    }
                }
            });
        }

        // Clone the resource
        const clonedResource = await prisma.resource.create({
            data: {
                title: sourceResource.title,
                description: sourceResource.description,
                type: sourceResource.type,
                url: sourceResource.url,
                quarter: sourceResource.quarter,
                metadata: sourceResource.metadata,
                topic: {
                    connect: { id: targetTopic.id }
                },
                createdBy: { 
                    connect: { id: req.user.userId } 
                },
                unit: { 
                    connect: { id: targetUnitId } 
                },
                part: { 
                    connect: { id: targetPartId } 
                },
                section: { 
                    connect: { id: targetSectionId } 
                }
            }
        });

        console.log('[CLONE PACKAGE] Cloned resource:', clonedResource.id);

        // Clone each assessment and link to the new resource
        const clonedAssessments = [];
        for (const sourceAssessment of sourceResource.assessments) {
            // Clone media files first
            const clonedMediaFiles = [];
            for (const mediaFile of sourceAssessment.mediaFiles) {
                const clonedMediaFile = await prisma.mediaFile.create({
                    data: {
                        filePath: mediaFile.filePath,
                        type: mediaFile.type,
                        label: mediaFile.label
                    }
                });
                clonedMediaFiles.push(clonedMediaFile);
            }

            // Clone the assessment
            const clonedAssessment = await prisma.assessment.create({
                data: {
                    title: sourceAssessment.title,
                    description: sourceAssessment.description,
                    type: sourceAssessment.type,
                    category: sourceAssessment.category,
                    criteria: sourceAssessment.criteria,
                    questions: sourceAssessment.questions,
                    dueDate: sourceAssessment.dueDate,
                    quarter: sourceAssessment.quarter,
                    maxAttempts: sourceAssessment.maxAttempts,
                    published: sourceAssessment.published,
                    section: {
                        connect: { id: targetSectionId }
                    },
                    createdBy: {
                        connect: { id: req.user.userId }
                    },
                    mediaFiles: clonedMediaFiles.length > 0 ? {
                        connect: clonedMediaFiles.map(mf => ({ id: mf.id }))
                    } : undefined,
                    topic: {
                        connect: { id: targetTopic.id }
                    }
                }
            });

            console.log('[CLONE PACKAGE] Cloned assessment:', clonedAssessment.id);
            clonedAssessments.push(clonedAssessment);
        }

        // Link all cloned assessments to the cloned resource
        await prisma.resource.update({
            where: { id: clonedResource.id },
            data: {
                assessments: {
                    connect: clonedAssessments.map(a => ({ id: a.id }))
                }
            }
        });

        console.log('[CLONE PACKAGE] Successfully cloned package');

        res.json({
            message: 'Package cloned successfully',
            resource: clonedResource,
            assessments: clonedAssessments.map(a => ({
                id: a.id,
                title: a.title,
                type: a.type
            }))
        });

    } catch (error) {
        console.error('Error cloning package:', error);
        res.status(500).json({ error: 'Failed to clone package' });
    }
});

// Add a utility endpoint for showing available audio files
app.get('/api/assessments/:assessmentId/audio-status', auth, async (req, res) => {
    try {
        const { assessmentId } = req.params;
        
        // Look up the assessment
        const assessment = await prisma.assessment.findUnique({
            where: { id: assessmentId },
            include: { mediaFiles: true }
        });
        
        if (!assessment) {
            return res.status(404).json({ error: 'Assessment not found' });
        }
        
        // Find audio files
        const audioFiles = assessment.mediaFiles.filter(file => 
            (file.type && file.type.startsWith('audio/')) || 
            (file.filePath && (file.filePath.endsWith('.mp3') || file.filePath.endsWith('.wav') || file.filePath.endsWith('.ogg')))
        );
        
        res.json({
            assessmentId,
            assessmentTitle: assessment.title,
            hasAudio: audioFiles.length > 0,
            audioCount: audioFiles.length,
            audioFiles: audioFiles.map(file => ({
                id: file.id,
                filePath: file.filePath,
                type: file.type,
                label: file.label
            }))
        });
    } catch (error) {
        console.error('Error checking audio status:', error);
        res.status(500).json({ error: 'Error checking audio status' });
    }
});

// Update the order of resources for a topic
app.put('/api/topics/:topicId/resources/order', auth, async (req, res) => {
    try {
        const { topicId } = req.params;
        const { resourceIds } = req.body;
        if (!Array.isArray(resourceIds)) {
            return res.status(400).json({ error: 'resourceIds must be an array' });
        }
        // Update each resource's order field
        const updatePromises = resourceIds.map((id, idx) =>
            prisma.resource.update({
                where: { id },
                data: { order: idx },
            })
        );
        await Promise.all(updatePromises);
        res.json({ success: true });
    } catch (error) {
        console.error('Error updating resource order:', error);
        res.status(500).json({ error: 'Failed to update resource order' });
    }
});

// Get all resources (for orphaned resources page)
app.get('/api/resources', auth, async (req, res) => {
    try {
        const resources = await prisma.resource.findMany({
            include: {
                assessments: true,
                createdBy: true
            }
        });
        // Add filePath and audioPath for compatibility
        const formatted = resources.map(resource => {
            let audioPath = null;
            if (resource.metadata && typeof resource.metadata === 'object' && resource.metadata.audioPath) {
                audioPath = resource.metadata.audioPath;
            }
            return {
                ...resource,
                filePath: resource.url,
                audioPath,
                assessments: resource.assessments.map(a => ({
                    id: a.id,
                    title: a.title,
                    type: a.type
                }))
            };
        });
        res.json(formatted);
    } catch (error) {
        console.error('Error fetching all resources:', error);
        res.status(500).json({ error: 'Failed to fetch resources' });
    }
});

// Delete all resources (admin only)
app.delete('/api/resources/all', auth, async (req, res) => {
    try {
        // First check if user is admin
        const user = await prisma.user.findUnique({
            where: { id: req.user.userId },
            select: { role: true }
        });

        if (!user || user.role !== 'ADMIN') {
            return res.status(403).json({ error: 'Only administrators can delete all resources' });
        }

        // First, disconnect all resources from assessments
        await prisma.assessment.updateMany({
            data: {
                resources: {
                    set: []
                }
            }
        });

        // Then delete all media files associated with resources
        await prisma.mediaFile.deleteMany({
            where: {
                resourceId: {
                    not: null
                }
            }
        });

        // Finally delete all resources
        const deletedResources = await prisma.resource.deleteMany({});

        res.json({ 
            success: true, 
            message: `Successfully deleted ${deletedResources.count} resources`,
            count: deletedResources.count
        });
    } catch (error) {
        console.error('Error deleting all resources:', error);
        res.status(500).json({ error: 'Failed to delete resources' });
    }
});

// Delete all assessments (admin only)
app.delete('/api/assessments/all', auth, async (req, res) => {
    try {
        // First check if user is admin
        const user = await prisma.user.findUnique({
            where: { id: req.user.userId },
            select: { role: true }
        });

        if (!user || user.role !== 'ADMIN') {
            return res.status(403).json({ error: 'Only administrators can delete all assessments' });
        }

        // First delete all assessment submissions
        const deletedSubmissions = await prisma.assessmentSubmission.deleteMany({});
        console.log(`Deleted ${deletedSubmissions.count} submissions`);

        // Then delete all media files associated with assessments
        const deletedMediaFiles = await prisma.mediaFile.deleteMany({
            where: {
                assessmentId: {
                    not: null
                }
            }
        });
        console.log(`Deleted ${deletedMediaFiles.count} media files`);

        // Disconnect assessments from resources
        await prisma.assessment.updateMany({
            data: {
                resources: {
                    set: []
                }
            }
        });

        // Finally delete all assessments
        const deletedAssessments = await prisma.assessment.deleteMany({});

        res.json({ 
            success: true, 
            message: `Successfully deleted ${deletedAssessments.count} assessments`,
            details: {
                assessments: deletedAssessments.count,
                submissions: deletedSubmissions.count,
                mediaFiles: deletedMediaFiles.count
            }
        });
    } catch (error) {
        console.error('Error deleting all assessments:', error);
        res.status(500).json({ error: 'Failed to delete assessments' });
    }
});

// Get all submissions for an assessment (for teacher grading)
app.get('/api/assessments/:assessmentId/all-submissions', auth, async (req, res) => {
    try {
        // Only allow teachers/admins
        const user = await prisma.user.findUnique({
            where: { id: req.user.userId }
        });
        if (!user || (user.role !== 'TEACHER' && user.role !== 'ADMIN')) {
            return res.status(403).json({ error: 'Not authorized' });
        }

        const { assessmentId } = req.params;
        const submissions = await prisma.assessmentSubmission.findMany({
            where: { assessmentId },
            include: {
                student: {
                    select: { id: true, name: true, nickname: true, class: true }
                }
            },
            orderBy: { submittedAt: 'desc' }
        });
        res.json(submissions);
    } catch (error) {
        console.error('Error fetching all submissions:', error);
        res.status(500).json({ error: 'Failed to fetch submissions' });
    }
});

// Un-enroll from a subject
app.delete('/api/subjects/:subjectId/unenroll', auth, async (req, res) => {
    try {
        const { subjectId } = req.params;
        const userId = req.user.userId;
        // Delete the StudentCourse record for this user and subject
        const result = await prisma.studentCourse.deleteMany({
            where: {
                studentId: userId,
                subjectId: subjectId
            }
        });
        if (result.count > 0) {
            res.json({ success: true, message: 'Un-enrolled from subject.' });
        } else {
            res.status(404).json({ success: false, message: 'Not enrolled in this subject.' });
        }
    } catch (error) {
        console.error('Error un-enrolling from subject:', error);
        res.status(500).json({ success: false, message: 'Failed to un-enroll from subject.' });
    }
});

// Add this endpoint to allow teachers to grade student submissions
app.post('/api/assessments/:assessmentId/grade', auth, async (req, res) => {
    try {
        // Only allow teachers/admins
        const user = await prisma.user.findUnique({
            where: { id: req.user.userId }
        });
        if (!user || (user.role !== 'TEACHER' && user.role !== 'ADMIN')) {
            return res.status(403).json({ error: 'Not authorized' });
        }
        const { assessmentId } = req.params;
        const { studentId, score, comment } = req.body;
        if (!studentId || typeof score !== 'number') {
            return res.status(400).json({ error: 'Missing studentId or score' });
        }
        // Find the latest submission for this student and assessment
        const latestSubmission = await prisma.assessmentSubmission.findFirst({
            where: { assessmentId, studentId },
            orderBy: { submittedAt: 'desc' }
        });
        if (!latestSubmission) {
            return res.status(404).json({ error: 'Submission not found' });
        }
        // Update the score and comment
        const updated = await prisma.assessmentSubmission.update({
            where: { id: latestSubmission.id },
            data: { 
                score,
                comment: comment || null
            }
        });
        res.json({ success: true, submission: updated });
    } catch (error) {
        console.error('Error grading submission:', error);
        res.status(500).json({ error: 'Failed to save grade', details: error.message });
    }
});

// Endpoint to delete a file or audio from a submission
app.post('/api/assessments/submissions/:submissionId/delete-file', auth, async (req, res) => {
    try {
        const { submissionId } = req.params;
        const { fileType, filePath } = req.body;
        if (!fileType || !filePath) return res.status(400).json({ error: 'fileType and filePath are required' });
        // Find the submission
        const submission = await prisma.assessmentSubmission.findUnique({ where: { id: submissionId } });
        if (!submission) return res.status(404).json({ error: 'Submission not found' });
        const answers = submission.answers || {};
        let changed = false;
        // Remove file from disk
        const absPath = path.join(__dirname, filePath.startsWith('/') ? filePath.slice(1) : filePath);
        if (fs.existsSync(absPath)) {
            try { fs.unlinkSync(absPath); } catch (e) { /* ignore */ }
        }
        // Remove from answers
        if (fileType === 'file') {
            if (Array.isArray(answers.file)) {
                answers.file = answers.file.filter(f => f !== filePath);
                changed = true;
            } else if (answers.file === filePath) {
                answers.file = null;
                changed = true;
            }
        } else if (fileType === 'audio') {
            if (Array.isArray(answers.audioFile)) {
                answers.audioFile = answers.audioFile.filter(f => f !== filePath);
                changed = true;
            } else if (answers.audioFile === filePath) {
                answers.audioFile = null;
                changed = true;
            }
        }
        if (changed) {
            await prisma.assessmentSubmission.update({ where: { id: submissionId }, data: { answers } });
        }
        res.json({ success: true });
    } catch (error) {
        console.error('Error deleting submission file:', error);
        res.status(500).json({ error: 'Failed to delete file' });
    }
});

// Endpoint to delete an entire submission and its files
app.delete('/api/assessments/submissions/:submissionId', auth, async (req, res) => {
    try {
        const { submissionId } = req.params;
        const submission = await prisma.assessmentSubmission.findUnique({ where: { id: submissionId } });
        if (!submission) return res.status(404).json({ error: 'Submission not found' });
        const answers = submission.answers || {};
        // Delete all files from disk
        const allFiles = [];
        if (Array.isArray(answers.file)) allFiles.push(...answers.file);
        else if (answers.file) allFiles.push(answers.file);
        if (Array.isArray(answers.audioFile)) allFiles.push(...answers.audioFile);
        else if (answers.audioFile) allFiles.push(answers.audioFile);
        for (const filePath of allFiles) {
            if (typeof filePath === 'string') {
                const absPath = path.join(__dirname, filePath.startsWith('/') ? filePath.slice(1) : filePath);
                if (fs.existsSync(absPath)) {
                    try { fs.unlinkSync(absPath); } catch (e) { /* ignore */ }
                }
            }
        }
        // Delete the submission record
        await prisma.assessmentSubmission.delete({ where: { id: submissionId } });
        res.json({ success: true });
    } catch (error) {
        console.error('Error deleting submission:', error);
        res.status(500).json({ error: 'Failed to delete submission' });
    }
});

// Add this endpoint after /api/teacher/classes
app.post('/api/teacher/update-students-active', auth, async (req, res) => {
    try {
        // Only allow teachers
        const user = await prisma.user.findUnique({ where: { id: req.user.userId } });
        if (!user || user.role !== 'TEACHER') {
            return res.status(403).json({ success: false, error: 'Not authorized' });
        }
        const updates = req.body.updates;
        if (!Array.isArray(updates)) {
            return res.status(400).json({ success: false, error: 'Invalid updates array' });
        }
        let updatedCount = 0;
        for (const update of updates) {
            const [name, nickname] = update.id.split('|');
            // Find the student by name and nickname
            const student = await prisma.user.findFirst({
                where: {
                    name: name,
                    nickname: nickname || undefined,
                    role: 'STUDENT'
                }
            });
            if (student) {
                await prisma.user.update({
                    where: { id: student.id },
                    data: { active: update.active }
                });
                updatedCount++;
            }
        }
        res.json({ success: true, updated: updatedCount });
    } catch (error) {
        console.error('Error updating students active status:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Get user profile with photo
app.get('/api/user/profile', auth, async (req, res) => {
    try {
        const user = await prisma.user.findUnique({
            where: { id: req.user.userId },
            select: {
                id: true,
                name: true,
                nickname: true,
                email: true,
                role: true,
                class: true,
                yearLevel: true,
                profilePicture: true,
                lastLogin: true, // Corrected from lastLoginAt
                studentNumber: true,
                studentCourses: {
                    select: {
                        subject: {
                            select: {
                                id: true,
                                name: true
                            }
                        }
                    }
                }
            }
        });

        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }

        // Remap subjects to a simpler array
        const subjects = user.studentCourses ? user.studentCourses.map(sc => sc.subject) : [];

        // Create a user object to send, excluding the nested studentCourses
        const { studentCourses, ...userProfile } = user;

        // Send a flat user object with subjects
        res.json({ ...userProfile, subjects });

    } catch (error) {
        console.error('Error fetching user profile:', error);
        res.status(500).json({ error: 'Failed to fetch user profile' });
    }
});

// Update student number
app.post('/api/user/update-student-number', auth, async (req, res) => {
    try {
        const { studentNumber } = req.body;
        const userId = req.user.userId;

        // Validate student number
        if (!studentNumber || studentNumber < 10000 || studentNumber > 99999) {
            return res.status(400).json({ error: 'Student number must be a 5-digit number (10000-99999)' });
        }

        // Get current user info to check if they're active
        const currentUser = await prisma.user.findUnique({
            where: { id: userId },
            select: { active: true, role: true }
        });

        if (!currentUser) {
            return res.status(404).json({ error: 'User not found' });
        }

        // Only allow active students to assign student numbers
        if (!currentUser.active || currentUser.role !== 'STUDENT') {
            return res.status(403).json({ error: 'Only active students can assign student numbers' });
        }

        // Check if student number is already taken by another ACTIVE user
        const existingUser = await prisma.user.findFirst({
            where: {
                studentNumber: studentNumber,
                id: { not: userId }, // Exclude current user
                active: true // Only check against active users
            },
            select: { name: true, email: true }
        });

        if (existingUser) {
            return res.status(400).json({ 
                error: `Student number ${studentNumber} is already taken by ${existingUser.name} (${existingUser.email}). Inactive accounts have been cleaned up, so this number should be available.` 
            });
        }

        // Update the user's student number
        const updatedUser = await prisma.user.update({
            where: { id: userId },
            data: { studentNumber: studentNumber },
            select: {
                id: true,
                name: true,
                studentNumber: true
            }
        });

        res.json({ 
            success: true, 
            message: 'Student number updated successfully',
            user: updatedUser
        });
    } catch (error) {
        console.error('Error updating student number:', error);
        res.status(500).json({ error: 'Failed to update student number' });
    }
});

// Upload profile photo
app.post('/api/user/upload-photo', auth, upload.single('photo'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ error: 'No photo uploaded' });
        }

        const userId = req.user.userId;
        const photoPath = `/uploads/resources/${req.file.filename}`;

        // Update user's profile picture
        await prisma.user.update({
            where: { id: userId },
            data: { profilePicture: photoPath }
        });

        res.json({ 
            success: true, 
            photoPath: photoPath,
            message: 'Photo uploaded successfully' 
        });
    } catch (error) {
        console.error('Error uploading photo:', error);
        res.status(500).json({ error: 'Failed to upload photo' });
    }
});

// Get student photos for teacher dashboard
app.get('/api/teacher/students/photos', auth, async (req, res) => {
    try {
        const { class: studentClass } = req.query;

        let students = [];
        // Only fetch students if a specific class is provided
        if (studentClass) {
            students = await prisma.user.findMany({
                where: {
                    role: 'STUDENT',
                    active: true,
                    class: studentClass,
                },
                select: {
                    id: true,
                    name: true,
                    nickname: true,
                    class: true,
                    profilePicture: true,
                    email: true,
                },
                orderBy: {
                    name: 'asc',
                },
            });
        }

        // Get a unique list of all active classes for the filter
        const allStudentClasses = await prisma.user.findMany({
            where: {
                role: 'STUDENT',
                active: true,
                class: {
                    not: null,
                },
            },
            distinct: ['class'],
            select: {
                class: true,
            },
            orderBy: {
                class: 'asc',
            },
        });

        const classes = allStudentClasses.map(s => s.class);

        res.json({ students, classes });

    } catch (error) {
        console.error('Error fetching student photos:', error);
        res.status(500).json({ error: 'Failed to fetch student photos' });
    }
});

// Enhanced teacher students endpoint (for manage students page)
app.get('/api/teacher/students', auth, async (req, res) => {
    try {
        console.log('\n--- [START] /api/teacher/students ---');
        const { quarter: quarterFilter } = req.query;

        const user = await prisma.user.findUnique({
            where: { id: req.user.userId }
        });
        if (!user || user.role !== 'TEACHER') {
            console.log('[ERROR] User is not a teacher.');
            return res.status(403).json({ error: 'Not authorized' });
        }

        // FIX: Remove active: true, add organization filter
        const students = await prisma.user.findMany({
            where: {
                role: 'STUDENT',
                organization: user.organization // Only students from the teacher's org
                // Do NOT filter by active here
            },
            select: {
                id: true,
                name: true,
                nickname: true,
                email: true,
                class: true,
                yearLevel: true,
                active: true,
                profilePicture: true,
                studentNumber: true,
                createdAt: true
            },
            orderBy: { name: 'asc' }
        });
        console.log(`[1] Found ${students.length} students.`);

        const studentIdsMS = students.map(s => s.id);
        if (studentIdsMS.length === 0) {
            console.log('[INFO] No students found, returning empty array.');
            return res.json([]);
        }

        const studentCoursesMS = await prisma.studentCourse.findMany({
            where: { studentId: { in: studentIdsMS } },
            select: { studentId: true, subjectId: true }
        });
        console.log(`[2] Found ${studentCoursesMS.length} student course enrollments.`);

        const studentSubjectMap = studentCoursesMS.reduce((map, sc) => {
            if (!map[sc.studentId]) map[sc.studentId] = [];
            map[sc.studentId].push(sc.subjectId);
            return map;
        }, {});
        if (students.length > 0) {
             console.log(`[3] Student-to-Subject map created. Example for student ${students[0].id}:`, studentSubjectMap[students[0].id]);
        }

        const allSubjectIds = [...new Set(studentCoursesMS.map(sc => sc.subjectId))];
        console.log(`[4] Found ${allSubjectIds.length} unique subject IDs across all students.`);

        const assessments = await prisma.assessment.findMany({
            where: {
                section: { part: { unit: { subjectId: { in: allSubjectIds } } } },
                ...(quarterFilter ? { quarter: quarterFilter } : {})
            },
            include: {
                resources: true,
                section: {
                    select: {
                        part: {
                            select: {
                                unit: {
                                    select: {
                                        subjectId: true
                                    }
                                }
                            }
                        }
                    }
                }
            },
        });
        console.log(`[5] Found ${assessments.length} assessments total for those subjects.`);
        if (assessments.length > 0) {
            console.log('Sample assessment for resource check:', JSON.stringify(assessments[0], null, 2));
        }
        // Only count assessments that are attached to at least one resource
        const attachedAssessments = assessments.filter(a => a.resources && a.resources.length > 0);
        const subjectAssessmentMap = attachedAssessments.reduce((map, a) => {
            const subjectId = a.section?.part?.unit?.subjectId;
            if (subjectId) {
                if (!map[subjectId]) map[subjectId] = [];
                map[subjectId].push(a.id);
                console.log('Mapping assessment', a.id, 'to subject', subjectId);
            }
            return map;
        }, {});
        console.log('allSubjectIds:', allSubjectIds);
        console.log('subjectAssessmentMap keys:', Object.keys(subjectAssessmentMap));
         if (allSubjectIds.length > 0) {
             console.log(`[6] Subject-to-Assessment map created. Example for subject ${allSubjectIds[0]}:`, subjectAssessmentMap[allSubjectIds[0]]?.length || 0, 'assessments');
        }

        // Limit to submissions for the assessments in-scope (quarter + attached only)
        const assessmentIdsInScope = attachedAssessments.map(a => a.id);
        const completedSubmissions = await prisma.assessmentSubmission.findMany({
            where: {
                studentId: { in: studentIdsMS },
                score: { not: null },
                assessmentId: { in: assessmentIdsInScope }
            },
            select: { studentId: true, assessmentId: true, score: true }
        });
        console.log(`[7] Found ${completedSubmissions.length} completed submissions total.`);

        const studentCompletedMap = completedSubmissions.reduce((map, sub) => {
            if (!map[sub.studentId]) map[sub.studentId] = new Set();
            map[sub.studentId].add(sub.assessmentId);
            return map;
        }, {});

        // Calculate best score per assessment for each student
        const studentAssessmentBestScores = {};
        completedSubmissions.forEach(sub => {
            if (!studentAssessmentBestScores[sub.studentId]) studentAssessmentBestScores[sub.studentId] = {};
            if (!studentAssessmentBestScores[sub.studentId][sub.assessmentId]) {
                studentAssessmentBestScores[sub.studentId][sub.assessmentId] = sub.score;
            } else {
                studentAssessmentBestScores[sub.studentId][sub.assessmentId] = Math.max(studentAssessmentBestScores[sub.studentId][sub.assessmentId], sub.score);
            }
        });

        // Calculate average of best scores for each student
        const studentAverageScores = {};
        Object.keys(studentAssessmentBestScores).forEach(studentId => {
            const bestScores = Object.values(studentAssessmentBestScores[studentId]);
            if (bestScores.length > 0) {
                const average = Math.round(bestScores.reduce((sum, score) => sum + score, 0) / bestScores.length);
                studentAverageScores[studentId] = average;
            } else {
                studentAverageScores[studentId] = null;
            }
        });

        const studentsWithProgress = students.map(student => {
            const enrolledSubjectIds = studentSubjectMap[student.id] || [];
            
            const enrolledAssessmentsSet = new Set();
            enrolledSubjectIds.forEach(subjectId => {
                const assessmentIds = subjectAssessmentMap[subjectId] || [];
                assessmentIds.forEach(id => enrolledAssessmentsSet.add(id));
            });

            const totalAssessments = enrolledAssessmentsSet.size;
            const allCompletedForStudent = studentCompletedMap[student.id] || new Set();

            let relevantCompletedCount = 0;
            allCompletedForStudent.forEach(completedId => {
                if (enrolledAssessmentsSet.has(completedId)) {
                    relevantCompletedCount++;
                }
            });
            
            const progressPercent = totalAssessments > 0 
                ? Math.round((relevantCompletedCount / totalAssessments) * 100)
                : 0;
            
            const averageScore = studentAverageScores[student.id] ?? null;
            
            return {
                ...student,
                progressPercent,
                progressCompleted: relevantCompletedCount,
                progressTotal: totalAssessments,
                averageScore
            };
        });

        if (studentsWithProgress.length > 0) {
            console.log('[8] Progress calculation complete. Example for first student:', {
                id: studentsWithProgress[0].id,
                progressPercent: studentsWithProgress[0].progressPercent,
                progressCompleted: studentsWithProgress[0].progressCompleted,
                progressTotal: studentsWithProgress[0].progressTotal,
            });
        }
        
        console.log('--- [END] /api/teacher/students ---');
        res.json(studentsWithProgress);
    } catch (error) {
        console.error('--- [CRITICAL ERROR] /api/teacher/students ---', error);
        res.status(500).json({ error: 'Failed to fetch students' });
    }
});

// Login report endpoint
app.get('/api/teacher/reports/logins', auth, async (req, res) => {
    try {
        // Only allow teachers
        const user = await prisma.user.findUnique({
            where: { id: req.user.userId }
        });
        if (!user || user.role !== 'TEACHER') {
            return res.status(403).json({ error: 'Not authorized' });
        }

        const { subjectId, date, class: classFilter } = req.query;
        
        if (!subjectId) {
            return res.json({ students: [] });
        }

        // 1. Get total number of assessments for the subject
        const assessments = await prisma.assessment.findMany({
            where: {
                section: {
                    part: {
                        unit: {
                            subjectId: subjectId,
                        },
                    },
                },
            },
            include: { resources: true }, // <-- include resources
        });
        // Only count assessments that are attached to at least one resource
        const attachedAssessments = assessments.filter(a => a.resources && a.resources.length > 0);
        const totalAssessments = attachedAssessments.length;
        const assessmentIds = attachedAssessments.map(a => a.id);

        // Get student IDs enrolled in this subject
        const studentCourses = await prisma.studentCourse.findMany({
            where: { subjectId: subjectId },
            select: { studentId: true }
        });

        const studentIds = studentCourses.map(sc => sc.studentId);
        if (studentIds.length === 0) {
            return res.json({ students: [] });
        }

        // Build the where clause for the main user query
        const userWhere = {
            id: { in: studentIds },
            active: true,
        };

        if (classFilter) {
            userWhere.class = classFilter;
        }

        if (date) {
            // This approach is more robust to timezone differences.
            // It finds all logins on a given calendar date regardless of the server/client timezone.
            const localDate = new Date(date);
            const year = localDate.getUTCFullYear();
            const month = localDate.getUTCMonth();
            const day = localDate.getUTCDate();
            
            const startDate = new Date(Date.UTC(year, month, day, 0, 0, 0, 0));
            const endDate = new Date(Date.UTC(year, month, day, 23, 59, 59, 999));

            userWhere.lastLogin = {
                gte: startDate,
                lte: endDate,
            };
        }

        // Get login data for these students
        const loginData = await prisma.user.findMany({
            where: userWhere,
            select: {
                id: true,
                name: true,
                nickname: true,
                class: true,
                email: true,
                lastLogin: true,
                assessmentSubmissions: {
                    where: {
                        assessmentId: { in: assessmentIds },
                        score: { not: null }, // Changed from gte: 100 to not: null
                    },
                    select: {
                        assessmentId: true,
                    },
                },
            },
            orderBy: { name: 'asc' },
        });

        // 3. Calculate progress for each student
        const studentsWithProgress = loginData.map(student => {
            const completedSubmissions = new Set(
                student.assessmentSubmissions.map(s => s.assessmentId)
            );
            const progressCompleted = completedSubmissions.size;
            const progressTotal = totalAssessments;
            const progressPercent =
                progressTotal > 0
                    ? Math.round((progressCompleted / progressTotal) * 100)
                    : 0;

            const { assessmentSubmissions, ...studentData } = student;

            return {
                ...studentData,
                progressCompleted,
                progressTotal,
                progressPercent,
            };
        });

        res.json({ students: studentsWithProgress });
    } catch (error) {
        console.error('Error fetching login report:', error);
        res.status(500).json({ error: 'Failed to fetch login report' });
    }
});

// Get a specific submission for a student (for viewing details including comments)
app.get('/api/student/submission/:submissionId', auth, async (req, res) => {
    try {
        const { submissionId } = req.params;
        const studentId = req.user.userId;

        console.log(`[SUBMISSION DETAILS] Fetching submission ${submissionId} for student ${studentId}`);

        // Get the student's organization first
        const student = await prisma.user.findUnique({
            where: { id: studentId },
            select: { organization: true }
        });

        if (!student) {
            console.error(`[SUBMISSION DETAILS] Student not found: ${studentId}`);
            return res.status(404).json({ error: 'Student not found' });
        }

        console.log(`[SUBMISSION DETAILS] Student organization: ${student.organization}`);

        // Find the submission and ensure it belongs to the requesting student
        const submission = await prisma.assessmentSubmission.findFirst({
            where: {
                id: submissionId,
                studentId: studentId
            },
            include: {
                assessment: {
                    include: {
                        section: {
                            include: {
                                part: {
                                    include: {
                                        unit: {
                                            include: {
                                                subject: true
                                            }
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            }
        });

        console.log(`[SUBMISSION DETAILS] Submission found:`, submission ? 'Yes' : 'No');

        if (!submission) {
            console.log(`[SUBMISSION DETAILS] Submission not found for ID: ${submissionId}`);
            return res.status(404).json({ error: 'Submission not found' });
        }

        // Check if all required relationships exist
        if (!submission.assessment) {
            console.error(`[SUBMISSION DETAILS] Assessment not found for submission ${submissionId}`);
            return res.status(500).json({ error: 'Assessment data is missing' });
        }

        if (!submission.assessment.section) {
            console.error(`[SUBMISSION DETAILS] Section not found for assessment ${submission.assessment.id}`);
            return res.status(500).json({ error: 'Section data is missing' });
        }

        if (!submission.assessment.section.part) {
            console.error(`[SUBMISSION DETAILS] Part not found for section ${submission.assessment.section.id}`);
            return res.status(500).json({ error: 'Part data is missing' });
        }

        if (!submission.assessment.section.part.unit) {
            console.error(`[SUBMISSION DETAILS] Unit not found for part ${submission.assessment.section.part.id}`);
            return res.status(500).json({ error: 'Unit data is missing' });
        }

        if (!submission.assessment.section.part.unit.subject) {
            console.error(`[SUBMISSION DETAILS] Subject not found for unit ${submission.assessment.section.part.unit.id}`);
            return res.status(500).json({ error: 'Subject data is missing' });
        }

        // Validate organization context - ensure the subject belongs to the student's organization
        const subjectOrganization = submission.assessment.section.part.unit.subject.organization;
        console.log(`[SUBMISSION DETAILS] Subject organization: ${subjectOrganization || 'null/undefined'}`);
        
        // Only check organization if both student and subject have organization set
        if (subjectOrganization && student.organization && subjectOrganization !== student.organization) {
            console.error(`[SUBMISSION DETAILS] Organization mismatch: student=${student.organization}, subject=${subjectOrganization}`);
            return res.status(403).json({ error: 'Access denied: submission belongs to different organization' });
        }

        console.log(`[SUBMISSION DETAILS] All relationships found and organization validated, formatting response`);

        // Format the response to match what the frontend expects
        const formattedSubmission = {
            id: submission.id,
            score: submission.score,
            comment: submission.comment,
            submittedAt: submission.submittedAt,
            answers: submission.answers,
            resourceTitle: null, // No longer available since resources relationship was removed
            assessment: {
                title: submission.assessment.title,
                type: submission.assessment.type,
                description: submission.assessment.description,
                subject: submission.assessment.section.part.unit.subject.name,
                unit: submission.assessment.section.part.unit.name,
                part: submission.assessment.section.part.name,
                section: submission.assessment.section.name
            }
        };

        console.log(`[SUBMISSION DETAILS] Response formatted successfully`);
        res.json({ submission: formattedSubmission });
    } catch (error) {
        console.error('[SUBMISSION DETAILS] Error fetching submission details:', error);
        console.error('[SUBMISSION DETAILS] Error stack:', error.stack);
        res.status(500).json({ error: 'Failed to fetch submission details', details: error.message });
    }
});

// Get the currently active quarter
app.get('/api/quarter/active', auth, async (req, res) => {
    try {
        // Only allow teachers/admins
        if (!req.user || !['TEACHER', 'ADMIN'].includes(req.user.role)) {
            return res.status(403).json({ error: 'Not authorized' });
        }
        const activeQuarter = await getActiveQuarter();
        res.json({ activeQuarter });
    } catch (error) {
        res.status(500).json({ error: 'Failed to get active quarter' });
    }
});

// Set the currently active quarter
app.post('/api/quarter/active', auth, async (req, res) => {
    try {
        // Only allow teachers/admins
        if (!req.user || !['TEACHER', 'ADMIN'].includes(req.user.role)) {
            return res.status(403).json({ error: 'Not authorized' });
        }
        const { quarter } = req.body;
        if (!quarter || !['Q1', 'Q2', 'Q3', 'Q4'].includes(quarter)) {
            return res.status(400).json({ error: 'Invalid quarter' });
        }
        await setActiveQuarter(quarter);
        res.json({ success: true, activeQuarter: quarter });
    } catch (error) {
        res.status(500).json({ error: 'Failed to set active quarter' });
    }
});

// WiFi analysis endpoint for teachers
app.get('/api/wifi-analysis', auth, async (req, res) => {
    try {
        // Only allow teachers
        const user = await prisma.user.findUnique({ where: { id: req.user.userId } });
        if (!user || user.role !== 'TEACHER') {
            return res.status(403).json({ error: 'Not authorized' });
        }
        // Get all student sessions in the last 30 days
        const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
        const sessions = await prisma.userSession.findMany({
            where: {
                startTime: { gte: since },
                ipAddress: { not: null },
                user: { role: 'STUDENT' }
            },
            include: { user: { select: { name: true, nickname: true } } }
        });
        // Aggregate by IP
        const ipMap = {};
        sessions.forEach(s => {
            const ip = s.ipAddress || 'Unknown';
            if (!ipMap[ip]) ipMap[ip] = { ipAddress: ip, sessions: 0, studentSet: new Set(), studentNames: [] };
            ipMap[ip].sessions++;
            if (s.user) {
                const displayName = s.user.nickname ? `${s.user.name} (${s.user.nickname})` : s.user.name;
                if (!ipMap[ip].studentSet.has(displayName)) {
                    ipMap[ip].studentSet.add(displayName);
                    ipMap[ip].studentNames.push(displayName);
                }
            }
        });
        // Convert to array and sort by session count
        const result = Object.values(ipMap).map(row => ({
            ipAddress: row.ipAddress,
            sessions: row.sessions,
            uniqueStudents: row.studentSet.size,
            studentNames: row.studentNames
        })).sort((a, b) => b.sessions - a.sessions);
        res.json(result);
    } catch (error) {
        console.error('WiFi analysis error:', error);
        res.status(500).json({ error: 'Failed to analyze WiFi usage' });
    }
});

// Delete a subject by ID (only if it has no content)
app.delete('/api/subjects/:subjectId', auth, async (req, res) => {
    try {
        const { subjectId } = req.params;
        // Only allow admin or teacher
        const user = await prisma.user.findUnique({ where: { id: req.user.userId } });
        if (!user || (user.role !== 'ADMIN' && user.role !== 'TEACHER')) {
            return res.status(403).json({ error: 'Not authorized' });
        }
        // Check for related units, topics, or assessments
        const units = await prisma.unit.findMany({ where: { subjectId } });
        const topics = await prisma.topic.findMany({ where: { subjectId } });
        const assessments = await prisma.assessment.findMany({
            where: {
                section: {
                    part: {
                        unit: {
                            subjectId: subjectId
                        }
                    }
                }
            }
        });
        if (units.length > 0 || topics.length > 0 || assessments.length > 0) {
            return res.status(400).json({ error: 'Cannot delete subject: it still has units, topics, or assessments.' });
        }
        // Delete related StudentCourse and SubjectTeacher records
        await prisma.studentCourse.deleteMany({ where: { subjectId } });
        await prisma.subjectTeacher.deleteMany({ where: { subjectId } });
        // Delete the subject
        await prisma.subject.delete({ where: { id: subjectId } });
        res.json({ success: true, message: 'Subject deleted successfully.' });
    } catch (error) {
        console.error('Error deleting subject:', error);
        if (error.code === 'P2003') {
            res.status(400).json({ error: 'Cannot delete subject: it is still referenced by other records.' });
        } else {
            res.status(500).json({ error: 'Failed to delete subject' });
        }
    }
});

// List students for a class/subject (teacher only)
app.get('/api/teacher/class-students/:subjectId', auth, async (req, res) => {
  try {
    const user = req.user;
    if (user.role !== 'TEACHER') {
      return res.status(403).json({ error: 'Access denied' });
    }
    const subjectId = req.params.subjectId;
    // Get subject and check organization
    const subject = await prisma.subject.findUnique({ where: { id: subjectId } });
    if (!subject) {
      return res.status(404).json({ error: 'Subject not found' });
    }
    if (subject.organization && user.organization && subject.organization !== user.organization) {
      return res.status(403).json({ error: 'Access denied: subject belongs to different organization' });
    }
    // Get students enrolled in this subject
    const studentCourses = await prisma.studentCourse.findMany({
      where: { subjectId },
      select: { studentId: true }
    });
    const studentIds = studentCourses.map(sc => sc.studentId);
    if (studentIds.length === 0) return res.json([]);
    const students = await prisma.user.findMany({
      where: {
        id: { in: studentIds },
        role: 'STUDENT',
        organization: user.organization,
        active: true
      },
      select: {
        id: true,
        nickname: true,
        name: true,
        studentNumber: true,
        class: true,
        active: true
      }
    });
    res.json(students);
  } catch (error) {
    console.error('Error fetching class students:', error);
    res.status(500).json({ error: 'Failed to fetch class students' });
  }
});

// List students for a class (by class name, teacher only)
app.get('/api/teacher/class-students-by-class/:className', auth, async (req, res) => {
  try {
    const user = req.user;
    if (user.role !== 'TEACHER') {
      return res.status(403).json({ error: 'Access denied' });
    }
    const className = decodeURIComponent(req.params.className);
    // Always filter out undefined from orgs array
    const orgs = [user.organization, 'PBS'].filter(Boolean);
    const students = await prisma.user.findMany({
      where: {
        class: className,
        role: 'STUDENT',
        organization: { in: orgs },
        active: true
      },
      select: {
        id: true,
        nickname: true,
        name: true,
        studentNumber: true
      }
    });
    res.json(students);
  } catch (error) {
    console.error('Error fetching class students by class:', error);
    res.status(500).json({ error: 'Failed to fetch class students' });
  }
});

// ... existing code ...
app.get('/api/teacher/class-students-by-class/:className/download', auth, async (req, res) => {
  try {
    const user = req.user;
    if (user.role !== 'TEACHER') {
      return res.status(403).json({ error: 'Access denied' });
    }
    const className = decodeURIComponent(req.params.className);
    const orgs = [user.organization, 'PBS'].filter(Boolean);
    const students = await prisma.user.findMany({
      where: {
        class: className,
        role: 'STUDENT',
        organization: { in: orgs },
        active: true
      },
      select: {
        nickname: true,
        name: true,
        studentNumber: true
      }
    });
    // Convert to CSV
    let csv = 'Nickname,Full Name,Student Number\n';
    students.forEach(s => {
      csv += `"${s.nickname || ''}","${s.name || ''}","${s.studentNumber || ''}"\n`;
    });
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="${className.replace(/[^a-zA-Z0-9]/g, '_')}_students.csv"`);
    res.send(csv);
  } catch (error) {
    console.error('Error downloading class students CSV:', error);
    res.status(500).json({ error: 'Failed to download class students' });
  }
});
// ... existing code ...

// Database export endpoint for teachers
app.post('/api/teacher/export-database', auth, async (req, res) => {
    try {
        console.log('=== EXPORT DEBUG START ===');
        console.log('Export request received');
        console.log('Request body:', req.body);
        console.log('User ID from auth:', req.user.userId);
        
        // Check if user is teacher or admin
        console.log('Looking up user in database...');
        const user = await prisma.user.findUnique({
            where: { id: req.user.userId }
        });

        console.log('User found:', user ? `${user.name} (${user.role})` : 'NOT FOUND');

        if (!user) {
            console.log('ERROR: User not found');
            return res.status(404).json({ error: 'User not found' });
        }

        if (user.role !== 'TEACHER' && user.role !== 'ADMIN') {
            console.log('ERROR: Access denied - user role:', user.role);
            return res.status(403).json({ error: 'Access denied. Teachers and admins only.' });
        }

        const { tables, quarter } = req.body;
        console.log('Tables to export:', tables);
        console.log('Quarter filter:', quarter);

        // Test ExcelJS
        console.log('Loading ExcelJS...');
        const ExcelJS = require('exceljs');
        console.log('ExcelJS loaded successfully');
        
        console.log('Creating workbook...');
        const workbook = new ExcelJS.Workbook();
        workbook.creator = 'LMS System';
        workbook.lastModifiedBy = user.name;
        workbook.created = new Date();
        workbook.modified = new Date();
        
        console.log('Workbook created successfully');

        // Helper function to add worksheet
        function addWorksheet(name, data, headers) {
            console.log(`Adding worksheet: ${name} with ${data.length} rows`);
            try {
                const worksheet = workbook.addWorksheet(name);
                console.log(`Worksheet "${name}" created`);
                
                // Add headers
                console.log(`Adding headers: ${headers.join(', ')}`);
                worksheet.addRow(headers);
                worksheet.getRow(1).font = { bold: true };
                worksheet.getRow(1).fill = {
                    type: 'pattern',
                    pattern: 'solid',
                    fgColor: { argb: 'FFE0E0E0' }
                };
                console.log('Headers added and styled');

                // Add data
                if (data && data.length > 0) {
                    console.log(`Processing ${data.length} rows of data...`);
                    data.forEach((row, index) => {
                        const excelRow = [];
                        headers.forEach(header => {
                            const value = row[header] || '';
                            // Handle special data types
                            if (value && typeof value === 'object') {
                                excelRow.push(JSON.stringify(value));
                            } else if (value instanceof Date) {
                                excelRow.push(value.toISOString());
                            } else {
                                excelRow.push(value);
                            }
                        });
                        worksheet.addRow(excelRow);
                        if (index % 10 === 0) console.log(`Processed ${index + 1} rows...`);
                    });
                    console.log('All data rows added');
                } else {
                    console.log('No data to add');
                }

                // Auto-fit columns
                console.log('Auto-fitting columns...');
                worksheet.columns.forEach(column => {
                    const headerLength = column.header ? column.header.length : 10;
                    column.width = Math.max(15, Math.min(50, headerLength + 5));
                });
                console.log('Columns auto-fitted');
            } catch (error) {
                console.error(`Error in addWorksheet for ${name}:`, error);
                throw error;
            }
        }

        // Student Performance Dashboard Export
        console.log('Starting Student Performance Dashboard export...');
        
        try {
            console.log('Querying students and their data...');
            
            // Get all students with their enrollments, progress, and submissions
            const students = await prisma.user.findMany({
                where: { role: 'STUDENT' },
                include: {
                    studentCourses: {
                        include: {
                            subject: true
                        }
                    },
                    assessmentSubmissions: {
                        include: {
                            assessment: {
                                include: {
                                    section: {
                                        include: {
                                            part: {
                                                include: {
                                                    unit: {
                                                        include: {
                                                            subject: true
                                                        }
                                                    }
                                                }
                                            }
                                        }
                                    }
                                }
                            }
                        }
                    },
                    studentProgress: {
                        include: {
                            subject: true,
                            topic: true
                        }
                    },
                    sessions: {
                        orderBy: {
                            startTime: 'desc'
                        }
                    }
                },
                orderBy: { name: 'asc' }
            });
            
            console.log(`Found ${students.length} students`);
            
            // Create comprehensive student performance data
            console.log('Creating student performance dashboard...');
            const studentPerformanceData = students.map(student => {
                // Calculate performance metrics
                // Count unique assessments instead of all submissions
                const uniqueAssessments = new Set(student.assessmentSubmissions.map(sub => sub.assessmentId)).size;
                const completedUniqueAssessments = new Set(
                    student.assessmentSubmissions
                        .filter(sub => sub.score !== null)
                        .map(sub => sub.assessmentId)
                ).size;
                const averageScore = student.assessmentSubmissions.length > 0 
                    ? (student.assessmentSubmissions.reduce((sum, sub) => sum + (sub.score || 0), 0) / student.assessmentSubmissions.length).toFixed(2)
                    : 0;
                
                const enrolledSubjects = student.studentCourses.length;
                const activeSubjects = student.studentCourses.filter(course => course.status === 'ACTIVE').length;
                
                // Calculate overall progress
                const totalProgress = student.studentProgress.length;
                const completedProgress = student.studentProgress.filter(p => p.status === 'COMPLETED').length;
                const progressPercentage = totalProgress > 0 ? ((completedProgress / totalProgress) * 100).toFixed(1) : 0;
                
                // Get subject list
                const subjectList = student.studentCourses.map(course => course.subject.name).join(', ');
                
                // Get recent activity
                const lastSubmission = student.assessmentSubmissions
                    .sort((a, b) => new Date(b.submittedAt) - new Date(a.submittedAt))[0];
                const lastActivity = lastSubmission ? new Date(lastSubmission.submittedAt).toLocaleDateString() : 'No activity';
                
                return {
                    'Student ID': student.id,
                    'Student Name': student.name,
                    'Email': student.email,
                    'Organization': student.organization,
                    'Student Number': student.studentNumber,
                    'Year Level': student.yearLevel,
                    'Class': student.class,
                    'Enrolled Subjects': enrolledSubjects,
                    'Active Subjects': activeSubjects,
                    'Subject List': subjectList,
                    'Unique Assessments': uniqueAssessments,
                    'Completed Unique Assessments': completedUniqueAssessments,
                    'Completion Rate (%)': uniqueAssessments > 0 ? ((completedUniqueAssessments / uniqueAssessments) * 100).toFixed(1) : 0,
                    'Average Score (%)': averageScore,
                    'Progress Items': totalProgress,
                    'Completed Progress': completedProgress,
                    'Overall Progress (%)': progressPercentage,
                    'Last Activity': lastActivity,
                    'Active': student.active ? 'Yes' : 'No',
                    'Last Login': student.lastLogin ? new Date(student.lastLogin).toLocaleDateString() : 'Never'
                };
            });
            
            console.log('Student performance data created successfully');

            console.log('Adding Student Performance Dashboard worksheet...');
            addWorksheet('Student Performance Dashboard', studentPerformanceData, [
                'Student ID', 'Student Name', 'Email', 'Organization', 'Student Number', 
                'Year Level', 'Class', 'Enrolled Subjects', 'Active Subjects', 'Subject List',
                'Unique Assessments', 'Completed Unique Assessments', 'Completion Rate (%)', 'Average Score (%)',
                'Progress Items', 'Completed Progress', 'Overall Progress (%)', 'Last Activity',
                'Active', 'Last Login'
            ]);
            
            // Create Login vs Activity Analysis
            console.log('Creating login vs activity analysis...');
            const loginActivityData = students.map(student => {
                const lastLogin = student.lastLogin ? new Date(student.lastLogin) : null;
                const lastSubmission = student.assessmentSubmissions
                    .sort((a, b) => new Date(b.submittedAt) - new Date(a.submittedAt))[0];
                const lastActivity = lastSubmission ? new Date(lastSubmission.submittedAt) : null;
                
                // Calculate days since last login and activity
                const now = new Date();
                const daysSinceLogin = lastLogin ? Math.floor((now - lastLogin) / (1000 * 60 * 60 * 24)) : 'Never';
                const daysSinceActivity = lastActivity ? Math.floor((now - lastActivity) / (1000 * 60 * 60 * 24)) : 'Never';
                
                // Determine engagement pattern
                let engagementPattern = 'Unknown';
                if (lastLogin && lastActivity) {
                    const loginTime = lastLogin.getTime();
                    const activityTime = lastActivity.getTime();
                    
                    if (activityTime > loginTime) {
                        // Activity after login - good engagement
                        engagementPattern = 'Active Learner';
                    } else if (loginTime > activityTime) {
                        // Login after activity - might be checking grades
                        engagementPattern = 'Grade Checker';
                    } else {
                        // Same day - good engagement
                        engagementPattern = 'Active Learner';
                    }
                } else if (lastLogin && !lastActivity) {
                    engagementPattern = 'Login Only - No Submissions';
                } else if (!lastLogin && lastActivity) {
                    engagementPattern = 'Activity Only - No Recent Login';
                } else {
                    engagementPattern = 'Inactive';
                }
                
                // Calculate login-to-activity ratio
                // Count distinct login days instead of all sessions
                const loginDays = student.sessions ? 
                    new Set(student.sessions.map(s => new Date(s.startTime).toDateString())).size : 0;
                const totalSubmissions = student.assessmentSubmissions.length;
                const loginToSubmissionRatio = loginDays > 0 ? (totalSubmissions / loginDays).toFixed(2) : '0';
                
                return {
                    'Student ID': student.id,
                    'Student Name': student.name,
                    'Email': student.email,
                    'Organization': student.organization,
                    'Last Login Date': lastLogin ? lastLogin.toLocaleDateString() : 'Never',
                    'Days Since Last Login': daysSinceLogin,
                    'Last Activity Date': lastActivity ? lastActivity.toLocaleDateString() : 'Never',
                    'Days Since Last Activity': daysSinceActivity,
                    'Login Days': loginDays,
                    'Total Submissions': totalSubmissions,
                    'Submissions per Login Day': loginToSubmissionRatio,
                    'Engagement Pattern': engagementPattern,
                    'Active': student.active ? 'Yes' : 'No'
                };
            });
            
            addWorksheet('Login vs Activity Analysis', loginActivityData, [
                'Student ID', 'Student Name', 'Email', 'Organization', 'Last Login Date', 
                'Days Since Last Login', 'Last Activity Date', 'Days Since Last Activity',
                'Login Days', 'Total Submissions', 'Submissions per Login Day', 
                'Engagement Pattern', 'Active'
            ]);
            
            // Create summary statistics
            console.log('Creating summary statistics...');
            const totalStudents = students.length;
            const activeStudents = students.filter(s => s.active).length;
            const avgCompletionRate = studentPerformanceData.reduce((sum, s) => sum + parseFloat(s['Completion Rate (%)']), 0) / totalStudents;
            const avgScore = studentPerformanceData.reduce((sum, s) => sum + parseFloat(s['Average Score (%)']), 0) / totalStudents;
            const avgProgress = studentPerformanceData.reduce((sum, s) => sum + parseFloat(s['Overall Progress (%)']), 0) / totalStudents;
            
            // Calculate engagement metrics
            const loginOnlyStudents = loginActivityData.filter(s => s['Engagement Pattern'] === 'Login Only - No Submissions').length;
            const activeLearners = loginActivityData.filter(s => s['Engagement Pattern'] === 'Active Learner').length;
            const inactiveStudents = loginActivityData.filter(s => s['Engagement Pattern'] === 'Inactive').length;
            
            const summaryData = [
                {
                    'Metric': 'Total Students',
                    'Value': totalStudents,
                    'Description': 'Total number of students in the system'
                },
                {
                    'Metric': 'Active Students',
                    'Value': activeStudents,
                    'Description': 'Students with active accounts'
                },
                {
                    'Metric': 'Active Learners',
                    'Value': activeLearners,
                    'Description': 'Students who login and submit assessments'
                },
                {
                    'Metric': 'Login Only (No Submissions)',
                    'Value': loginOnlyStudents,
                    'Description': 'Students who login but don\'t submit assessments'
                },
                {
                    'Metric': 'Inactive Students',
                    'Value': inactiveStudents,
                    'Description': 'Students with no recent login or activity'
                },
                {
                    'Metric': 'Average Completion Rate',
                    'Value': avgCompletionRate.toFixed(1) + '%',
                    'Description': 'Average assessment completion rate across all students'
                },
                {
                    'Metric': 'Average Score',
                    'Value': avgScore.toFixed(1) + '%',
                    'Description': 'Average assessment score across all students'
                },
                {
                    'Metric': 'Average Progress',
                    'Value': avgProgress.toFixed(1) + '%',
                    'Description': 'Average overall progress across all students'
                }
            ];
            
            addWorksheet('Summary Statistics', summaryData, [
                'Metric', 'Value', 'Description'
            ]);
            
            // Export comprehensive data based on selected tables
            console.log('Adding comprehensive data export...');
            
            // Export Users
            if (tables.includes('users')) {
                console.log('Exporting users...');
                const users = await prisma.user.findMany({
                    include: {
                        studentCourses: {
                            include: { subject: true }
                        },
                        subjectTeacher: {
                            include: { subject: true }
                        }
                    },
                    orderBy: { name: 'asc' }
                });
                
                const usersData = users.map(user => ({
                    'User ID': user.id,
                    'Name': user.name,
                    'Email': user.email,
                    'Role': user.role,
                    'Organization': user.organization,
                    'Student Number': user.studentNumber,
                    'Year Level': user.yearLevel,
                    'Class': user.class,
                    'Active': user.active ? 'Yes' : 'No',
                    'Last Login': user.lastLogin ? user.lastLogin.toISOString() : 'Never',
                    'Created At': user.createdAt.toISOString(),
                    'Updated At': user.updatedAt.toISOString(),
                    'Enrolled Subjects': user.studentCourses?.map(sc => sc.subject.name).join(', ') || 'N/A',
                    'Teaching Subjects': user.subjectTeacher?.map(st => st.subject.name).join(', ') || 'N/A'
                }));
                
                addWorksheet('Users', usersData, [
                    'User ID', 'Name', 'Email', 'Role', 'Organization', 'Student Number', 'Year Level', 'Class',
                    'Active', 'Last Login', 'Created At', 'Updated At', 'Enrolled Subjects', 'Teaching Subjects'
                ]);
            }
            
            // Export Subjects
            if (tables.includes('subjects')) {
                try {
                    console.log('Exporting subjects...');
                    console.log('Starting subject query...');
                    const subjects = await prisma.subject.findMany({
                        include: {
                            units: {
                                include: {
                                    parts: {
                                        include: {
                                            sections: {
                                                include: {
                                                    assessments: true,
                                                    resources: true
                                                }
                                            }
                                        }
                                    }
                                }
                            },
                            studentCourses: {
                                include: { student: true }
                            },
                            teachers: {
                                include: { teacher: true }
                            },
                            topics: true
                        },
                        orderBy: { name: 'asc' }
                    });
                
                console.log(`Found ${subjects.length} subjects`);
                if (subjects.length > 0) {
                    console.log('Sample subject structure:', JSON.stringify(subjects[0], null, 2));
                } else {
                    console.log('No subjects found in database!');
                }
                
                console.log('Processing subjects data...');
                const subjectsData = subjects.map((subject, index) => {
                    console.log(`Processing subject ${index + 1}/${subjects.length}: ${subject.name}`);
                    console.log(`Subject ${subject.name} has:`, {
                        units: subject.units?.length || 0,
                        topics: subject.topics?.length || 0,
                        studentCourses: subject.studentCourses?.length || 0,
                        teachers: subject.teachers?.length || 0
                    });
                    
                    return {
                    'Subject ID': subject.id,
                    'Name': subject.name,
                    'Description': subject.description || '',
                    'Year Level': subject.yearLevel,
                    'Units Count': subject.units?.length || 0,
                    'Total Parts': subject.units?.reduce((sum, unit) => sum + (unit.parts?.length || 0), 0) || 0,
                    'Total Sections': subject.units?.reduce((sum, unit) => 
                        sum + (unit.parts?.reduce((partSum, part) => partSum + (part.sections?.length || 0), 0) || 0), 0) || 0,
                    'Total Topics': subject.topics?.length || 0,
                    'Total Assessments': subject.units?.reduce((sum, unit) => 
                        sum + (unit.parts?.reduce((partSum, part) => 
                            partSum + (part.sections?.reduce((sectionSum, section) => sectionSum + (section.assessments?.length || 0), 0) || 0), 0) || 0), 0) || 0,
                    'Total Resources': subject.units?.reduce((sum, unit) => 
                        sum + (unit.parts?.reduce((partSum, part) => 
                            partSum + (part.sections?.reduce((sectionSum, section) => sectionSum + (section.resources?.length || 0), 0) || 0), 0) || 0), 0) || 0,
                    'Enrolled Students': subject.studentCourses?.length || 0,
                    'Assigned Teachers': subject.teachers?.length || 0,
                    'Created At': subject.createdAt.toISOString(),
                    'Updated At': subject.updatedAt.toISOString()
                    };
                });
                
                console.log(`Successfully processed ${subjectsData.length} subjects`);
                
                addWorksheet('Subjects', subjectsData, [
                    'Subject ID', 'Name', 'Description', 'Year Level', 'Units Count', 'Total Parts', 'Total Sections',
                    'Total Topics', 'Total Assessments', 'Total Resources', 'Enrolled Students', 'Assigned Teachers',
                    'Created At', 'Updated At'
                ]);
                console.log('Subjects export completed successfully');
                } catch (error) {
                    console.error('Error in subjects export:', error);
                    console.error('Error stack:', error.stack);
                    throw error;
                }
            }
            
            // Export Course Structure
            if (tables.includes('course-structure')) {
                console.log('Exporting course structure...');
                const units = await prisma.unit.findMany({
                    include: {
                        subject: true,
                        parts: {
                            include: {
                                sections: {
                                    include: {
                                        topics: true,
                                        assessments: true,
                                        resources: true
                                    }
                                }
                            }
                        }
                    },
                    orderBy: { name: 'asc' }
                });
                
                const courseStructureData = [];
                units.forEach(unit => {
                    unit.parts.forEach(part => {
                        part.sections.forEach(section => {
                            courseStructureData.push({
                                'Subject': unit.subject.name,
                                'Unit': unit.name,
                                'Part': part.name,
                                'Section': section.name,
                                'Topics Count': section.topics.length,
                                'Assessments Count': section.assessments.length,
                                'Resources Count': section.resources.length,
                                'Unit Order': unit.order,
                                'Part Order': part.order,
                                'Section Order': section.order
                            });
                        });
                    });
                });
                
                addWorksheet('Course Structure', courseStructureData, [
                    'Subject', 'Unit', 'Part', 'Section', 'Topics Count', 'Assessments Count', 'Resources Count',
                    'Unit Order', 'Part Order', 'Section Order'
                ]);
            }
            
            // Export Resources (all quarters or filtered)
            if (tables.includes('resources')) {
                console.log('Exporting resources...');
                const resourcesQuery = {
                    include: {
                        createdBy: true,
                        topic: true,
                        unit: true,
                        part: true,
                        section: true,
                        assessments: true
                    },
                    orderBy: { createdAt: 'desc' }
                };
                
                if (quarter) {
                    resourcesQuery.where = { quarter: quarter };
                }
                
                const resources = await prisma.resource.findMany(resourcesQuery);
                
                const resourcesData = resources.map(resource => ({
                    'Resource ID': resource.id,
                    'Title': resource.title,
                    'Description': resource.description,
                    'Type': resource.type,
                    'Quarter': resource.quarter,
                    'URL': resource.url,
                    'File Path': resource.filePath,
                    'Created By': resource.createdBy.name,
                    'Topic': resource.topic?.name || 'N/A',
                    'Unit': resource.unit?.name || 'N/A',
                    'Part': resource.part?.name || 'N/A',
                    'Section': resource.section?.name || 'N/A',
                    'Usage Count': resource.usageCount,
                    'Created At': resource.createdAt.toISOString(),
                    'Updated At': resource.updatedAt.toISOString(),
                    'Linked Assessments': resource.assessments.length
                }));
                
                const quarterSuffix = quarter ? `_${quarter}` : '_AllQuarters';
                addWorksheet(`Resources${quarterSuffix}`, resourcesData, [
                    'Resource ID', 'Title', 'Description', 'Type', 'Quarter', 'URL', 'File Path',
                    'Created By', 'Topic', 'Unit', 'Part', 'Section', 'Usage Count', 'Created At', 'Updated At', 'Linked Assessments'
                ]);
            }
            
            // Export Assessments (all quarters or filtered)
            if (tables.includes('assessments')) {
                console.log('Exporting assessments...');
                const assessmentsQuery = {
                    include: {
                        createdBy: true,
                        section: {
                            include: {
                                part: {
                                    include: {
                                        unit: {
                                            include: {
                                                subject: true
                                            }
                                        }
                                    }
                                }
                            }
                        },
                        mediaFiles: true,
                        resources: true
                    },
                    orderBy: { createdAt: 'desc' }
                };
                
                if (quarter) {
                    assessmentsQuery.where = { quarter: quarter };
                }
                
                const assessments = await prisma.assessment.findMany(assessmentsQuery);
                
                const assessmentsData = assessments.map(assessment => ({
                    'Assessment ID': assessment.id,
                    'Title': assessment.title,
                    'Description': assessment.description,
                    'Type': assessment.type,
                    'Category': assessment.category,
                    'Quarter': assessment.quarter,
                    'Published': assessment.published ? 'Yes' : 'No',
                    'Due Date': assessment.dueDate ? assessment.dueDate.toISOString() : 'N/A',
                    'Created By': assessment.createdBy.name,
                    'Subject': assessment.section?.part?.unit?.subject?.name || 'N/A',
                    'Unit': assessment.section?.part?.unit?.name || 'N/A',
                    'Part': assessment.section?.part?.name || 'N/A',
                    'Section': assessment.section?.name || 'N/A',
                    'Questions Count': assessment.questions ? assessment.questions.length : 0,
                    'Media Files': assessment.mediaFiles.length,
                    'Linked Resources': assessment.resources.length,
                    'Created At': assessment.createdAt.toISOString(),
                    'Updated At': assessment.updatedAt.toISOString()
                }));
                
                const quarterSuffix = quarter ? `_${quarter}` : '_AllQuarters';
                addWorksheet(`Assessments${quarterSuffix}`, assessmentsData, [
                    'Assessment ID', 'Title', 'Description', 'Type', 'Category', 'Quarter', 'Published', 'Due Date',
                    'Created By', 'Subject', 'Unit', 'Part', 'Section', 'Questions Count', 'Media Files', 'Linked Resources', 'Created At', 'Updated At'
                ]);
            }
            
            // Export Submissions (all quarters or filtered)
            if (tables.includes('submissions')) {
                console.log('Exporting submissions...');
                const submissionsQuery = {
                    include: {
                        student: true,
                        assessment: {
                            include: {
                                section: {
                                    include: {
                                        part: {
                                            include: {
                                                unit: {
                                                    include: {
                                                        subject: true
                                                    }
                                                }
                                            }
                                        }
                                    }
                                }
                            }
                        }
                    },
                    orderBy: { submittedAt: 'desc' }
                };
                
                if (quarter) {
                    submissionsQuery.where = {
                        assessment: {
                            quarter: quarter
                        }
                    };
                }
                
                const submissions = await prisma.assessmentSubmission.findMany(submissionsQuery);
                
                // Calculate attempt numbers for each submission
                const submissionsWithAttempts = await Promise.all(submissions.map(async (submission) => {
                    // Count how many submissions this student has made for this assessment up to this submission
                    const attemptNumber = await prisma.assessmentSubmission.count({
                        where: {
                            studentId: submission.studentId,
                            assessmentId: submission.assessmentId,
                            submittedAt: {
                                lte: submission.submittedAt
                            }
                        }
                    });
                    
                    return {
                        ...submission,
                        calculatedAttempts: attemptNumber
                    };
                }));

                const submissionsData = submissionsWithAttempts.map(submission => ({
                    'Submission ID': submission.id,
                    'Student ID': submission.student.id,
                    'Student Name': submission.student.name,
                    'Student Email': submission.student.email,
                    'Assessment ID': submission.assessment.id,
                    'Assessment Title': submission.assessment.title,
                    'Assessment Type': submission.assessment.type,
                    'Assessment Quarter': submission.assessment.quarter,
                    'Score': submission.score,
                    'Attempts': submission.calculatedAttempts || 1,
                    'Total Time': submission.totalTime,
                    'Status': submission.status,
                    'Subject': submission.assessment.section?.part?.unit?.subject?.name || 'N/A',
                    'Unit': submission.assessment.section?.part?.unit?.name || 'N/A',
                    'Part': submission.assessment.section?.part?.name || 'N/A',
                    'Section': submission.assessment.section?.name || 'N/A',
                    'Submitted At': submission.submittedAt ? submission.submittedAt.toISOString() : 'N/A',
                    'Updated At': submission.updatedAt ? submission.updatedAt.toISOString() : 'N/A'
                }));
                
                const quarterSuffix = quarter ? `_${quarter}` : '_AllQuarters';
                addWorksheet(`Submissions${quarterSuffix}`, submissionsData, [
                    'Submission ID', 'Student ID', 'Student Name', 'Student Email', 'Assessment ID', 'Assessment Title', 'Assessment Type', 'Assessment Quarter',
                    'Score', 'Attempts', 'Total Time', 'Status', 'Subject', 'Unit', 'Part', 'Section', 'Submitted At', 'Updated At'
                ]);
            }
            
            // Export Progress
            if (tables.includes('progress')) {
                console.log('Exporting progress...');
                const progress = await prisma.studentProgress.findMany({
                    include: {
                        student: true,
                        subject: true,
                        topic: true
                    },
                    orderBy: { lastUpdated: 'desc' }
                });
                
                const progressData = progress.map(p => ({
                    'Progress ID': p.id,
                    'Student ID': p.student.id,
                    'Student Name': p.student.name,
                    'Subject': p.subject.name,
                    'Skill Category': p.skillCategory || p.topic?.name || 'N/A',
                    'Topic': p.topic?.name || 'N/A',
                    'Status': p.status,
                    'Score': p.score,
                    'Last Updated': p.lastUpdated ? p.lastUpdated.toISOString() : 'N/A',
                    'Created At': p.createdAt ? p.createdAt.toISOString() : 'N/A',
                    'Updated At': p.updatedAt ? p.updatedAt.toISOString() : 'N/A'
                }));
                
                addWorksheet('Progress', progressData, [
                    'Progress ID', 'Student ID', 'Student Name', 'Subject', 'Skill Category', 'Topic', 'Status', 'Score', 'Last Updated', 'Created At', 'Updated At'
                ]);
            }
            
            // Export Student Courses
            if (tables.includes('student-courses')) {
                console.log('Exporting student courses...');
                const studentCourses = await prisma.studentCourse.findMany({
                    include: {
                        student: true,
                        subject: true
                    },
                    orderBy: { createdAt: 'desc' }
                });
                
                const studentCoursesData = studentCourses.map(sc => ({
                    'Enrollment ID': sc.id,
                    'Student ID': sc.student.id,
                    'Student Name': sc.student.name,
                    'Student Email': sc.student.email,
                    'Subject ID': sc.subject.id,
                    'Subject Name': sc.subject.name,
                    'Created At': sc.createdAt.toISOString(),
                    'Updated At': sc.updatedAt.toISOString()
                }));
                
                addWorksheet('Student Courses', studentCoursesData, [
                    'Enrollment ID', 'Student ID', 'Student Name', 'Student Email', 'Subject ID', 'Subject Name', 'Created At', 'Updated At'
                ]);
            }
            
            // Export Teacher Assignments
            if (tables.includes('teacher-assignments')) {
                console.log('Exporting teacher assignments...');
                const teacherAssignments = await prisma.subjectTeacher.findMany({
                    include: {
                        teacher: true,
                        subject: true
                    },
                    orderBy: { createdAt: 'desc' }
                });
                
                const teacherAssignmentsData = teacherAssignments.map(ta => ({
                    'Assignment ID': ta.id,
                    'Teacher ID': ta.teacher.id,
                    'Teacher Name': ta.teacher.name,
                    'Teacher Email': ta.teacher.email,
                    'Subject ID': ta.subject.id,
                    'Subject Name': ta.subject.name,
                    'Created At': ta.createdAt.toISOString(),
                    'Updated At': ta.updatedAt.toISOString()
                }));
                
                addWorksheet('Teacher Assignments', teacherAssignmentsData, [
                    'Assignment ID', 'Teacher ID', 'Teacher Name', 'Teacher Email', 'Subject ID', 'Subject Name', 'Created At', 'Updated At'
                ]);
            }
            
            // Export Weekly Schedules
            if (tables.includes('weekly-schedules')) {
                console.log('Exporting weekly schedules...');
                const weeklySchedules = await prisma.weeklySchedule.findMany({
                    include: {
                        subject: true,
                        assessments: true,
                        resources: true
                    },
                    orderBy: { weekNumber: 'asc' }
                });
                
                const weeklySchedulesData = weeklySchedules.map(ws => ({
                    'Schedule ID': ws.id,
                    'Week Number': ws.weekNumber,
                    'Start Date': ws.startDate.toISOString(),
                    'End Date': ws.endDate.toISOString(),
                    'Objectives': ws.objectives,
                    'Subject': ws.subject.name,
                    'Assessments Count': ws.assessments.length,
                    'Resources Count': ws.resources.length,
                    'Created At': ws.createdAt.toISOString(),
                    'Updated At': ws.updatedAt.toISOString()
                }));
                
                addWorksheet('Weekly Schedules', weeklySchedulesData, [
                    'Schedule ID', 'Week Number', 'Start Date', 'End Date', 'Objectives', 'Subject', 'Assessments Count', 'Resources Count', 'Created At', 'Updated At'
                ]);
            }
            
            // Export User Sessions
            if (tables.includes('user-sessions')) {
                console.log('Exporting user sessions...');
                const sessions = await prisma.userSession.findMany({
                    include: {
                        user: true
                    },
                    orderBy: { startTime: 'desc' }
                });
                
                const sessionsData = sessions.map(session => ({
                    'Session ID': session.id,
                    'User ID': session.user.id,
                    'User Name': session.user.name,
                    'User Email': session.user.email,
                    'Start Time': session.startTime.toISOString(),
                    'End Time': session.endTime ? session.endTime.toISOString() : 'Active',
                    'Duration (minutes)': session.endTime ? 
                        Math.round((new Date(session.endTime) - new Date(session.startTime)) / (1000 * 60)) : 'N/A',
                    'IP Address': session.ipAddress,
                    'User Agent': session.userAgent,
                    'Created At': session.createdAt.toISOString()
                }));
                
                addWorksheet('User Sessions', sessionsData, [
                    'Session ID', 'User ID', 'User Name', 'User Email', 'Start Time', 'End Time', 'Duration (minutes)', 'IP Address', 'User Agent', 'Created At'
                ]);
            }
            
            // Export Resource Usage
            if (tables.includes('resource-usage')) {
                console.log('Exporting resource usage...');
                const resourceUsage = await prisma.resourceUsage.findMany({
                    include: {
                        user: true,
                        resource: true
                    },
                    orderBy: { usedAt: 'desc' }
                });
                
                const resourceUsageData = resourceUsage.map(ru => ({
                    'Usage ID': ru.id,
                    'User ID': ru.user.id,
                    'User Name': ru.user.name,
                    'Resource ID': ru.resource.id,
                    'Resource Title': ru.resource.title,
                    'Accessed At': ru.usedAt.toISOString(),
                    'Duration (seconds)': ru.duration,
                    'Created At': ru.createdAt.toISOString()
                }));
                
                addWorksheet('Resource Usage', resourceUsageData, [
                    'Usage ID', 'User ID', 'User Name', 'Resource ID', 'Resource Title', 'Accessed At', 'Duration (seconds)', 'Created At'
                ]);
            }
            
            // Export Media Files
            if (tables.includes('media-files')) {
                console.log('Exporting media files...');
                const mediaFiles = await prisma.mediaFile.findMany({
                    include: {
                        assessment: true
                    },
                    orderBy: { createdAt: 'desc' }
                });
                
                const mediaFilesData = mediaFiles.map(mf => ({
                    'Media File ID': mf.id,
                    'File Path': mf.filePath,
                    'Type': mf.type,
                    'Label': mf.label,
                    'Assessment ID': mf.assessmentId,
                    'Assessment Title': mf.assessment?.title || 'N/A',
                    'Created At': mf.createdAt.toISOString()
                }));
                
                addWorksheet('Media Files', mediaFilesData, [
                    'Media File ID', 'File Path', 'Type', 'Label', 'Assessment ID', 'Assessment Title', 'Created At'
                ]);
            }
            
            // Export Transfer Logs
            if (tables.includes('transfer-logs')) {
                console.log('Exporting transfer logs...');
                const transferLogs = await prisma.teacherTransferLog.findMany({
                    orderBy: { transferredAt: 'desc' }
                });
                
                const transferLogsData = transferLogs.map(tl => ({
                    'Transfer ID': tl.id,
                    'From Teacher ID': tl.fromTeacherId,
                    'To Teacher ID': tl.toTeacherId,
                    'Subject IDs': tl.subjectIds,
                    'Transferred At': tl.transferredAt.toISOString(),
                    'Reason': tl.reason || 'N/A',
                    'Created At': tl.createdAt.toISOString()
                }));
                
                addWorksheet('Transfer Logs', transferLogsData, [
                    'Transfer ID', 'From Teacher ID', 'To Teacher ID', 'Subject IDs', 'Transferred At', 'Reason', 'Created At'
                ]);
            }
            
            // Export Configuration
            if (tables.includes('config')) {
                console.log('Exporting configuration...');
                const config = await prisma.config.findMany({
                    orderBy: { key: 'asc' }
                });
                
                const configData = config.map(c => ({
                    'Config ID': c.id,
                    'Key': c.key,
                    'Value': c.value,
                    'Description': c.description || 'N/A',
                    'Created At': c.createdAt.toISOString(),
                    'Updated At': c.updatedAt.toISOString()
                }));
                
                addWorksheet('Configuration', configData, [
                    'Config ID', 'Key', 'Value', 'Description', 'Created At', 'Updated At'
                ]);
            }
            
            // Export Quarter-Specific Data (if no specific quarter selected, export all quarters)
            if (!quarter) {
                console.log('Exporting quarter-specific data for all quarters...');
                const quarters = ['Q1', 'Q2', 'Q3', 'Q4'];
                
                for (const q of quarters) {
                    console.log(`Exporting data for ${q}...`);
                    
                    // Q1 Resources
                    const qResources = await prisma.resource.findMany({
                        where: { quarter: q },
                        include: {
                            createdBy: true,
                            topic: true,
                            unit: true,
                            part: true,
                            section: true,
                            assessments: true
                        },
                        orderBy: { createdAt: 'desc' }
                    });
                    
                    if (qResources.length > 0) {
                        const qResourcesData = qResources.map(resource => ({
                            'Resource ID': resource.id,
                            'Title': resource.title,
                            'Description': resource.description,
                            'Type': resource.type,
                            'Quarter': resource.quarter,
                            'URL': resource.url,
                            'File Path': resource.filePath,
                            'Created By': resource.createdBy.name,
                            'Topic': resource.topic?.name || 'N/A',
                            'Unit': resource.unit?.name || 'N/A',
                            'Part': resource.part?.name || 'N/A',
                            'Section': resource.section?.name || 'N/A',
                            'Usage Count': resource.usageCount,
                            'Created At': resource.createdAt.toISOString(),
                            'Updated At': resource.updatedAt.toISOString(),
                            'Linked Assessments': resource.assessments.length
                        }));
                        
                        addWorksheet(`Resources_${q}`, qResourcesData, [
                            'Resource ID', 'Title', 'Description', 'Type', 'Quarter', 'URL', 'File Path',
                            'Created By', 'Topic', 'Unit', 'Part', 'Section', 'Usage Count', 'Created At', 'Updated At', 'Linked Assessments'
                        ]);
                    }
                    
                    // Q1 Assessments
                    const qAssessments = await prisma.assessment.findMany({
                        where: { quarter: q },
                        include: {
                            createdBy: true,
                            section: {
                                include: {
                                    part: {
                                        include: {
                                            unit: {
                                                include: {
                                                    subject: true
                                                }
                                            }
                                        }
                                    }
                                }
                            },
                            mediaFiles: true,
                            resources: true
                        },
                        orderBy: { createdAt: 'desc' }
                    });
                    
                    if (qAssessments.length > 0) {
                        const qAssessmentsData = qAssessments.map(assessment => ({
                            'Assessment ID': assessment.id,
                            'Title': assessment.title,
                            'Description': assessment.description,
                            'Type': assessment.type,
                            'Category': assessment.category,
                            'Quarter': assessment.quarter,
                            'Published': assessment.published ? 'Yes' : 'No',
                            'Due Date': assessment.dueDate ? assessment.dueDate.toISOString() : 'N/A',
                            'Created By': assessment.createdBy.name,
                            'Subject': assessment.section?.part?.unit?.subject?.name || 'N/A',
                            'Unit': assessment.section?.part?.unit?.name || 'N/A',
                            'Part': assessment.section?.part?.name || 'N/A',
                            'Section': assessment.section?.name || 'N/A',
                            'Questions Count': assessment.questions ? assessment.questions.length : 0,
                            'Media Files': assessment.mediaFiles.length,
                            'Linked Resources': assessment.resources.length,
                            'Created At': assessment.createdAt.toISOString(),
                            'Updated At': assessment.updatedAt.toISOString()
                        }));
                        
                        addWorksheet(`Assessments_${q}`, qAssessmentsData, [
                            'Assessment ID', 'Title', 'Description', 'Type', 'Category', 'Quarter', 'Published', 'Due Date',
                            'Created By', 'Subject', 'Unit', 'Part', 'Section', 'Questions Count', 'Media Files', 'Linked Resources', 'Created At', 'Updated At'
                        ]);
                    }
                    
                    // Q1 Submissions
                    const qSubmissions = await prisma.assessmentSubmission.findMany({
                        where: {
                            assessment: {
                                quarter: q
                            }
                        },
                        include: {
                            student: true,
                            assessment: {
                                include: {
                                    section: {
                                        include: {
                                            part: {
                                                include: {
                                                    unit: {
                                                        include: {
                                                            subject: true
                                                        }
                                                    }
                                                }
                                            }
                                        }
                                    }
                                }
                            }
                        },
                        orderBy: { submittedAt: 'desc' }
                    });
                    
                    if (qSubmissions.length > 0) {
                        // Calculate attempt numbers for quarter-specific submissions
                        const qSubmissionsWithAttempts = await Promise.all(qSubmissions.map(async (submission) => {
                            const attemptNumber = await prisma.assessmentSubmission.count({
                                where: {
                                    studentId: submission.studentId,
                                    assessmentId: submission.assessmentId,
                                    submittedAt: {
                                        lte: submission.submittedAt
                                    }
                                }
                            });
                            
                            return {
                                ...submission,
                                calculatedAttempts: attemptNumber
                            };
                        }));

                        const qSubmissionsData = qSubmissionsWithAttempts.map(submission => ({
                            'Submission ID': submission.id,
                            'Student ID': submission.student.id,
                            'Student Name': submission.student.name,
                            'Student Email': submission.student.email,
                            'Assessment ID': submission.assessment.id,
                            'Assessment Title': submission.assessment.title,
                            'Assessment Type': submission.assessment.type,
                            'Assessment Quarter': submission.assessment.quarter,
                            'Score': submission.score,
                            'Attempts': submission.calculatedAttempts || 1,
                            'Total Time': submission.totalTime,
                            'Status': submission.status,
                            'Subject': submission.assessment.section?.part?.unit?.subject?.name || 'N/A',
                            'Unit': submission.assessment.section?.part?.unit?.name || 'N/A',
                            'Part': submission.assessment.section?.part?.name || 'N/A',
                            'Section': submission.assessment.section?.name || 'N/A',
                            'Submitted At': submission.submittedAt ? submission.submittedAt.toISOString() : 'N/A',
                            'Updated At': submission.updatedAt ? submission.updatedAt.toISOString() : 'N/A'
                        }));
                        
                        addWorksheet(`Submissions_${q}`, qSubmissionsData, [
                            'Submission ID', 'Student ID', 'Student Name', 'Student Email', 'Assessment ID', 'Assessment Title', 'Assessment Type', 'Assessment Quarter',
                            'Score', 'Attempts', 'Total Time', 'Status', 'Subject', 'Unit', 'Part', 'Section', 'Submitted At', 'Updated At'
                        ]);
                    }
                }
            }
            
            console.log('Worksheets added successfully');
            console.log('Total worksheets created:', workbook.worksheets.length);
            console.log('Worksheet names:', workbook.worksheets.map(ws => ws.name));

            console.log('Generating Excel file...');
            const buffer = await workbook.xlsx.writeBuffer();
            console.log('Excel file generated successfully, buffer size:', buffer.length);
            
            console.log('Setting response headers...');
            const quarterSuffix = quarter ? `-${quarter}` : '';
            res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
            res.setHeader('Content-Disposition', `attachment; filename=student-performance-dashboard${quarterSuffix}-${new Date().toISOString().split('T')[0]}.xlsx`);
            
            console.log('Sending response...');
            res.send(buffer);
            console.log('=== EXPORT DEBUG END - SUCCESS ===');
        } catch (error) {
            console.error('Error in export process:', error);
            throw error;
        }

    } catch (error) {
        console.error('Database export error:', error);
        res.status(500).json({ error: 'Failed to export database' });
    }
});

// Student Performance Dashboard API
app.get('/api/teacher/student-performance', auth, async (req, res) => {
    try {
        // Check if user is teacher or admin
        const user = await prisma.user.findUnique({
            where: { id: req.user.userId }
        });

        if (user.role !== 'TEACHER' && user.role !== 'ADMIN') {
            return res.status(403).json({ error: 'Access denied. Teachers and admins only.' });
        }

        // Get query parameters for filtering
        const { subjectId, quarter, class: classFilter } = req.query;

        // Build student filter conditions
        const studentFilterConditions = {
                role: 'STUDENT',
                active: true  // Only include active students
        };
        
        // Add class filter if specified
        if (classFilter) {
            studentFilterConditions.class = classFilter;
        }

        // Get all active students with their performance data
        const students = await prisma.user.findMany({
            where: studentFilterConditions,
            include: {
                studentCourses: {
                    include: {
                        subject: {
                            include: {
                                coreSubject: true
                            }
                        }
                    }
                },
                assessmentSubmissions: {
                    include: {
                        assessment: {
                            include: {
                                section: {
                                    include: {
                                        part: {
                                            include: {
                                                unit: {
                                                    include: {
                                                        subject: true
                                                    }
                                                }
                                            }
                                        }
                                    }
                                }
                            }
                        }
                    }
                },
                studentProgress: {
                    include: {
                        subject: true,
                        topic: true
                    }
                },
                sessions: {
                    orderBy: {
                        startTime: 'desc'
                    }
                }
            },
            orderBy: { name: 'asc' }
        });

        // Process student data for dashboard
        const studentPerformanceData = await Promise.all(students.map(async student => {
            // Filter student courses by subject if specified
            let enrolledSubjectIds;
            if (subjectId) {
                // Only include the specified subject
                enrolledSubjectIds = student.studentCourses
                    .filter(sc => sc.subjectId === subjectId)
                    .map(sc => sc.subjectId);
                
                // Skip students who are not enrolled in the specified subject
                if (enrolledSubjectIds.length === 0) {
                    return null;
                }
            } else {
                // Include all enrolled subjects
                enrolledSubjectIds = student.studentCourses.map(sc => sc.subjectId);
            }
            
            // Build assessment filter conditions
            const assessmentFilterConditions = {
                section: {
                    part: {
                        unit: {
                            subjectId: { in: enrolledSubjectIds }
                        }
                    }
                },
                published: true
            };
            
            // Add quarter filter if specified
            if (quarter) {
                assessmentFilterConditions.quarter = quarter;
            }
            
            // Get all assessments available to this student
            const availableAssessments = await prisma.assessment.findMany({
                where: assessmentFilterConditions,
                include: {
                    resources: true
                }
            });
            
            // Filter to only assessments with attached resources (same logic as progress page)
            const assessmentsWithResources = availableAssessments.filter(a => a.resources && a.resources.length > 0);
            const totalAvailableAssessments = assessmentsWithResources.length;
            
            // Calculate completed assessments (those with valid scores AND available to student)
            const availableAssessmentIds = new Set(assessmentsWithResources.map(a => a.id));
            const completedAssessments = new Set(
                student.assessmentSubmissions
                    .filter(sub => sub.score !== null && sub.score !== undefined)
                    .filter(sub => availableAssessmentIds.has(sub.assessmentId)) // Only count if assessment is available
                    .map(sub => sub.assessmentId)
            ).size;
            
            const averageScore = student.assessmentSubmissions.length > 0 
                ? (student.assessmentSubmissions.reduce((sum, sub) => sum + (sub.score || 0), 0) / student.assessmentSubmissions.length).toFixed(1)
                : 0;
            
            const completionRate = totalAvailableAssessments > 0 ? ((completedAssessments / totalAvailableAssessments) * 100).toFixed(1) : 0;
            
            // Calculate engagement metrics
            const loginDays = student.sessions ? 
                new Set(student.sessions.map(s => new Date(s.startTime).toDateString())).size : 0;
            const totalSubmissions = student.assessmentSubmissions.length;
            const submissionsPerLoginDay = loginDays > 0 ? (totalSubmissions / loginDays).toFixed(2) : '0';
            
            // Determine engagement pattern
            const lastLogin = student.lastLogin ? new Date(student.lastLogin) : null;
            const lastSubmission = student.assessmentSubmissions
                .sort((a, b) => new Date(b.submittedAt) - new Date(a.submittedAt))[0];
            const lastActivity = lastSubmission ? new Date(lastSubmission.submittedAt) : null;
            
            let engagementPattern = 'Unknown';
            if (lastLogin && lastActivity) {
                const loginTime = lastLogin.getTime();
                const activityTime = lastActivity.getTime();
                
                if (activityTime > loginTime) {
                    engagementPattern = 'Active Learner';
                } else if (loginTime > activityTime) {
                    engagementPattern = 'Grade Checker';
                } else {
                    engagementPattern = 'Active Learner';
                }
            } else if (lastLogin && !lastActivity) {
                engagementPattern = 'Login Only - No Submissions';
            } else if (!lastLogin && lastActivity) {
                engagementPattern = 'Activity Only - No Recent Login';
            } else {
                engagementPattern = 'Inactive';
            }

            // Extract subjects from student courses (include CoreSubject info)
            const subjects = student.studentCourses.map(sc => ({
                name: sc.subject.name,
                coreSubject: sc.subject.coreSubject
            }));
            
            return {
                id: student.id,
                name: student.name,
                email: student.email,
                organization: student.organization,
                yearLevel: student.yearLevel,
                class: student.class,
                active: student.active,
                subjects: subjects,
                uniqueAssessments: totalAvailableAssessments,
                completedUniqueAssessments: completedAssessments,
                completionRate: parseFloat(completionRate),
                averageScore: parseFloat(averageScore),
                loginDays: loginDays,
                totalSubmissions: totalSubmissions,
                submissionsPerLoginDay: submissionsPerLoginDay,
                engagementPattern: engagementPattern,
                lastLogin: student.lastLogin,
                lastActivity: lastActivity ? lastActivity.toISOString() : null
            };
        }));

        // Filter out null values (students not enrolled in specified subject)
        const filteredStudentData = studentPerformanceData.filter(data => data !== null);

        res.json(filteredStudentData);

    } catch (error) {
        console.error('Student performance API error:', error);
        res.status(500).json({ error: 'Failed to load student performance data' });
    }
});

// Combined Quarter Report API - Q1+Q2 combined performance
app.get('/api/teacher/combined-quarter-report', auth, async (req, res) => {
    try {
        // Check if user is teacher or admin
        const user = await prisma.user.findUnique({
            where: { id: req.user.userId }
        });

        if (user.role !== 'TEACHER' && user.role !== 'ADMIN') {
            return res.status(403).json({ error: 'Access denied. Teachers and admins only.' });
        }

        // Get query parameters for filtering
        const { subjectId, class: classFilter } = req.query;

        if (!subjectId) {
            return res.status(400).json({ error: 'subjectId is required' });
        }

        // Build student filter conditions
        const studentFilterConditions = {
            role: 'STUDENT',
            active: true
        };
        
        // Add class filter if specified
        if (classFilter) {
            studentFilterConditions.class = classFilter;
        }

        // Get all students with their performance data
        const students = await prisma.user.findMany({
            where: studentFilterConditions,
            include: {
                studentCourses: {
                    include: {
                        subject: true
                    }
                },
                assessmentSubmissions: {
                    include: {
                        assessment: {
                            include: {
                                section: {
                                    include: {
                                        part: {
                                            include: {
                                                unit: {
                                                    include: {
                                                        subject: true
                                                    }
                                                }
                                            }
                                        }
                                    }
                                },
                                resources: true
                            }
                        }
                    }
                }
            },
            orderBy: { name: 'asc' }
        });

        // Process student data for combined Q1+Q2 report
        const studentReportData = await Promise.all(students.map(async student => {
            // Check if student is enrolled in the specified subject
            const isEnrolledInSubject = student.studentCourses.some(sc => sc.subjectId === subjectId);
            if (!isEnrolledInSubject) {
                return null; // Skip students not enrolled in this subject
            }

            // Get all assessments for Q1 and Q2 combined for this subject
            const availableAssessments = await prisma.assessment.findMany({
                where: {
                    section: {
                        part: {
                            unit: {
                                subjectId: subjectId
                            }
                        }
                    },
                    quarter: { in: ['Q1', 'Q2'] }, // Combined Q1 and Q2
                    published: true
                },
                include: {
                    resources: true
                }
            });
            
            // Filter to only assessments with attached resources (same logic as other reports)
            const assessmentsWithResources = availableAssessments.filter(a => a.resources && a.resources.length > 0);
            const totalAvailableAssessments = assessmentsWithResources.length;
            
            // Calculate completed assessments (those with valid scores) for Q1+Q2
            const availableAssessmentIds = new Set(assessmentsWithResources.map(a => a.id));
            const completedAssessments = new Set(
                student.assessmentSubmissions
                    .filter(sub => sub.score !== null && sub.score !== undefined)
                    .filter(sub => availableAssessmentIds.has(sub.assessmentId)) // Only count if assessment is available
                    .map(sub => sub.assessmentId)
            ).size;
            
            // Calculate completion percentage
            const completionPercentage = totalAvailableAssessments > 0 ? 
                ((completedAssessments / totalAvailableAssessments) * 100) : 0;
            
            // Calculate average score for Q1+Q2 assessments only
            const relevantSubmissions = student.assessmentSubmissions.filter(sub => 
                availableAssessmentIds.has(sub.assessmentId) && 
                sub.score !== null && 
                sub.score !== undefined
            );
            
            const averageScore = relevantSubmissions.length > 0 ? 
                (relevantSubmissions.reduce((sum, sub) => sum + sub.score, 0) / relevantSubmissions.length) : 0;
            
            // Calculate final total: (completionPercentage / 100) * averageScore
            const finalTotal = (completionPercentage / 100) * averageScore;
            
            return {
                id: student.id,
                name: student.name,
                studentNumber: student.studentNumber,
                class: student.class,
                completionPercentage: parseFloat(completionPercentage.toFixed(1)),
                averageScore: parseFloat(averageScore.toFixed(1)),
                finalTotal: parseFloat(finalTotal.toFixed(1)),
                totalAvailableAssessments,
                completedAssessments
            };
        }));

        // Filter out null values (students not enrolled in specified subject)
        const filteredStudentData = studentReportData.filter(data => data !== null);
        
        // Sort by final total (highest first) - can be changed to other fields in future
        filteredStudentData.sort((a, b) => b.finalTotal - a.finalTotal);

        res.json(filteredStudentData);

    } catch (error) {
        console.error('Combined quarter report API error:', error);
        res.status(500).json({ error: 'Failed to load combined quarter report data' });
    }
});

// Quarter-specific reporting endpoint
app.get('/api/teacher/quarter-report', auth, async (req, res) => {
    try {
        const { quarter } = req.query;
        
        if (!quarter) {
            return res.status(400).json({ error: 'Quarter parameter is required (Q1, Q2, Q3, Q4)' });
        }
        
        // Check if user is teacher or admin
        const user = await prisma.user.findUnique({
            where: { id: req.user.userId }
        });

        if (user.role !== 'TEACHER' && user.role !== 'ADMIN') {
            return res.status(403).json({ error: 'Access denied. Teachers and admins only.' });
        }

        console.log(`Generating quarter report for ${quarter}...`);

        // Get resources for the quarter
        const resources = await prisma.resource.findMany({
            where: { quarter: quarter },
            include: {
                createdBy: true,
                topic: true,
                assessments: true
            },
            orderBy: { createdAt: 'desc' }
        });

        // Get assessments for the quarter
        const assessments = await prisma.assessment.findMany({
            where: { quarter: quarter },
            include: {
                createdBy: true,
                section: {
                    include: {
                        part: {
                            include: {
                                unit: {
                                    include: {
                                        subject: true
                                    }
                                }
                            }
                        }
                    }
                },
                submissions: true
            },
            orderBy: { createdAt: 'desc' }
        });

        // Get submissions for assessments in this quarter
        const submissions = await prisma.assessmentSubmission.findMany({
            where: {
                assessment: {
                    quarter: quarter
                }
            },
            include: {
                student: true,
                assessment: true
            },
            orderBy: { submittedAt: 'desc' }
        });

        // Calculate statistics
        const totalResources = resources.length;
        const totalAssessments = assessments.length;
        const totalSubmissions = submissions.length;
        const publishedAssessments = assessments.filter(a => a.published).length;
        const averageScore = submissions.length > 0 
            ? (submissions.reduce((sum, sub) => sum + (sub.score || 0), 0) / submissions.length).toFixed(2)
            : 0;

        // Group by subject
        const subjectStats = {};
        assessments.forEach(assessment => {
            const subjectName = assessment.section?.part?.unit?.subject?.name || 'Unknown';
            if (!subjectStats[subjectName]) {
                subjectStats[subjectName] = {
                    assessments: 0,
                    submissions: 0,
                    averageScore: 0
                };
            }
            subjectStats[subjectName].assessments++;
        });

        submissions.forEach(submission => {
            const subjectName = submission.assessment.section?.part?.unit?.subject?.name || 'Unknown';
            if (subjectStats[subjectName]) {
                subjectStats[subjectName].submissions++;
            }
        });

        // Calculate average scores by subject
        Object.keys(subjectStats).forEach(subjectName => {
            const subjectSubmissions = submissions.filter(sub => 
                sub.assessment.section?.part?.unit?.subject?.name === subjectName
            );
            if (subjectSubmissions.length > 0) {
                const avgScore = subjectSubmissions.reduce((sum, sub) => sum + (sub.score || 0), 0) / subjectSubmissions.length;
                subjectStats[subjectName].averageScore = avgScore.toFixed(2);
            }
        });

        // Get unique students for this quarter
        const uniqueStudents = [...new Set(submissions.map(s => s.student.id))];
        const students = uniqueStudents.map(studentId => {
            const studentSubmissions = submissions.filter(s => s.student.id === studentId);
            const student = studentSubmissions[0].student;
            return {
                id: student.id,
                name: student.name,
                email: student.email,
                class: student.class,
                yearLevel: student.yearLevel,
                submissions: studentSubmissions.length,
                averageScore: studentSubmissions.length > 0 
                    ? (studentSubmissions.reduce((sum, s) => sum + (s.score || 0), 0) / studentSubmissions.length).toFixed(2)
                    : 0
            };
        });

        const report = {
            quarter: quarter,
            summary: {
                totalResources,
                totalAssessments,
                totalSubmissions,
                publishedAssessments,
                averageScore: parseFloat(averageScore),
                completionRate: totalAssessments > 0 ? ((publishedAssessments / totalAssessments) * 100).toFixed(1) : 0
            },
            students: students,
            subjectStats,
            resources: resources.map(r => ({
                id: r.id,
                title: r.title,
                type: r.type,
                createdBy: r.createdBy.name,
                topic: r.topic?.name,
                linkedAssessments: r.assessments.length,
                createdAt: r.createdAt
            })),
            assessments: assessments.map(a => ({
                id: a.id,
                title: a.title,
                type: a.type,
                category: a.category,
                published: a.published,
                createdBy: a.createdBy.name,
                subject: a.section?.part?.unit?.subject?.name,
                submissions: a.submissions.length,
                averageScore: a.submissions.length > 0 
                    ? (a.submissions.reduce((sum, s) => sum + (s.score || 0), 0) / a.submissions.length).toFixed(2)
                    : 0,
                createdAt: a.createdAt
            })),
            submissions: submissions.map(s => ({
                id: s.id,
                studentName: s.student.name,
                assessmentTitle: s.assessment.title,
                score: s.score,
                attempts: s.attempts,
                status: s.status,
                submittedAt: s.submittedAt
            }))
        };

        res.json(report);
    } catch (error) {
        console.error('Quarter report error:', error);
        res.status(500).json({ error: 'Failed to generate quarter report' });
    }
});

// English Class Student Report Generator
app.get('/api/teacher/english-student-report', auth, async (req, res) => {
    try {
        const { studentId, quarter } = req.query;
        
        if (!studentId || !quarter) {
            return res.status(400).json({ 
                error: 'Student ID and quarter parameters are required' 
            });
        }
        
        // Check if user is teacher or admin
        const user = await prisma.user.findUnique({
            where: { id: req.user.userId }
        });

        if (user.role !== 'TEACHER' && user.role !== 'ADMIN') {
            return res.status(403).json({ error: 'Access denied. Teachers and admins only.' });
        }

        console.log(`Generating English class report for student ${studentId}, quarter ${quarter}...`);

        // Get student information
        const student = await prisma.user.findUnique({
            where: { id: studentId },
            include: {
                studentCourses: {
                    include: {
                        subject: {
                            include: {
                                coreSubject: true
                            }
                        }
                    }
                },
                assessmentSubmissions: {
                    include: {
                        assessment: true
                    },
                    orderBy: { submittedAt: 'desc' }
                },
                sessions: {
                    orderBy: { startTime: 'desc' }
                }
            }
        });

        if (!student || student.role !== 'STUDENT' || !student.active) {
            return res.status(404).json({ error: 'Student not found or inactive' });
        }

        // Find English subject (using CoreSubject)
        const englishSubject = student.studentCourses.find(sc => 
            sc.subject.coreSubject.name.toLowerCase().includes('english')
        );

        if (!englishSubject) {
            return res.status(404).json({ 
                error: 'Student is not enrolled in English class. Available subjects: ' + 
                       student.studentCourses.map(sc => sc.subject.name).join(', ')
            });
        }

        // Get all assessments for English subject in the specified quarter
        // Only count assessments with resources attached (matching Student Progress table logic)
        const assessments = await prisma.assessment.findMany({
            where: {
                quarter: quarter,
                section: {
                    part: {
                        unit: {
                            subjectId: englishSubject.subjectId
                        }
                    }
                },
                resources: {
                    some: {} // Only include assessments with at least one resource
                }
            },
            include: {
                section: {
                    include: {
                        part: {
                            include: {
                                unit: {
                                    include: {
                                        subject: true
                                    }
                                }
                            }
                        }
                    }
                },
                submissions: {
                    where: { studentId: studentId },
                    orderBy: { submittedAt: 'desc' }
                }
            }
        });

        // Get student progress for English subject
        const studentProgress = await prisma.studentProgress.findMany({
            where: {
                studentId: studentId,
                subjectId: englishSubject.subjectId
            }
        });

        // Separate Test Practice from skill-based assessments
        const testPracticeAssessments = assessments.filter(a => 
            a.title.toLowerCase().includes('test practice') || 
            a.category?.toLowerCase().includes('test practice')
        );

        // Include all assessments for skill categorization (including Test Practice)
        const skillBasedAssessments = assessments;

        // Define skill categories
        const skillCategories = ['Reading', 'Writing', 'Listening', 'Speaking', 'Vocabulary', 'Grammar', 'Test Practice'];

        // Get all students in the same English class for class averages
        const classStudents = await prisma.studentCourse.findMany({
            where: {
                subjectId: englishSubject.subjectId
            },
            include: {
                student: {
                    include: {
                        assessmentSubmissions: {
                            include: {
                                assessment: true
                            }
                        }
                    }
                }
            }
        });

        // Function to categorize assessments correctly
        function categorizeAssessment(category) {
            if (!category) return 'Uncategorized';
            
            const categoryLower = category.toLowerCase();
            
            // Reading includes all reading-related categories
            if (categoryLower.includes('reading')) {
                return 'Reading';
            }
            // Listening includes all listening-related categories (but not reading)
            if (categoryLower.includes('listening')) {
                return 'Listening';
            }
            // Speaking includes all speaking-related categories (but not reading)
            if (categoryLower.includes('speaking')) {
                return 'Speaking';
            }
            // Writing includes all writing-related categories (but not reading)
            if (categoryLower.includes('writing')) {
                return 'Writing';
            }
            // Test Practice is separate
            if (categoryLower.includes('test practice')) {
                return 'Test Practice';
            }
            // Grammar is separate (but not "Reading and Grammar")
            if (categoryLower.includes('grammar')) {
                return 'Grammar';
            }
            // Vocabulary is separate
            if (categoryLower.includes('vocabulary')) {
                return 'Vocabulary';
            }
            
            return category;
        }

        // Filter student submissions by quarter
        const quarterStart = new Date(`${quarter === 'Q1' ? '2025-05-01' : '2025-07-21'}`);
        const quarterEnd = new Date(`${quarter === 'Q1' ? '2025-07-21' : '2025-10-01'}`);
        
        const studentQuarterSubmissions = student.assessmentSubmissions.filter(submission => {
            const submittedAt = new Date(submission.submittedAt);
            return submittedAt >= quarterStart && submittedAt < quarterEnd;
        });

        // Calculate class averages for this quarter
        const classCategoryScores = {};
        classStudents.forEach(studentCourse => {
            const classStudent = studentCourse.student;
            const classStudentSubmissions = classStudent.assessmentSubmissions.filter(submission => {
                const submittedAt = new Date(submission.submittedAt);
                return submittedAt >= quarterStart && submittedAt < quarterEnd;
            });
            
            classStudentSubmissions.forEach(submission => {
                const category = categorizeAssessment(submission.assessment.category);
                if (!classCategoryScores[category]) {
                    classCategoryScores[category] = [];
                }
                if (submission.score !== null) {
                    classCategoryScores[category].push(submission.score);
                }
            });
        });

        // Calculate skill-based metrics with class comparisons
        const skillMetrics = {};
        let totalAssessmentsProvided = 0;
        let totalAssessmentsCompleted = 0;
        
        skillCategories.forEach(skill => {
            const skillAssessments = skillBasedAssessments.filter(a => {
                const category = a.category?.toLowerCase() || '';
                
                // Special categorization rules
                if (skill === 'Reading') {
                    // Reading includes all reading-related categories
                    return category.includes('reading');
                } else if (skill === 'Listening') {
                    // Listening includes all listening-related categories (but not reading)
                    return category.includes('listening') && !category.includes('reading');
                } else if (skill === 'Speaking') {
                    // Speaking includes all speaking-related categories (but not reading)
                    return category.includes('speaking') && !category.includes('reading');
                } else if (skill === 'Writing') {
                    // Writing includes all writing-related categories (but not reading)
                    return category.includes('writing') && !category.includes('reading');
                } else if (skill === 'Grammar') {
                    // Grammar includes only pure grammar (not "Reading and Grammar")
                    return category.includes('grammar') && !category.includes('reading');
                } else if (skill === 'Vocabulary') {
                    // Vocabulary is separate
                    return category.includes('vocabulary');
                } else if (skill === 'Test Practice') {
                    // Test Practice is separate
                    return category.includes('test practice');
                }
                
                // Fallback for other categories
                return category === skill.toLowerCase() || category.includes(skill.toLowerCase());
            });

            const totalAssessments = skillAssessments.length;
            const completedAssessments = skillAssessments.filter(a => 
                a.submissions && a.submissions.length > 0
            ).length;

            const completionRate = totalAssessments > 0 ? 
                Math.round((completedAssessments / totalAssessments) * 100) : 0;

            // Calculate student's average score for this skill
            const studentSkillSubmissions = studentQuarterSubmissions.filter(submission => {
                const category = categorizeAssessment(submission.assessment.category);
                return category === skill;
            });

            const studentScores = studentSkillSubmissions
                .map(s => s.score)
                .filter(score => score !== null);

            const studentAverageScore = studentScores.length > 0 ? 
                Math.round((studentScores.reduce((sum, score) => sum + score, 0) / studentScores.length) * 10) / 10 : 0;

            // Calculate class average for this skill
            const classScores = classCategoryScores[skill] || [];
            const classAverageScore = classScores.length > 0 ? 
                Math.round((classScores.reduce((sum, score) => sum + score, 0) / classScores.length) * 10) / 10 : 0;

            // Calculate struggling assessments (below 70%)
            const strugglingCount = studentScores.filter(score => score < 70).length;
            const strugglingPercent = studentScores.length > 0 ? 
                Math.round((strugglingCount / studentScores.length) * 100) : 0;

            // Calculate performance vs class
            const performanceVsClass = studentAverageScore - classAverageScore;
            let performanceLevel = 'Near class average';
            if (performanceVsClass > 5) {
                performanceLevel = `Above class average (+${performanceVsClass.toFixed(1)}%)`;
            } else if (performanceVsClass < -5) {
                performanceLevel = `Below class average (${performanceVsClass.toFixed(1)}%)`;
            } else {
                performanceLevel = `Near class average (${performanceVsClass > 0 ? '+' : ''}${performanceVsClass.toFixed(1)}%)`;
            }

        skillMetrics[skill] = {
            total: totalAssessments,
            completed: completedAssessments,
            completionRate: completionRate,
            studentAverageScore: studentAverageScore,
            classAverageScore: classAverageScore,
            performanceVsClass: performanceLevel,
            strugglingCount: strugglingCount,
            strugglingPercent: strugglingPercent,
            studentAssessments: studentScores.length,
            classAssessments: classScores.length,
            notAttempted: totalAssessments - completedAssessments
        };
        
        // Add to totals
        totalAssessmentsProvided += totalAssessments;
        totalAssessmentsCompleted += completedAssessments;
        });

        // Test Practice metrics are now calculated as part of skill-based metrics

        // Calculate overall completion rate (including Test Practice)
        // Note: totalAssessments should match the expected counts (Q1: 50, Q2: 71)
        const totalAssessments = assessments.length;
        const totalCompletedAssessments = assessments.filter(a => 
            a.submissions && a.submissions.length > 0
        ).length;
        const overallCompletionRate = totalAssessments > 0 ? 
            Math.round((totalCompletedAssessments / totalAssessments) * 100) : 0;
            
        // Calculate unique submissions count (not total submissions)
        const uniqueSubmissionsCount = studentQuarterSubmissions.length;

        // Calculate overall performance with class comparison
        const allStudentScores = studentQuarterSubmissions
            .map(s => s.score)
            .filter(score => score !== null);

        const overallStudentAverage = allStudentScores.length > 0 ? 
            Math.round((allStudentScores.reduce((sum, score) => sum + score, 0) / allStudentScores.length) * 10) / 10 : 0;

        const allClassScores = Object.values(classCategoryScores).flat();
        const overallClassAverage = allClassScores.length > 0 ? 
            Math.round((allClassScores.reduce((sum, score) => sum + score, 0) / allClassScores.length) * 10) / 10 : 0;

        const overallPerformanceVsClass = overallStudentAverage - overallClassAverage;
        let overallPerformanceLevel = 'Near class average';
        if (overallPerformanceVsClass > 5) {
            overallPerformanceLevel = `Above class average (+${overallPerformanceVsClass.toFixed(1)}%)`;
        } else if (overallPerformanceVsClass < -5) {
            overallPerformanceLevel = `Below class average (${overallPerformanceVsClass.toFixed(1)}%)`;
        } else {
            overallPerformanceLevel = `Near class average (${overallPerformanceVsClass > 0 ? '+' : ''}${overallPerformanceVsClass.toFixed(1)}%)`;
        }

        // Calculate overall struggling percentage
        const overallStrugglingCount = allStudentScores.filter(score => score < 70).length;
        const overallStrugglingPercent = allStudentScores.length > 0 ? 
            Math.round((overallStrugglingCount / allStudentScores.length) * 100) : 0;

        // Calculate engagement metrics
        const loginDays = student.sessions ? 
            new Set(student.sessions.map(s => new Date(s.startTime).toDateString())).size : 0;

        // Count submissions for this quarter
        const quarterSubmissions = assessments
            .flatMap(a => a.submissions || [])
            .filter(s => {
                const submittedAt = new Date(s.submittedAt);
                const quarterStart = new Date(`${quarter === 'Q1' ? '2025-05-01' : '2025-07-21'}`);
                const quarterEnd = new Date(`${quarter === 'Q1' ? '2025-07-21' : '2025-10-01'}`);
                return submittedAt >= quarterStart && submittedAt < quarterEnd;
            });

        const totalSubmissions = quarterSubmissions.length;

        // Determine engagement style based on submission times (class vs homework)
        let classSubmissions = 0;
        let homeworkSubmissions = 0;

        quarterSubmissions.forEach(submission => {
            const submissionDate = new Date(submission.submittedAt);
            const dayOfWeek = submissionDate.getDay();
            const hour = submissionDate.getHours();

            // Class time: Thursday/Friday between 8am-4pm
            if ((dayOfWeek === 4 || dayOfWeek === 5) && hour >= 8 && hour < 16) {
                classSubmissions++;
            } else {
                // Homework: any other time (evenings, weekends, or before 8am/after 4pm)
                homeworkSubmissions++;
            }
        });

        const engagementStyle = classSubmissions > homeworkSubmissions ? 'Active Learner' : 
                               homeworkSubmissions > classSubmissions ? 'Homework Focused' : 'Balanced';

        // Analyze login frequency patterns for Thursday/Friday class days
        const quarterStartDate = new Date(`${quarter === 'Q1' ? '2025-05-01' : '2025-07-21'}`);
        const quarterEndDate = new Date(`${quarter === 'Q1' ? '2025-07-21' : '2025-10-01'}`);
        
        // Get all sessions for the quarter (convert to Date objects for comparison)
        const quarterSessions = student.sessions ? student.sessions.filter(session => {
            const sessionDate = new Date(session.startTime);
            return sessionDate >= quarterStartDate && sessionDate < quarterEndDate;
        }) : [];

        // Filter for Thursday/Friday class sessions (8am-4pm)
        const classDaySessions = quarterSessions.filter(session => {
            const dayOfWeek = new Date(session.startTime).getDay();
            const hour = new Date(session.startTime).getHours();
            return (dayOfWeek === 4 || dayOfWeek === 5) && hour >= 8 && hour < 16;
        });

        // Calculate class day login metrics
        const totalClassDayLogins = classDaySessions.length;
        
        // Group sessions by date to count logins per day
        const loginsByDate = {};
        classDaySessions.forEach(session => {
            const dateKey = new Date(session.startTime).toDateString();
            if (!loginsByDate[dateKey]) {
                loginsByDate[dateKey] = {
                    date: dateKey,
                    count: 0,
                    totalDuration: 0,
                    sessions: [],
                    completedSessions: 0,
                    incompleteSessions: 0
                };
            }
            loginsByDate[dateKey].count++;
            
            // Handle duration calculation - use stored duration or calculate from endTime
            let sessionDuration = 0;
            if (session.duration && session.duration > 0) {
                sessionDuration = session.duration;
            } else if (session.endTime) {
                sessionDuration = Math.round((new Date(session.endTime) - new Date(session.startTime)) / 1000);
            }
            
            loginsByDate[dateKey].totalDuration += sessionDuration;
            loginsByDate[dateKey].sessions.push({
                ...session,
                calculatedDuration: sessionDuration
            });
            
            if (sessionDuration > 0) {
                loginsByDate[dateKey].completedSessions++;
            } else {
                loginsByDate[dateKey].incompleteSessions++;
            }
        });
        
        // Calculate comprehensive statistics
        const classDayDates = Object.keys(loginsByDate);
        const averageLoginsPerDay = classDayDates.length > 0 ? 
            Math.round((totalClassDayLogins / classDayDates.length) * 10) / 10 : 0;
        
        // Calculate total duration for class days
        const totalClassDayDuration = classDaySessions.reduce((sum, session) => {
            let sessionDuration = 0;
            if (session.duration && session.duration > 0) {
                sessionDuration = session.duration;
            } else if (session.endTime) {
                sessionDuration = Math.round((new Date(session.endTime) - new Date(session.startTime)) / 1000);
            }
            return sum + sessionDuration;
        }, 0);
        
        const averageSessionDuration = totalClassDayLogins > 0 ? 
            Math.round(totalClassDayDuration / totalClassDayLogins) : 0;
        
        // Calculate completed vs incomplete sessions
        const completedSessions = classDaySessions.filter(session => {
            if (session.duration && session.duration > 0) return true;
            if (session.endTime) {
                const calculatedDuration = Math.round((new Date(session.endTime) - new Date(session.startTime)) / 1000);
                return calculatedDuration > 0;
            }
            return false;
        }).length;
        
        const incompleteSessions = totalClassDayLogins - completedSessions;
        
        // Find days with excessive logins (more than 3)
        const excessiveLoginDays = classDayDates.filter(date => 
            loginsByDate[date].count > 3
        ).length;
        
        // Calculate ratios and additional metrics
        const completionRate = totalClassDayLogins > 0 ? 
            Math.round((completedSessions / totalClassDayLogins) * 100) : 0;
        
        const totalClassDayMinutes = Math.round(totalClassDayDuration / 60);
        const averageSessionMinutes = Math.round(averageSessionDuration / 60);
        
        // Calculate per-day statistics
        const dayStats = classDayDates.map(date => {
            const dayData = loginsByDate[date];
            return {
                date: date,
                logins: dayData.count,
                totalMinutes: Math.round(dayData.totalDuration / 60),
                avgMinutesPerLogin: dayData.count > 0 ? Math.round(dayData.totalDuration / dayData.count / 60) : 0,
                completedSessions: dayData.completedSessions,
                incompleteSessions: dayData.incompleteSessions,
                completionRate: dayData.count > 0 ? Math.round((dayData.completedSessions / dayData.count) * 100) : 0
            };
        });

        // Calculate persistence metrics
        const assessmentAttempts = assessments
            .filter(a => a.submissions && a.submissions.length > 0)
            .map(a => a.submissions.length);

        const averageAttempts = assessmentAttempts.length > 0 ? 
            (assessmentAttempts.reduce((sum, attempts) => sum + attempts, 0) / assessmentAttempts.length).toFixed(1) : '0';
        
        const maxAttempts = assessmentAttempts.length > 0 ? 
            Math.max(...assessmentAttempts) : 0;

        // Generate narrative (excluding Test Practice from skills)
        const skillEntries = Object.entries(skillMetrics).filter(([skill]) => skill !== 'Test Practice');
        const proficientSkills = skillEntries.filter(([skill, metrics]) => metrics.completionRate >= 90);
        const needsWorkSkills = skillEntries.filter(([skill, metrics]) => metrics.completionRate < 80);
        
        let narrative = '';
        if (proficientSkills.length >= 5) {
            narrative = 'Proficient in all language skills.';
        } else if (needsWorkSkills.length === 0) {
            narrative = 'Good progress in all language skills.';
        } else if (needsWorkSkills.length === 1) {
            narrative = `Proficient in most language skills; needs extra work in ${needsWorkSkills[0][0]}.`;
        } else if (needsWorkSkills.length === skillEntries.length) {
            narrative = 'Needs improvement in all language skills.';
        } else {
            narrative = `Proficient in ${proficientSkills.map(([skill]) => skill).join(', ')}; needs improvement in ${needsWorkSkills.map(([skill]) => skill).join(', ')}.`;
        }

        // Add Test Practice information
        const testPracticeMetrics = skillMetrics['Test Practice'];
        if (testPracticeMetrics) {
            const testPracticeNarrative = testPracticeMetrics.total > 0 
                ? ` Test Practice: ${testPracticeMetrics.completed}/${testPracticeMetrics.total} completed.${testPracticeMetrics.completed === testPracticeMetrics.total ? ' The student completed all test practices.' : ' The student did not complete all test practices.'}`
                : ' No Test Practice assessments available.';
            narrative += testPracticeNarrative;
        }

        // Generate report
        const report = {
            student: {
                name: student.name,
                id: student.id,
                studentNumber: student.studentNumber,
                class: student.class
            },
            quarter: quarter,
            classInfo: {
                size: classStudents.length,
                subject: englishSubject.subject.name
            },
            achievement: {
                overallCompletionRate: overallCompletionRate,
                totalAssessments: totalAssessments,
                studentSubmissions: uniqueSubmissionsCount,
                completionRate: totalAssessments > 0 ? Math.round((uniqueSubmissionsCount / totalAssessments) * 100) : 0,
                description: `${student.name} completed ${overallCompletionRate}% of the coursework. This shows ${
                    overallCompletionRate >= 90 ? 'excellent' : 
                    overallCompletionRate >= 80 ? 'good' : 
                    overallCompletionRate >= 70 ? 'satisfactory' : 'needs improvement'
                } achievement.`
            },
            performance: {
                studentAverage: overallStudentAverage,
                classAverage: overallClassAverage,
                performanceVsClass: overallPerformanceLevel,
                strugglingPercent: overallStrugglingPercent,
                strugglingCount: overallStrugglingCount,
                totalAssessments: allStudentScores.length,
                strugglingDescription: `Assessments in which ${student.name} is struggling (scoring below 70%)`,
                note: "Only submitted assessments with scores are included in averages. Missing assessments are excluded entirely."
            },
            skills: skillMetrics,
            skillsSummary: {
                totalAssessmentsProvided: totalAssessmentsProvided,
                totalAssessmentsCompleted: totalAssessmentsCompleted,
                overallCompletionRate: totalAssessmentsProvided > 0 ? Math.round((totalAssessmentsCompleted / totalAssessmentsProvided) * 100) : 0
            },
            narrative: narrative,
            engagement: {
                totalSubmissions: totalSubmissions,
                loginDays: loginDays,
                engagementStyle: engagementStyle,
                classSubmissions: classSubmissions,
                homeworkSubmissions: homeworkSubmissions,
                classDayLogins: totalClassDayLogins,
                averageLoginsPerDay: averageLoginsPerDay,
                totalClassDayDuration: totalClassDayDuration,
                totalClassDayMinutes: totalClassDayMinutes,
                averageSessionDuration: averageSessionDuration,
                averageSessionMinutes: averageSessionMinutes,
                completedSessions: completedSessions,
                incompleteSessions: incompleteSessions,
                completionRate: completionRate,
                excessiveLoginDays: excessiveLoginDays,
                loginsByDate: loginsByDate,
                dayStats: dayStats,
                description: `${student.name} had ${totalSubmissions} submissions over ${loginDays} login days. Engagement style: ${engagementStyle} (${classSubmissions} class submissions, ${homeworkSubmissions} homework submissions). Class day logins: ${totalClassDayLogins} total (avg ${averageLoginsPerDay} per day). Total class time: ${totalClassDayMinutes} minutes (avg ${averageSessionMinutes} min per session). Session completion: ${completedSessions}/${totalClassDayLogins} (${completionRate}%).`
            },
            persistence: {
                averageAttempts: averageAttempts,
                maxAttempts: maxAttempts,
                description: `Average ${averageAttempts} attempts per assessment (max ${maxAttempts}).`
            }
        };

        res.json(report);

    } catch (error) {
        console.error('English student report error:', error);
        res.status(500).json({ error: 'Failed to generate English student report' });
    }
});

// Combined Q1+Q2 English Class Reports Generator
app.get('/api/teacher/english-combined-reports', auth, async (req, res) => {
    try {
        const { subjectId } = req.query;
        
        if (!subjectId) {
            return res.status(400).json({ 
                error: 'Subject ID parameter is required' 
            });
        }
        
        // Check if user is teacher or admin
        const user = await prisma.user.findUnique({
            where: { id: req.user.userId }
        });

        if (user.role !== 'TEACHER' && user.role !== 'ADMIN') {
            return res.status(403).json({ error: 'Access denied. Teachers and admins only.' });
        }

        console.log(`Generating combined Q1+Q2 English class reports for subject ${subjectId}...`);

        // Get the specified subject
        const subject = await prisma.subject.findUnique({
            where: { id: subjectId },
            include: {
                coreSubject: true
            }
        });

        if (!subject) {
            return res.status(404).json({ error: 'Subject not found' });
        }

        // Get all students enrolled in this subject
        const englishStudents = await prisma.user.findMany({
            where: {
                role: 'STUDENT',
                active: true,
                studentCourses: {
                    some: {
                        subjectId: subjectId
                    }
                }
            },
            include: {
                studentCourses: {
                    include: {
                        subject: {
                            include: {
                                coreSubject: true
                            }
                        }
                    }
                },
                assessmentSubmissions: {
                    include: {
                        assessment: true
                    },
                    orderBy: { submittedAt: 'desc' }
                },
                sessions: {
                    orderBy: { startTime: 'desc' }
                }
            }
        });

        const reports = [];

        for (const student of englishStudents) {
            try {
                // Get the specific subject for this student
                const studentSubject = student.studentCourses.find(sc => 
                    sc.subjectId === subjectId
                );

                if (!studentSubject) continue;

                // Generate Q1 and Q2 reports directly (simplified approach)
                let q1Report = null;
                let q2Report = null;

                try {
                    // For now, just create placeholder reports with basic info
                    q1Report = {
                        student: {
                            name: student.name,
                            id: student.id,
                            studentNumber: student.studentNumber,
                            class: student.class
                        },
                        quarter: 'Q1',
                        classInfo: {
                            size: englishStudents.length,
                            subject: subject.name
                        },
                        achievement: {
                            description: `${student.name} completed Q1 coursework.`
                        },
                        skills: {},
                        narrative: 'Q1 report data available.',
                        engagement: {
                            description: 'Q1 engagement data available.'
                        },
                        persistence: {
                            description: 'Q1 persistence data available.'
                        }
                    };

                    q2Report = {
                        student: {
                            name: student.name,
                            id: student.id,
                            studentNumber: student.studentNumber,
                            class: student.class
                        },
                        quarter: 'Q2',
                        classInfo: {
                            size: englishStudents.length,
                            subject: subject.name
                        },
                        achievement: {
                            description: `${student.name} completed Q2 coursework.`
                        },
                        skills: {},
                        narrative: 'Q2 report data available.',
                        engagement: {
                            description: 'Q2 engagement data available.'
                        },
                        persistence: {
                            description: 'Q2 persistence data available.'
                        }
                    };
                } catch (error) {
                    console.error(`Error generating placeholder reports for student ${student.id}:`, error);
                }

                // Combine the reports into a single document
                const combinedReport = {
                    student: student,
                    classInfo: {
                        size: englishStudents.length,
                        subject: subject.name
                    },
                    quarter: 'Q1 + Q2 Combined',
                    q1Report: q1Report,
                    q2Report: q2Report
                };

                reports.push(combinedReport);
            } catch (error) {
                console.error(`Error generating combined report for student ${student.id}:`, error);
                // Continue with other students
            }
        }

        res.json({
            quarter: 'Q1 + Q2 Combined',
            totalStudents: reports.length,
            reports: reports
        });

    } catch (error) {
        console.error('Combined English reports error:', error);
        res.status(500).json({ error: 'Failed to generate combined English reports' });
    }
});
