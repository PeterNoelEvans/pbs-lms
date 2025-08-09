const { PrismaClient } = require('@prisma/client');
const { getActiveQuarter } = require('../utils/configManager');

const prisma = new PrismaClient();

async function migrateAssessmentsToActiveQuarter() {
    try {
        console.log('🔄 Migrating assessments to active quarter...\n');
        
        // Get current active quarter
        const activeQuarter = await getActiveQuarter();
        console.log(`📅 Active quarter: ${activeQuarter}`);
        
        // Check current distribution
        console.log('\n📊 Current assessment distribution:');
        const quarterCounts = await prisma.assessment.groupBy({
            by: ['quarter'],
            _count: { id: true }
        });
        quarterCounts.forEach(group => {
            console.log(`   ${group.quarter}: ${group._count.id} assessments`);
        });
        
        // Count assessments NOT in active quarter
        const nonActiveCount = await prisma.assessment.count({
            where: {
                quarter: { not: activeQuarter }
            }
        });
        
        if (nonActiveCount === 0) {
            console.log(`\n✅ All assessments are already in quarter ${activeQuarter}!`);
            return;
        }
        
        console.log(`\n🎯 Found ${nonActiveCount} assessments not in active quarter ${activeQuarter}`);
        console.log(`\n⚠️  This will move ALL assessments to quarter ${activeQuarter}`);
        console.log('   This is useful when starting a new quarter and you want');
        console.log('   all existing content to be available in the new quarter.\n');
        
        // Update all assessments to active quarter
        const result = await prisma.assessment.updateMany({
            where: {
                quarter: { not: activeQuarter }
            },
            data: {
                quarter: activeQuarter
            }
        });
        
        console.log(`✅ Successfully migrated ${result.count} assessments to quarter ${activeQuarter}`);
        
        // Show final distribution
        console.log('\n📊 Final assessment distribution:');
        const finalCounts = await prisma.assessment.groupBy({
            by: ['quarter'],
            _count: { id: true }
        });
        finalCounts.forEach(group => {
            console.log(`   ${group.quarter}: ${group._count.id} assessments`);
        });
        
        console.log(`\n🎉 Migration complete! All assessments are now in quarter ${activeQuarter}`);
        console.log('   Student progress should now show assessment data when viewing the active quarter.');
        
    } catch (error) {
        console.error('❌ Error migrating assessments:', error);
    } finally {
        await prisma.$disconnect();
    }
}

// Add confirmation prompt for safety
console.log('🚨 ASSESSMENT QUARTER MIGRATION TOOL 🚨\n');
console.log('This script will migrate ALL assessments to the current active quarter.');
console.log('This is typically done when starting a new quarter.\n');

const args = process.argv.slice(2);
if (args.includes('--confirm')) {
    migrateAssessmentsToActiveQuarter();
} else {
    console.log('To proceed with migration, run:');
    console.log('node scripts/migrate-assessments-to-active-quarter.js --confirm');
    console.log('\nOr check current status with:');
    console.log('node scripts/check-assessment-quarters.js');
}
