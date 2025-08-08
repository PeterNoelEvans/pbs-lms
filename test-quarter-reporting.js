const { PrismaClient } = require('@prisma/client');
const { getActiveQuarter } = require('./utils/configManager');

const prisma = new PrismaClient();

async function testQuarterReporting() {
    try {
        console.log('=== Testing Quarter Reporting Capabilities ===\n');
        
        // Test 1: Get data for each quarter
        const quarters = ['Q1', 'Q2', 'Q3', 'Q4'];
        
        for (const quarter of quarters) {
            console.log(`\n--- Quarter ${quarter} Report ---`);
            
            // Get resources for this quarter
            const resources = await prisma.resource.findMany({
                where: { quarter: quarter },
                include: {
                    createdBy: true,
                    assessments: true
                }
            });
            
            // Get assessments for this quarter
            const assessments = await prisma.assessment.findMany({
                where: { quarter: quarter },
                include: {
                    submissions: true
                }
            });
            
            // Get submissions for assessments in this quarter
            const submissions = await prisma.assessmentSubmission.findMany({
                where: {
                    assessment: {
                        quarter: quarter
                    }
                },
                include: {
                    student: true,
                    assessment: true
                }
            });
            
            // Calculate statistics
            const totalResources = resources.length;
            const totalAssessments = assessments.length;
            const totalSubmissions = submissions.length;
            const publishedAssessments = assessments.filter(a => a.published).length;
            const averageScore = submissions.length > 0 
                ? (submissions.reduce((sum, sub) => sum + (sub.score || 0), 0) / submissions.length).toFixed(2)
                : 0;
            
            console.log(`Resources: ${totalResources}`);
            console.log(`Assessments: ${totalAssessments} (${publishedAssessments} published)`);
            console.log(`Submissions: ${totalSubmissions}`);
            console.log(`Average Score: ${averageScore}%`);
            console.log(`Completion Rate: ${totalAssessments > 0 ? ((publishedAssessments / totalAssessments) * 100).toFixed(1) : 0}%`);
            
            // Show sample resources
            if (resources.length > 0) {
                console.log('\nSample Resources:');
                resources.slice(0, 3).forEach(resource => {
                    console.log(`  - ${resource.title} (${resource.type}) by ${resource.createdBy.name}`);
                });
            }
            
            // Show sample assessments
            if (assessments.length > 0) {
                console.log('\nSample Assessments:');
                assessments.slice(0, 3).forEach(assessment => {
                    console.log(`  - ${assessment.title} (${assessment.type}) - ${assessment.published ? 'Published' : 'Draft'}`);
                });
            }
        }
        
        // Test 2: Demonstrate API-style filtering
        console.log('\n=== API-Style Quarter Filtering ===');
        
        const activeQuarter = await getActiveQuarter();
        console.log(`Active Quarter: ${activeQuarter}`);
        
        // Simulate API calls for different quarters
        const testQuarters = ['Q1', 'Q2'];
        for (const quarter of testQuarters) {
            console.log(`\n--- API Call: GET /api/subjects/:subjectId/resources?quarter=${quarter} ---`);
            
            // Simulate the API response
            const resources = await prisma.resource.findMany({
                where: { quarter: quarter },
                take: 5 // Limit for demo
            });
            
            console.log(`Would return ${resources.length} resources for ${quarter}`);
            resources.forEach(resource => {
                console.log(`  - ${resource.title} (${resource.type})`);
            });
        }
        
        // Test 3: Database export with quarter filtering
        console.log('\n=== Database Export with Quarter Filtering ===');
        
        const exportQuarters = ['Q1', 'Q2'];
        for (const quarter of exportQuarters) {
            console.log(`\n--- Export for ${quarter} ---`);
            
            const resources = await prisma.resource.findMany({
                where: { quarter: quarter },
                include: {
                    createdBy: true,
                    assessments: true
                }
            });
            
            const assessments = await prisma.assessment.findMany({
                where: { quarter: quarter },
                include: {
                    submissions: true
                }
            });
            
            console.log(`Would export ${resources.length} resources and ${assessments.length} assessments for ${quarter}`);
            console.log(`Excel filename would be: student-performance-dashboard-${quarter}-${new Date().toISOString().split('T')[0]}.xlsx`);
        }
        
        // Test 4: Quarter comparison
        console.log('\n=== Quarter Comparison ===');
        
        const quarterComparison = {};
        for (const quarter of quarters) {
            const resources = await prisma.resource.count({ where: { quarter: quarter } });
            const assessments = await prisma.assessment.count({ where: { quarter: quarter } });
            
            quarterComparison[quarter] = {
                resources,
                assessments
            };
        }
        
        console.log('Quarter Comparison:');
        Object.entries(quarterComparison).forEach(([quarter, stats]) => {
            console.log(`  ${quarter}: ${stats.resources} resources, ${stats.assessments} assessments`);
        });
        
    } catch (error) {
        console.error('Error testing quarter reporting:', error);
    } finally {
        await prisma.$disconnect();
    }
}

// Run the test
testQuarterReporting();
