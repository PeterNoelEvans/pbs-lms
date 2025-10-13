const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

async function debugActiveAbigail() {
    try {
        console.log('=== Debug Active Abigail ===\n');
        
        // Find the active Abigail account
        const activeAbigail = await prisma.user.findUnique({
            where: {
                id: '009e27ea-72d4-4eb4-9658-92131a42b3c2'
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
        
        if (!activeAbigail) {
            console.log('Active Abigail not found');
            return;
        }
        
        console.log(`Active Abigail: ${activeAbigail.name} (ID: ${activeAbigail.id})`);
        console.log(`Active: ${activeAbigail.active}`);
        console.log(`Last login: ${activeAbigail.lastLogin}`);
        console.log(`Total sessions: ${activeAbigail.sessions.length}`);
        console.log(`Total submissions: ${activeAbigail.assessmentSubmissions.length}`);
        
        // Check sessions
        console.log('\n=== Session Analysis ===');
        const sessionsWithEndTime = activeAbigail.sessions.filter(s => s.endTime !== null);
        const sessionsWithDuration = activeAbigail.sessions.filter(s => s.duration !== null && s.duration > 0);
        
        console.log(`Sessions with endTime: ${sessionsWithEndTime.length}`);
        console.log(`Sessions with duration: ${sessionsWithDuration.length}`);
        
        // Check Q2 sessions
        const q2Start = new Date('2025-07-21');
        const q2End = new Date('2025-10-01');
        
        const q2Sessions = activeAbigail.sessions.filter(session => {
            const sessionDate = new Date(session.startTime);
            return sessionDate >= q2Start && sessionDate < q2End;
        });
        
        console.log(`Q2 sessions: ${q2Sessions.length}`);
        
        const q2ClassDaySessions = q2Sessions.filter(session => {
            const dayOfWeek = new Date(session.startTime).getDay();
            const hour = new Date(session.startTime).getHours();
            return (dayOfWeek === 4 || dayOfWeek === 5) && hour >= 8 && hour < 16;
        });
        
        console.log(`Q2 class day sessions: ${q2ClassDaySessions.length}`);
        
        if (q2ClassDaySessions.length > 0) {
            console.log('\nQ2 class day sessions:');
            q2ClassDaySessions.forEach((session, index) => {
                const dayOfWeek = new Date(session.startTime).getDay();
                const dayName = dayOfWeek === 4 ? 'Thu' : 'Fri';
                console.log(`${index + 1}. ${dayName} ${session.startTime.toDateString()} ${session.startTime.toTimeString().split(' ')[0]} - End: ${session.endTime || 'null'} - Duration: ${session.duration || 'null'}`);
            });
        }
        
        // Check English course
        const englishCourse = activeAbigail.studentCourses.find(sc => 
            sc.subject.coreSubject.name.toLowerCase().includes('english')
        );
        
        if (englishCourse) {
            console.log(`\nEnglish course: ${englishCourse.subject.name}`);
            
            // Get Q2 assessments
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
                            studentId: activeAbigail.id
                        }
                    }
                }
            });
            
            console.log(`Q2 English assessments: ${assessments.length}`);
            
            const totalSubmissions = assessments.flatMap(a => a.submissions || []);
            console.log(`Q2 submissions: ${totalSubmissions.length}`);
            
            if (totalSubmissions.length > 0) {
                console.log('\nQ2 submissions:');
                totalSubmissions.forEach((submission, index) => {
                    console.log(`${index + 1}. ${submission.assessment.title} - ${submission.submittedAt} - Score: ${submission.score}`);
                });
            }
        }
        
        // Simulate English report calculation
        console.log('\n=== English Report Calculation ===');
        
        const quarter = 'Q2';
        const quarterStart = new Date(`${quarter === 'Q1' ? '2025-05-01' : '2025-07-21'}`);
        const quarterEnd = new Date(`${quarter === 'Q1' ? '2025-07-21' : '2025-10-01'}`);
        
        // Calculate login days
        const loginDays = new Set(activeAbigail.sessions.map(s => new Date(s.startTime).toDateString())).size;
        console.log(`Login days: ${loginDays}`);
        
        // Calculate quarter sessions
        const quarterSessions = activeAbigail.sessions.filter(session => {
            const sessionDate = new Date(session.startTime);
            return sessionDate >= quarterStart && sessionDate < quarterEnd;
        });
        
        console.log(`Quarter sessions: ${quarterSessions.length}`);
        
        // Calculate class day sessions
        const classDaySessions = quarterSessions.filter(session => {
            const dayOfWeek = new Date(session.startTime).getDay();
            const hour = new Date(session.startTime).getHours();
            return (dayOfWeek === 4 || dayOfWeek === 5) && hour >= 8 && hour < 16;
        });
        
        console.log(`Class day sessions: ${classDaySessions.length}`);
        
        // Calculate duration metrics
        const totalClassDayDuration = classDaySessions.reduce((sum, session) => {
            let sessionDuration = 0;
            if (session.duration && session.duration > 0) {
                sessionDuration = session.duration;
            } else if (session.endTime) {
                sessionDuration = Math.round((new Date(session.endTime) - new Date(session.startTime)) / 1000);
            }
            return sum + sessionDuration;
        }, 0);
        
        const completedSessions = classDaySessions.filter(session => {
            if (session.duration && session.duration > 0) return true;
            if (session.endTime) {
                const calculatedDuration = Math.round((new Date(session.endTime) - new Date(session.startTime)) / 1000);
                return calculatedDuration > 0;
            }
            return false;
        }).length;
        
        console.log(`\nDuration Analysis:`);
        console.log(`Total class day duration: ${totalClassDayDuration} seconds (${Math.round(totalClassDayDuration / 60)} minutes)`);
        console.log(`Completed sessions: ${completedSessions}/${classDaySessions.length}`);
        console.log(`Completion rate: ${classDaySessions.length > 0 ? Math.round((completedSessions / classDaySessions.length) * 100) : 0}%`);
        
    } catch (error) {
        console.error('Error:', error);
    } finally {
        await prisma.$disconnect();
    }
}

debugActiveAbigail();
