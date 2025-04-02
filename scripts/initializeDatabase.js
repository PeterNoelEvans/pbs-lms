require('dotenv').config();
const CredentialManager = require('../utils/credentialManager');
const StudentManager = require('../utils/studentManager');

// Student data for Class 4/1
const students41 = [
    { username: 'Peter41', password: 'Peter2025AA', portfolio_path: '/portfolios/P4-1/Peter/Peter.html' },
    { username: 'Peta', password: 'Peta2025A', portfolio_path: '/portfolios/P4-1/Peta/Peta.html' },
    { username: 'Uda', password: 'Uda2025B', portfolio_path: '/portfolios/P4-1/Uda/Uda.html' },
    { username: 'Tar', password: 'Tar2025C', portfolio_path: '/portfolios/P4-1/Tar/Tar.html' },
    { username: 'Jaijai', password: 'Jaijai2025D', portfolio_path: '/portfolios/P4-1/Jaijai/Jaijai.html' },
    { username: 'Nava', password: 'Nava2025E', portfolio_path: '/portfolios/P4-1/Nava/Nava.html' },
    { username: 'Bonus', password: 'Bonus2025F', portfolio_path: '/portfolios/P4-1/Bonus/Bonus.html' },
    { username: 'Nicha', password: 'Nicha2025G', portfolio_path: '/portfolios/P4-1/Nicha/Nicha.html' },
    { username: 'Tigger', password: 'Tigger2025H', portfolio_path: '/portfolios/P4-1/Tigger/Tigger.html' },
    { username: 'Uno', password: 'Uno2025I', portfolio_path: '/portfolios/P4-1/Uno/Uno.html' },
    { username: 'Namoun', password: 'Namoun2025J', portfolio_path: '/portfolios/P4-1/Nahmoun/Namoun.html' },
    { username: 'Copter', password: 'Copter2025K', portfolio_path: '/portfolios/P4-1/Copter/Copter.html' },
    { username: 'Phupha', password: 'Phupha2025L', portfolio_path: '/portfolios/P4-1/Phupha/Phupha.html' },
    { username: 'Teen', password: 'Teen2025M', portfolio_path: '/portfolios/P4-1/Teen/Teen.html' },
    { username: 'Kod', password: 'Kod2025N', portfolio_path: '/portfolios/P4-1/Kod/Kod.html' },
    { username: 'Earth', password: 'Earth2025O', portfolio_path: '/portfolios/P4-1/Earth/Earth.html' }
];

// Student data for Class 4/2
const students42 = [
    { username: 'Peter42', password: 'Peter2025BB', portfolio_path: '/portfolios/P4-2/Peter/Peter.html' },
    { username: 'Chapter', password: 'Chapter2025A', portfolio_path: '/portfolios/P4-2/Chapter/Chapter.html' },
    { username: 'Zeno', password: 'Zeno2025B', portfolio_path: '/portfolios/P4-2/Zeno/Zeno.html' },
    { username: 'Jdi', password: 'Jdi2025C', portfolio_path: '/portfolios/P4-2/Jdi/Jdi.html' },
    { username: 'Sky', password: 'Sky2025D', portfolio_path: '/portfolios/P4-2/Sky/Sky.html' },
    { username: 'Perth', password: 'Perth2025E', portfolio_path: '/portfolios/P4-2/Perth/Perth.html' },
    { username: 'Tin', password: 'Tin2025F', portfolio_path: '/portfolios/P4-2/Tin/Tin.html' },
    { username: 'PoonPoon', password: 'Poonpoon2025G', portfolio_path: '/portfolios/P4-2/PoonPoon/PoonPoon.html' },
    { username: 'Paul', password: 'Paul2025H', portfolio_path: '/portfolios/P4-2/Paul/Paul.html' },
    { username: 'Peso', password: 'Peso2025I', portfolio_path: '/portfolios/P4-2/Peso/Peso.html' },
    { username: 'Ounjai', password: 'Ounjai2025J', portfolio_path: '/portfolios/P4-2/Ounjai/Ounjai.html' },
    { username: 'Darin', password: 'Darin2025K', portfolio_path: '/portfolios/P4-2/Darin/Darin.html' },
    { username: 'Harber', password: 'Harber2025L', portfolio_path: '/portfolios/P4-2/Harber/Harber.html' },
    { username: 'Pleng', password: 'Pleng2025M', portfolio_path: '/portfolios/P4-2/Pleng/Pleng.html' },
    { username: 'Tonmali', password: 'Tonmali2025N', portfolio_path: '/portfolios/P4-2/Tonmali/Tonmali.html' }
];

// Student data for ClassM2-001
const studentsM2 = [
    { username: 'Peter', password: 'Peter2025CC', portfolio_path: '/portfolios/ClassM2-001/Peter/Peter.html' }
];

// Function to initialize the database
async function initializeDatabase() {
    try {
        console.log('Initializing database...');
        
        // Use a default key for initialization if CREDENTIAL_KEY is not available
        // This is only for initialization during build - the real key will be used in production
        const credentialKey = process.env.CREDENTIAL_KEY || 
            '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
        
        console.log('Creating credential manager...');
        const credentialManager = new CredentialManager(credentialKey);
        
        console.log('Creating student manager...');
        const studentManager = new StudentManager(credentialManager);
        
        // Initialize database schema
        await studentManager.initializeDatabase();
        
        console.log('Registering Class 4/1 students...');
        for (const student of students41) {
            try {
                await studentManager.addStudent(student.username, student.password, student.portfolio_path);
                console.log(`Registered: ${student.username}`);
            } catch (error) {
                // If the error is about duplicate username, it's ok - student already exists
                if (error.message.includes('UNIQUE constraint failed')) {
                    console.log(`Student ${student.username} already exists, skipping`);
                } else {
                    console.error(`Error registering ${student.username}:`, error.message);
                }
            }
        }
        
        console.log('Registering Class 4/2 students...');
        for (const student of students42) {
            try {
                await studentManager.addStudent(student.username, student.password, student.portfolio_path);
                console.log(`Registered: ${student.username}`);
            } catch (error) {
                // If the error is about duplicate username, it's ok - student already exists
                if (error.message.includes('UNIQUE constraint failed')) {
                    console.log(`Student ${student.username} already exists, skipping`);
                } else {
                    console.error(`Error registering ${student.username}:`, error.message);
                }
            }
        }
        
        console.log('Registering Class M2-001 students...');
        for (const student of studentsM2) {
            try {
                await studentManager.addStudent(student.username, student.password, student.portfolio_path);
                console.log(`Registered: ${student.username}`);
            } catch (error) {
                // If the error is about duplicate username, it's ok - student already exists
                if (error.message.includes('UNIQUE constraint failed')) {
                    console.log(`Student ${student.username} already exists, skipping`);
                } else {
                    console.error(`Error registering ${student.username}:`, error.message);
                }
            }
        }
        
        console.log('Database initialization completed successfully!');
    } catch (error) {
        console.error('Database initialization failed:', error);
        // Don't exit with error code during build process
        if (process.env.NODE_ENV !== 'production') {
            process.exit(1);
        }
    }
}

// Execute the initialization function
initializeDatabase(); 