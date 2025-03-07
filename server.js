const express = require('express');
const path = require('path');
const app = express();
const port = process.env.PORT || 3002;  // Use Render's PORT or fallback to 3002

// Serve static files from the current directory
app.use(express.static(__dirname));

// Handle all routes by sending the index.html file
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

app.listen(port, () => {
    console.log(`Server running on port ${port}`);
    console.log(`Local network access: http://<your-computer-ip>:${port}`);
}); 