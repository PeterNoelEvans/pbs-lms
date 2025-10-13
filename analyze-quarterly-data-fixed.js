const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

async function analyzeQuarterlyDataFixed() {
    try {
        console.log('=== Quarterly Data Analysis for Student Assessment (FIXED) ===\n');
        
        // Quarter date ranges
        const q1Start = new Date('2025-05-01');
        const q1End = new Date('2025-07-21');
        const q2Start = new Date('2025-07-21');
        const q2End = new Date('2025-10-01');
        
        console.log('Quarter Date Ranges:');
        console.log(`Q1: ${q1Start.toDateString()} to ${q1End.toDateString()}`);
        console.log(`Q2: ${q2Start.toDateString()} to ${q2End.toDateString()}\n`);
        
        // Find active Abigail for testing
        const activeAbigail = await prisma.user.findUnique({
            where: {
                id: '009e27ea-72d4-4eb4-9658-92131a42b3c2'
            },
            include: {
                assessmentSubmissions: {
                    include: {
                        assessment: {
                            include: {
                                section: {
                                    include: {
                                        part: {
                                            include: {
                                                unit: {
                                                    include: {
                                                        subject: {
                                                            include: {
                                                                coreSubject: true
                                                            }
                                                        }
                                                    }
                                                }
                                            }
                                        }
                                    }
                                },
                                topic: true
                            }
                        }
                    },
                    orderBy: { submittedAt: 'desc' }
                },
                sessions: {
                    orderBy: { startTime: 'desc' }
                }
            }
        });
        
        if (!activeAbigail) {
            console.log('Active Abigail not found');
            return;
        }
        
        console.log(`=== Quarterly Analysis for ${activeAbigail.name} ===\n`);
        
        // Filter data by quarters
        const q1Submissions = activeAbigail.assessmentSubmissions.filter(submission => {
            const submittedAt = new Date(submission.submittedAt);
            return submittedAt >= q1Start && submittedAt < q1End;
        });
        
        const q2Submissions = activeAbigail.assessmentSubmissions.filter(submission => {
            const submittedAt = new Date(submission.submittedAt);
            return submittedAt >= q2Start && submittedAt < q2End;
        });
        
        // Function to categorize assessments correctly
        function categorizeAssessment(category) {
            if (!category) return 'Uncategorized';
            
            const categoryLower = category.toLowerCase();
            
            // Reading includes "Reading and Grammar"
            if (categoryLower.includes('reading')) {
                return 'Reading';
            }
            // Listening includes "Listening and reading"
            if (categoryLower.includes('listening')) {
                return 'Listening';
            }
            // Speaking includes "Reading and speaking"
            if (categoryLower.includes('speaking')) {
                return 'Speaking';
            }
            // Writing includes "Reading and writing"
            if (categoryLower.includes('writing')) {
                return 'Writing';
            }
            // Test Practice is separate
            if (categoryLower.includes('test practice')) {
                return 'Test Practice';
            }
            // Grammar is separate (but not "Reading and Grammar")
            if (categoryLower.includes('grammar')) {
                return 'Grammar';
            }
            // Vocabulary is separate
            if (categoryLower.includes('vocabulary')) {
                return 'Vocabulary';
            }
            
            return category;
        }
        
        // Q1 ANALYSIS
        console.log('=== Q1 ANALYSIS ===');
        console.log(`Q1 Submissions: ${q1Submissions.length}`);
        
        if (q1Submissions.length > 0) {
            const q1Scores = q1Submissions
                .filter(s => s.score !== null)
                .map(s => s.score);
            
            const q1AvgScore = q1Scores.length > 0 ? 
                q1Scores.reduce((sum, score) => sum + score, 0) / q1Scores.length : 0;
            
            const q1ScoresWithTime = q1Submissions.filter(s => s.totalTime !== null);
            const q1TotalTime = q1ScoresWithTime.reduce((sum, s) => sum + s.totalTime, 0);
            const q1AvgTime = q1ScoresWithTime.length > 0 ? q1TotalTime / q1ScoresWithTime.length : 0;
            
            console.log(`   Average Score: ${q1AvgScore.toFixed(1)}%`);
            console.log(`   Score Range: ${Math.min(...q1Scores)}% - ${Math.max(...q1Scores)}%`);
            console.log(`   Total Time: ${Math.round(q1TotalTime / 60)} minutes`);
            console.log(`   Average Time per Assessment: ${Math.round(q1AvgTime / 60)} minutes`);
            console.log(`   Assessments with Time Data: ${q1ScoresWithTime.length}`);
            
            // Q1 Categories (FIXED)
            const q1Categories = {};
            q1Submissions.forEach(submission => {
                const category = categorizeAssessment(submission.assessment.category);
                q1Categories[category] = (q1Categories[category] || 0) + 1;
            });
            
            console.log('\n   Q1 Assessment Categories (FIXED):');
            Object.entries(q1Categories).forEach(([category, count]) => {
                console.log(`   ${category}: ${count} assessments`);
            });
            
            // Show original categories for debugging
            console.log('\n   Original Q1 Categories (for reference):');
            const q1OriginalCategories = {};
            q1Submissions.forEach(submission => {
                const category = submission.assessment.category || 'Uncategorized';
                q1OriginalCategories[category] = (q1OriginalCategories[category] || 0) + 1;
            });
            Object.entries(q1OriginalCategories).forEach(([category, count]) => {
                console.log(`   "${category}": ${count} assessments`);
            });
        }
        
        // Q2 ANALYSIS
        console.log('\n=== Q2 ANALYSIS ===');
        console.log(`Q2 Submissions: ${q2Submissions.length}`);
        
        if (q2Submissions.length > 0) {
            const q2Scores = q2Submissions
                .filter(s => s.score !== null)
                .map(s => s.score);
            
            const q2AvgScore = q2Scores.length > 0 ? 
                q2Scores.reduce((sum, score) => sum + score, 0) / q2Scores.length : 0;
            
            const q2ScoresWithTime = q2Submissions.filter(s => s.totalTime !== null);
            const q2TotalTime = q2ScoresWithTime.reduce((sum, s) => sum + s.totalTime, 0);
            const q2AvgTime = q2ScoresWithTime.length > 0 ? q2TotalTime / q2ScoresWithTime.length : 0;
            
            console.log(`   Average Score: ${q2AvgScore.toFixed(1)}%`);
            console.log(`   Score Range: ${Math.min(...q2Scores)}% - ${Math.max(...q2Scores)}%`);
            console.log(`   Total Time: ${Math.round(q2TotalTime / 60)} minutes`);
            console.log(`   Average Time per Assessment: ${Math.round(q2AvgTime / 60)} minutes`);
            console.log(`   Assessments with Time Data: ${q2ScoresWithTime.length}`);
            
            // Q2 Categories (FIXED)
            const q2Categories = {};
            q2Submissions.forEach(submission => {
                const category = categorizeAssessment(submission.assessment.category);
                q2Categories[category] = (q2Categories[category] || 0) + 1;
            });
            
            console.log('\n   Q2 Assessment Categories (FIXED):');
            Object.entries(q2Categories).forEach(([category, count]) => {
                console.log(`   ${category}: ${count} assessments`);
            });
            
            // Show original categories for debugging
            console.log('\n   Original Q2 Categories (for reference):');
            const q2OriginalCategories = {};
            q2Submissions.forEach(submission => {
                const category = submission.assessment.category || 'Uncategorized';
                q2OriginalCategories[category] = (q2OriginalCategories[category] || 0) + 1;
            });
            Object.entries(q2OriginalCategories).forEach(([category, count]) => {
                console.log(`   "${category}": ${count} assessments`);
            });
        }
        
        // QUARTERLY COMPARISON
        console.log('\n=== QUARTERLY COMPARISON (FIXED CATEGORIES) ===');
        
        if (q1Submissions.length > 0 && q2Submissions.length > 0) {
            const q1Scores = q1Submissions.filter(s => s.score !== null).map(s => s.score);
            const q2Scores = q2Submissions.filter(s => s.score !== null).map(s => s.score);
            
            const q1AvgScore = q1Scores.reduce((sum, score) => sum + score, 0) / q1Scores.length;
            const q2AvgScore = q2Scores.reduce((sum, score) => sum + score, 0) / q2Scores.length;
            
            console.log(`Score Improvement: Q1 ${q1AvgScore.toFixed(1)}% → Q2 ${q2AvgScore.toFixed(1)}% (${(q2AvgScore - q1AvgScore).toFixed(1)}% change)`);
            console.log(`Activity Level: Q1 ${q1Submissions.length} submissions → Q2 ${q2Submissions.length} submissions (${q2Submissions.length - q1Submissions.length} change)`);
            
            // Category comparison
            const q1Categories = {};
            q1Submissions.forEach(submission => {
                const category = categorizeAssessment(submission.assessment.category);
                q1Categories[category] = (q1Categories[category] || 0) + 1;
            });
            
            const q2Categories = {};
            q2Submissions.forEach(submission => {
                const category = categorizeAssessment(submission.assessment.category);
                q2Categories[category] = (q2Categories[category] || 0) + 1;
            });
            
            console.log('\nCategory Changes:');
            const allCategories = new Set([...Object.keys(q1Categories), ...Object.keys(q2Categories)]);
            allCategories.forEach(category => {
                const q1Count = q1Categories[category] || 0;
                const q2Count = q2Categories[category] || 0;
                const change = q2Count - q1Count;
                console.log(`   ${category}: Q1 ${q1Count} → Q2 ${q2Count} (${change > 0 ? '+' : ''}${change})`);
            });
        }
        
    } catch (error) {
        console.error('Error:', error);
    } finally {
        await prisma.$disconnect();
    }
}

analyzeQuarterlyDataFixed();
