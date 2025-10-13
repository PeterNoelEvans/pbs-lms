const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

async function analyzeQuarterlyProportional() {
    try {
        console.log('=== Quarterly Proportional Analysis for Student Assessment ===\n');
        
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
        
        console.log(`=== Proportional Analysis for ${activeAbigail.name} ===\n`);
        
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
            
            // Reading includes all reading-related categories
            if (categoryLower.includes('reading')) {
                return 'Reading';
            }
            // Listening includes all listening-related categories (but not reading)
            if (categoryLower.includes('listening')) {
                return 'Listening';
            }
            // Speaking includes all speaking-related categories (but not reading)
            if (categoryLower.includes('speaking')) {
                return 'Speaking';
            }
            // Writing includes all writing-related categories (but not reading)
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
        
        const q1Categories = {};
        q1Submissions.forEach(submission => {
            const category = categorizeAssessment(submission.assessment.category);
            q1Categories[category] = (q1Categories[category] || 0) + 1;
        });
        
        console.log('\n   Q1 Assessment Categories:');
        Object.entries(q1Categories).forEach(([category, count]) => {
            const percentage = ((count / q1Submissions.length) * 100).toFixed(1);
            console.log(`   ${category}: ${count} assessments (${percentage}%)`);
        });
        
        // Q2 ANALYSIS
        console.log('\n=== Q2 ANALYSIS ===');
        console.log(`Q2 Submissions: ${q2Submissions.length}`);
        
        const q2Categories = {};
        q2Submissions.forEach(submission => {
            const category = categorizeAssessment(submission.assessment.category);
            q2Categories[category] = (q2Categories[category] || 0) + 1;
        });
        
        console.log('\n   Q2 Assessment Categories:');
        Object.entries(q2Categories).forEach(([category, count]) => {
            const percentage = ((count / q2Submissions.length) * 100).toFixed(1);
            console.log(`   ${category}: ${count} assessments (${percentage}%)`);
        });
        
        // PROPORTIONAL COMPARISON
        console.log('\n=== PROPORTIONAL COMPARISON ===');
        console.log('Focus Distribution Changes (Q1 → Q2):');
        
        const allCategories = new Set([...Object.keys(q1Categories), ...Object.keys(q2Categories)]);
        allCategories.forEach(category => {
            const q1Count = q1Categories[category] || 0;
            const q2Count = q2Categories[category] || 0;
            const q1Percentage = q1Submissions.length > 0 ? ((q1Count / q1Submissions.length) * 100).toFixed(1) : '0.0';
            const q2Percentage = q2Submissions.length > 0 ? ((q2Count / q2Submissions.length) * 100).toFixed(1) : '0.0';
            const percentageChange = (parseFloat(q2Percentage) - parseFloat(q1Percentage)).toFixed(1);
            
            console.log(`   ${category}:`);
            console.log(`     Q1: ${q1Count} assessments (${q1Percentage}%)`);
            console.log(`     Q2: ${q2Count} assessments (${q2Percentage}%)`);
            console.log(`     Change: ${percentageChange > 0 ? '+' : ''}${percentageChange} percentage points`);
            
            // Interpretation
            if (Math.abs(parseFloat(percentageChange)) > 5) {
                if (parseFloat(percentageChange) > 0) {
                    console.log(`     → Increased focus on ${category}`);
                } else {
                    console.log(`     → Decreased focus on ${category}`);
                }
            } else {
                console.log(`     → Stable focus on ${category}`);
            }
            console.log('');
        });
        
        // PERFORMANCE COMPARISON
        console.log('=== PERFORMANCE COMPARISON ===');
        
        if (q1Submissions.length > 0 && q2Submissions.length > 0) {
            const q1Scores = q1Submissions.filter(s => s.score !== null).map(s => s.score);
            const q2Scores = q2Submissions.filter(s => s.score !== null).map(s => s.score);
            
            const q1AvgScore = q1Scores.reduce((sum, score) => sum + score, 0) / q1Scores.length;
            const q2AvgScore = q2Scores.reduce((sum, score) => sum + score, 0) / q2Scores.length;
            
            console.log(`Overall Performance: Q1 ${q1AvgScore.toFixed(1)}% → Q2 ${q2AvgScore.toFixed(1)}% (${(q2AvgScore - q1AvgScore).toFixed(1)}% change)`);
            
            // Performance by category
            console.log('\nPerformance by Category:');
            allCategories.forEach(category => {
                const q1CategorySubmissions = q1Submissions.filter(s => 
                    categorizeAssessment(s.assessment.category) === category && s.score !== null
                );
                const q2CategorySubmissions = q2Submissions.filter(s => 
                    categorizeAssessment(s.assessment.category) === category && s.score !== null
                );
                
                if (q1CategorySubmissions.length > 0 && q2CategorySubmissions.length > 0) {
                    const q1CategoryAvg = q1CategorySubmissions.reduce((sum, s) => sum + s.score, 0) / q1CategorySubmissions.length;
                    const q2CategoryAvg = q2CategorySubmissions.reduce((sum, s) => sum + s.score, 0) / q2CategorySubmissions.length;
                    const change = q2CategoryAvg - q1CategoryAvg;
                    
                    console.log(`   ${category}: Q1 ${q1CategoryAvg.toFixed(1)}% → Q2 ${q2CategoryAvg.toFixed(1)}% (${change > 0 ? '+' : ''}${change.toFixed(1)}%)`);
                } else if (q1CategorySubmissions.length > 0) {
                    const q1CategoryAvg = q1CategorySubmissions.reduce((sum, s) => sum + s.score, 0) / q1CategorySubmissions.length;
                    console.log(`   ${category}: Q1 ${q1CategoryAvg.toFixed(1)}% → Q2 N/A (new category)`);
                } else if (q2CategorySubmissions.length > 0) {
                    const q2CategoryAvg = q2CategorySubmissions.reduce((sum, s) => sum + s.score, 0) / q2CategorySubmissions.length;
                    console.log(`   ${category}: Q1 N/A → Q2 ${q2CategoryAvg.toFixed(1)}% (new category)`);
                }
            });
        }
        
        // ENGAGEMENT COMPARISON
        console.log('\n=== ENGAGEMENT COMPARISON ===');
        
        const q1Sessions = activeAbigail.sessions.filter(session => {
            const sessionDate = new Date(session.startTime);
            return sessionDate >= q1Start && sessionDate < q1End;
        });
        
        const q2Sessions = activeAbigail.sessions.filter(session => {
            const sessionDate = new Date(session.startTime);
            return sessionDate >= q2Start && sessionDate < q2End;
        });
        
        console.log(`Session Frequency: Q1 ${q1Sessions.length} sessions → Q2 ${q2Sessions.length} sessions`);
        console.log(`Submission Rate: Q1 ${q1Submissions.length} submissions → Q2 ${q2Submissions.length} submissions`);
        
        if (q1Sessions.length > 0 && q2Sessions.length > 0) {
            const q1SubmissionsPerSession = (q1Submissions.length / q1Sessions.length).toFixed(1);
            const q2SubmissionsPerSession = (q2Submissions.length / q2Sessions.length).toFixed(1);
            console.log(`Productivity: Q1 ${q1SubmissionsPerSession} submissions/session → Q2 ${q2SubmissionsPerSession} submissions/session`);
        }
        
        // SUGGESTED METRICS FOR REPORTS
        console.log('\n=== SUGGESTED METRICS FOR REPORTS ===');
        console.log('1. Focus Distribution:');
        console.log('   - Percentage of time spent on each skill');
        console.log('   - Changes in focus areas between quarters');
        console.log('   - Skill balance analysis');
        
        console.log('\n2. Performance Trends:');
        console.log('   - Overall performance stability');
        console.log('   - Category-specific performance changes');
        console.log('   - Performance consistency across skills');
        
        console.log('\n3. Engagement Efficiency:');
        console.log('   - Submissions per session ratio');
        console.log('   - Activity level changes');
        console.log('   - Learning productivity trends');
        
        console.log('\n4. Skill Development:');
        console.log('   - Areas of increased focus');
        console.log('   - Areas of decreased focus');
        console.log('   - Balanced skill development');
        
    } catch (error) {
        console.error('Error:', error);
    } finally {
        await prisma.$disconnect();
    }
}

analyzeQuarterlyProportional();
