const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function listAndUpdateSubjects() {
    try {
        // First, list all subjects
        const subjects = await prisma.subject.findMany({
            include: {
                coreSubject: true
            }
        });

        console.log('All subjects:', subjects.map(s => ({
            id: s.id,
            name: s.name,
            yearLevel: s.yearLevel,
            coreSubject: s.coreSubject.name
        })));

        if (subjects.length === 0) {
            console.log('No subjects found in the database');
            return;
        }

        // Ask user to confirm before updating
        console.log('\nFound subjects. Please check the console output and update the script with the correct subject ID before proceeding with the update.');
    } catch (error) {
        console.error('Error:', error);
    } finally {
        await prisma.$disconnect();
    }
}

listAndUpdateSubjects(); 