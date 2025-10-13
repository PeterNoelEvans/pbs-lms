const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

async function debugAbigailComplete() {
    try {
        console.log('=== Complete Abigail Debug ===\n');
        
        // Find Abigail
        const abigailUser = await prisma.user.findFirst({
            where: {
                name: {
                    contains: 'Abigail'
                }
            },
            include: {
                sessions: {
                    orderBy: { startTime: 'desc' }
                },
                studentCourses: {
                    include: {
                        subject: {
                            include: {
                                coreSubject: true
                            }
                        }
                    }
                },
                assessmentSubmissions: {
                    include: {
                        assessment: true
                    },
                    orderBy: { submittedAt: 'desc' }
                }
            }
        });
        
        if (!abigailUser) {
            console.log('Abigail not found');
            return;
        }
        
        console.log(`Found user: ${abigailUser.name} (ID: ${abigailUser.id})`);
        console.log(`Active: ${abigailUser.active}`);
        console.log(`Last login: ${abigailUser.lastLogin}`);
        
        // Check sessions
        console.log(`\nSessions: ${abigailUser.sessions.length}`);
        if (abigailUser.sessions.length > 0) {
            abigailUser.sessions.slice(0, 5).forEach((session, index) => {
                console.log(`${index + 1}. Start: ${session.startTime}, End: ${session.endTime}, Duration: ${session.duration}`);
            });
        }
        
        // Check student courses
        console.log(`\nStudent courses: ${abigailUser.studentCourses.length}`);
        abigailUser.studentCourses.forEach((course, index) => {
            console.log(`${index + 1}. ${course.subject.name} (${course.subject.coreSubject.name})`);
        });
        
        // Check English course
        const englishCourse = abigailUser.studentCourses.find(sc => 
            sc.subject.coreSubject.name.toLowerCase().includes('english')
        );
        
        if (englishCourse) {
            console.log(`\nEnglish course found: ${englishCourse.subject.name}`);
            
            // Get Q2 assessments for this subject
            const q2Start = new Date('2025-07-21');
            const q2End = new Date('2025-10-01');
            
            const assessments = await prisma.assessment.findMany({
                where: {
                    quarter: 'Q2',
                    section: {
                        part: {
                            unit: {
                                subjectId: englishCourse.subjectId
                            }
                        }
                    }
                },
                include: {
                    submissions: {
                        where: {
                            studentId: abigailUser.id
                        }
                    }
                }
            });
            
            console.log(`\nQ2 English assessments: ${assessments.length}`);
            
            const totalSubmissions = assessments.flatMap(a => a.submissions || []);
            console.log(`Total Q2 submissions: ${totalSubmissions.length}`);
            
            if (totalSubmissions.length > 0) {
                console.log('\nRecent submissions:');
                totalSubmissions.slice(0, 5).forEach((submission, index) => {
                    console.log(`${index + 1}. Assessment: ${submission.assessment.title}, Submitted: ${submission.submittedAt}, Score: ${submission.score}`);
                });
            }
        } else {
            console.log('\nNo English course found');
        }
        
        // Check all submissions
        console.log(`\nAll submissions: ${abigailUser.assessmentSubmissions.length}`);
        if (abigailUser.assessmentSubmissions.length > 0) {
            console.log('\nRecent submissions:');
            abigailUser.assessmentSubmissions.slice(0, 5).forEach((submission, index) => {
                console.log(`${index + 1}. Assessment: ${submission.assessment.title}, Submitted: ${submission.submittedAt}, Score: ${submission.score}`);
            });
        }
        
        // Check if there are any sessions in the database for this user ID
        const directSessions = await prisma.userSession.findMany({
            where: {
                userId: abigailUser.id
            },
            orderBy: {
                startTime: 'desc'
            }
        });
        
        console.log(`\nDirect session query: ${directSessions.length} sessions`);
        if (directSessions.length > 0) {
            directSessions.slice(0, 5).forEach((session, index) => {
                console.log(`${index + 1}. Start: ${session.startTime}, End: ${session.endTime}, Duration: ${session.duration}`);
            });
        }
        
    } catch (error) {
        console.error('Error:', error);
    } finally {
        await prisma.$disconnect();
    }
}

debugAbigailComplete();
