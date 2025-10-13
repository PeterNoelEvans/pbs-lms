const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

async function debugAbigailSessions() {
    try {
        console.log('=== Abigail Session Debug ===\n');
        
        // Find Abigail
        const abigailUser = await prisma.user.findFirst({
            where: {
                name: {
                    contains: 'Abigail'
                }
            }
        });
        
        if (!abigailUser) {
            console.log('Abigail not found');
            return;
        }
        
        console.log(`Found user: ${abigailUser.name} (ID: ${abigailUser.id})`);
        
        // Get all sessions for Abigail
        const allSessions = await prisma.userSession.findMany({
            where: {
                userId: abigailUser.id
            },
            orderBy: {
                startTime: 'desc'
            }
        });
        
        console.log(`\nTotal sessions for Abigail: ${allSessions.length}`);
        
        if (allSessions.length > 0) {
            console.log('\nRecent sessions (last 10):');
            allSessions.slice(0, 10).forEach((session, index) => {
                const dayOfWeek = new Date(session.startTime).getDay();
                const dayName = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][dayOfWeek];
                const hour = new Date(session.startTime).getHours();
                const isClassDay = (dayOfWeek === 4 || dayOfWeek === 5) && hour >= 8 && hour < 16;
                
                console.log(`${index + 1}. ${dayName} ${session.startTime.toDateString()} ${session.startTime.toTimeString().split(' ')[0]} - End: ${session.endTime || 'null'} - Duration: ${session.duration || 'null'} ${isClassDay ? '(Class Day)' : ''}`);
            });
            
            // Check Q1 sessions
            const q1Start = new Date('2025-05-01');
            const q1End = new Date('2025-07-21');
            
            const q1Sessions = allSessions.filter(session => {
                const sessionDate = new Date(session.startTime);
                return sessionDate >= q1Start && sessionDate < q1End;
            });
            
            console.log(`\nQ1 sessions: ${q1Sessions.length}`);
            if (q1Sessions.length > 0) {
                q1Sessions.slice(0, 5).forEach((session, index) => {
                    console.log(`${index + 1}. ${session.startTime.toDateString()} - End: ${session.endTime || 'null'} - Duration: ${session.duration || 'null'}`);
                });
            }
            
            // Check Q2 sessions
            const q2Start = new Date('2025-07-21');
            const q2End = new Date('2025-10-01');
            
            const q2Sessions = allSessions.filter(session => {
                const sessionDate = new Date(session.startTime);
                return sessionDate >= q2Start && sessionDate < q2End;
            });
            
            console.log(`\nQ2 sessions: ${q2Sessions.length}`);
            if (q2Sessions.length > 0) {
                q2Sessions.slice(0, 5).forEach((session, index) => {
                    console.log(`${index + 1}. ${session.startTime.toDateString()} - End: ${session.endTime || 'null'} - Duration: ${session.duration || 'null'}`);
                });
            }
            
            // Check for sessions with endTime
            const sessionsWithEndTime = allSessions.filter(session => session.endTime !== null);
            console.log(`\nSessions with endTime: ${sessionsWithEndTime.length}`);
            
            // Check for sessions with duration
            const sessionsWithDuration = allSessions.filter(session => session.duration !== null && session.duration > 0);
            console.log(`Sessions with duration: ${sessionsWithDuration.length}`);
            
            // Check for Thursday/Friday class day sessions
            const classDaySessions = allSessions.filter(session => {
                const dayOfWeek = new Date(session.startTime).getDay();
                const hour = new Date(session.startTime).getHours();
                return (dayOfWeek === 4 || dayOfWeek === 5) && hour >= 8 && hour < 16;
            });
            
            console.log(`\nThursday/Friday class day sessions: ${classDaySessions.length}`);
            if (classDaySessions.length > 0) {
                console.log('Recent class day sessions:');
                classDaySessions.slice(0, 5).forEach((session, index) => {
                    const dayOfWeek = new Date(session.startTime).getDay();
                    const dayName = dayOfWeek === 4 ? 'Thu' : 'Fri';
                    console.log(`${index + 1}. ${dayName} ${session.startTime.toDateString()} ${session.startTime.toTimeString().split(' ')[0]} - End: ${session.endTime || 'null'} - Duration: ${session.duration || 'null'}`);
                });
            }
        }
        
    } catch (error) {
        console.error('Error:', error);
    } finally {
        await prisma.$disconnect();
    }
}

debugAbigailSessions();
