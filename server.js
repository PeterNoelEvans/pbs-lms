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
        const { name, description } = req.body;

        const unit = await prisma.unit.update({
            where: { id: unitId },
            data: { name, description }
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
        
        const subject = await prisma.subject.findUnique({
            where: { id: subjectId },
            include: {
                units: {
                    include: {
                        parts: {
                            include: {
                                sections: {
                                    include: {
                                        resources: true
                                    }
                                }
                            }
                        }
                    }
                }
            }
        });

        if (!subject) {
            return res.status(404).json({ error: 'Subject not found' });
        }

        // Flatten the resources array
        const resources = [];
        subject.units.forEach(unit => {
            unit.parts.forEach(part => {
                part.sections.forEach(section => {
                    section.resources.forEach(resource => {
                        resources.push({
                            ...resource,
                            unitId: unit.id,
                            partId: part.id,
                            sectionId: section.id
                        });
                    });
                });
            });
        });

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
        
        const resource = await prisma.resource.create({
            data: {
                title,
                description,
                type,
                url: type === 'link' ? url : req.file ? `/uploads/resources/${req.file.filename}` : null,
                subject: { connect: { id: subjectId } },
                unit: unitId ? { connect: { id: unitId } } : undefined,
                part: partId ? { connect: { id: partId } } : undefined,
                section: sectionId ? { connect: { id: sectionId } } : undefined,
                uploadedBy: { connect: { id: req.user.userId } }
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

// Start server
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
