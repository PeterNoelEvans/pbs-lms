const jwt = require('jsonwebtoken');
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

const auth = async (req, res, next) => {
    try {
        // Get token from header
        const authHeader = req.headers.authorization;
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return res.status(401).json({ error: 'No token provided' });
        }

        const token = authHeader.split(' ')[1];

        // Verify token
        const decoded = jwt.verify(token, process.env.JWT_SECRET || 'your-secret-key');
        
        // Get user from database to ensure they exist and get their role
        const user = await prisma.user.findUnique({
            where: { id: decoded.userId },
            select: {
                id: true,
                role: true,
                class: true,
                yearLevel: true
            }
        });

        if (!user) {
            return res.status(401).json({ error: 'Invalid token - user not found' });
        }

        // Add user info to request
        req.user = {
            userId: user.id,
            role: user.role.toUpperCase(), // Normalize role to uppercase
            class: user.class,
            yearLevel: user.yearLevel
        };

        // For student routes, verify class/yearLevel info exists
        if (req.path.startsWith('/api/student') && user.role.toUpperCase() === 'STUDENT') {
            if (!user.class || !user.yearLevel) {
                return res.status(403).json({ error: 'Student class or year information missing' });
            }
        }

        next();
    } catch (error) {
        console.error('Auth middleware error:', error);
        if (error.name === 'JsonWebTokenError') {
            return res.status(401).json({ error: 'Invalid token' });
        }
        if (error.name === 'TokenExpiredError') {
            return res.status(401).json({ error: 'Token expired' });
        }
        res.status(403).json({ error: 'Authentication failed' });
    }
};

module.exports = auth; 