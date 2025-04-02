require('dotenv').config();
const fs = require('fs');
const path = require('path');
const readline = require('readline');

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

/**
 * Ask a question and return the answer
 * @param {string} question - Question to ask
 * @returns {Promise<string>} User's answer
 */
function askQuestion(question) {
    return new Promise(resolve => {
        rl.question(question, answer => {
            resolve(answer);
        });
    });
}

/**
 * Set up a new school with classes
 */
async function setupNewSchool() {
    try {
        console.log('\n===== Setting up a new school =====\n');
        
        // Ask for school details
        const schoolId = await askQuestion('Enter school ID (e.g., school2): ');
        const schoolName = await askQuestion('Enter school name: ');
        
        // Ask for number of classes
        const numClasses = parseInt(await askQuestion('Enter number of classes to create: '), 10);
        if (isNaN(numClasses) || numClasses <= 0) {
            throw new Error('Invalid number of classes');
        }
        
        // Ask for class details
        const classes = [];
        for (let i = 1; i <= numClasses; i++) {
            console.log(`\n--- Class ${i} ---`);
            
            const classId = await askQuestion(`Enter class ID (e.g., Class${String(i).padStart(3, '0')}): `);
            const className = await askQuestion('Enter class name: ');
            const displayName = await askQuestion('Enter display name (shown in UI): ');
            const description = await askQuestion('Enter description: ');
            
            classes.push({
                id: classId,
                name: className,
                displayName: displayName,
                description: description,
                portfolioPath: `/portfolios/${classId}`
            });
            
            // Create directories for this class
            const portfolioBasePath = path.join(__dirname, '..', 'portfolios', classId);
            if (!fs.existsSync(portfolioBasePath)) {
                console.log(`Creating directory: ${portfolioBasePath}`);
                fs.mkdirSync(portfolioBasePath, { recursive: true });
            }
        }
        
        // Update schools.js config
        const schoolsConfigPath = path.join(__dirname, '..', 'config', 'schools.js');
        let configContent = fs.readFileSync(schoolsConfigPath, 'utf8');
        
        // Extract existing schools array
        const schoolsMatch = configContent.match(/const schools = \[([\s\S]*?)(\s*\/\/ Add more schools as needed\s*)\]/);
        if (!schoolsMatch) {
            throw new Error('Could not find schools array in config file');
        }
        
        // Create new school object
        const newSchool = `
  {
    id: '${schoolId}',
    name: '${schoolName}',
    classes: [
${classes.map(cls => `      {
        id: '${cls.id}',
        name: '${cls.name}',
        displayName: '${cls.displayName}',
        description: '${cls.description}',
        portfolioPath: '${cls.portfolioPath}'
      }`).join(',\n')}
    ]
  },`;
        
        // Update the config file with the new school
        const updatedConfig = configContent.replace(
            `const schools = [${schoolsMatch[1]}${schoolsMatch[2]}]`,
            `const schools = [${schoolsMatch[1]}${newSchool}${schoolsMatch[2]}]`
        );
        
        fs.writeFileSync(schoolsConfigPath, updatedConfig, 'utf8');
        
        console.log('\n===== School setup completed =====');
        console.log(`School "${schoolName}" with ${numClasses} classes has been added to the configuration.`);
        console.log('\nNext steps:');
        console.log('1. Update student information in scripts/setupClassStudents.js');
        console.log('2. Run the following command to set up students for each class:');
        
        for (const cls of classes) {
            console.log(`   npm run setup-class ${schoolId} ${cls.id}`);
        }
        
    } catch (error) {
        console.error('Error setting up school:', error);
    } finally {
        rl.close();
    }
}

// Run the setup function
setupNewSchool(); 