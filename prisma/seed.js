const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcrypt');
const prisma = new PrismaClient();

async function main() {
    // Create users
    const admin = await prisma.user.upsert({
        where: { nickname: 'admin' },
        update: {},
        create: {
            name: 'Admin User',
            email: 'admin@example.com',
            password: await bcrypt.hash('adminpass', 10),
            role: 'ADMIN',
            nickname: 'admin'
        }
    });
    const teacher = await prisma.user.upsert({
        where: { nickname: 'teacher' },
        update: {},
        create: {
            name: 'Teacher User',
            email: 'teacher@example.com',
            password: await bcrypt.hash('teacherpass', 10),
            role: 'TEACHER',
            nickname: 'teacher'
        }
    });
    const student = await prisma.user.upsert({
        where: { nickname: 'student' },
        update: {},
        create: {
            name: 'Student User',
            email: 'student@example.com',
            password: await bcrypt.hash('studentpass', 10),
            role: 'STUDENT',
            nickname: 'student',
            yearLevel: 7,
            class: 'M1/1'
        }
    });

    // Create core subject
    const coreSubject = await prisma.coreSubject.upsert({
        where: { name: 'English' },
        update: {},
        create: {
            name: 'English',
            description: 'English Language'
        }
    });

    // Create subject
    const subject = await prisma.subject.upsert({
        where: { name_coreSubjectId_yearLevel: {
            name: "Let's Find Out Book 1",
            coreSubjectId: coreSubject.id,
            yearLevel: 7
        }},
        update: {},
        create: {
            name: "Let's Find Out Book 1",
            description: 'English for M1',
            yearLevel: 7,
            coreSubject: { connect: { id: coreSubject.id } },
            teachers: { create: { teacherId: teacher.id } }
        }
    });

    // Create unit, part, section
    const unit = await prisma.unit.create({
        data: {
            name: 'Unit 1',
            description: 'All About Me',
            order: 1,
            subject: { connect: { id: subject.id } }
        }
    });
    const part = await prisma.part.create({
        data: {
            name: 'Lesson 1',
            description: 'Introductions',
            order: 1,
            unit: { connect: { id: unit.id } }
        }
    });
    const section = await prisma.section.create({
        data: {
            name: 'Section 1',
            description: 'Matching Expressions',
            order: 1,
            part: { connect: { id: part.id } }
        }
    });

    // Create assessment (matching type)
    const assessment = await prisma.assessment.create({
        data: {
            title: 'Expressions Quiz',
            type: 'quiz',
            questions: [
                {
                    type: 'matching',
                    text: 'Match the expressions with their meanings.',
                    pairs: [
                        { expression: 'Finally!', meaning: 'It took a long time, but it happened.' },
                        { expression: 'Weird!', meaning: 'That is strange or unusual!' },
                        { expression: 'I hope so.', meaning: 'I want that to happen.' }
                    ]
                }
            ],
            section: { connect: { id: section.id } },
            createdBy: { connect: { id: teacher.id } }
        }
    });

    // Enroll student in subject
    await prisma.studentCourse.create({
        data: {
            studentId: student.id,
            subjectId: subject.id
        }
    });

    // Create a sample assessment submission
    await prisma.assessmentSubmission.create({
        data: {
            answers: { 0: { matching: { 0: 0, 1: 1, 2: 2 } } },
            score: 100,
            assessment: { connect: { id: assessment.id } },
            student: { connect: { id: student.id } }
        }
    });

    console.log('Seed data created successfully!');
}

main()
    .catch((e) => {
        console.error(e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    }); 