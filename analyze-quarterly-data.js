const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

async function analyzeQuarterlyData() {
    try {
        console.log('=== Quarterly Data Analysis for Student Assessment ===\n');
        
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
                studentProgress: {
                    include: {
                        subject: {
                            include: {
                                coreSubject: true
                            }
                        },
                        topic: true
                    },
                    orderBy: { lastUpdated: 'desc' }
                },
                resourcesUsed: {
                    include: {
                        resource: {
                            include: {
                                topic: true
                            }
                        }
                    },
                    orderBy: { usedAt: 'desc' }
                },
                sessions: {
                    orderBy: { startTime: 'desc' }
                },
                studentCourses: {
                    include: {
                        subject: {
                            include: {
                                coreSubject: true
                            }
                        }
                    }
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
        
        const q1Sessions = activeAbigail.sessions.filter(session => {
            const sessionDate = new Date(session.startTime);
            return sessionDate >= q1Start && sessionDate < q1End;
        });
        
        const q2Sessions = activeAbigail.sessions.filter(session => {
            const sessionDate = new Date(session.startTime);
            return sessionDate >= q2Start && sessionDate < q2End;
        });
        
        const q1ResourceUsage = activeAbigail.resourcesUsed.filter(usage => {
            const usedAt = new Date(usage.usedAt);
            return usedAt >= q1Start && usedAt < q1End;
        });
        
        const q2ResourceUsage = activeAbigail.resourcesUsed.filter(usage => {
            const usedAt = new Date(usage.usedAt);
            return usedAt >= q2Start && usedAt < q2End;
        });
        
        // Q1 ANALYSIS
        console.log('=== Q1 ANALYSIS ===');
        console.log(`Q1 Submissions: ${q1Submissions.length}`);
        console.log(`Q1 Sessions: ${q1Sessions.length}`);
        console.log(`Q1 Resource Usage: ${q1ResourceUsage.length}`);
        
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
            
            // Q1 Categories
            const q1Categories = {};
            q1Submissions.forEach(submission => {
                const category = submission.assessment.category || 'Uncategorized';
                q1Categories[category] = (q1Categories[category] || 0) + 1;
            });
            
            console.log('\n   Q1 Assessment Categories:');
            Object.entries(q1Categories).forEach(([category, count]) => {
                console.log(`   ${category}: ${count} assessments`);
            });
        }
        
        if (q1Sessions.length > 0) {
            // Q1 Session patterns
            const q1DayCounts = {};
            q1Sessions.forEach(session => {
                const dayName = new Date(session.startTime).toLocaleDateString('en-US', { weekday: 'long' });
                q1DayCounts[dayName] = (q1DayCounts[dayName] || 0) + 1;
            });
            
            console.log('\n   Q1 Login Patterns:');
            Object.entries(q1DayCounts).forEach(([day, count]) => {
                console.log(`   ${day}: ${count} sessions`);
            });
        }
        
        // Q2 ANALYSIS
        console.log('\n=== Q2 ANALYSIS ===');
        console.log(`Q2 Submissions: ${q2Submissions.length}`);
        console.log(`Q2 Sessions: ${q2Sessions.length}`);
        console.log(`Q2 Resource Usage: ${q2ResourceUsage.length}`);
        
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
            
            // Q2 Categories
            const q2Categories = {};
            q2Submissions.forEach(submission => {
                const category = submission.assessment.category || 'Uncategorized';
                q2Categories[category] = (q2Categories[category] || 0) + 1;
            });
            
            console.log('\n   Q2 Assessment Categories:');
            Object.entries(q2Categories).forEach(([category, count]) => {
                console.log(`   ${category}: ${count} assessments`);
            });
        }
        
        if (q2Sessions.length > 0) {
            // Q2 Session patterns
            const q2DayCounts = {};
            q2Sessions.forEach(session => {
                const dayName = new Date(session.startTime).toLocaleDateString('en-US', { weekday: 'long' });
                q2DayCounts[dayName] = (q2DayCounts[dayName] || 0) + 1;
            });
            
            console.log('\n   Q2 Login Patterns:');
            Object.entries(q2DayCounts).forEach(([day, count]) => {
                console.log(`   ${day}: ${count} sessions`);
            });
            
            // Q2 Class day sessions
            const q2ClassDaySessions = q2Sessions.filter(session => {
                const dayOfWeek = new Date(session.startTime).getDay();
                const hour = new Date(session.startTime).getHours();
                return (dayOfWeek === 4 || dayOfWeek === 5) && hour >= 8 && hour < 16;
            });
            
            console.log(`\n   Q2 Class Day Sessions (Thu/Fri 8am-4pm): ${q2ClassDaySessions.length}`);
            
            // Q2 Class day login patterns
            const q2ClassDayCounts = {};
            q2ClassDaySessions.forEach(session => {
                const dayName = new Date(session.startTime).toLocaleDateString('en-US', { weekday: 'long' });
                q2ClassDayCounts[dayName] = (q2ClassDayCounts[dayName] || 0) + 1;
            });
            
            console.log('   Q2 Class Day Login Patterns:');
            Object.entries(q2ClassDayCounts).forEach(([day, count]) => {
                console.log(`   ${day}: ${count} sessions`);
            });
        }
        
        // QUARTERLY COMPARISON
        console.log('\n=== QUARTERLY COMPARISON ===');
        
        if (q1Submissions.length > 0 && q2Submissions.length > 0) {
            const q1Scores = q1Submissions.filter(s => s.score !== null).map(s => s.score);
            const q2Scores = q2Submissions.filter(s => s.score !== null).map(s => s.score);
            
            const q1AvgScore = q1Scores.reduce((sum, score) => sum + score, 0) / q1Scores.length;
            const q2AvgScore = q2Scores.reduce((sum, score) => sum + score, 0) / q2Scores.length;
            
            console.log(`Score Improvement: Q1 ${q1AvgScore.toFixed(1)}% → Q2 ${q2AvgScore.toFixed(1)}% (${(q2AvgScore - q1AvgScore).toFixed(1)}% change)`);
            console.log(`Activity Level: Q1 ${q1Submissions.length} submissions → Q2 ${q2Submissions.length} submissions (${q2Submissions.length - q1Submissions.length} change)`);
            console.log(`Session Frequency: Q1 ${q1Sessions.length} sessions → Q2 ${q2Sessions.length} sessions (${q2Sessions.length - q1Sessions.length} change)`);
        }
        
        // COURSE STRUCTURE BY QUARTER
        console.log('\n=== COURSE STRUCTURE BY QUARTER ===');
        
        activeAbigail.studentCourses.forEach((course, index) => {
            console.log(`\nCourse ${index + 1}: ${course.subject.name}`);
            console.log(`Core Subject: ${course.subject.coreSubject.name}`);
            
            // Get assessments by quarter
            const q1Assessments = q1Submissions.map(s => s.assessment);
            const q2Assessments = q2Submissions.map(s => s.assessment);
            
            console.log(`Q1 Assessments: ${q1Assessments.length}`);
            console.log(`Q2 Assessments: ${q2Assessments.length}`);
        });
        
        // SUGGESTED QUARTERLY METRICS FOR REPORTS
        console.log('\n=== SUGGESTED QUARTERLY METRICS FOR REPORTS ===');
        console.log('1. Performance Trends:');
        console.log('   - Q1 vs Q2 average scores');
        console.log('   - Score improvement/decline');
        console.log('   - Category-specific performance changes');
        
        console.log('\n2. Engagement Trends:');
        console.log('   - Q1 vs Q2 submission counts');
        console.log('   - Session frequency changes');
        console.log('   - Login pattern consistency');
        
        console.log('\n3. Time Analysis:');
        console.log('   - Q1 vs Q2 total learning time');
        console.log('   - Average time per assessment changes');
        console.log('   - Efficiency improvements');
        
        console.log('\n4. Skill Progression:');
        console.log('   - Q1 vs Q2 skill completion rates');
        console.log('   - Skill mastery progression');
        console.log('   - Topic coverage expansion');
        
        console.log('\n5. Behavioral Patterns:');
        console.log('   - Q1 vs Q2 login consistency');
        console.log('   - Class day attendance patterns');
        console.log('   - Resource usage changes');
        
    } catch (error) {
        console.error('Error:', error);
    } finally {
        await prisma.$disconnect();
    }
}

analyzeQuarterlyData();
