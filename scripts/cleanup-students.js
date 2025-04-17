const mongoose = require('mongoose');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

// Import models
const { Student, StudentResults, ProgressTracking, User } = require('../config/mongodb');

async function cleanupStudents() {
    try {
        // Connect to MongoDB
        await mongoose.connect('mongodb://localhost:27017/m3project-book', {
            useNewUrlParser: true,
            useUnifiedTopology: true
        });
        console.log('Connected to MongoDB (m3project-book database)');

        // Count students before deletion
        const initialCount = await Student.countDocuments();
        console.log(`Found ${initialCount} students in MongoDB`);

        // Delete all student results
        const resultsDeleted = await StudentResults.deleteMany({});
        console.log(`Deleted ${resultsDeleted.deletedCount} student results`);

        // Delete all progress tracking records
        const progressDeleted = await ProgressTracking.deleteMany({});
        console.log(`Deleted ${progressDeleted.deletedCount} progress tracking records`);

        // Delete all students
        const studentsDeleted = await Student.deleteMany({});
        console.log(`Deleted ${studentsDeleted.deletedCount} students`);

        // Delete all users (both teachers and students)
        const usersDeleted = await User.deleteMany({});
        console.log(`Deleted ${usersDeleted.deletedCount} users`);

        // Verify MongoDB cleanup
        const remainingCount = await Student.countDocuments();
        console.log(`Remaining students in MongoDB: ${remainingCount}`);

        // Clean up portfolio directories
        const portfolioDirs = ['M2-001', 'P4-1', 'P4-2'];
        const basePortfolioPath = path.join(__dirname, '..', 'Portfolios');
        
        for (const dir of portfolioDirs) {
            const fullPath = path.join(basePortfolioPath, dir);
            if (fs.existsSync(fullPath)) {
                fs.rmSync(fullPath, { recursive: true, force: true });
                console.log(`Deleted portfolio directory: ${dir}`);
            } else {
                console.log(`Portfolio directory not found: ${dir}`);
            }
        }

        // Clean up student creation scripts
        const scriptsToRemove = [
            'check-students.js',
            'fix-class4-2.js',
            'fix-p4-1-display.js',
            'make-class4-1-public.js',
            'make-class4-2-public.js',
            'set-all-private.js',
            'set-portfolio-public.js',
            'check-all-users.js',
            'check-privacy.js',
            'check-user.js',
            'class-script.js',
            'clean-peter-accounts.js',
            'fix-peter41.js',
            'fix-peter42.js',
            'make-portfolios-public.js'
        ];

        // Clean up HTML and other files
        const filesToRemove = [
            'class-4-1.html',
            'class-4-2.html',
            'class1.html',
            'public-login.html',
            'public-register.html',
            'fix-peter41.js',
            'fix-peter42.js',
            'toggle-peta.js',
            'reset-peter42.js',
            'register-peter42.js',
            'registration-guide.html',
            'dashboard-new.html',
            'check-privacy.js',
            'check-user.js',
            'check-all-users.js',
            'make-portfolios-public.js',
            'reset-db.js'
        ];

        // Remove scripts
        for (const script of scriptsToRemove) {
            const scriptPath = path.join(__dirname, script);
            if (fs.existsSync(scriptPath)) {
                fs.unlinkSync(scriptPath);
                console.log(`Deleted script: ${script}`);
            } else {
                console.log(`Script not found: ${script}`);
            }
        }

        // Remove HTML and other files
        for (const file of filesToRemove) {
            const filePath = path.join(__dirname, '..', file);
            if (fs.existsSync(filePath)) {
                fs.unlinkSync(filePath);
                console.log(`Deleted file: ${file}`);
            } else {
                console.log(`File not found: ${file}`);
            }
        }

        // Clean up CSS files
        const cssPath = path.join(__dirname, '..', 'class-styles.css');
        if (fs.existsSync(cssPath)) {
            fs.unlinkSync(cssPath);
            console.log('Deleted class-styles.css');
        } else {
            console.log('CSS file not found: class-styles.css');
        }

        if (remainingCount === 0) {
            console.log('✅ All students have been successfully removed');
        } else {
            console.log('❌ Some students remain in the system');
        }

        console.log('Cleanup completed');
    } catch (error) {
        console.error('Error during cleanup:', error);
    } finally {
        // Close the connection
        await mongoose.connection.close();
        console.log('MongoDB connection closed');
    }
}

// Run the cleanup
cleanupStudents(); 