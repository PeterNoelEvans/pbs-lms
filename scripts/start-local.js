const { exec } = require('child_process');
const path = require('path');
const fs = require('fs');

// Ensure required directories exist
const directories = [
    './uploads',
    './logs',
    './data'
];

directories.forEach(dir => {
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
    }
});

// Start the server with local configuration
const server = exec('node server.js', {
    env: {
        ...process.env,
        NODE_ENV: 'development',
        CONFIG_FILE: path.join(__dirname, '../config/local.js')
    }
});

server.stdout.on('data', (data) => {
    console.log(`Server: ${data}`);
});

server.stderr.on('data', (data) => {
    console.error(`Server Error: ${data}`);
});

server.on('close', (code) => {
    console.log(`Server process exited with code ${code}`);
});

// Handle process termination
process.on('SIGINT', () => {
    console.log('Shutting down server...');
    server.kill();
    process.exit();
}); 