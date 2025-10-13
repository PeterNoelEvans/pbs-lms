const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

async function findAbigailVariants() {
    try {
        console.log('=== Finding Abigail Variants ===\n');
        
        // Search for all users with "Abigail" in name
        const abigailUsers = await prisma.user.findMany({
            where: {
                name: {
                    contains: 'Abigail'
                }
            },
            include: {
                sessions: {
                    orderBy: { startTime: 'desc' },
                    take: 5
                },
                assessmentSubmissions: {
                    orderBy: { submittedAt: 'desc' },
                    take: 5
                },
                studentCourses: {
                    include: {
                        subject: {
                            include: {
                                coreSubject: true
                            }
                        }
                    }
                }
            }
        });
        
        console.log(`Found ${abigailUsers.length} users with "Abigail" in name:`);
        
        abigailUsers.forEach((user, index) => {
            console.log(`\n${index + 1}. ${user.name} (ID: ${user.id})`);
            console.log(`   Active: ${user.active}`);
            console.log(`   Last login: ${user.lastLogin}`);
            console.log(`   Sessions: ${user.sessions.length}`);
            console.log(`   Submissions: ${user.assessmentSubmissions.length}`);
            console.log(`   Courses: ${user.studentCourses.length}`);
            
            if (user.sessions.length > 0) {
                console.log('   Recent sessions:');
                user.sessions.forEach((session, i) => {
                    console.log(`     ${i + 1}. ${session.startTime} - End: ${session.endTime || 'null'} - Duration: ${session.duration || 'null'}`);
                });
            }
            
            if (user.assessmentSubmissions.length > 0) {
                console.log('   Recent submissions:');
                user.assessmentSubmissions.forEach((submission, i) => {
                    console.log(`     ${i + 1}. ${submission.assessment.title} - ${submission.submittedAt} - Score: ${submission.score}`);
                });
            }
        });
        
        // Also search for "Quiming" or "Flores"
        const quimingUsers = await prisma.user.findMany({
            where: {
                OR: [
                    { name: { contains: 'Quiming' } },
                    { name: { contains: 'Flores' } }
                ]
            },
            include: {
                sessions: {
                    orderBy: { startTime: 'desc' },
                    take: 3
                },
                assessmentSubmissions: {
                    orderBy: { submittedAt: 'desc' },
                    take: 3
                }
            }
        });
        
        console.log(`\nFound ${quimingUsers.length} users with "Quiming" or "Flores":`);
        quimingUsers.forEach((user, index) => {
            console.log(`${index + 1}. ${user.name} (ID: ${user.id}) - Sessions: ${user.sessions.length}, Submissions: ${user.assessmentSubmissions.length}`);
        });
        
        // Search for users with many sessions
        const usersWithManySessions = await prisma.user.findMany({
            include: {
                _count: {
                    select: {
                        sessions: true,
                        assessmentSubmissions: true
                    }
                }
            },
            orderBy: {
                sessions: {
                    _count: 'desc'
                }
            },
            take: 10
        });
        
        console.log('\nTop 10 users by session count:');
        usersWithManySessions.forEach((user, index) => {
            console.log(`${index + 1}. ${user.name} - Sessions: ${user._count.sessions}, Submissions: ${user._count.assessmentSubmissions}`);
        });
        
    } catch (error) {
        console.error('Error:', error);
    } finally {
        await prisma.$disconnect();
    }
}

findAbigailVariants();
