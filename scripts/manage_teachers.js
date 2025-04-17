const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function listTeachers() {
    try {
        const teachers = await prisma.user.findMany({
            where: {
                role: 'teacher'
            },
            select: {
                id: true,
                name: true,
                email: true,
                nickname: true
            }
        });

        console.log('\nTeachers List:');
        console.log('ID\tName\t\tEmail\t\t\tNickname');
        console.log('----------------------------------------');
        teachers.forEach(teacher => {
            console.log(`${teacher.id}\t${teacher.name}\t${teacher.email}\t${teacher.nickname}`);
        });
        return teachers;
    } catch (error) {
        console.error('Error listing teachers:', error);
        return [];
    }
}

async function deleteTeacher(teacherId) {
    try {
        const teacher = await prisma.user.findUnique({
            where: { id: teacherId },
            select: { role: true }
        });

        if (!teacher) {
            console.log('Teacher not found');
            return false;
        }

        if (teacher.role !== 'teacher') {
            console.log('This user is not a teacher');
            return false;
        }

        await prisma.user.delete({
            where: { id: teacherId }
        });

        console.log('Teacher account successfully deleted');
        return true;
    } catch (error) {
        console.error('Error deleting teacher:', error);
        return false;
    }
}

async function main() {
    const readline = require('readline').createInterface({
        input: process.stdin,
        output: process.stdout
    });

    while (true) {
        console.log('\nTeacher Management System');
        console.log('1. List all teachers');
        console.log('2. Delete a teacher');
        console.log('3. Exit');

        const choice = await new Promise(resolve => {
            readline.question('\nEnter your choice (1-3): ', resolve);
        });

        switch (choice) {
            case '1':
                await listTeachers();
                break;
            case '2':
                const teachers = await listTeachers();
                const teacherId = await new Promise(resolve => {
                    readline.question('\nEnter the ID of the teacher to delete: ', resolve);
                });
                await deleteTeacher(parseInt(teacherId));
                break;
            case '3':
                readline.close();
                process.exit(0);
                break;
            default:
                console.log('Invalid choice. Please try again.');
        }
    }
}

main()
    .catch(e => {
        console.error(e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    }); 