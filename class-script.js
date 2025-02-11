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