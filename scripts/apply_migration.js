const { PrismaClient } = require('@prisma/client');
const { execSync } = require('child_process');
const path = require('path');

async function applyMigration() {
    try {
        // Execute the SQL migration directly
        const migrationPath = path.join(__dirname, '..', 'prisma/migrations/20250414000001_remove_email_unique_again/migration.sql');
        const sql = require('fs').readFileSync(migrationPath, 'utf8');
        
        const prisma = new PrismaClient();
        await prisma.$executeRawUnsafe(sql);
        
        console.log('Migration applied successfully');
        await prisma.$disconnect();
    } catch (error) {
        console.error('Error applying migration:', error);
        process.exit(1);
    }
}

applyMigration(); 