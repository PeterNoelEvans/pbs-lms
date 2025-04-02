# Portfolio System Codebase Guide

## 1. File Structure
```
/
├── views/                    # Frontend HTML views
│   ├── class-4-1.html       # Class 4/1 portfolio view
│   ├── class-4-2.html       # Class 4/2 portfolio view
│   └── class-styles.css     # Shared styles
├── portfolios/              # Student portfolios
│   ├── P4-1/               # Class 4/1 portfolios
│   │   └── [student]/      # Individual student folders
│   └── P4-2/               # Class 4/2 portfolios
│       └── [student]/      # Individual student folders
└── scripts/                # Backend scripts
    └── initializeDatabase.js
```

## 2. Student Data Structure
```javascript
// Standard student object structure
{
    username: string,          // Student's username
    portfolio_path: string,    // Path to portfolio HTML
    avatar_path: string,       // Path to avatar image
    first_name?: string,       // Optional first name
    last_name?: string,        // Optional last name
    nickname?: string         // Optional nickname
}
```

## 3. Portfolio File Structure
```
/portfolios/[class]/[student]/
├── [student].html           # Main portfolio file
└── images/                  # Student images
    ├── [student].(jpg|png)  # Student avatar
    └── other-images/        # Other portfolio images
```

## 4. API Endpoints
```javascript
// Authentication
'/check-auth'              // GET - Check user authentication status
'/login'                   // POST - User login
'/logout'                  // GET - User logout

// Privacy Management
'/get-all-privacy-states'  // GET - Fetch privacy states for all portfolios

// Portfolio Data
'/api/phumdham-students/:classId'  // GET - Fetch students for specific class
```

## 5. Class View Implementation Checklist

When creating/updating class views (e.g., class-4-1.html, class-4-2.html):

### Required HTML Structure
```html
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>[Class Name] Portfolios</title>
    <link rel="stylesheet" href="class-styles.css">
</head>
```

### Required Components
- [ ] Login prompt container
- [ ] Navigation links
- [ ] Portfolios grid container
- [ ] Portfolio cards

### Student Data Implementation
- [ ] Remove hardcoded privacy settings (`is_public: false`)
- [ ] Use standard student object structure
- [ ] Include all required paths (portfolio, avatar)

### Required Functions
1. `createPortfolioCard()`
   - [ ] Privacy badge
   - [ ] Avatar image with fallback
   - [ ] Username display
   - [ ] View button with privacy control

2. `loadPortfolios()`
   - [ ] Authentication check
   - [ ] Privacy states fetch
   - [ ] Dynamic privacy mapping
   - [ ] Sorting implementation
   - [ ] Error handling

### Required Event Listeners
```javascript
// Initial load
document.addEventListener('DOMContentLoaded', loadPortfolios);

// Auto refresh
setInterval(loadPortfolios, 5000);

// Privacy updates
window.addEventListener('storage', (event) => {
    if (event.key === 'privacy_updated') {
        loadPortfolios();
    }
});
```

### Cache Control Headers
```javascript
{
    cache: 'no-store',
    headers: {
        'Cache-Control': 'no-cache',
        'Pragma': 'no-cache'
    }
}
```

## 6. Best Practices

### 1. Privacy Management
- Always fetch privacy states from server
- Never hardcode privacy settings in HTML
- Use dynamic privacy mapping

### 2. Error Handling
- Implement fallbacks for missing images
- Show user-friendly error messages
- Log errors to console for debugging

### 3. Performance
- Use proper cache control
- Implement efficient sorting
- Handle loading states

### 4. Security
- Validate authentication status
- Protect private portfolios
- Sanitize user inputs

### 5. Maintenance
- Keep student lists updated
- Maintain consistent file structure
- Follow naming conventions

## 7. Common Issues and Solutions

### Missing Privacy States
**Problem**: Hardcoded privacy settings in HTML files
**Solution**: Always fetch privacy states from server using `/get-all-privacy-states`

### Inconsistent File Structure
**Problem**: Different file structures between classes
**Solution**: Follow the standard portfolio structure for all classes

### Cache Issues
**Problem**: Outdated data showing in browser
**Solution**: Use proper cache control headers for all API requests

### Authentication Problems
**Problem**: Private portfolios accessible to public
**Solution**: Implement proper authentication checks and privacy controls

## 8. Development Workflow

1. **Adding New Class**
   - Create new class view HTML file
   - Follow standard template structure
   - Implement all required components
   - Test privacy and authentication

2. **Adding New Student**
   - Create student folder with correct structure
   - Add student data to class view
   - Verify all paths and privacy settings
   - Test portfolio visibility

3. **Updating Existing Class**
   - Review implementation checklist
   - Update to match current standards
   - Test all functionality
   - Verify privacy controls

## 9. Testing Checklist

- [ ] Authentication works correctly
- [ ] Privacy states are fetched from server
- [ ] Images load correctly with fallbacks
- [ ] Auto-refresh works
- [ ] Privacy updates are reflected
- [ ] Error messages are user-friendly
- [ ] Cache control is working
- [ ] All paths are correct
- [ ] Sorting works as expected 