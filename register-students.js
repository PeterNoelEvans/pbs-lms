const fetch = require('node-fetch');

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
    { username: 'Namoun', password: 'Namoun2025J', portfolio_path: '/portfolios/P4-1/Namoun/Namoun.html' },
    { username: 'Copter', password: 'Copter2025K', portfolio_path: '/portfolios/P4-1/Copter/Copter.html' },
    { username: 'Phupha', password: 'Phupha2025L', portfolio_path: '/portfolios/P4-1/Phupha/Phupha.html' },
    { username: 'Teen', password: 'Teen2025M', portfolio_path: '/portfolios/P4-1/Teen/Teen.html' },
    { username: 'Kod', password: 'Kod2025N', portfolio_path: '/portfolios/P4-1/Kod/Kod.html' },
    { username: 'Earth', password: 'Earth2025O', portfolio_path: '/portfolios/P4-1/Earth/Earth.html' }
];

const students42 = [
    { username: 'Peter42', password: 'Peter2025BB', portfolio_path: '/portfolios/P4-2/Peter/Peter.html' },
    { username: 'Chapter', password: 'Chapter2025A', portfolio_path: '/portfolios/P4-2/Chapter/Chapter.html' },
    { username: 'Zeno', password: 'Zeno2025B', portfolio_path: '/portfolios/P4-2/Zeno/Zeno.html' },
    { username: 'Jdi', password: 'Jdi2025C', portfolio_path: '/portfolios/P4-2/Jdi/Jdi.html' },
    { username: 'Sky', password: 'Sky2025D', portfolio_path: '/portfolios/P4-2/Sky/Sky.html' },
    { username: 'Perth', password: 'Perth2025E', portfolio_path: '/portfolios/P4-2/Perth/Perth.html' },
    { username: 'Tin', password: 'Tin2025F', portfolio_path: '/portfolios/P4-2/Tin/Tin.html' },
    { username: 'Poonpoon', password: 'Poonpoon2025G', portfolio_path: '/portfolios/P4-2/Poonpoon/Poonpoon.html' },
    { username: 'Paul', password: 'Paul2025H', portfolio_path: '/portfolios/P4-2/Paul/Paul.html' },
    { username: 'Peso', password: 'Peso2025I', portfolio_path: '/portfolios/P4-2/Peso/Peso.html' },
    { username: 'Ounjai', password: 'Ounjai2025J', portfolio_path: '/portfolios/P4-2/Ounjai/Ounjai.html' },
    { username: 'Darin', password: 'Darin2025K', portfolio_path: '/portfolios/P4-2/Darin/Darin.html' },
    { username: 'Harber', password: 'Harber2025L', portfolio_path: '/portfolios/P4-2/Harber/Harber.html' },
    { username: 'Pleng', password: 'Pleng2025M', portfolio_path: '/portfolios/P4-2/Pleng/Pleng.html' },
    { username: 'Tonmali', password: 'Tonmali2025N', portfolio_path: '/portfolios/P4-2/Tonmali/Tonmali.html' }
];

// Function to wait
const wait = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// Function to register a student
async function registerStudent(student) {
    try {
        const response = await fetch('http://localhost:3002/register', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(student),
            redirect: 'manual'
        });

        // Wait a bit after registration
        await wait(500);

        if (response.status === 302 || response.ok) {
            console.log(`Successfully registered ${student.username}`);
            return true;
        } else {
            try {
                const error = await response.json();
                console.error(`Failed to register ${student.username}:`, error.error);
            } catch (e) {
                console.error(`Failed to register ${student.username}: Unknown error`);
            }
            return false;
        }
    } catch (error) {
        console.error(`Error registering ${student.username}:`, error.message);
        return false;
    }
}

// Function to register parent account
async function registerParent(student) {
    // Wait a bit before registering parent
    await wait(500);

    // Create parent portfolio path by adding '-parent' before .html
    const parentPortfolioPath = student.portfolio_path.replace('.html', '-parent.html');

    const parent = {
        username: `parent-${student.username.toLowerCase()}`, // Make username lowercase
        password: student.password,
        portfolio_path: parentPortfolioPath
    };

    try {
        const response = await fetch('http://localhost:3002/register', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(parent),
            redirect: 'manual'
        });

        // Wait a bit after registration
        await wait(500);

        if (response.status === 302 || response.ok) {
            console.log(`Successfully registered parent for ${student.username}`);
            return true;
        } else {
            try {
                const error = await response.json();
                console.error(`Failed to register parent for ${student.username}:`, error.error);
            } catch (e) {
                console.error(`Failed to register parent for ${student.username}: Unknown error`);
            }
            return false;
        }
    } catch (error) {
        console.error(`Error registering parent for ${student.username}:`, error.message);
        return false;
    }
}

// Main function to register all students and their parents
async function registerAll() {
    console.log('Starting registration process...');
    
    // Register Class 4/1 students and their parents
    console.log('\nRegistering Class 4/1 students and parents...');
    for (const student of students41) {
        const studentSuccess = await registerStudent(student);
        if (studentSuccess) {
            await wait(1000); // Wait 1 second before registering parent
            await registerParent(student);
        }
        await wait(1000); // Wait 1 second before next registration
    }
    
    // Register Class 4/2 students and their parents
    console.log('\nRegistering Class 4/2 students and parents...');
    for (const student of students42) {
        const studentSuccess = await registerStudent(student);
        if (studentSuccess) {
            await wait(1000); // Wait 1 second before registering parent
            await registerParent(student);
        }
        await wait(1000); // Wait 1 second before next registration
    }
    
    console.log('\nRegistration process completed!');
}

// Run the registration process
registerAll().catch(console.error); 