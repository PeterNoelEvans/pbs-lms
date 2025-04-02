// Script to create missing P4-2 student folders and files
const fs = require('fs');
const path = require('path');

// List of students from class-4-2.html
const students = [
    { username: 'Peter42', displayName: 'Peter42', path: '/portfolios/P4-2/Peter/Peter.html', avatar: '/portfolios/P4-2/Peter/images/Peter42.jpg' },
    { username: 'Darin', displayName: 'Darin', path: '/portfolios/P4-2/Darin/Darin.html', avatar: '/portfolios/P4-2/Darin/images/Darin.jpg' },
    { username: 'Sky', displayName: 'Sky', path: '/portfolios/P4-2/Sky/index.html', avatar: '/portfolios/P4-2/Sky/images/Sky.jpg' },
    { username: 'Perth', displayName: 'Perth', path: '/portfolios/P4-2/Perth/Perth.html', avatar: '/portfolios/P4-2/Perth/images/Perth.jpg' },
    { username: 'Tin', displayName: 'Tin', path: '/portfolios/P4-2/Tin/Tin.html', avatar: '/portfolios/P4-2/Tin/images/Tin.jpg' },
    { username: 'Tonmali', displayName: 'Tonmali', path: '/portfolios/P4-2/Tonmali/Tonmali.html', avatar: '/portfolios/P4-2/Tonmali/images/Tonmali.jpg' },
    { username: 'Zeno', displayName: 'Zeno', path: '/portfolios/P4-2/Zeno/Zeno.html', avatar: '/portfolios/P4-2/Zeno/images/Zeno.jpg' },
    { username: 'Chapter', displayName: 'Chapter', path: '/portfolios/P4-2/Chapter/Chapter.html', avatar: '/portfolios/P4-2/Chapter/images/Chapter.jpg' },
    { username: 'copter', displayName: 'Copter', path: '/portfolios/P4-2/copter/copter.html', avatar: '/portfolios/P4-2/copter/images/copter.jpg' },
    { username: 'Jdi', displayName: 'Jdi', path: '/portfolios/P4-2/Jdi/Jdi.html', avatar: '/portfolios/P4-2/Jdi/images/Jdi.jpg' },
    { username: 'nicha', displayName: 'Nicha', path: '/portfolios/P4-2/nicha.html', avatar: '/images/default-avatar.png' },
    { username: 'Ounjai', displayName: 'Ounjai', path: '/portfolios/P4-2/Ounjai/Ounjai.html', avatar: '/portfolios/P4-2/Ounjai/images/Ounjai.jpg' },
    { username: 'Paul', displayName: 'Paul', path: '/portfolios/P4-2/Paul/Paul.html', avatar: '/portfolios/P4-2/Paul/images/Paul.jpg' },
    { username: 'Peso', displayName: 'Peso', path: '/portfolios/P4-2/Peso/Peso.html', avatar: '/portfolios/P4-2/Peso/images/Peso.jpg' },
    { username: 'Peter', displayName: 'Peter', path: '/portfolios/P4-2/Peter/Peter.html', avatar: '/portfolios/P4-2/Peter/images/Peter.jpg' },
    { username: 'Pleng', displayName: 'Pleng', path: '/portfolios/P4-2/Pleng/Pleng.html', avatar: '/portfolios/P4-2/Pleng/images/Pleng.jpg' },
    { username: 'PoonPoon', displayName: 'PoonPoon', path: '/portfolios/P4-2/PoonPoon/PoonPoon.html', avatar: '/portfolios/P4-2/PoonPoon/images/PoonPoon.jpg' }
];

// Ensure P4-2 folder exists
const p42Dir = path.join(__dirname, '..', 'portfolios', 'P4-2');
if (!fs.existsSync(p42Dir)) {
    console.log(`Creating P4-2 directory at: ${p42Dir}`);
    fs.mkdirSync(p42Dir, { recursive: true });
}

// Create student folders and index.html files
students.forEach(student => {
    // Extract student folder path from portfolio path
    const pathParts = student.path.split('/');
    const folderName = pathParts[pathParts.length - 2]; // Get the folder name
    const isRootHtmlFile = student.path.split('/').length === 4; // For cases like /portfolios/P4-2/nicha.html
    
    if (!isRootHtmlFile) {
        // Create student folder
        const studentDir = path.join(p42Dir, folderName);
        if (!fs.existsSync(studentDir)) {
            console.log(`Creating directory for ${student.username}: ${studentDir}`);
            fs.mkdirSync(studentDir, { recursive: true });
        } else {
            console.log(`Directory for ${student.username} already exists: ${studentDir}`);
        }
        
        // Create images folder
        const imagesDir = path.join(studentDir, 'images');
        if (!fs.existsSync(imagesDir)) {
            console.log(`Creating images directory for ${student.username}`);
            fs.mkdirSync(imagesDir, { recursive: true });
        }
        
        // Create simple HTML file
        const htmlFilename = student.path.split('/').pop();
        const htmlPath = path.join(studentDir, htmlFilename);
        
        if (!fs.existsSync(htmlPath)) {
            console.log(`Creating HTML file for ${student.username}: ${htmlPath}`);
            const htmlContent = `<!DOCTYPE html>
<html>
<head>
    <title>${student.displayName}'s Portfolio</title>
</head>
<body>
    <h1>Welcome to ${student.displayName}'s Portfolio</h1>
    <p>This is a placeholder for ${student.displayName}'s portfolio.</p>
</body>
</html>`;
            fs.writeFileSync(htmlPath, htmlContent);
        }
    } else {
        // Handle HTML files at the root of P4-2
        const htmlFilename = student.path.split('/').pop();
        const htmlPath = path.join(p42Dir, htmlFilename);
        
        if (!fs.existsSync(htmlPath)) {
            console.log(`Creating HTML file at root for ${student.username}: ${htmlPath}`);
            const htmlContent = `<!DOCTYPE html>
<html>
<head>
    <title>${student.displayName}'s Portfolio</title>
</head>
<body>
    <h1>Welcome to ${student.displayName}'s Portfolio</h1>
    <p>This is a placeholder for ${student.displayName}'s portfolio.</p>
</body>
</html>`;
            fs.writeFileSync(htmlPath, htmlContent);
        }
    }
    
    // Create a placeholder avatar
    if (!isRootHtmlFile) {
        const avatarPath = student.avatar.replace('/portfolios', path.join(__dirname, '..', 'portfolios'));
        const avatarDir = path.dirname(avatarPath);
        
        if (!fs.existsSync(avatarDir)) {
            console.log(`Creating avatar directory: ${avatarDir}`);
            fs.mkdirSync(avatarDir, { recursive: true });
        }
        
        if (!fs.existsSync(avatarPath)) {
            console.log(`Creating placeholder avatar for ${student.username}: ${avatarPath}`);
            // Create an empty file - would be better with a real image but this is enough for testing
            const defaultAvatarPath = path.join(__dirname, '..', 'images', 'default-avatar.png');
            if (fs.existsSync(defaultAvatarPath)) {
                fs.copyFileSync(defaultAvatarPath, avatarPath);
            } else {
                // Just create an empty file
                fs.writeFileSync(avatarPath, '');
            }
        }
    }
});

console.log("All missing P4-2 student folders and files have been created."); 