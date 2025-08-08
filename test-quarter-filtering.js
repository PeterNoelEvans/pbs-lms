const { PrismaClient } = require('@prisma/client');
const { getActiveQuarter } = require('./utils/configManager');

const prisma = new PrismaClient();

async function testQuarterFiltering() {
    try {
        console.log('Testing quarter filtering for resources and assessments...');
        
        // Get current active quarter
        const activeQuarter = await getActiveQuarter();
        console.log(`Active quarter: ${activeQuarter}`);
        
        // Test 1: Check resources by quarter
        console.log('\n=== Testing Resources by Quarter ===');
        const resourcesByQuarter = await prisma.resource.groupBy({
            by: ['quarter'],
            _count: {
                id: true
            }
        });
        
        for (const quarter of resourcesByQuarter) {
            console.log(`Quarter ${quarter.quarter}: ${quarter._count.id} resources`);
        }
        
        // Test 2: Check assessments by quarter
        console.log('\n=== Testing Assessments by Quarter ===');
        const assessmentsByQuarter = await prisma.assessment.groupBy({
            by: ['quarter'],
            _count: {
                id: true
            },
            where: {
                published: true
            }
        });
        
        for (const quarter of assessmentsByQuarter) {
            console.log(`Quarter ${quarter.quarter}: ${quarter._count.id} assessments`);
        }
        
        // Test 3: Check resources for a specific subject with quarter filtering
        console.log('\n=== Testing Subject Resources with Quarter Filtering ===');
        const subjects = await prisma.subject.findMany({
            take: 1
        });
        
        if (subjects.length > 0) {
            const subjectId = subjects[0].id;
            console.log(`Testing resources for subject: ${subjects[0].name} (${subjectId})`);
            
            // Get resources with quarter filtering
            const subject = await prisma.subject.findUnique({
                where: { id: subjectId },
                include: {
                    topics: {
                        include: {
                            resources: {
                                where: {
                                    quarter: activeQuarter
                                },
                                include: {
                                    assessments: {
                                        where: {
                                            quarter: activeQuarter,
                                            published: true
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            });
            
            if (subject) {
                let totalResources = 0;
                let resourcesWithAssessments = 0;
                
                for (const topic of subject.topics) {
                    for (const resource of topic.resources) {
                        totalResources++;
                        if (resource.assessments && resource.assessments.length > 0) {
                            resourcesWithAssessments++;
                            console.log(`Resource "${resource.title}" has ${resource.assessments.length} assessments for quarter ${activeQuarter}`);
                        }
                    }
                }
                
                console.log(`\nResults for quarter ${activeQuarter}:`);
                console.log(`Total resources: ${totalResources}`);
                console.log(`Resources with assessments: ${resourcesWithAssessments}`);
            } else {
                console.log('Subject not found');
            }
        }
        
        // Test 4: Check all resources vs quarter-filtered resources
        console.log('\n=== Testing Quarter Filtering Effectiveness ===');
        const allResources = await prisma.resource.count();
        const quarterResources = await prisma.resource.count({
            where: {
                quarter: activeQuarter
            }
        });
        
        console.log(`Total resources in database: ${allResources}`);
        console.log(`Resources for quarter ${activeQuarter}: ${quarterResources}`);
        console.log(`Filtering effectiveness: ${((quarterResources / allResources) * 100).toFixed(1)}% of resources are for ${activeQuarter}`);
        
    } catch (error) {
        console.error('Error testing quarter filtering:', error);
    } finally {
        await prisma.$disconnect();
    }
}

// Run the test
testQuarterFiltering(); 