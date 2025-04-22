require('dotenv').config();
const express = require('express');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const path = require('path');
const cors = require('cors');
const auth = require('./middleware/auth');
const { PrismaClient } = require('@prisma/client');
const multer = require('multer');

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

// Login endpoint
app.post('/api/login', async (req, res) => {
    try {
        const { email, password } = req.body;

        // Find user using Prisma
        const user = await prisma.user.findUnique({
            where: { email },
            select: {
                id: true,
                name: true,
                email: true,
                password: true,
                role: true,
                class: true,
                yearLevel: true,
                nickname: true
            }
        });

        if (!user) {
            return res.status(400).json({ 
                success: false, 
                error: 'Invalid email or password' 
            });
        }

        // Validate password
        const isValidPassword = await bcrypt.compare(password, user.password);
        if (!isValidPassword) {
            return res.status(400).json({ 
                success: false, 
                error: 'Invalid email or password' 
            });
        }

        // If class is M1/1 but year level is 1, update it to 7
        if (user.class === 'M1/1' && user.yearLevel === 1) {
            await prisma.user.update({
                where: { id: user.id },
                data: { yearLevel: 7 }
            });
            user.yearLevel = 7;
        }

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
                role: user.role.toUpperCase(),
                class: user.class,
                yearLevel: user.yearLevel,
                nickname: user.nickname
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
        const { name, nickname, email, password, role, year, class: studentClass } = req.body;

        // Check if user already exists
        const existingUser = await prisma.user.findUnique({
            where: { email }
        });

        if (existingUser) {
            return res.status(400).json({ 
                success: false, 
                error: 'Email already registered' 
            });
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
                active: true
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
                nickname: user.nickname
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

        // Create a map of unit names to their structure
        const unitMap = {};
        subject.units.forEach(unit => {
            unitMap[unit.name] = {
                unitId: unit.id,
                parts: unit.parts
            };
        });

        // Map resources to their units
        const resources = [];
        subject.topics.forEach(topic => {
            const unitInfo = unitMap[topic.name];
            if (unitInfo) {
                topic.resources.forEach(resource => {
                    resources.push({
                        ...resource,
                        unitId: unitInfo.unitId
                    });
                });
            }
        });

        console.log('Found resources:', resources); // Debug log
        res.json(resources);
    } catch (error) {
        console.error('Error fetching resources:', error);
        res.status(500).json({ error: 'Failed to fetch resources' });
    }
});

// Add a new resource
app.post('/api/resources', auth, upload.single('file'), async (req, res) => {
    try {
        const { title, description, type, url, subjectId, unitId, partId, sectionId } = req.body;
        
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
        if (req.file) {
            filePath = `/uploads/resources/${req.file.filename}`;
        } else if (type === 'link' && url) {
            filePath = url;
        }
        
        const resource = await prisma.resource.create({
            data: {
                title,
                description,
                type,
                url: filePath,
                topic: {
                    connect: { id: topic.id }
                },
                createdBy: { connect: { id: req.user.userId } }
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
            where: { sectionId },
            include: {
                mediaFiles: true,
                submissions: {
                    where: {
                        studentId: req.user.userId
                    }
                }
            },
            orderBy: {
                createdAt: 'desc'
            }
        });

        res.json(assessments);
    } catch (error) {
        console.error('Error fetching section assessments:', error);
        res.status(500).json({ error: 'Failed to fetch section assessments' });
    }
});

// Get total resources count for student's enrolled subjects
app.get('/api/student/resources/count', auth, async (req, res) => {
    try {
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
                resources: true
            }
        });

        // Count total resources
        const totalResources = topics.reduce((total, topic) => total + topic.resources.length, 0);

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

        res.json(topic.resources);
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
            .filter(assessment => assessment.type === 'quiz')
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
                submissions: {
                    where: {
                        studentId: req.user.userId
                    },
                    orderBy: {
                        submittedAt: 'desc'
                    },
                    take: 1
                }
            }
        });

        if (!assessment) {
            return res.status(404).json({ error: 'Assessment not found' });
        }

        res.json(assessment);
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
app.post('/api/sections/:sectionId/assessments', auth, upload.array('mediaFiles'), async (req, res) => {
    try {
        const { sectionId } = req.params;
        const { title, description, type, questions, dueDate } = req.body;

        // Validate required fields
        if (!title || !type) {
            return res.status(400).json({ error: 'Title and type are required' });
        }

        // Check if section exists
        const section = await prisma.section.findUnique({
            where: { id: sectionId }
        });

        if (!section) {
            return res.status(404).json({ error: 'Section not found' });
        }

        // Handle file uploads if any
        const mediaFiles = req.files ? req.files.map(file => ({
            filename: file.filename,
            path: `/uploads/resources/${file.filename}`,
            type: file.mimetype
        })) : [];

        // Create the assessment
        const assessment = await prisma.assessment.create({
            data: {
                title,
                description,
                type,
                questions: questions ? JSON.parse(questions) : [],
                dueDate: dueDate ? new Date(dueDate) : null,
                section: {
                    connect: { id: sectionId }
                },
                createdBy: {
                    connect: { id: req.user.userId }
                },
                mediaFiles: {
                    create: mediaFiles
                }
            },
            include: {
                mediaFiles: true,
                section: true
            }
        });

        res.json(assessment);
    } catch (error) {
        console.error('Error creating assessment:', error);
        res.status(500).json({ error: 'Failed to create assessment' });
    }
});

// Submit an assessment
app.post('/api/assessments/:assessmentId/submit', auth, async (req, res) => {
    try {
        const { assessmentId } = req.params;
        const { answers, score } = req.body;

        // Validate submission
        if (!answers) {
            return res.status(400).json({ error: 'Answers are required' });
        }

        // Create the submission
        const submission = await prisma.assessmentSubmission.create({
            data: {
                answers,
                score,
                assessment: {
                    connect: { id: assessmentId }
                },
                student: {
                    connect: { id: req.user.userId }
                }
            }
        });

        res.json(submission);
    } catch (error) {
        console.error('Error submitting assessment:', error);
        res.status(500).json({ error: 'Failed to submit assessment' });
    }
});

// Start server
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});

