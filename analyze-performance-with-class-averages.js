const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

async function analyzePerformanceWithClassAverages() {
    try {
        console.log('=== Performance Analysis with Class Averages ===\n');
        
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
        
        console.log(`=== Performance Analysis for ${activeAbigail.name} ===\n`);
        
        // Get English subject
        const englishCourse = activeAbigail.studentCourses.find(sc => 
            sc.subject.coreSubject.name.toLowerCase().includes('english')
        );
        
        if (!englishCourse) {
            console.log('English course not found');
            return;
        }
        
        console.log(`English Course: ${englishCourse.subject.name}`);
        
        // Get all students in the same English class
        const classStudents = await prisma.studentCourse.findMany({
            where: {
                subjectId: englishCourse.subjectId
            },
            include: {
                student: {
                    include: {
                        assessmentSubmissions: {
                            include: {
                                assessment: true
                            }
                        }
                    }
                }
            }
        });
        
        console.log(`Class size: ${classStudents.length} students\n`);
        
        // Filter data by quarters for target student
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
        
        // Calculate class averages for Q1
        const q1ClassCategories = {};
        classStudents.forEach(studentCourse => {
            const student = studentCourse.student;
            const studentQ1Submissions = student.assessmentSubmissions.filter(submission => {
                const submittedAt = new Date(submission.submittedAt);
                return submittedAt >= q1Start && submittedAt < q1End;
            });
            
            studentQ1Submissions.forEach(submission => {
                const category = categorizeAssessment(submission.assessment.category);
                if (!q1ClassCategories[category]) {
                    q1ClassCategories[category] = [];
                }
                if (submission.score !== null) {
                    q1ClassCategories[category].push(submission.score);
                }
            });
        });
        
        // Calculate class averages for Q2
        const q2ClassCategories = {};
        classStudents.forEach(studentCourse => {
            const student = studentCourse.student;
            const studentQ2Submissions = student.assessmentSubmissions.filter(submission => {
                const submittedAt = new Date(submission.submittedAt);
                return submittedAt >= q2Start && submittedAt < q2End;
            });
            
            studentQ2Submissions.forEach(submission => {
                const category = categorizeAssessment(submission.assessment.category);
                if (!q2ClassCategories[category]) {
                    q2ClassCategories[category] = [];
                }
                if (submission.score !== null) {
                    q2ClassCategories[category].push(submission.score);
                }
            });
        });
        
        // Q1 PERFORMANCE ANALYSIS
        console.log('=== Q1 PERFORMANCE ANALYSIS ===');
        console.log(`Q1 Submissions: ${q1Submissions.length}`);
        
        const q1Categories = {};
        q1Submissions.forEach(submission => {
            const category = categorizeAssessment(submission.assessment.category);
            if (!q1Categories[category]) {
                q1Categories[category] = { submissions: [], scores: [] };
            }
            q1Categories[category].submissions.push(submission);
            if (submission.score !== null) {
                q1Categories[category].scores.push(submission.score);
            }
        });
        
        console.log('\n   Q1 Performance by Category:');
        console.log('   (All averages and percentages are for this student only)');
        console.log('   Note: Only submitted assessments with scores are included in averages');
        Object.entries(q1Categories).forEach(([category, data]) => {
            const scores = data.scores;
            if (scores.length > 0) {
                const avgScore = scores.reduce((sum, score) => sum + score, 0) / scores.length;
                const minScore = Math.min(...scores);
                const maxScore = Math.max(...scores);
                const lowScores = scores.filter(s => s < 80).length;
                const strugglingCount = scores.filter(s => s < 70).length;
                
                // Calculate class average for this category
                const classScores = q1ClassCategories[category] || [];
                const classAvg = classScores.length > 0 ? 
                    classScores.reduce((sum, score) => sum + score, 0) / classScores.length : 0;
                
                console.log(`   ${category}:`);
                console.log(`     Student's Average Score: ${avgScore.toFixed(1)}% (${scores.length} assessments)`);
                console.log(`     Class Average Score: ${classAvg.toFixed(1)}% (${classScores.length} total assessments)`);
                console.log(`     Score Range: ${minScore}% - ${maxScore}%`);
                console.log(`     Below 80%: ${lowScores}/${scores.length} assessments (${((lowScores/scores.length)*100).toFixed(1)}%)`);
                console.log(`     Below 70%: ${strugglingCount}/${scores.length} assessments (${((strugglingCount/scores.length)*100).toFixed(1)}%)`);
                
                // Show struggling assessments
                if (strugglingCount > 0) {
                    console.log(`     Low-performing assessments:`);
                    data.submissions
                        .filter(s => s.score !== null && s.score < 70)
                        .forEach(s => {
                            console.log(`       - ${s.assessment.title}: ${s.score}%`);
                        });
                }
                console.log('');
            }
        });
        
        // Q2 PERFORMANCE ANALYSIS
        console.log('=== Q2 PERFORMANCE ANALYSIS ===');
        console.log(`Q2 Submissions: ${q2Submissions.length}`);
        
        const q2Categories = {};
        q2Submissions.forEach(submission => {
            const category = categorizeAssessment(submission.assessment.category);
            if (!q2Categories[category]) {
                q2Categories[category] = { submissions: [], scores: [] };
            }
            q2Categories[category].submissions.push(submission);
            if (submission.score !== null) {
                q2Categories[category].scores.push(submission.score);
            }
        });
        
        console.log('\n   Q2 Performance by Category:');
        console.log('   (All averages and percentages are for this student only)');
        console.log('   Note: Only submitted assessments with scores are included in averages');
        Object.entries(q2Categories).forEach(([category, data]) => {
            const scores = data.scores;
            if (scores.length > 0) {
                const avgScore = scores.reduce((sum, score) => sum + score, 0) / scores.length;
                const minScore = Math.min(...scores);
                const maxScore = Math.max(...scores);
                const lowScores = scores.filter(s => s < 80).length;
                const strugglingCount = scores.filter(s => s < 70).length;
                
                // Calculate class average for this category
                const classScores = q2ClassCategories[category] || [];
                const classAvg = classScores.length > 0 ? 
                    classScores.reduce((sum, score) => sum + score, 0) / classScores.length : 0;
                
                console.log(`   ${category}:`);
                console.log(`     Student's Average Score: ${avgScore.toFixed(1)}% (${scores.length} assessments)`);
                console.log(`     Class Average Score: ${classAvg.toFixed(1)}% (${classScores.length} total assessments)`);
                console.log(`     Score Range: ${minScore}% - ${maxScore}%`);
                console.log(`     Below 80%: ${lowScores}/${scores.length} assessments (${((lowScores/scores.length)*100).toFixed(1)}%)`);
                console.log(`     Below 70%: ${strugglingCount}/${scores.length} assessments (${((strugglingCount/scores.length)*100).toFixed(1)}%)`);
                
                // Show struggling assessments
                if (strugglingCount > 0) {
                    console.log(`     Low-performing assessments:`);
                    data.submissions
                        .filter(s => s.score !== null && s.score < 70)
                        .forEach(s => {
                            console.log(`       - ${s.assessment.title}: ${s.score}%`);
                        });
                }
                console.log('');
            }
        });
        
        // PERFORMANCE COMPARISON
        console.log('=== PERFORMANCE COMPARISON ===');
        console.log('Skill Development Analysis:');
        console.log('Note: "Struggling" refers to the percentage of assessments scoring below 70%');
        console.log('This indicates areas where the student may need additional support or practice.');
        console.log('Important: Only submitted assessments with scores are included in all averages.');
        console.log('Missing or unsubmitted assessments are not counted as 0% - they are excluded entirely.\n');
        
        const allCategories = new Set([...Object.keys(q1Categories), ...Object.keys(q2Categories)]);
        allCategories.forEach(category => {
            const q1Data = q1Categories[category];
            const q2Data = q2Categories[category];
            
            if (q1Data && q2Data && q1Data.scores.length > 0 && q2Data.scores.length > 0) {
                const q1Avg = q1Data.scores.reduce((sum, score) => sum + score, 0) / q1Data.scores.length;
                const q2Avg = q2Data.scores.reduce((sum, score) => sum + score, 0) / q2Data.scores.length;
                const change = q2Avg - q1Avg;
                
                const q1Struggling = q1Data.scores.filter(s => s < 70).length;
                const q2Struggling = q2Data.scores.filter(s => s < 70).length;
                const q1StrugglingPercent = (q1Struggling / q1Data.scores.length) * 100;
                const q2StrugglingPercent = (q2Struggling / q2Data.scores.length) * 100;
                
                // Calculate class averages
                const q1ClassScores = q1ClassCategories[category] || [];
                const q2ClassScores = q2ClassCategories[category] || [];
                const q1ClassAvg = q1ClassScores.length > 0 ? 
                    q1ClassScores.reduce((sum, score) => sum + score, 0) / q1ClassScores.length : 0;
                const q2ClassAvg = q2ClassScores.length > 0 ? 
                    q2ClassScores.reduce((sum, score) => sum + score, 0) / q2ClassScores.length : 0;
                
                console.log(`\n   ${category}:`);
                console.log(`     Student's Performance: Q1 ${q1Avg.toFixed(1)}% → Q2 ${q2Avg.toFixed(1)}% (${change > 0 ? '+' : ''}${change.toFixed(1)}% change)`);
                console.log(`     Class Performance: Q1 ${q1ClassAvg.toFixed(1)}% → Q2 ${q2ClassAvg.toFixed(1)}%`);
                console.log(`     Struggling Assessments: Q1 ${q1StrugglingPercent.toFixed(1)}% → Q2 ${q2StrugglingPercent.toFixed(1)}% (percentage below 70%)`);
                
                // Compare student vs class
                const studentVsClassQ1 = q1Avg - q1ClassAvg;
                const studentVsClassQ2 = q2Avg - q2ClassAvg;
                
                if (studentVsClassQ1 > 5) {
                    console.log(`     Q1: Student performing above class average (+${studentVsClassQ1.toFixed(1)}%)`);
                } else if (studentVsClassQ1 < -5) {
                    console.log(`     Q1: Student performing below class average (${studentVsClassQ1.toFixed(1)}%)`);
                } else {
                    console.log(`     Q1: Student performing near class average (${studentVsClassQ1 > 0 ? '+' : ''}${studentVsClassQ1.toFixed(1)}%)`);
                }
                
                if (studentVsClassQ2 > 5) {
                    console.log(`     Q2: Student performing above class average (+${studentVsClassQ2.toFixed(1)}%)`);
                } else if (studentVsClassQ2 < -5) {
                    console.log(`     Q2: Student performing below class average (${studentVsClassQ2.toFixed(1)}%)`);
                } else {
                    console.log(`     Q2: Student performing near class average (${studentVsClassQ2 > 0 ? '+' : ''}${studentVsClassQ2.toFixed(1)}%)`);
                }
                
                if (change > 5) {
                    console.log(`     → Student improving in ${category}`);
                } else if (change < -5) {
                    console.log(`     → Student declining in ${category}`);
                } else {
                    console.log(`     → Student stable in ${category}`);
                }
                
                if (q2StrugglingPercent > 20) {
                    console.log(`     → Student needs attention in ${category}`);
                }
            } else if (q2Data && q2Data.scores.length > 0) {
                const q2Avg = q2Data.scores.reduce((sum, score) => sum + score, 0) / q2Data.scores.length;
                const q2Struggling = q2Data.scores.filter(s => s < 70).length;
                const q2StrugglingPercent = (q2Struggling / q2Data.scores.length) * 100;
                
                // Calculate class average for Q2
                const q2ClassScores = q2ClassCategories[category] || [];
                const q2ClassAvg = q2ClassScores.length > 0 ? 
                    q2ClassScores.reduce((sum, score) => sum + score, 0) / q2ClassScores.length : 0;
                
                const studentVsClassQ2 = q2Avg - q2ClassAvg;
                
                console.log(`\n   ${category}:`);
                console.log(`     Student's Performance: New in Q2 - ${q2Avg.toFixed(1)}% average (${q2Data.scores.length} assessments)`);
                console.log(`     Class Performance: Q2 ${q2ClassAvg.toFixed(1)}% average (${q2ClassScores.length} total assessments)`);
                console.log(`     Struggling Assessments: ${q2StrugglingPercent.toFixed(1)}% (percentage below 70%)`);
                
                if (studentVsClassQ2 > 5) {
                    console.log(`     Q2: Student performing above class average (+${studentVsClassQ2.toFixed(1)}%)`);
                } else if (studentVsClassQ2 < -5) {
                    console.log(`     Q2: Student performing below class average (${studentVsClassQ2.toFixed(1)}%)`);
                } else {
                    console.log(`     Q2: Student performing near class average (${studentVsClassQ2 > 0 ? '+' : ''}${studentVsClassQ2.toFixed(1)}%)`);
                }
                
                if (q2StrugglingPercent > 20) {
                    console.log(`     → Student needs attention in ${category}`);
                }
            }
        });
        
        // ASSESSMENT COMPLETION ANALYSIS
        console.log('\n=== ASSESSMENT COMPLETION ANALYSIS ===');
        console.log('This section shows how many assessments were completed vs. assigned');
        
        // Get all assessments for this subject in each quarter
        const q1AllAssessments = await prisma.assessment.findMany({
            where: {
                quarter: 'Q1',
                section: {
                    part: {
                        unit: {
                            subjectId: englishCourse.subjectId
                        }
                    }
                }
            }
        });
        
        const q2AllAssessments = await prisma.assessment.findMany({
            where: {
                quarter: 'Q2',
                section: {
                    part: {
                        unit: {
                            subjectId: englishCourse.subjectId
                        }
                    }
                }
            }
        });
        
        console.log(`Q1 Total Assessments Available: ${q1AllAssessments.length}`);
        console.log(`Q1 Student Submissions: ${q1Submissions.length}`);
        console.log(`Q1 Completion Rate: ${q1AllAssessments.length > 0 ? ((q1Submissions.length / q1AllAssessments.length) * 100).toFixed(1) : 0}%`);
        
        console.log(`\nQ2 Total Assessments Available: ${q2AllAssessments.length}`);
        console.log(`Q2 Student Submissions: ${q2Submissions.length}`);
        console.log(`Q2 Completion Rate: ${q2AllAssessments.length > 0 ? ((q2Submissions.length / q2AllAssessments.length) * 100).toFixed(1) : 0}%`);
        
        console.log('\nNote: Completion rate shows how many assessments the student submitted out of all available.');
        console.log('Missing assessments are not included in performance averages (they are excluded, not counted as 0%).');
        
        // OVERALL PERFORMANCE TRENDS
        console.log('\n=== OVERALL PERFORMANCE TRENDS ===');
        
        const q1AllScores = q1Submissions.filter(s => s.score !== null).map(s => s.score);
        const q2AllScores = q2Submissions.filter(s => s.score !== null).map(s => s.score);
        
        if (q1AllScores.length > 0 && q2AllScores.length > 0) {
            const q1Avg = q1AllScores.reduce((sum, score) => sum + score, 0) / q1AllScores.length;
            const q2Avg = q2AllScores.reduce((sum, score) => sum + score, 0) / q2AllScores.length;
            
            const q1Struggling = q1AllScores.filter(s => s < 70).length;
            const q2Struggling = q2AllScores.filter(s => s < 70).length;
            const q1StrugglingPercent = (q1Struggling / q1AllScores.length) * 100;
            const q2StrugglingPercent = (q2Struggling / q2AllScores.length) * 100;
            
            // Calculate overall class averages
            const q1ClassAllScores = Object.values(q1ClassCategories).flat();
            const q2ClassAllScores = Object.values(q2ClassCategories).flat();
            const q1ClassAvg = q1ClassAllScores.length > 0 ? 
                q1ClassAllScores.reduce((sum, score) => sum + score, 0) / q1ClassAllScores.length : 0;
            const q2ClassAvg = q2ClassAllScores.length > 0 ? 
                q2ClassAllScores.reduce((sum, score) => sum + score, 0) / q2ClassAllScores.length : 0;
            
            console.log(`Student's Overall Performance: Q1 ${q1Avg.toFixed(1)}% → Q2 ${q2Avg.toFixed(1)}% (${(q2Avg - q1Avg).toFixed(1)}% change)`);
            console.log(`Class Overall Performance: Q1 ${q1ClassAvg.toFixed(1)}% → Q2 ${q2ClassAvg.toFixed(1)}%`);
            console.log(`Student's Overall Struggling: Q1 ${q1StrugglingPercent.toFixed(1)}% → Q2 ${q2StrugglingPercent.toFixed(1)}% (percentage of assessments below 70%)`);
            
            if (q2StrugglingPercent > 15) {
                console.log(`→ Student needs additional support`);
            } else if (q2StrugglingPercent > 10) {
                console.log(`→ Monitor student progress closely`);
            } else {
                console.log(`→ Student performing well`);
            }
        }
        
    } catch (error) {
        console.error('Error:', error);
    } finally {
        await prisma.$disconnect();
    }
}

analyzePerformanceWithClassAverages();
