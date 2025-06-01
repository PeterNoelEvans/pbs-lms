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

async function updateStudentYearLevel() {
    try {
        // Define the email and new year level/class
        const studentEmail = 'ptest@gmail.com';
        const newYearLevel = 8; // 8 corresponds to M1
        const newClass = 'M2/1';

        // Find the student by email
        const student = await prisma.user.findFirst({
            where: {
                email: studentEmail,
                role: 'STUDENT'
            }
        });

        if (!student) {
            console.log(`No student found with email: ${studentEmail}`);
            return;
        }

        console.log('Found student:', {
            id: student.id,
            name: student.name,
            email: student.email,
            currentYearLevel: student.yearLevel,
            currentClass: student.class
        });

        // Update the student's year level and class
        const updatedStudent = await prisma.user.update({
            where: {
                id: student.id
            },
            data: {
                yearLevel: newYearLevel,
                class: newClass
            }
        });

        console.log(`Successfully updated student ${studentEmail}:`, {
            name: updatedStudent.name,
            newYearLevel: updatedStudent.yearLevel,
            newClass: updatedStudent.class
        });
    } catch (error) {
        console.error('Error:', error);
    } finally {
        await prisma.$disconnect();
    }
}

listAndUpdateSubjects();
updateStudentYearLevel(); 