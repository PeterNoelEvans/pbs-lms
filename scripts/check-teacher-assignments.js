const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function checkTeacherAssignments() {
    try {
        console.log('🧑‍🏫 TEACHER SUBJECT ASSIGNMENTS CHECKER\n');
        
        // Get all teachers
        const teachers = await prisma.user.findMany({
            where: { role: 'TEACHER' },
            include: {
                subjectTeacher: {
                    include: {
                        subject: true
                    }
                }
            }
        });
        
        console.log(`Found ${teachers.length} teachers:\n`);
        
        teachers.forEach((teacher, i) => {
            console.log(`${i + 1}. ${teacher.name} (${teacher.email})`);
            console.log(`   ID: ${teacher.id}`);
            console.log(`   Subject assignments: ${teacher.subjectTeacher.length}`);
            
            if (teacher.subjectTeacher.length > 0) {
                teacher.subjectTeacher.forEach((st, j) => {
                    console.log(`     ${j + 1}. ${st.subject.name}`);
                });
            } else {
                console.log('     ❌ No subject assignments');
            }
            console.log('');
        });
        
        // Check which teacher has the most assignments
        const teacherWithMostAssignments = teachers.reduce((max, teacher) => {
            return teacher.subjectTeacher.length > max.subjectTeacher.length ? teacher : max;
        }, teachers[0]);
        
        if (teacherWithMostAssignments?.subjectTeacher.length > 0) {
            console.log(`\n🎯 Teacher with most assignments: ${teacherWithMostAssignments.name}`);
            console.log(`   Use this teacher account to access student progress data.`);
            console.log(`   Email: ${teacherWithMostAssignments.email}`);
        }
        
        // Count total assessments available
        const allSubjects = await prisma.subject.findMany({
            include: {
                units: {
                    include: {
                        parts: {
                            include: {
                                sections: {
                                    include: {
                                        assessments: true
                                    }
                                }
                            }
                        }
                    }
                }
            }
        });
        
        let totalAssessments = 0;
        allSubjects.forEach(subject => {
            subject.units.forEach(unit => {
                unit.parts.forEach(part => {
                    part.sections.forEach(section => {
                        totalAssessments += section.assessments.length;
                    });
                });
            });
        });
        
        console.log(`\n📊 Total assessments in system: ${totalAssessments}`);
        
    } catch (error) {
        console.error('❌ Error:', error);
    } finally {
        await prisma.$disconnect();
    }
}

async function assignAllSubjectsToTeacher(teacherEmail) {
    try {
        console.log(`\n🔄 Assigning all subjects to ${teacherEmail}...\n`);
        
        // Find teacher
        const teacher = await prisma.user.findUnique({
            where: { email: teacherEmail }
        });
        
        if (!teacher) {
            console.log('❌ Teacher not found');
            return;
        }
        
        // Get all subjects
        const subjects = await prisma.subject.findMany();
        
        console.log(`Found ${subjects.length} subjects to assign...\n`);
        
        let assigned = 0;
        for (const subject of subjects) {
            try {
                await prisma.subjectTeacher.upsert({
                    where: {
                        subjectId_teacherId: {
                            subjectId: subject.id,
                            teacherId: teacher.id
                        }
                    },
                    update: {
                        isActive: true
                    },
                    create: {
                        subjectId: subject.id,
                        teacherId: teacher.id,
                        isActive: true,
                        role: 'EDITOR'
                    }
                });
                
                console.log(`✅ Assigned: ${subject.name}`);
                assigned++;
            } catch (error) {
                console.log(`❌ Failed to assign: ${subject.name} - ${error.message}`);
            }
        }
        
        console.log(`\n🎉 Successfully assigned ${assigned} subjects to ${teacher.name}!`);
        console.log(`   They can now access student progress for all subjects.`);
        
    } catch (error) {
        console.error('❌ Error:', error);
    } finally {
        await prisma.$disconnect();
    }
}

// Check command line arguments
const args = process.argv.slice(2);
if (args[0] === '--assign' && args[1]) {
    assignAllSubjectsToTeacher(args[1]);
} else {
    checkTeacherAssignments();
    console.log('\n💡 To assign all subjects to a teacher, run:');
    console.log('   node scripts/check-teacher-assignments.js --assign teacher@email.com');
}
