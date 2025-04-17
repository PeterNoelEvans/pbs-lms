const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function resetDatabase() {
    try {
        // Delete all data in reverse order of dependencies
        console.log('Deleting all data (preserving user accounts)...');
        
        // Delete StudentProgress
        await prisma.studentProgress.deleteMany();
        console.log('✓ Deleted all student progress');
        
        // Delete StudentCourse
        await prisma.studentCourse.deleteMany();
        console.log('✓ Deleted all student courses');
        
        // Delete Resource
        await prisma.resource.deleteMany();
        console.log('✓ Deleted all resources');
        
        // Delete Assessment
        await prisma.assessment.deleteMany();
        console.log('✓ Deleted all assessments');
        
        // Delete Section
        await prisma.section.deleteMany();
        console.log('✓ Deleted all sections');
        
        // Delete Part
        await prisma.part.deleteMany();
        console.log('✓ Deleted all parts');
        
        // Delete Unit
        await prisma.unit.deleteMany();
        console.log('✓ Deleted all units');
        
        // Delete Topic
        await prisma.topic.deleteMany();
        console.log('✓ Deleted all topics');
        
        // Delete WeeklySchedule
        await prisma.weeklySchedule.deleteMany();
        console.log('✓ Deleted all weekly schedules');
        
        // Delete Subject
        await prisma.subject.deleteMany();
        console.log('✓ Deleted all subjects');
        
        // Delete CoreSubject
        await prisma.coreSubject.deleteMany();
        console.log('✓ Deleted all core subjects');
        
        // Delete Book
        await prisma.book.deleteMany();
        console.log('✓ Deleted all books');

        console.log('\nDatabase reset complete! ✨');
        console.log('User accounts have been preserved.');
        
    } catch (error) {
        console.error('Error resetting database:', error);
    } finally {
        await prisma.$disconnect();
    }
}

resetDatabase(); 