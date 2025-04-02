require('dotenv').config();
const { getClass } = require('../config/schools');
const CredentialManager = require('../utils/credentialManager');
const StudentManager = require('../utils/studentManager');
const fs = require('fs');
const path = require('path');

// Configuration
const SCHOOL_ID = process.argv[2] || 'school1';
const CLASS_ID = process.argv[3] || 'Class001';

// Function to ensure portfolio directories exist
function ensureDirectoriesExist(classObj) {
  if (!classObj) {
    console.error(`Class not found: ${CLASS_ID}`);
    process.exit(1);
  }

  const portfolioBasePath = path.join(__dirname, '..', classObj.portfolioPath.substring(1));
  
  if (!fs.existsSync(portfolioBasePath)) {
    console.log(`Creating main directory: ${portfolioBasePath}`);
    fs.mkdirSync(portfolioBasePath, { recursive: true });
  }
}

// Function to get students for a class from JSON file
function getStudentsForClass(schoolId, classId) {
  // First try to read from the JSON file
  const studentsFilePath = path.join(__dirname, '..', 'data', 'students', `${classId}.json`);
  
  try {
    if (fs.existsSync(studentsFilePath)) {
      console.log(`Reading students from: ${studentsFilePath}`);
      const studentsData = JSON.parse(fs.readFileSync(studentsFilePath, 'utf8'));
      
      // Process and validate the data
      if (!studentsData.students || !Array.isArray(studentsData.students)) {
        throw new Error('Invalid students data format - missing students array');
      }
      
      // Ensure class data matches
      const classObj = getClass(schoolId, classId);
      
      // Transform to the format needed for database
      const students = studentsData.students.map(student => {
        // Generate portfolio path
        const portfolioPath = `${classObj.portfolioPath}/${student.username}/${student.username}.html`;
        
        // Return student in the format needed for the database
        return {
          username: student.username,
          password: student.password,
          portfolio_path: portfolioPath,
          firstName: student.firstName || '',
          lastName: student.lastName || '',
          nickname: student.nickname || '',
          // Process avatar path if provided
          avatar_path: student.avatarFileName 
            ? `${classObj.portfolioPath}/${student.username}/images/${student.avatarFileName}`
            : `${classObj.portfolioPath}/${student.username}/images/${student.username}.jpg`
        };
      });
      
      // Create student directories
      students.forEach(student => {
        const studentDir = path.join(
          __dirname, 
          '..', 
          student.portfolio_path.substring(0, student.portfolio_path.lastIndexOf('/'))
        );
        
        if (!fs.existsSync(studentDir)) {
          console.log(`Creating student directory: ${studentDir}`);
          fs.mkdirSync(studentDir, { recursive: true });
          
          // Create images subdirectory
          const imagesDir = path.join(studentDir, 'images');
          if (!fs.existsSync(imagesDir)) {
            fs.mkdirSync(imagesDir);
          }
          
          // Create a basic portfolio HTML file from template
          createPortfolioFromTemplate(student, studentDir);
        }
      });
      
      return students;
    } else {
      console.log(`No student data file found at: ${studentsFilePath}`);
      console.log('Using default student data');
      
      // If no file exists, return some sample data
      const classObj = getClass(schoolId, classId);
      return [
        { 
          username: `Student1_${classId}`, 
          password: `Student1Pass_${classId}`, 
          portfolio_path: `${classObj.portfolioPath}/Student1/Student1.html`,
          firstName: 'Student',
          lastName: 'One',
          nickname: 'S1'
        },
        { 
          username: `Student2_${classId}`, 
          password: `Student2Pass_${classId}`, 
          portfolio_path: `${classObj.portfolioPath}/Student2/Student2.html`,
          firstName: 'Student',
          lastName: 'Two',
          nickname: 'S2'
        }
      ];
    }
  } catch (error) {
    console.error(`Error reading student data: ${error.message}`);
    console.log('Using default student data');
    
    // If error, return some sample data
    const classObj = getClass(schoolId, classId);
    return [
      { 
        username: `Student1_${classId}`, 
        password: `Student1Pass_${classId}`, 
        portfolio_path: `${classObj.portfolioPath}/Student1/Student1.html`,
        firstName: 'Student',
        lastName: 'One',
        nickname: 'S1'
      },
      { 
        username: `Student2_${classId}`, 
        password: `Student2Pass_${classId}`, 
        portfolio_path: `${classObj.portfolioPath}/Student2/Student2.html`,
        firstName: 'Student',
        lastName: 'Two',
        nickname: 'S2'
      }
    ];
  }
}

// Function to create a portfolio HTML file from template
function createPortfolioFromTemplate(student, studentDir) {
  try {
    // Read the template file
    const templatePath = path.join(__dirname, '..', 'templates', 'student-template.html');
    let templateContent = fs.readFileSync(templatePath, 'utf8');
    
    // Replace placeholders with student info
    templateContent = templateContent
      .replace(/Student Name/g, `${student.firstName} ${student.lastName} (${student.nickname})`)
      .replace(/School Name - Class ID/g, `${SCHOOL_ID} - ${CLASS_ID}`)
      .replace(/images\/student.jpg/g, `images/${student.avatar_path ? student.avatar_path.split('/').pop() : student.username + '.jpg'}`);
    
    // Write the customized template to the student's directory
    const portfolioFile = path.join(studentDir, `${student.username}.html`);
    fs.writeFileSync(portfolioFile, templateContent);
    
    console.log(`Created portfolio file: ${portfolioFile}`);
  } catch (error) {
    console.error(`Error creating portfolio template: ${error.message}`);
  }
}

// Function to initialize the database with students
async function setupClassStudents() {
  try {
    console.log(`Setting up students for ${CLASS_ID} in ${SCHOOL_ID}...`);
    
    const classObj = getClass(SCHOOL_ID, CLASS_ID);
    ensureDirectoriesExist(classObj);
    
    const credentialManager = new CredentialManager(process.env.CREDENTIAL_KEY);
    const studentManager = new StudentManager(credentialManager);
    
    // Initialize database schema
    await studentManager.initializeDatabase();
    
    const students = getStudentsForClass(SCHOOL_ID, CLASS_ID);
    console.log(`Registering ${students.length} students for ${CLASS_ID}...`);
    
    for (const student of students) {
      try {
        await studentManager.addStudent(
          student.username, 
          student.password, 
          student.portfolio_path,
          student.firstName,
          student.lastName,
          student.nickname,
          student.avatar_path
        );
        console.log(`Registered: ${student.username} (${student.nickname})`);
      } catch (error) {
        // If the error is about duplicate username, it's ok - student already exists
        if (error.message.includes('UNIQUE constraint failed')) {
          console.log(`Student ${student.username} already exists, updating...`);
          // Could add update logic here if needed
        } else {
          console.error(`Error registering ${student.username}:`, error.message);
        }
      }
    }
    
    console.log(`Class ${CLASS_ID} setup completed successfully!`);
  } catch (error) {
    console.error('Class setup failed:', error);
    process.exit(1);
  }
}

// Ensure data directory exists
const dataDir = path.join(__dirname, '..', 'data', 'students');
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

// Execute the setup function
setupClassStudents(); 