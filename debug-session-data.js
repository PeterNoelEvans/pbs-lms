const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

async function debugSessionData() {
    try {
        console.log('=== Session Data Debug ===\n');
        
        // Get total session count
        const totalSessions = await prisma.userSession.count();
        console.log(`Total sessions in database: ${totalSessions}`);
        
        // Get sessions with endTime
        const sessionsWithEndTime = await prisma.userSession.count({
            where: {
                endTime: { not: null }
            }
        });
        console.log(`Sessions with endTime: ${sessionsWithEndTime}`);
        
        // Get sessions with duration
        const sessionsWithDuration = await prisma.userSession.count({
            where: {
                duration: { not: null }
            }
        });
        console.log(`Sessions with duration: ${sessionsWithDuration}`);
        
        // Get sessions in Q2 date range (2025-07-21 to 2025-10-01)
        const q2Start = new Date('2025-07-21');
        const q2End = new Date('2025-10-01');
        
        const q2Sessions = await prisma.userSession.findMany({
            where: {
                startTime: {
                    gte: q2Start,
                    lt: q2End
                }
            },
            orderBy: {
                startTime: 'desc'
            },
            take: 10
        });
        
        console.log(`\nQ2 sessions (sample of 10): ${q2Sessions.length}`);
        q2Sessions.forEach((session, index) => {
            console.log(`${index + 1}. User: ${session.userId}, Start: ${session.startTime}, End: ${session.endTime}, Duration: ${session.duration}`);
        });
        
        // Get Q2 Thursday/Friday sessions (8am-4pm)
        const q2ClassDaySessions = await prisma.userSession.findMany({
            where: {
                startTime: {
                    gte: q2Start,
                    lt: q2End
                }
            },
            orderBy: {
                startTime: 'desc'
            }
        });
        
        const classDaySessions = q2ClassDaySessions.filter(session => {
            const dayOfWeek = new Date(session.startTime).getDay();
            const hour = new Date(session.startTime).getHours();
            return (dayOfWeek === 4 || dayOfWeek === 5) && hour >= 8 && hour < 16;
        });
        
        console.log(`\nQ2 Thursday/Friday class day sessions: ${classDaySessions.length}`);
        classDaySessions.slice(0, 5).forEach((session, index) => {
            console.log(`${index + 1}. User: ${session.userId}, Start: ${session.startTime}, End: ${session.endTime}, Duration: ${session.duration}`);
        });
        
        // Check for a specific student (Abigail Quiming Flores)
        const abigailUser = await prisma.user.findFirst({
            where: {
                name: {
                    contains: 'Abigail'
                }
            }
        });
        
        if (abigailUser) {
            console.log(`\nFound user: ${abigailUser.name} (ID: ${abigailUser.id})`);
            
            const abigailSessions = await prisma.userSession.findMany({
                where: {
                    userId: abigailUser.id,
                    startTime: {
                        gte: q2Start,
                        lt: q2End
                    }
                },
                orderBy: {
                    startTime: 'desc'
                }
            });
            
            console.log(`Abigail's Q2 sessions: ${abigailSessions.length}`);
            abigailSessions.slice(0, 5).forEach((session, index) => {
                console.log(`${index + 1}. Start: ${session.startTime}, End: ${session.endTime}, Duration: ${session.duration}`);
            });
            
            const abigailClassDaySessions = abigailSessions.filter(session => {
                const dayOfWeek = new Date(session.startTime).getDay();
                const hour = new Date(session.startTime).getHours();
                return (dayOfWeek === 4 || dayOfWeek === 5) && hour >= 8 && hour < 16;
            });
            
            console.log(`Abigail's Q2 class day sessions: ${abigailClassDaySessions.length}`);
            abigailClassDaySessions.forEach((session, index) => {
                console.log(`${index + 1}. Start: ${session.startTime}, End: ${session.endTime}, Duration: ${session.duration}`);
            });
        }
        
        // Get overall statistics
        const allSessions = await prisma.userSession.findMany({
            where: {
                endTime: { not: null }
            }
        });
        
        const totalDuration = allSessions.reduce((sum, session) => {
            if (session.duration && session.duration > 0) {
                return sum + session.duration;
            } else if (session.endTime) {
                const calculatedDuration = Math.round((new Date(session.endTime) - new Date(session.startTime)) / 1000);
                return sum + calculatedDuration;
            }
            return sum;
        }, 0);
        
        const averageDuration = allSessions.length > 0 ? Math.round(totalDuration / allSessions.length) : 0;
        
        console.log(`\nOverall Statistics:`);
        console.log(`Total sessions with endTime: ${allSessions.length}`);
        console.log(`Total duration (seconds): ${totalDuration}`);
        console.log(`Average duration (seconds): ${averageDuration}`);
        console.log(`Average duration (minutes): ${Math.round(averageDuration / 60)}`);
        
    } catch (error) {
        console.error('Error:', error);
    } finally {
        await prisma.$disconnect();
    }
}

debugSessionData();
