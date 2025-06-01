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

        // Find all users with this email using findMany instead of findUnique
        const users = await prisma.user.findMany({
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
                nickname: authenticatedUser.nickname
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
                    // Fetch linked assessments for this resource
                    const resourceWithAssessments = await prisma.resource.findUnique({
                        where: { id: resource.id },
                        include: { assessments: true }
                    });
                    
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
                        assessments: resourceWithAssessments.assessments.map(a => ({
                            id: a.id,
                            title: a.title,
                            type: a.type
                        }))
                    });
                }
            }
        }

        console.log('Found resources:', resources); // Debug log
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
        
        const resource = await prisma.resource.create({
            data: {
                title,
                description,
                type,
                url: filePath,
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

        // For each resource, include its linked assessments
        const resourcesWithAssessments = await Promise.all(topic.resources.map(async resource => {
            const resourceWithAssessments = await prisma.resource.findUnique({
                where: { id: resource.id },
                include: { assessments: true }
            });
            // Extract audioPath from metadata if it exists
            let audioPath = null;
            if (resource.metadata && typeof resource.metadata === 'object' && resource.metadata.audioPath) {
                audioPath = resource.metadata.audioPath;
            }
            return {
                ...resource,
                audioPath: audioPath,
                assessments: resourceWithAssessments.assessments.map(a => ({
                    id: a.id,
                    title: a.title,
                    type: a.type
                }))
            };
        }));

        // Sort by order field
        resourcesWithAssessments.sort((a, b) => (a.order ?? 0) - (b.order ?? 0));

        res.json(resourcesWithAssessments);
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
        const { title, description, type, questions, dueDate, maxAttempts, category, topicId, weeklyScheduleId, criteria, audioFile } = req.body;
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
        const assessment = await prisma.assessment.create({
            data: {
                title: title.trim(),
                description,
                type,
                category: category,
                criteria, // Ensure criteria is included
                questions: parsedQuestions,
                dueDate: dueDate ? new Date(dueDate) : null,
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
        const { title, description, type, questions, dueDate, maxAttempts, category, topicId, weeklyScheduleId, criteria } = req.body;
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
        const assessments = await prisma.assessment.findMany({
            // Removed userId filter so all assessments are shown
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
                mediaFiles: true
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

        console.log(`Found ${assessments.length} assessments, ${uniqueAssessments.length} are unique`);
        res.json(uniqueAssessments);
    } catch (error) {
        console.error('Error fetching teacher assessments:', error);
        res.status(500).json({ error: 'Failed to fetch assessments' });
    }
});

// Get all assessments for a specific subject
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
                mediaFiles: true
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

        console.log(`Found ${assessments.length} assessments, ${uniqueAssessments.length} are unique`);
        res.json(uniqueAssessments);
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
        const resource = await prisma.resource.findUnique({
            where: { id: resourceId },
            include: { assessments: true }
        });
        if (!resource) return res.status(404).json({ error: 'Resource not found' });
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
        if (!Array.isArray(assessmentIds)) return res.status(400).json({ error: 'assessmentIds must be an array' });
        const resource = await prisma.resource.update({
            where: { id: resourceId },
            data: { assessments: { set: assessmentIds.map(id => ({ id })) } },
            include: { assessments: true }
        });
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
                submittedAt: new Date()
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
                                let status = 'Not Started';
                                if (attempts > 0 && bestScore === 100) status = 'Completed';
                                else if (attempts > 0) status = 'In Progress';
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
                                    subjectName: subject.name || null,
                                    unitName: unit.name || null,
                                    partName: part.name || null,
                                    sectionName: section.name || null
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
                                    const bestScore = submissions.length > 0 ? Math.max(...submissions.map(s => s.score || 0)) : null;
                                    const lastScore = submissions.length > 0 ? submissions[0].score : null;
                                    const lastAttempt = submissions.length > 0 ? submissions[0].submittedAt : null;
                                    let status = 'Not Started';
                                    if (attempts > 0 && bestScore === 100) status = 'Completed';
                                    else if (attempts > 0) status = 'In Progress';
                                    progress.push({
                                        studentName: student.name,
                                        studentNickname: student.nickname,
                                        studentClass: student.class,
                                        assessmentTitle: assessment.title || assessment.name,
                                        attempts,
                                        maxAttempts: assessment.maxAttempts || '-',
                                        bestScore,
                                        lastScore,
                                        lastAttempt,
                                        status
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

// Endpoint to get all classes for teacher's students
app.get('/api/teacher/classes', auth, async (req, res) => {
    try {
        const teacher = await prisma.user.findUnique({
            where: { id: req.user.userId },
            include: {
                subjectTeacher: {
                    include: {
                        subject: {
                            include: {
                                studentCourses: {
                                    include: { student: true }
                                }
                            }
                        }
                    }
                }
            }
        });
        if (!teacher || !teacher.subjectTeacher) return res.json({ classes: [] });
        const classSet = new Set();
        for (const subjT of teacher.subjectTeacher) {
            const subject = subjT.subject;
            if (!subject || !subject.studentCourses) continue;
            for (const sc of subject.studentCourses) {
                if (sc.student && sc.student.class) classSet.add(sc.student.class);
            }
        }
        res.json({ classes: Array.from(classSet).sort() });
    } catch (error) {
        console.error('Error fetching teacher classes:', error);
        res.status(500).json({ error: 'Failed to fetch classes' });
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
