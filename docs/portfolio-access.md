# Portfolio Access System Documentation

## Overview
The portfolio access system manages who can view student portfolios based on authentication status and portfolio privacy settings. There are three main types of users:

1. **Non-authenticated Users (Visitors)**
   - Can browse schools and classes
   - Can view public portfolios
   - Cannot view private portfolios
   - Cannot access the dashboard

2. **Authenticated Visitors**
   - Can browse schools and classes
   - Can view public portfolios
   - Cannot view private portfolios
   - Cannot access the dashboard

3. **Authenticated Students/Parents**
   - Can browse schools and classes
   - Can view all public portfolios
   - Can view their own private portfolio
   - Parents can view their child's private portfolio
   - Can access the dashboard

## Access Control Flow

### 1. Portfolio Viewing
- When a user attempts to view a portfolio, the system checks:
  1. If the portfolio is public (`is_public = true`)
     - If yes: Anyone can view it
     - If no: Proceed to authentication check
  2. If the user is authenticated
     - If yes: Check if user owns the portfolio or is a parent of the owner
     - If no: Access denied

### 2. Class Viewing
- When viewing a class page:
  1. All portfolios are listed
  2. Private portfolios are marked as "Private"
  3. Non-authenticated users see:
     - Public portfolios with "View Portfolio" button
     - Private portfolios with "Private Portfolio" button (non-clickable)
  4. Authenticated users see:
     - All portfolios with appropriate access controls

### 3. Navigation
- Non-authenticated users:
  - "Back" button goes to schools page
  - Cannot access dashboard
- Authenticated users:
  - "Back" button goes to dashboard
  - Can access all authenticated features

## Technical Implementation

### Server-side Checks
1. `/check-access/*` endpoint:
   ```javascript
   if (portfolio.is_public) {
       // Allow access to everyone
   } else if (user.isAuthenticated) {
       // Check user ownership or parent relationship
   } else {
       // Deny access
   }
   ```

2. Portfolio Access Middleware:
   - Handles direct file access
   - Enforces the same access rules
   - Allows access to static files (images, CSS, etc.)

### Frontend Implementation
1. Class Viewer:
   - Shows appropriate UI based on authentication status
   - Filters portfolios based on access rights
   - Updates privacy badges in real-time

2. Navigation:
   - Back button behavior changes based on auth status
   - Dashboard access restricted to authenticated users

## Common Scenarios

### Viewing Public Portfolios
1. User visits class page
2. System shows all portfolios
3. Public portfolios are marked with green "Public" badge
4. User can click "View Portfolio" to access public portfolios

### Viewing Private Portfolios
1. User must be authenticated
2. System checks portfolio ownership
3. If user owns portfolio or is parent of owner:
   - Portfolio is accessible
4. If not:
   - Access is denied
   - User is prompted to log in

### Parent Access
1. Parent accounts start with "parent-"
2. System extracts child's name from parent username
3. Parent can view:
   - Their child's portfolio (public or private)
   - All public portfolios
4. Parent cannot view other private portfolios

## Troubleshooting

### Common Issues
1. "Access Denied" for public portfolios
   - Check if `is_public` is set to true in database
   - Verify portfolio path matches database entry

2. Parent cannot view child's portfolio
   - Verify parent username format: "parent-{childname}"
   - Check child's username matches exactly

3. Portfolio not showing in class view
   - Verify portfolio is registered in database
   - Check portfolio path matches class directory structure

### Debugging Steps
1. Check authentication status:
   ```javascript
   fetch('/check-auth').then(response => response.json())
   ```

2. Verify portfolio privacy:
   ```javascript
   fetch('/get-all-privacy-states').then(response => response.json())
   ```

3. Test access directly:
   ```javascript
   fetch('/check-access/portfolio-path').then(response => response.json())
   ``` 