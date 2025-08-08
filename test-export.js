const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

async function testExport() {
    try {
        console.log('Testing export functionality...');
        
        // Test if we can access the database
        const userCount = await prisma.user.count();
        console.log(`Total users: ${userCount}`);
        
        const subjectCount = await prisma.subject.count();
        console.log(`Total subjects: ${subjectCount}`);
        
        const assessmentCount = await prisma.assessment.count();
        console.log(`Total assessments: ${assessmentCount}`);
        
        // Test if ExcelJS is available
        try {
            const ExcelJS = require('exceljs');
            console.log('ExcelJS is available');
            
            const workbook = new ExcelJS.Workbook();
            workbook.creator = 'LMS System';
            console.log('Workbook created successfully');
            
        } catch (excelError) {
            console.error('ExcelJS error:', excelError.message);
        }
        
    } catch (error) {
        console.error('Test error:', error);
    } finally {
        await prisma.$disconnect();
    }
}

testExport(); 