const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

async function analyzeDatabaseData() {
    try {
        console.log('=== Database Data Analysis for Student Assessment ===\n');
        
        // Find active Abigail for testing
        const activeAbigail = await prisma.user.findUnique({
            where: {
                id: '009e27ea-72d4-4eb4-9658-92131a42b3c2'
            },
            include: {
                // All related data
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
                                topic: true,
                                mediaFiles: true
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
                    orderBy: { startTime: 'desc' },
                    take: 10
                },
                studentCourses: {
                    include: {
                        subject: {
                            include: {
                                coreSubject: true,
                                units: {
                                    include: {
                                        parts: {
                                            include: {
                                                sections: {
                                                    include: {
                                                        assessments: {
                                                            include: {
                                                                submissions: {
                                                                    where: {
                                                                        studentId: '009e27ea-72d4-4eb4-9658-92131a42b3c2'
                                                                    }
                                                                }
                                                            }
                                                        }
                                                    }
                                                }
                                            }
                                        }
                                    }
                                }
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
        
        console.log(`=== Analysis for ${activeAbigail.name} ===\n`);
        
        // 1. ASSESSMENT SUBMISSIONS ANALYSIS
        console.log('1. ASSESSMENT SUBMISSIONS:');
        console.log(`   Total submissions: ${activeAbigail.assessmentSubmissions.length}`);
        
        if (activeAbigail.assessmentSubmissions.length > 0) {
            // Score analysis
            const scores = activeAbigail.assessmentSubmissions
                .filter(s => s.score !== null)
                .map(s => s.score);
            
            const avgScore = scores.length > 0 ? 
                scores.reduce((sum, score) => sum + score, 0) / scores.length : 0;
            
            console.log(`   Average score: ${avgScore.toFixed(1)}%`);
            console.log(`   Highest score: ${Math.max(...scores)}%`);
            console.log(`   Lowest score: ${Math.min(...scores)}%`);
            
            // Time analysis
            const submissionsWithTime = activeAbigail.assessmentSubmissions
                .filter(s => s.totalTime !== null);
            
            console.log(`   Submissions with time data: ${submissionsWithTime.length}`);
            
            if (submissionsWithTime.length > 0) {
                const totalTime = submissionsWithTime.reduce((sum, s) => sum + s.totalTime, 0);
                const avgTime = totalTime / submissionsWithTime.length;
                console.log(`   Average time per assessment: ${Math.round(avgTime / 60)} minutes`);
                console.log(`   Total time spent: ${Math.round(totalTime / 60)} minutes`);
            }
            
            // Attempts analysis
            const submissionsWithAttempts = activeAbigail.assessmentSubmissions
                .filter(s => s.attempts !== null);
            
            console.log(`   Submissions with attempts data: ${submissionsWithAttempts.length}`);
            
            if (submissionsWithAttempts.length > 0) {
                const totalAttempts = submissionsWithAttempts.reduce((sum, s) => sum + s.attempts, 0);
                const avgAttempts = totalAttempts / submissionsWithAttempts.length;
                console.log(`   Average attempts per assessment: ${avgAttempts.toFixed(1)}`);
                console.log(`   Max attempts on any assessment: ${Math.max(...submissionsWithAttempts.map(s => s.attempts))}`);
            }
            
            // Recent submissions
            console.log('\n   Recent submissions (last 5):');
            activeAbigail.assessmentSubmissions.slice(0, 5).forEach((submission, index) => {
                console.log(`   ${index + 1}. ${submission.assessment.title}`);
                console.log(`      Score: ${submission.score || 'N/A'}%, Time: ${submission.totalTime ? Math.round(submission.totalTime / 60) + ' min' : 'N/A'}, Attempts: ${submission.attempts || 'N/A'}`);
                console.log(`      Submitted: ${submission.submittedAt.toDateString()}`);
                console.log(`      Category: ${submission.assessment.category || 'N/A'}`);
                console.log(`      Topic: ${submission.assessment.topic?.name || 'N/A'}`);
            });
        }
        
        // 2. STUDENT PROGRESS ANALYSIS
        console.log('\n2. STUDENT PROGRESS:');
        console.log(`   Total progress records: ${activeAbigail.studentProgress.length}`);
        
        if (activeAbigail.studentProgress.length > 0) {
            console.log('\n   Progress by subject:');
            const progressBySubject = {};
            activeAbigail.studentProgress.forEach(progress => {
                const subjectName = progress.subject.name;
                if (!progressBySubject[subjectName]) {
                    progressBySubject[subjectName] = [];
                }
                progressBySubject[subjectName].push(progress);
            });
            
            Object.entries(progressBySubject).forEach(([subject, records]) => {
                console.log(`   ${subject}: ${records.length} records`);
                records.forEach(record => {
                    console.log(`     - ${record.topic?.name || record.skillCategory || 'General'}: ${record.status} (Score: ${record.score || 'N/A'})`);
                });
            });
        }
        
        // 3. RESOURCE USAGE ANALYSIS
        console.log('\n3. RESOURCE USAGE:');
        console.log(`   Total resources used: ${activeAbigail.resourcesUsed.length}`);
        
        if (activeAbigail.resourcesUsed.length > 0) {
            console.log('\n   Recent resource usage (last 5):');
            activeAbigail.resourcesUsed.slice(0, 5).forEach((usage, index) => {
                console.log(`   ${index + 1}. ${usage.resource.title}`);
                console.log(`      Type: ${usage.resource.type}, Used: ${usage.usedAt.toDateString()}`);
                console.log(`      Topic: ${usage.resource.topic?.name || 'N/A'}`);
            });
        }
        
        // 4. SESSION PATTERNS
        console.log('\n4. SESSION PATTERNS:');
        console.log(`   Total sessions: ${activeAbigail.sessions.length}`);
        
        if (activeAbigail.sessions.length > 0) {
            // Day of week analysis
            const dayCounts = {};
            activeAbigail.sessions.forEach(session => {
                const dayName = new Date(session.startTime).toLocaleDateString('en-US', { weekday: 'long' });
                dayCounts[dayName] = (dayCounts[dayName] || 0) + 1;
            });
            
            console.log('\n   Login patterns by day:');
            Object.entries(dayCounts).forEach(([day, count]) => {
                console.log(`   ${day}: ${count} sessions`);
            });
            
            // Time of day analysis
            const hourCounts = {};
            activeAbigail.sessions.forEach(session => {
                const hour = new Date(session.startTime).getHours();
                hourCounts[hour] = (hourCounts[hour] || 0) + 1;
            });
            
            console.log('\n   Login patterns by hour:');
            Object.entries(hourCounts).forEach(([hour, count]) => {
                console.log(`   ${hour}:00 - ${count} sessions`);
            });
        }
        
        // 5. COURSE STRUCTURE ANALYSIS
        console.log('\n5. COURSE STRUCTURE:');
        console.log(`   Enrolled in ${activeAbigail.studentCourses.length} courses`);
        
        activeAbigail.studentCourses.forEach((course, index) => {
            console.log(`\n   Course ${index + 1}: ${course.subject.name}`);
            console.log(`   Core Subject: ${course.subject.coreSubject.name}`);
            console.log(`   Units: ${course.subject.units.length}`);
            
            let totalAssessments = 0;
            let completedAssessments = 0;
            
            course.subject.units.forEach(unit => {
                unit.parts.forEach(part => {
                    part.sections.forEach(section => {
                        totalAssessments += section.assessments.length;
                        section.assessments.forEach(assessment => {
                            if (assessment.submissions.length > 0) {
                                completedAssessments++;
                            }
                        });
                    });
                });
            });
            
            console.log(`   Total assessments: ${totalAssessments}`);
            console.log(`   Completed assessments: ${completedAssessments}`);
            console.log(`   Completion rate: ${totalAssessments > 0 ? Math.round((completedAssessments / totalAssessments) * 100) : 0}%`);
        });
        
        // 6. ADDITIONAL METRICS WE COULD TRACK
        console.log('\n6. ADDITIONAL METRICS AVAILABLE:');
        console.log('   - IP Address tracking (for location patterns)');
        console.log('   - User Agent tracking (for device/browser patterns)');
        console.log('   - Assessment metadata (questions, criteria)');
        console.log('   - Media file usage (audio, video, documents)');
        console.log('   - Weekly schedule adherence');
        console.log('   - Resource creation (if student creates content)');
        console.log('   - Parent-child relationships (for family engagement)');
        console.log('   - Teacher transfer history');
        console.log('   - Password reset patterns (engagement indicator)');
        
        // 7. SUGGESTED NEW METRICS FOR REPORTS
        console.log('\n7. SUGGESTED NEW METRICS FOR REPORTS:');
        console.log('   - Time spent per assessment type');
        console.log('   - Improvement over time (score trends)');
        console.log('   - Resource engagement rate');
        console.log('   - Topic mastery progression');
        console.log('   - Login consistency patterns');
        console.log('   - Peak learning hours');
        console.log('   - Assessment retry patterns');
        console.log('   - Comment/feedback engagement');
        console.log('   - Due date adherence');
        console.log('   - Cross-subject performance correlation');
        
    } catch (error) {
        console.error('Error:', error);
    } finally {
        await prisma.$disconnect();
    }
}

analyzeDatabaseData();
