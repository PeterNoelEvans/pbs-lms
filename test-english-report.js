const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

async function testEnglishReport() {
    try {
        console.log('=== Testing English Report Logic ===\n');
        
        // Find Abigail
        const abigailUser = await prisma.user.findFirst({
            where: {
                name: {
                    contains: 'Abigail'
                }
            },
            include: {
                studentCourses: {
                    include: {
                        subject: {
                            include: {
                                coreSubject: true
                            }
                        }
                    }
                },
                sessions: {
                    orderBy: { startTime: 'desc' }
                }
            }
        });
        
        if (!abigailUser) {
            console.log('Abigail not found');
            return;
        }
        
        console.log(`Testing report for: ${abigailUser.name} (ID: ${abigailUser.id})`);
        console.log(`Active: ${abigailUser.active}`);
        console.log(`Sessions: ${abigailUser.sessions.length}`);
        
        // Simulate the English report logic
        const quarter = 'Q2';
        
        // Find English subject
        const englishSubject = abigailUser.studentCourses.find(sc => 
            sc.subject.coreSubject.name.toLowerCase().includes('english')
        );
        
        if (!englishSubject) {
            console.log('No English subject found');
            return;
        }
        
        console.log(`English subject: ${englishSubject.subject.name}`);
        
        // Get assessments for English subject in Q2
        const assessments = await prisma.assessment.findMany({
            where: {
                quarter: quarter,
                section: {
                    part: {
                        unit: {
                            subjectId: englishSubject.subjectId
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
        
        console.log(`Q2 assessments found: ${assessments.length}`);
        
        // Calculate quarter submissions
        const quarterStart = new Date(`${quarter === 'Q1' ? '2025-05-01' : '2025-07-21'}`);
        const quarterEnd = new Date(`${quarter === 'Q1' ? '2025-07-21' : '2025-10-01'}`);
        
        const quarterSubmissions = assessments
            .flatMap(a => a.submissions || [])
            .filter(s => {
                const submittedAt = new Date(s.submittedAt);
                return submittedAt >= quarterStart && submittedAt < quarterEnd;
            });
        
        console.log(`Quarter submissions: ${quarterSubmissions.length}`);
        
        // Calculate login days
        const loginDays = abigailUser.sessions ? 
            new Set(abigailUser.sessions.map(s => new Date(s.startTime).toDateString())).size : 0;
        
        console.log(`Login days: ${loginDays}`);
        
        // Calculate class day sessions
        const quarterSessions = abigailUser.sessions ? abigailUser.sessions.filter(session => {
            const sessionDate = new Date(session.startTime);
            return sessionDate >= quarterStart && sessionDate < quarterEnd;
        }) : [];
        
        console.log(`Quarter sessions: ${quarterSessions.length}`);
        
        const classDaySessions = quarterSessions.filter(session => {
            const dayOfWeek = new Date(session.startTime).getDay();
            const hour = new Date(session.startTime).getHours();
            return (dayOfWeek === 4 || dayOfWeek === 5) && hour >= 8 && hour < 16;
        });
        
        console.log(`Class day sessions: ${classDaySessions.length}`);
        
        // This should match what the report shows
        console.log('\n=== Expected Report Values ===');
        console.log(`Total submissions: ${quarterSubmissions.length}`);
        console.log(`Login days: ${loginDays}`);
        console.log(`Class day logins: ${classDaySessions.length}`);
        
    } catch (error) {
        console.error('Error:', error);
    } finally {
        await prisma.$disconnect();
    }
}

testEnglishReport();
