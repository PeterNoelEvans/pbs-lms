require('dotenv').config();
const { connectDB, User, Subject, Topic, Subtopic } = require('../config/mongodb');
const bcrypt = require('bcrypt');

async function initializeDatabase() {
    try {
        // Connect to MongoDB
        await connectDB();

        // Clear existing data
        await User.deleteMany({});
        await Subject.deleteMany({});
        await Topic.deleteMany({});
        await Subtopic.deleteMany({});
        console.log('Cleared existing data');

        // Create admin user
        const hashedAdminPassword = await bcrypt.hash('admin123', 10);
        const admin = await User.create({
            username: 'admin',
            password: hashedAdminPassword,
            role: 'admin',
            email: 'admin@school.edu'
        });
        console.log('Admin user created');

        // Create teacher user
        const hashedTeacherPassword = await bcrypt.hash('teacher123', 10);
        const teacher = await User.create({
            username: 'teacher1',
            password: hashedTeacherPassword,
            role: 'teacher',
            email: 'teacher1@school.edu'
        });
        console.log('Teacher user created');

        // Create subjects and their topics
        const subjects = [
            {
                name: 'Mathematics',
                description: 'Secondary 1 Mathematics',
                year: 1,
                topics: [
                    {
                        name: 'Numbers and Operations',
                        description: 'Whole numbers, factors, multiples, and integers',
                        subtopics: [
                            { name: 'Whole Numbers', description: 'Understanding place value and basic operations with whole numbers' },
                            { name: 'Factors and Multiples', description: 'Finding factors, multiples, HCF and LCM' },
                            { name: 'Integers', description: 'Operations and number lines with integers' }
                        ]
                    },
                    {
                        name: 'Fractions, Decimals, and Percentages',
                        description: 'Converting between forms and operations',
                        subtopics: [
                            { name: 'Fractions', description: 'Understanding and operations with fractions' },
                            { name: 'Decimals', description: 'Decimal place value and operations' },
                            { name: 'Percentages', description: 'Understanding and calculating percentages' }
                        ]
                    }
                ]
            },
            {
                name: 'Science',
                description: 'Secondary 1 Science',
                year: 1,
                topics: [
                    {
                        name: 'Introduction to Science',
                        description: 'Scientific method, laboratory safety, and equipment',
                        subtopics: [
                            { name: 'Scientific Method', description: 'Understanding the scientific method' },
                            { name: 'Laboratory Safety', description: 'Safety protocols and equipment use' }
                        ]
                    },
                    {
                        name: 'Living Things and Life Processes',
                        description: 'Characteristics of living organisms, cell structure, and human body systems',
                        subtopics: [
                            { name: 'Characteristics of Living Things', description: 'Understanding what makes something alive' },
                            { name: 'Cell Structure', description: 'Basic cell components and functions' }
                        ]
                    }
                ]
            },
            {
                name: 'English',
                description: 'Secondary 1 English',
                year: 1,
                topics: [
                    {
                        name: 'Reading Comprehension',
                        description: 'Understanding and analyzing various text types',
                        subtopics: [
                            { name: 'Text Analysis', description: 'Understanding different text types' },
                            { name: 'Reading Strategies', description: 'Effective reading techniques' }
                        ]
                    },
                    {
                        name: 'Writing Skills',
                        description: 'Developing writing techniques and styles',
                        subtopics: [
                            { name: 'Paragraph Writing', description: 'Structure and development of paragraphs' },
                            { name: 'Essay Writing', description: 'Basic essay structure and development' }
                        ]
                    }
                ]
            }
        ];

        // Insert subjects and their related data
        for (const subjectData of subjects) {
            const subject = await Subject.create(subjectData);
            console.log(`Created subject: ${subject.name}`);

            for (const topicData of subjectData.topics) {
                const topic = await Topic.create({
                    ...topicData,
                    subject_id: subject._id
                });
                console.log(`Created topic: ${topic.name}`);

                for (const subtopicData of topicData.subtopics) {
                    await Subtopic.create({
                        ...subtopicData,
                        topic_id: topic._id
                    });
                    console.log(`Created subtopic: ${subtopicData.name}`);
                }
            }
        }

        console.log('Database initialization completed successfully');
        process.exit(0);
    } catch (error) {
        console.error('Error during initialization:', error);
        process.exit(1);
    }
}

// Run the initialization
initializeDatabase(); 