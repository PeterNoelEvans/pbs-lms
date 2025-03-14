function addRating(studentId, rating) {
    // Get existing ratings from localStorage
    let ratings = JSON.parse(localStorage.getItem('portfolioRatings')) || {};
    
    // Update the rating for this student
    if (!ratings[studentId]) {
        ratings[studentId] = {
            ratings: []
        };
    }
    
    ratings[studentId].ratings.push({
        rating: rating,
        timestamp: new Date().toISOString()
    });
    
    // Save back to localStorage
    localStorage.setItem('portfolioRatings', JSON.stringify(ratings));
    
    // Show feedback
    alert('Thank you for rating this portfolio!');
}

// Add rating buttons to each student card
document.querySelectorAll('.student-card').forEach(card => {
    const ratingContainer = document.createElement('div');
    ratingContainer.className = 'rating-container';
    
    const ratings = ['so-so', 'good', 'great', 'fantastic'];
    ratings.forEach(rating => {
        const button = document.createElement('button');
        button.className = `rating-button ${rating}`;
        button.textContent = rating.charAt(0).toUpperCase() + rating.slice(1);
        button.onclick = () => addRating(card.dataset.studentId, rating);
        ratingContainer.appendChild(button);
    });
    
    card.appendChild(ratingContainer);
});

// Function to create a portfolio card
function createPortfolioCard(username, imagePath, isPublic, portfolioPath) {
    const card = document.createElement('div');
    card.className = 'portfolio-card';
    
    const img = document.createElement('img');
    img.src = imagePath || '/images/default-avatar.png';
    img.alt = `${username}'s avatar`;
    img.className = 'avatar';
    
    const name = document.createElement('h3');
    name.textContent = username;
    
    const privacyBadge = document.createElement('span');
    privacyBadge.className = `privacy-badge ${isPublic ? 'public' : 'private'}`;
    privacyBadge.textContent = isPublic ? 'Public' : 'Private';
    
    const viewBtn = document.createElement('a');
    viewBtn.className = 'view-portfolio button';
    viewBtn.textContent = 'View Portfolio';
    viewBtn.href = portfolioPath;
    
    if (!isPublic) {
        viewBtn.addEventListener('click', (e) => {
            e.preventDefault();
            checkAccess(portfolioPath);
        });
    }
    
    card.appendChild(privacyBadge);
    card.appendChild(img);
    card.appendChild(name);
    card.appendChild(viewBtn);
    
    return card;
}

// Function to check portfolio access
async function checkAccess(portfolioPath) {
    try {
        const response = await fetch(`/check-access${portfolioPath}`);
        const data = await response.json();
        
        if (data.hasAccess) {
            window.location.href = portfolioPath;
        } else {
            const loginPrompt = document.getElementById('loginPrompt');
            loginPrompt.style.display = 'block';
            setTimeout(() => {
                loginPrompt.style.display = 'none';
            }, 3000);
        }
    } catch (error) {
        console.error('Error checking access:', error);
    }
}

// Function to load portfolios for a specific class
async function initializePortfolios(classId) {
    try {
        const response = await fetch('/check-auth');
        const authData = await response.json();
        
        // Show login prompt if not authenticated
        const loginPrompt = document.getElementById('loginPrompt');
        if (!authData.authenticated) {
            loginPrompt.style.display = 'block';
        }
        
        // Load portfolios
        const usersResponse = await fetch('/admin/users');
        const users = await usersResponse.json();
        const container = document.getElementById('portfoliosContainer');
        
        users.forEach(user => {
            // Match users based on their class
            if (user.portfolio_path.includes(`/${classId}/`)) {
                const card = createPortfolioCard(
                    user.username,
                    user.avatar_path || '/images/default-avatar.png',
                    user.is_public,
                    user.portfolio_path
                );
                container.appendChild(card);
            }
        });
    } catch (error) {
        console.error('Error initializing portfolios:', error);
    }
}

async function loadPortfolios() {
    try {
        // Get all users
        const usersResponse = await fetch('/admin/users');
        if (!usersResponse.ok) {
            throw new Error('Failed to fetch users');
        }
        const users = await usersResponse.json();

        // Sort users: public portfolios first, then alphabetically by username
        users.sort((a, b) => {
            if (a.is_public !== b.is_public) {
                return b.is_public - a.is_public;
            }
            return a.username.localeCompare(b.username);
        });

        const container = document.getElementById('portfoliosContainer');
        container.innerHTML = ''; // Clear existing content

        // Create and append portfolio cards
        for (const user of users) {
            // Check access for each portfolio
            const accessResponse = await fetch(`/check-portfolio-access?path=${encodeURIComponent(user.portfolio_path)}`);
            const accessData = await accessResponse.json();

            if (accessData.hasAccess) {
                createPortfolioCard(
                    user.username,
                    user.avatar_path,
                    user.is_public,
                    user.portfolio_path
                );
            }
        }
    } catch (error) {
        console.error('Error:', error);
        document.getElementById('portfoliosContainer').innerHTML = 
            '<p class="error">Error loading portfolios. Please try again later.</p>';
    }
} 