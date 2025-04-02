const fs = require('fs');
const path = require('path');
const readline = require('readline');

// Function to parse CSV content
function parseCSV(csvContent) {
  const lines = csvContent.split('\n');
  const headers = lines[0].split(',').map(header => header.trim());
  
  const students = [];
  for (let i = 1; i < lines.length; i++) {
    if (!lines[i].trim()) continue; // Skip empty lines
    
    const values = lines[i].split(',').map(value => value.trim());
    const student = {};
    
    headers.forEach((header, index) => {
      student[header] = values[index] || '';
    });
    
    students.push(student);
  }
  
  return students;
}

// Function to convert CSV to JSON
async function convertCSVToJSON() {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });
  
  try {
    // Default to the specified file in examples directory
    const defaultCsvPath = path.join(__dirname, '..', 'examples', 'Student_Names.csv');
    
    // Check if the default file exists
    const defaultExists = fs.existsSync(defaultCsvPath);
    
    // Get CSV file path, suggesting the default if it exists
    const promptText = defaultExists 
      ? `Enter path to CSV file (press Enter for default: ${defaultCsvPath}): `
      : 'Enter path to CSV file: ';
    
    let csvPath = await askQuestion(rl, promptText);
    if (!csvPath && defaultExists) csvPath = defaultCsvPath;
    
    if (!fs.existsSync(csvPath)) {
      throw new Error(`File not found: ${csvPath}`);
    }
    
    // Read CSV file
    const csvContent = fs.readFileSync(csvPath, 'utf8');
    const studentsFromCsv = parseCSV(csvContent);
    
    console.log(`Found ${studentsFromCsv.length} students in CSV file`);
    
    // Get school and class info
    const schoolId = await askQuestion(rl, 'Enter school ID: ');
    const classId = await askQuestion(rl, 'Enter class ID: ');
    const className = await askQuestion(rl, 'Enter class name: ');
    const displayName = await askQuestion(rl, 'Enter class display name: ');
    
    // Create JSON structure
    const jsonData = {
      class: {
        id: classId,
        name: className,
        displayName: displayName,
        school: schoolId
      },
      students: studentsFromCsv.map(student => {
        // Extract values from CSV, supporting both custom format and standard format
        const firstName = student['First Name'] || student.firstName || '';
        const lastName = student['Last Name'] || student.lastName || '';
        const title = student['Title'] || student.title || '';
        const studentNumber = student['Student Number'] || student.studentNumber || '';
        
        // Generate username based on first name, last name and student number if available
        let username = '';
        if (firstName && lastName) {
          username = studentNumber 
            ? `${firstName.toLowerCase()}_${lastName.toLowerCase()}_${studentNumber}` 
            : `${firstName.toLowerCase()}_${lastName.toLowerCase()}`;
        }
        
        // Generate nickname as first 3 letters of first name if not provided
        const nickname = student.nickname || (firstName ? firstName.substring(0, 3) : '');
        
        return {
          username: student.username || username,
          password: student.password || generatePassword(firstName, lastName),
          firstName: firstName,
          lastName: lastName,
          title: title,
          studentNumber: studentNumber,
          nickname: nickname,
          avatarFileName: student.avatarFileName || `${username}.jpg`
        };
      })
    };
    
    // Create output directory if it doesn't exist
    const outputDir = path.join(__dirname, '..', 'data', 'students');
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }
    
    // Write JSON file
    const outputPath = path.join(outputDir, `${classId}.json`);
    fs.writeFileSync(outputPath, JSON.stringify(jsonData, null, 2), 'utf8');
    
    console.log(`\nSuccessfully converted CSV to JSON`);
    console.log(`Output file: ${outputPath}`);
    console.log(`\nNext step: Run "npm run setup-class ${schoolId} ${classId}" to set up students`);
    
    // Print summary of the first few students for verification
    console.log('\nSample of processed student data:');
    jsonData.students.slice(0, 3).forEach((student, index) => {
      console.log(`Student ${index + 1}: ${student.firstName} ${student.lastName} (${student.nickname})`);
      console.log(`  Username: ${student.username}`);
      console.log(`  Password: ${student.password}`);
      console.log('  ---');
    });
    
  } catch (error) {
    console.error('Error:', error.message);
  } finally {
    rl.close();
  }
}

// Helper function to ask a question
function askQuestion(rl, question) {
  return new Promise(resolve => {
    rl.question(question, answer => {
      resolve(answer);
    });
  });
}

// Helper function to generate a username
function generateUsername(firstName, lastName, studentNumber) {
  if (!firstName || !lastName) return '';
  if (studentNumber) {
    return `${firstName.toLowerCase()}_${lastName.toLowerCase()}_${studentNumber}`;
  }
  return `${firstName.toLowerCase()}_${lastName.toLowerCase()}`;
}

// Helper function to generate a password
function generatePassword(firstName, lastName) {
  if (!firstName || !lastName) return `Student${new Date().getFullYear()}`;
  const year = new Date().getFullYear();
  return `${firstName}${year}${lastName.substring(0, 2).toUpperCase()}`;
}

// Run the conversion
convertCSVToJSON(); 