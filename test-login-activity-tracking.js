const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

async function testLoginActivityTracking() {
    try {
        console.log('=== Testing Login Activity Tracking ===\n');
        
        // Set analysis period (30 days)
        const days = 30;
        const daysAgo = new Date();
        daysAgo.setDate(daysAgo.getDate() - days);
        
        console.log(`Analysis period: Last ${days} days (since ${daysAgo.toLocaleDateString()})\n`);
        
        // Get all active students with their sessions and submissions
        const students = await prisma.user.findMany({
            where: { 
                role: 'STUDENT',
                active: true  // Only include active students
            },
            include: {
                sessions: {
                    where: {
                        startTime: {
                            gte: daysAgo
                        }
                    },
                    orderBy: {
                        startTime: 'desc'
                    }
                },
                assessmentSubmissions: {
                    where: {
                        submittedAt: {
                            gte: daysAgo
                        }
                    },
                    orderBy: {
                        submittedAt: 'desc'
                    }
                },
                studentCourses: {
                    include: {
                        subject: true
                    }
                }
            },
            orderBy: { name: 'asc' }
        });
        
        console.log(`Found ${students.length} students\n`);
        
        // Analyze each student
        const analysis = students.map(student => {
            const loginSessions = student.sessions;
            const recentSubmissions = student.assessmentSubmissions;
            
            // Count distinct login days
            const loginDays = new Set(loginSessions.map(s => 
                new Date(s.startTime).toDateString()
            )).size;
            
            // Count distinct activity days
            const activityDays = new Set(recentSubmissions.map(s => 
                new Date(s.submittedAt).toDateString()
            )).size;
            
            // Find login sessions that didn't result in activity
            const loginWithoutActivity = loginSessions.filter(session => {
                const sessionDate = new Date(session.startTime).toDateString();
                const hadActivityOnDay = recentSubmissions.some(submission => 
                    new Date(submission.submittedAt).toDateString() === sessionDate
                );
                return !hadActivityOnDay;
            });
            
            // Calculate metrics
            const totalLoginSessions = loginSessions.length;
            const sessionsWithActivity = totalLoginSessions - loginWithoutActivity.length;
            const sessionsWithoutActivity = loginWithoutActivity.length;
            const activityRate = totalLoginSessions > 0 ? 
                ((sessionsWithActivity / totalLoginSessions) * 100).toFixed(1) : 0;
            
            // Determine engagement pattern
            let engagementPattern = 'Unknown';
            if (totalLoginSessions === 0) {
                engagementPattern = 'No Logins';
            } else if (sessionsWithoutActivity === 0) {
                engagementPattern = 'Always Active';
            } else if (sessionsWithoutActivity === totalLoginSessions) {
                engagementPattern = 'Login Only - No Activity';
            } else if (activityRate >= 75) {
                engagementPattern = 'Highly Engaged';
            } else if (activityRate >= 50) {
                engagementPattern = 'Moderately Engaged';
            } else if (activityRate >= 25) {
                engagementPattern = 'Low Engagement';
            } else {
                engagementPattern = 'Minimal Engagement';
            }
            
            return {
                name: student.name,
                email: student.email,
                class: student.class,
                yearLevel: student.yearLevel,
                totalLoginSessions,
                sessionsWithActivity,
                sessionsWithoutActivity,
                activityRate: parseFloat(activityRate),
                engagementPattern,
                loginDays,
                activityDays,
                loginWithoutActivityCount: loginWithoutActivity.length
            };
        });
        
        // Calculate summary statistics
        const totalStudents = analysis.length;
        const studentsWithLogins = analysis.filter(s => s.totalLoginSessions > 0).length;
        const studentsWithActivity = analysis.filter(s => s.sessionsWithActivity > 0).length;
        const studentsLoginOnly = analysis.filter(s => s.engagementPattern === 'Login Only - No Activity').length;
        const studentsNoLogins = analysis.filter(s => s.engagementPattern === 'No Logins').length;
        
        const averageActivityRate = analysis.reduce((sum, s) => sum + s.activityRate, 0) / totalStudents;
        
        console.log('=== SUMMARY STATISTICS ===');
        console.log(`Total Students: ${totalStudents}`);
        console.log(`Students with Logins: ${studentsWithLogins}`);
        console.log(`Students with Activity: ${studentsWithActivity}`);
        console.log(`Students Login Only - No Activity: ${studentsLoginOnly}`);
        console.log(`Students No Logins: ${studentsNoLogins}`);
        console.log(`Average Activity Rate: ${averageActivityRate.toFixed(1)}%\n`);
        
        // Show engagement patterns
        console.log('=== ENGAGEMENT PATTERNS ===');
        const patterns = {};
        analysis.forEach(student => {
            patterns[student.engagementPattern] = (patterns[student.engagementPattern] || 0) + 1;
        });
        
        Object.entries(patterns).forEach(([pattern, count]) => {
            console.log(`${pattern}: ${count} students`);
        });
        console.log();
        
        // Show critical students (Login Only - No Activity)
        const criticalStudents = analysis.filter(s => s.engagementPattern === 'Login Only - No Activity');
        if (criticalStudents.length > 0) {
            console.log('=== CRITICAL ALERT: LOGIN ONLY - NO ACTIVITY ===');
            criticalStudents.forEach(student => {
                console.log(`• ${student.name} (${student.class}): ${student.totalLoginSessions} logins, 0 activities`);
            });
            console.log();
        }
        
        // Show low engagement students
        const lowEngagementStudents = analysis.filter(s => 
            s.engagementPattern === 'Minimal Engagement' || 
            s.engagementPattern === 'Low Engagement'
        );
        
        if (lowEngagementStudents.length > 0) {
            console.log('=== LOW ENGAGEMENT STUDENTS ===');
            lowEngagementStudents.forEach(student => {
                console.log(`• ${student.name} (${student.class}): ${student.activityRate}% activity rate`);
            });
            console.log();
        }
        
        // Show detailed analysis for a few students
        console.log('=== DETAILED STUDENT ANALYSIS ===');
        analysis.slice(0, 5).forEach(student => {
            console.log(`${student.name} (${student.class}):`);
            console.log(`  Engagement Pattern: ${student.engagementPattern}`);
            console.log(`  Activity Rate: ${student.activityRate}%`);
            console.log(`  Login Sessions: ${student.totalLoginSessions}`);
            console.log(`  Sessions with Activity: ${student.sessionsWithActivity}`);
            console.log(`  Sessions without Activity: ${student.sessionsWithoutActivity}`);
            console.log(`  Login Days: ${student.loginDays}`);
            console.log(`  Activity Days: ${student.activityDays}`);
            console.log();
        });
        
        // Demonstrate parent report generation
        console.log('=== PARENT REPORT EXAMPLE ===');
        const sampleStudent = analysis.find(s => s.engagementPattern === 'Login Only - No Activity') || analysis[0];
        if (sampleStudent) {
            console.log(`Sample Parent Report for ${sampleStudent.name}:`);
            console.log(`Analysis Period: Last ${days} days`);
            console.log(`Engagement Pattern: ${sampleStudent.engagementPattern}`);
            console.log(`Activity Rate: ${sampleStudent.activityRate}%`);
            console.log(`Total Login Sessions: ${sampleStudent.totalLoginSessions}`);
            console.log(`Sessions Without Activity: ${sampleStudent.sessionsWithoutActivity}`);
            console.log(`Active Learning Days: ${sampleStudent.activityDays} out of ${sampleStudent.loginDays} login days`);
            
            if (sampleStudent.activityRate < 50) {
                console.log('\nRECOMMENDATIONS:');
                console.log('• Student logs in but may not be fully engaging with learning activities');
                console.log('• Consider one-on-one support to understand barriers');
                console.log('• Check if student understands how to access and complete assessments');
                console.log('• Consider parent-teacher conference to discuss engagement');
            }
        }
        
    } catch (error) {
        console.error('Error testing login activity tracking:', error);
    } finally {
        await prisma.$disconnect();
    }
}

// Run the test
testLoginActivityTracking();
