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

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

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
        console.error('Login error:', error);
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
        console.error('Logout error:', error);
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
        console.error('Error fetching session data:', error);
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
        console.error('Error analyzing login frequency:', error);
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
        console.error('Error analyzing class session frequency:', error);
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
        console.error('Auth check error:', error);
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
        console.error('Error creating core subject:', error);
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
        console.error('Error fetching core subjects:', error);
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
        console.error('Registration error:', error);
        res.status(500).json({ 
            success: false, 
            error: error.message 
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
        const subjects = await prisma.subject.findMany({
            include: {
                coreSubject: true,
                teachers: {
                    include: {
                        teacher: true
                    }
                }
            },
            where: {
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
            },
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
                    // Only include resources that match the active quarter
                    if (resource.quarter !== activeQuarter) {
                        continue;
                    }
                    
                    // Fetch linked assessments for this resource, filtered by active quarter
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
                            type: a.type
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
        let metadata = {};
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
                        type: a.type
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
        let mediaFiles = req.files ? req.files.map(file => ({
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
        const { quarter, published } = req.query;
        let where = {
            type: { in: ['speaking', 'writing', 'writing-long', 'assignment'] }
        };
        if (quarter) {
            where.quarter = quarter;
        }
        if (published === 'true') {
            where.published = true;
        } else if (published === 'false') {
            where.published = false;
        }
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

        // Add ungradedCount and unattached flag for each assessment
        const assessmentsWithUngraded = uniqueAssessments.map(a => {
            const unattached = !a.resources || a.resources.length === 0;
            return { ...a, unattached };
        });

        console.log(`Found ${assessments.length} assessments, ${uniqueAssessments.length} are unique`);
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
        const assessmentsWithExtras = await Promise.all(uniqueAssessments.map(async (a) => {
            const ungradedCount = await prisma.assessmentSubmission.count({
                where: { assessmentId: a.id, score: null }
            });
            const unattached = !a.resources || a.resources.length === 0;
            return { ...a, ungradedCount, unattached };
        }));

        console.log(`Found ${assessments.length} assessments, ${uniqueAssessments.length} are unique`);
        console.log('[SUBJECT ASSESSMENTS] Assessment IDs:', uniqueAssessments.map(a => ({ id: a.id, title: a.title, quarter: a.quarter, published: a.published })));
        res.json(assessmentsWithExtras);
    } catch (error) {
        console.error('Error fetching subject assessments:', error);
        res.status(500).json({ error: 'Failed to fetch subject assessments', details: error.message });
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
                    let total = q.pairs.length;
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
                let total = assessment.questions.length;
                for (let i = 0; i < total; i++) {
                    const q = assessment.questions[i];
                    if (q && typeof q.correctAnswerIndex === 'number' && answers && answers[i] !== undefined) {
                        if (parseInt(answers[i]) === q.correctAnswerIndex) correct++;
                    }
                }
                calculatedScore = Math.round((correct / total) * 100);
            } else if (assessment.type === 'assignment' && Array.isArray(assessment.questions)) {
                // Fill-in-the-blank text exercise
                console.log('Grading assignment (fill-in-the-blank):', answers);
                
                const q = assessment.questions[0];
                if (q && Array.isArray(q.answers) && answers && answers.studentAnswers) {
                    const correctAnswers = q.answers;
                    const studentAnswers = answers.studentAnswers;
                    let correct = 0;
                    let total = correctAnswers.length;
                    
                    // Compare each student answer with the corresponding correct answer
                    for (let i = 0; i < total; i++) {
                        const correctAnswer = correctAnswers[i];
                        const studentAnswer = studentAnswers[i] || '';
                        
                        // Apply case sensitivity based on question settings
                        if (q.caseSensitive) {
                            if (studentAnswer === correctAnswer) correct++;
                        } else {
                            if (studentAnswer.toLowerCase() === correctAnswer.toLowerCase()) correct++;
                        }
                    }
                    
                    calculatedScore = Math.round((correct / total) * 100);
                    console.log('Assignment grading result:', { total, correct, score: calculatedScore });
                }
            } else if (assessment.type === 'drag-and-drop' && Array.isArray(assessment.questions)) {
                // Support all subtypes: sequence, fill-in-blank, image-fill-in-blank, long-paragraph-fill-in-blank
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
                    } else if (q.subtype === 'image-fill-in-blank' && answers[0]) {
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

        let assessments = [];
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
                                // Filter by active quarter and published status
                                if (assessment.quarter !== activeQuarter || !assessment.published) continue;
                                // ... existing code ...
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
                                    attempts,
                                    maxAttempts: assessment.maxAttempts || '-',
                                    bestScore,
                                    lastScore,
                                    lastAttempt,
                                    status,
                                    completed: hasGraded, // <-- new flag
                                    subjectName: subject.name || null,
                                    unitName: unit.name || null,
                                    partName: part.name || null,
                                    sectionName: section.name || null,
                                    submissionId: submissions.length > 0 ? submissions[0].id : null,
                                    resourceTitle: assessmentWithResources?.resources?.[0]?.title || null,
                                    resourceDescription: assessmentWithResources?.resources?.[0]?.description || null
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
        let progress = [];
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
                                    if (!student.active) continue;
                                    if (classFilter && student.class !== classFilter) continue;
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

        const updatePromises = Object.entries(changes).map(([studentId, active]) =>
            prisma.user.update({
                where: { id: studentId },
                data: { active: active },
            })
        );

        await Promise.all(updatePromises);

        res.json({ success: true, message: 'Student statuses updated successfully.' });

    } catch (error) {
        console.error('Error updating student statuses:', error);
        res.status(500).json({ error: 'Failed to update student statuses.' });
    }
});

// Endpoint for writing assignment submission (long/short answer)
app.post('/api/assessments/:assessmentId/submit-writing', auth, upload.single('file'), async (req, res) => {
    try {
        const { assessmentId } = req.params;
        const studentId = req.user.userId;
        let { text } = req.body;
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
        let answers = submission.answers || {};
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

        // Check if student number is already taken by another user
        const existingUser = await prisma.user.findFirst({
            where: {
                studentNumber: studentNumber,
                id: { not: userId } // Exclude current user
            }
        });

        if (existingUser) {
            return res.status(400).json({ error: 'This student number is already assigned to another student' });
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
                section: { part: { unit: { subjectId: { in: allSubjectIds } } } }
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

        const completedSubmissions = await prisma.assessmentSubmission.findMany({
            where: { studentId: { in: studentIdsMS }, score: { not: null } },
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
        organization: user.organization
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
            
            // Add quarter-filtered data if quarter is specified
            if (quarter) {
                console.log(`Adding quarter-filtered data for ${quarter}...`);
                
                // Export Resources with quarter filter
                if (tables.includes('resources')) {
                    console.log('Exporting resources with quarter filter...');
                    const resources = await prisma.resource.findMany({
                        where: { quarter: quarter },
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
                    
                    addWorksheet(`Resources_${quarter}`, resourcesData, [
                        'Resource ID', 'Title', 'Description', 'Type', 'Quarter', 'URL', 'File Path',
                        'Created By', 'Topic', 'Unit', 'Part', 'Section', 'Usage Count', 'Created At', 'Updated At', 'Linked Assessments'
                    ]);
                }
                
                // Export Assessments with quarter filter
                if (tables.includes('assessments')) {
                    console.log('Exporting assessments with quarter filter...');
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
                            mediaFiles: true,
                            resources: true
                        },
                        orderBy: { createdAt: 'desc' }
                    });
                    
                    const assessmentsData = assessments.map(assessment => ({
                        'Assessment ID': assessment.id,
                        'Title': assessment.title,
                        'Description': assessment.description,
                        'Type': assessment.type,
                        'Category': assessment.category,
                        'Quarter': assessment.quarter,
                        'Published': assessment.published ? 'Yes' : 'No',
                        'Created By': assessment.createdBy.name,
                        'Subject': assessment.section?.part?.unit?.subject?.name || 'N/A',
                        'Unit': assessment.section?.part?.unit?.name || 'N/A',
                        'Part': assessment.section?.part?.name || 'N/A',
                        'Section': assessment.section?.name || 'N/A',
                        'Media Files': assessment.mediaFiles.length,
                        'Linked Resources': assessment.resources.length,
                        'Created At': assessment.createdAt.toISOString(),
                        'Updated At': assessment.updatedAt.toISOString()
                    }));
                    
                    addWorksheet(`Assessments_${quarter}`, assessmentsData, [
                        'Assessment ID', 'Title', 'Description', 'Type', 'Category', 'Quarter', 'Published',
                        'Created By', 'Subject', 'Unit', 'Part', 'Section', 'Media Files', 'Linked Resources', 'Created At', 'Updated At'
                    ]);
                }
                
                // Export Submissions with quarter filter (for assessments in the specified quarter)
                if (tables.includes('submissions')) {
                    console.log('Exporting submissions with quarter filter...');
                    const submissions = await prisma.assessmentSubmission.findMany({
                        where: {
                            assessment: {
                                quarter: quarter
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
                    
                    const submissionsData = submissions.map(submission => ({
                        'Submission ID': submission.id,
                        'Student ID': submission.student.id,
                        'Student Name': submission.student.name,
                        'Assessment ID': submission.assessment.id,
                        'Assessment Title': submission.assessment.title,
                        'Assessment Quarter': submission.assessment.quarter,
                        'Score': submission.score,
                        'Attempts': submission.attempts,
                        'Total Time': submission.totalTime,
                        'Status': submission.status,
                        'Subject': submission.assessment.section?.part?.unit?.subject?.name || 'N/A',
                        'Submitted At': submission.submittedAt.toISOString(),
                        'Updated At': submission.updatedAt.toISOString()
                    }));
                    
                    addWorksheet(`Submissions_${quarter}`, submissionsData, [
                        'Submission ID', 'Student ID', 'Student Name', 'Assessment ID', 'Assessment Title', 'Assessment Quarter',
                        'Score', 'Attempts', 'Total Time', 'Status', 'Subject', 'Submitted At', 'Updated At'
                    ]);
                }
            }
            
            console.log('Worksheets added successfully');

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

        // Get all students with their performance data
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

        // Process student data for dashboard
        const studentPerformanceData = students.map(student => {
            // Calculate performance metrics
            const uniqueAssessments = new Set(student.assessmentSubmissions.map(sub => sub.assessmentId)).size;
            const completedUniqueAssessments = new Set(
                student.assessmentSubmissions
                    .filter(sub => sub.score !== null)
                    .map(sub => sub.assessmentId)
            ).size;
            const averageScore = student.assessmentSubmissions.length > 0 
                ? (student.assessmentSubmissions.reduce((sum, sub) => sum + (sub.score || 0), 0) / student.assessmentSubmissions.length).toFixed(1)
                : 0;
            
            const completionRate = uniqueAssessments > 0 ? ((completedUniqueAssessments / uniqueAssessments) * 100).toFixed(1) : 0;
            
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

            // Extract subjects from student courses
            const subjects = student.studentCourses.map(sc => sc.subject.name);
            
            return {
                id: student.id,
                name: student.name,
                email: student.email,
                organization: student.organization,
                yearLevel: student.yearLevel,
                class: student.class,
                active: student.active,
                subjects: subjects,
                uniqueAssessments: uniqueAssessments,
                completedUniqueAssessments: completedUniqueAssessments,
                completionRate: parseFloat(completionRate),
                averageScore: parseFloat(averageScore),
                loginDays: loginDays,
                totalSubmissions: totalSubmissions,
                submissionsPerLoginDay: submissionsPerLoginDay,
                engagementPattern: engagementPattern,
                lastLogin: student.lastLogin,
                lastActivity: lastActivity ? lastActivity.toISOString() : null
            };
        });

        res.json(studentPerformanceData);

    } catch (error) {
        console.error('Student performance API error:', error);
        res.status(500).json({ error: 'Failed to load student performance data' });
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

// Login without activity tracking endpoint
app.get('/api/teacher/login-without-activity', auth, async (req, res) => {
    try {
        // Check if user is teacher or admin
        const user = await prisma.user.findUnique({
            where: { id: req.user.userId }
        });

        if (user.role !== 'TEACHER' && user.role !== 'ADMIN') {
            return res.status(403).json({ error: 'Access denied. Teachers and admins only.' });
        }

        const { days = 30, quarter } = req.query;
        const daysAgo = new Date();
        daysAgo.setDate(daysAgo.getDate() - parseInt(days));

        console.log(`Analyzing login without activity for the past ${days} days...`);

        // Get all active students with their login sessions and assessment submissions
        const students = await prisma.user.findMany({
            where: { 
                role: 'STUDENT',
                active: true  // Only include active students
            },
            include: {
                sessions: {
                    where: {
                        startTime: {
                            gte: daysAgo
                        }
                    },
                    orderBy: {
                        startTime: 'desc'
                    }
                },
                assessmentSubmissions: {
                    where: {
                        submittedAt: {
                            gte: daysAgo
                        }
                    },
                    orderBy: {
                        submittedAt: 'desc'
                    }
                },
                studentCourses: {
                    include: {
                        subject: true
                    }
                }
            },
            orderBy: { name: 'asc' }
        });

        // Analyze each student's login vs activity pattern
        const analysis = students.map(student => {
            const loginSessions = student.sessions;
            const recentSubmissions = student.assessmentSubmissions;
            
            // Count distinct login days
            const loginDays = new Set(loginSessions.map(s => 
                new Date(s.startTime).toDateString()
            )).size;
            
            // Count distinct activity days (submission days)
            const activityDays = new Set(recentSubmissions.map(s => 
                new Date(s.submittedAt).toDateString()
            )).size;
            
            // Find login sessions that didn't result in activity
            const loginWithoutActivity = loginSessions.filter(session => {
                const sessionDate = new Date(session.startTime).toDateString();
                const hadActivityOnDay = recentSubmissions.some(submission => 
                    new Date(submission.submittedAt).toDateString() === sessionDate
                );
                return !hadActivityOnDay;
            });
            
            // Calculate engagement metrics
            const totalLoginSessions = loginSessions.length;
            const sessionsWithActivity = totalLoginSessions - loginWithoutActivity.length;
            const sessionsWithoutActivity = loginWithoutActivity.length;
            const activityRate = totalLoginSessions > 0 ? 
                ((sessionsWithActivity / totalLoginSessions) * 100).toFixed(1) : 0;
            
            // Determine engagement pattern
            let engagementPattern = 'Unknown';
            if (totalLoginSessions === 0) {
                engagementPattern = 'No Logins';
            } else if (sessionsWithoutActivity === 0) {
                engagementPattern = 'Always Active';
            } else if (sessionsWithoutActivity === totalLoginSessions) {
                engagementPattern = 'Login Only - No Activity';
            } else if (activityRate >= 75) {
                engagementPattern = 'Highly Engaged';
            } else if (activityRate >= 50) {
                engagementPattern = 'Moderately Engaged';
            } else if (activityRate >= 25) {
                engagementPattern = 'Low Engagement';
            } else {
                engagementPattern = 'Minimal Engagement';
            }
            
            // Get last login and last activity
            const lastLogin = loginSessions.length > 0 ? 
                new Date(loginSessions[0].startTime) : null;
            const lastActivity = recentSubmissions.length > 0 ? 
                new Date(recentSubmissions[0].submittedAt) : null;
            
            // Calculate days since last login and activity
            const now = new Date();
            const daysSinceLogin = lastLogin ? 
                Math.floor((now - lastLogin) / (1000 * 60 * 60 * 24)) : 'Never';
            const daysSinceActivity = lastActivity ? 
                Math.floor((now - lastActivity) / (1000 * 60 * 60 * 24)) : 'Never';
            
            return {
                id: student.id,
                name: student.name,
                email: student.email,
                organization: student.organization,
                yearLevel: student.yearLevel,
                class: student.class,
                active: student.active,
                subjects: student.studentCourses.map(sc => sc.subject.name),
                totalLoginSessions,
                sessionsWithActivity,
                sessionsWithoutActivity,
                activityRate: parseFloat(activityRate),
                engagementPattern,
                loginDays,
                activityDays,
                lastLogin: lastLogin ? lastLogin.toISOString() : null,
                lastActivity: lastActivity ? lastActivity.toISOString() : null,
                daysSinceLogin,
                daysSinceActivity,
                loginWithoutActivitySessions: loginWithoutActivity.map(session => ({
                    id: session.id,
                    startTime: session.startTime,
                    endTime: session.endTime,
                    duration: session.duration,
                    ipAddress: session.ipAddress
                }))
            };
        });
        
        // Calculate summary statistics
        const totalStudents = analysis.length;
        const studentsWithLogins = analysis.filter(s => s.totalLoginSessions > 0).length;
        const studentsWithActivity = analysis.filter(s => s.sessionsWithActivity > 0).length;
        const studentsLoginOnly = analysis.filter(s => s.engagementPattern === 'Login Only - No Activity').length;
        const studentsNoLogins = analysis.filter(s => s.engagementPattern === 'No Logins').length;
        
        const averageActivityRate = analysis.reduce((sum, s) => sum + s.activityRate, 0) / totalStudents;
        
        const summary = {
            totalStudents,
            studentsWithLogins,
            studentsWithActivity,
            studentsLoginOnly,
            studentsNoLogins,
            averageActivityRate: averageActivityRate.toFixed(1),
            analysisPeriod: `${days} days`,
            analysisDate: new Date().toISOString()
        };
        
        res.json({
            summary,
            students: analysis
        });
        
    } catch (error) {
        console.error('Login without activity analysis error:', error);
        res.status(500).json({ error: 'Failed to analyze login without activity patterns' });
    }
});

