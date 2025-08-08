const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

async function updateQuarterDistribution() {
    try {
        console.log('=== Updating Quarter Distribution ===\n');
        
        // Get all resources ordered by creation date (newest first)
        const allResources = await prisma.resource.findMany({
            orderBy: { createdAt: 'desc' }
        });
        
        console.log(`Found ${allResources.length} total resources`);
        
        // Keep the 3 most recent resources in Q2, move the rest to Q1
        const resourcesToQ1 = allResources.slice(3); // All except the first 3
        const resourcesToQ2 = allResources.slice(0, 3); // Only the first 3 (most recent)
        
        console.log(`Resources to move to Q1: ${resourcesToQ1.length}`);
        console.log(`Resources to keep in Q2: ${resourcesToQ2.length}`);
        
        // Update resources to Q1
        if (resourcesToQ1.length > 0) {
            console.log('\nMoving resources to Q1...');
            for (const resource of resourcesToQ1) {
                await prisma.resource.update({
                    where: { id: resource.id },
                    data: { quarter: 'Q1' }
                });
            }
            console.log(`Updated ${resourcesToQ1.length} resources to Q1`);
        }
        
        // Ensure the 3 most recent resources are in Q2
        if (resourcesToQ2.length > 0) {
            console.log('\nEnsuring recent resources are in Q2...');
            for (const resource of resourcesToQ2) {
                await prisma.resource.update({
                    where: { id: resource.id },
                    data: { quarter: 'Q2' }
                });
            }
            console.log(`Updated ${resourcesToQ2.length} resources to Q2`);
        }
        
        // Get all assessments ordered by creation date (newest first)
        const allAssessments = await prisma.assessment.findMany({
            orderBy: { createdAt: 'desc' }
        });
        
        console.log(`\nFound ${allAssessments.length} total assessments`);
        
        // Keep the 3 most recent assessments in Q2, move the rest to Q1
        const assessmentsToQ1 = allAssessments.slice(3); // All except the first 3
        const assessmentsToQ2 = allAssessments.slice(0, 3); // Only the first 3 (most recent)
        
        console.log(`Assessments to move to Q1: ${assessmentsToQ1.length}`);
        console.log(`Assessments to keep in Q2: ${assessmentsToQ2.length}`);
        
        // Update assessments to Q1
        if (assessmentsToQ1.length > 0) {
            console.log('\nMoving assessments to Q1...');
            for (const assessment of assessmentsToQ1) {
                await prisma.assessment.update({
                    where: { id: assessment.id },
                    data: { quarter: 'Q1' }
                });
            }
            console.log(`Updated ${assessmentsToQ1.length} assessments to Q1`);
        }
        
        // Ensure the 3 most recent assessments are in Q2
        if (assessmentsToQ2.length > 0) {
            console.log('\nEnsuring recent assessments are in Q2...');
            for (const assessment of assessmentsToQ2) {
                await prisma.assessment.update({
                    where: { id: assessment.id },
                    data: { quarter: 'Q2' }
                });
            }
            console.log(`Updated ${assessmentsToQ2.length} assessments to Q2`);
        }
        
        // Verify the distribution
        console.log('\n=== Verification ===');
        
        const q1Resources = await prisma.resource.count({ where: { quarter: 'Q1' } });
        const q2Resources = await prisma.resource.count({ where: { quarter: 'Q2' } });
        const q1Assessments = await prisma.assessment.count({ where: { quarter: 'Q1' } });
        const q2Assessments = await prisma.assessment.count({ where: { quarter: 'Q2' } });
        
        console.log(`Q1 Resources: ${q1Resources}`);
        console.log(`Q2 Resources: ${q2Resources}`);
        console.log(`Q1 Assessments: ${q1Assessments}`);
        console.log(`Q2 Assessments: ${q2Assessments}`);
        
        // Show the 3 most recent resources in Q2
        console.log('\n=== Recent Q2 Resources ===');
        const recentQ2Resources = await prisma.resource.findMany({
            where: { quarter: 'Q2' },
            orderBy: { createdAt: 'desc' },
            include: { createdBy: true }
        });
        
        recentQ2Resources.forEach((resource, index) => {
            console.log(`${index + 1}. ${resource.title} (${resource.type}) by ${resource.createdBy.name}`);
        });
        
        // Show the 3 most recent assessments in Q2
        console.log('\n=== Recent Q2 Assessments ===');
        const recentQ2Assessments = await prisma.assessment.findMany({
            where: { quarter: 'Q2' },
            orderBy: { createdAt: 'desc' },
            include: { createdBy: true }
        });
        
        recentQ2Assessments.forEach((assessment, index) => {
            console.log(`${index + 1}. ${assessment.title} (${assessment.type}) by ${assessment.createdBy.name}`);
        });
        
        console.log('\n=== Quarter Distribution Update Complete ===');
        
    } catch (error) {
        console.error('Error updating quarter distribution:', error);
    } finally {
        await prisma.$disconnect();
    }
}

// Run the update
updateQuarterDistribution();
