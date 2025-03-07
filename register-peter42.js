const fetch = require('node-fetch');

const peter42 = {
    username: 'Peter42',
    password: 'Peter2024BB',
    portfolio_path: '/portfolios/P4-2/Peter/Peter.html'
};

async function registerPeter42() {
    try {
        const response = await fetch('http://localhost:3002/register', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(peter42),
            redirect: 'manual'
        });

        if (response.status === 302 || response.ok) {
            console.log('Successfully registered Peter42');
        } else {
            const error = await response.json();
            console.error('Failed to register Peter42:', error.error);
        }
    } catch (error) {
        console.error('Error:', error.message);
    }
}

registerPeter42(); 