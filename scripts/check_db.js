const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
    try {
        // Check if the User table exists and has any records
        const users = await prisma.user.findMany();
        console.log('\nAll Users in Database:');
        console.log('ID\tName\t\tEmail\t\t\tRole');
        console.log('----------------------------------------');
        users.forEach(user => {
            console.log(`${user.id}\t${user.name}\t${user.email}\t${user.role}`);
        });

        // Check the database schema
        const tables = await prisma.$queryRaw`
            SELECT name FROM sqlite_master 
            WHERE type='table' 
            AND name NOT LIKE 'sqlite_%'
            AND name NOT LIKE '_prisma_%'
        `;
        console.log('\nTables in Database:');
        console.log(tables);
    } catch (error) {
        console.error('Error checking database:', error);
    } finally {
        await prisma.$disconnect();
    }
}

main(); 