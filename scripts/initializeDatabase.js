require('dotenv').config();
const CredentialManager = require('../utils/credentialManager');
const StudentManager = require('../utils/studentManager');

// Student data
const students41 = [
    { username: 'Peter41', password: 'Peter2025AA', portfolio_path: '/portfolios/P4-1/Peter/Peter.html' },
    { username: 'Peta', password: 'Peta2025A', portfolio_path: '/portfolios/P4-1/Peta/Peta.html' },
    // ... rest of class 4/1 students
];

const students42 = [
    { username: 'Peter42', password: 'Peter2025BB', portfolio_path: '/portfolios/P4-2/Peter/Peter.html' },
    { username: 'Chapter', password: 'Chapter2025A', portfolio_path: '/portfolios/P4-2/Chapter/Chapter.html' },
    // ... rest of class 4/2 students
];

async function initializeDatabase() {
    try {
        console.log('Initializing database...');

        const credentialManager = new CredentialManager(process.env.CREDENTIAL_KEY);
        const studentManager = new StudentManager(credentialManager);

        // Register Class 4/1 students
        console.log('\nRegistering Class 4/1 students...');
        for (const student of students41) {
            try {
                await studentManager.addStudent(
                    student.username,
                    student.password,
                    student.portfolio_path
                );
                console.log(`Registered ${student.username}`);
            } catch (error) {
                console.error(`Failed to register ${student.username}:`, error.message);
            }
        }

        // Register Class 4/2 students
        console.log('\nRegistering Class 4/2 students...');
        for (const student of students42) {
            try {
                await studentManager.addStudent(
                    student.username,
                    student.password,
                    student.portfolio_path
                );
                console.log(`Registered ${student.username}`);
            } catch (error) {
                console.error(`Failed to register ${student.username}:`, error.message);
            }
        }

        console.log('\nDatabase initialization completed!');
    } catch (error) {
        console.error('Database initialization failed:', error);
        process.exit(1);
    }
}

// Run the initialization
initializeDatabase(); 