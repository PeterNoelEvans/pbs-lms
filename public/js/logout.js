// Utility function for proper logout
async function logout() {
    const token = localStorage.getItem('token');
    
    if (token) {
        try {
            // Call server-side logout endpoint to end the session
            await fetch('/api/logout', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                }
            });
        } catch (error) {
            console.error('Logout error:', error);
            // Continue with logout even if server call fails
        }
    }
    
    // Clear local storage and redirect
    localStorage.clear();
    window.location.href = '/login-pbs.html';
}

// Attempt to end session if user closes tab, browser, or navigates away
// This is a best-effort solution; browser may not always complete the request
window.addEventListener('unload', function() {
    const token = localStorage.getItem('token');
    if (token) {
        try {
            navigator.sendBeacon('/api/logout');
        } catch (e) {
            // Fallback to fetch with keepalive
            fetch('/api/logout', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                },
                keepalive: true
            });
        }
    }
});

// Auto-logout when token expires (check every 5 minutes)
setInterval(() => {
    const token = localStorage.getItem('token');
    if (token) {
        try {
            // Decode JWT to check expiration
            const payload = JSON.parse(atob(token.split('.')[1]));
            const expirationTime = payload.exp * 1000; // Convert to milliseconds
            const currentTime = Date.now();
            
            if (currentTime >= expirationTime) {
                console.log('Token expired, logging out...');
                logout();
            }
        } catch (error) {
            console.error('Error checking token expiration:', error);
        }
    }
}, 5 * 60 * 1000); // Check every 5 minutes 