const bcrypt = require('bcrypt');

async function generatePasswordHash(password = 'abc123456') {
    const saltRounds = 10;
    
    try {
        const hashedPassword = await bcrypt.hash(password, saltRounds);
        
        console.log('='.repeat(60));
        console.log('PASSWORD HASH GENERATOR');
        console.log('='.repeat(60));
        console.log(`Plain text password: ${password}`);
        console.log(`Salt rounds: ${saltRounds}`);
        console.log('');
        console.log('HASHED PASSWORD (copy this to Prisma Studio):');
        console.log('='.repeat(60));
        console.log(hashedPassword);
        console.log('='.repeat(60));
        console.log('');
        console.log('INSTRUCTIONS:');
        console.log('1. Copy the hashed password above');
        console.log('2. Open Prisma Studio');
        console.log('3. Find the user record you want to update');
        console.log('4. Replace the password field with the hash above');
        console.log('5. Save the record');
        console.log('');
        console.log('The student can now login with:');
        console.log(`Email: (their email)`);
        console.log(`Password: ${password}`);
        console.log('='.repeat(60));
        
    } catch (error) {
        console.error('Error generating password hash:', error);
    }
}

// Get password from command line argument or use default
const password = process.argv[2] || 'abc123456';

// Show usage if help is requested
if (process.argv.includes('--help') || process.argv.includes('-h')) {
    console.log('Password Hash Generator');
    console.log('');
    console.log('Usage:');
    console.log('  node scripts/generate-password-hash.js [password]');
    console.log('');
    console.log('Examples:');
    console.log('  node scripts/generate-password-hash.js                    # Uses default: abc123456');
    console.log('  node scripts/generate-password-hash.js mypassword123      # Uses: mypassword123');
    console.log('  node scripts/generate-password-hash.js "Hello World!"     # Uses: Hello World!');
    console.log('');
    console.log('Note: If your password contains spaces, wrap it in quotes.');
    process.exit(0);
}

// Run the function
generatePasswordHash(password); 