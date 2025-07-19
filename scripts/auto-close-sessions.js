const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

async function autoCloseSessions() {
    try {
        console.log('Starting auto-close of stale sessions...');
        
        // Find sessions that have been open for more than 60 minutes
        const sixtyMinutesAgo = new Date(Date.now() - (60 * 60 * 1000));
        
        const staleSessions = await prisma.userSession.findMany({
            where: {
                endTime: null, // Still active
                startTime: {
                    lt: sixtyMinutesAgo // Started more than 60 minutes ago
                }
            }
        });
        
        console.log(`Found ${staleSessions.length} stale sessions to close`);
        
        if (staleSessions.length === 0) {
            console.log('No stale sessions found');
            return;
        }
        
        let closedCount = 0;
        
        for (const session of staleSessions) {
            // Set endTime to startTime + 60 minutes
            const endTime = new Date(session.startTime.getTime() + 60 * 60 * 1000);
            const duration = 60 * 60; // 60 minutes in seconds
            
            await prisma.userSession.update({
                where: { id: session.id },
                data: {
                    endTime: endTime,
                    duration: duration
                }
            });
            
            closedCount++;
            console.log(`Closed session ${session.id} for user ${session.userId} (duration: ${duration}s)`);
        }
        
        console.log(`Successfully closed ${closedCount} stale sessions`);
        
    } catch (error) {
        console.error('Error auto-closing sessions:', error);
    } finally {
        await prisma.$disconnect();
    }
}

// Run the function
autoCloseSessions(); 