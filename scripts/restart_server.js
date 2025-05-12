const { exec } = require('child_process');
const path = require('path');

console.log('Restarting server...');

// Get the current working directory
const cwd = process.cwd();
console.log('Current working directory:', cwd);

// Kill any running Node.js processes on port 3000 (Windows command)
const killCommand = 'taskkill /F /IM node.exe';

exec(killCommand, (error, stdout, stderr) => {
    if (error) {
        console.log('No Node.js processes running or unable to kill processes.');
    } else {
        console.log('Killed existing Node.js processes:', stdout);
    }

    // Start the server
    const startCommand = 'node server.js';
    const serverProcess = exec(startCommand, { cwd }, (error, stdout, stderr) => {
        if (error) {
            console.error('Error starting server:', error);
            return;
        }
    });

    serverProcess.stdout.on('data', (data) => {
        console.log(data);
    });

    serverProcess.stderr.on('data', (data) => {
        console.error(data);
    });

    console.log('Server restarted! Access at http://localhost:3000');
}); 