const bcrypt = require('bcrypt');
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function initializeDatabase() {
    try {
        // Create admin user
        const hashedAdminPassword = await bcrypt.hash('admin123', 10);
        const admin = await prisma.user.create({
            data: {
                name: 'Admin',
                email: 'admin@example.com',
                password: hashedAdminPassword,
                role: 'TEACHER',
                active: true
            }
        });
        console.log('Admin user created:', admin.email);

    } catch (error) {
        console.error('Error initializing database:', error);
    } finally {
        await prisma.$disconnect();
    }
}

// Run the initialization
initializeDatabase(); 