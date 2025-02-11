const express = require('express');
const path = require('path');
const app = express();
const port = 3001;  // You can change this port number

// Serve static files from the current directory
app.use(express.static(__dirname));

// Handle all routes by sending the index.html file
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

app.listen(port, () => {
    console.log(`Server running at http://localhost:${port}`);
    console.log(`Local network access: http://<your-computer-ip>:${port}`);
}); 