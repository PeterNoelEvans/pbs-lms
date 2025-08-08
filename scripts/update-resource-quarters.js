const { PrismaClient } = require('@prisma/client');
const { getActiveQuarter } = require('../utils/configManager');

const prisma = new PrismaClient();

async function updateResourceQuarters() {
    try {
        console.log('Starting resource quarter update...');
        
        // Get the active quarter
        const activeQuarter = await getActiveQuarter();
        console.log(`Active quarter: ${activeQuarter}`);
        
        // Get all resources
        const allResources = await prisma.resource.findMany();
        console.log(`Found ${allResources.length} total resources`);
        
        // Count resources that need updating (have Q1 or null quarter)
        const resourcesToUpdate = allResources.filter(r => !r.quarter || r.quarter === 'Q1');
        console.log(`Found ${resourcesToUpdate.length} resources that need updating`);
        
        if (resourcesToUpdate.length === 0) {
            console.log('No resources need updating.');
            return;
        }
        
        // Update each resource individually
        let updatedCount = 0;
        for (const resource of resourcesToUpdate) {
            await prisma.resource.update({
                where: { id: resource.id },
                data: { quarter: activeQuarter }
            });
            updatedCount++;
        }
        
        console.log(`Updated ${updatedCount} resources to quarter ${activeQuarter}`);
        
        // Verify the update
        const updatedResources = await prisma.resource.findMany({
            where: {
                quarter: activeQuarter
            }
        });
        
        console.log(`Verified: ${updatedResources.length} resources now have quarter ${activeQuarter}`);
        
    } catch (error) {
        console.error('Error updating resource quarters:', error);
    } finally {
        await prisma.$disconnect();
    }
}

// Run the update
updateResourceQuarters();
