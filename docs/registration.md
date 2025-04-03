# Registration System Documentation

## Overview
The registration system supports multiple schools and classes through a configuration-based approach. Each school can have multiple classes, and each class has its own portfolio directory structure.

## School and Class Configuration
Schools and their classes are defined in `config/schools.js`. Each school has:
- A unique ID (e.g., 'PBSChonburi', 'PhumdhamPrimary')
- A display name
- A list of classes

Example configuration:
```javascript
{
    id: 'PBSChonburi',
    name: 'Prabhassorn Vidhaya School Chonburi',
    classes: [
        {
            id: 'M2-001',
            name: 'M2 2025',
            displayName: 'M2 2025',
            description: 'M2 2025 Coding Class',
            portfolioPath: '/portfolios/M2-001'
        }
    ]
},
{
    id: 'PhumdhamPrimary',
    name: 'Phumdham Primary Learning Center',
    classes: [
        {
            id: 'P4-1',
            name: 'Class 4/1',
            displayName: 'Class 4/1',
            description: 'Grade 4/1 Coding Class',
            portfolioPath: '/portfolios/P4-1'
        },
        {
            id: 'P4-2',
            name: 'Class 4/2',
            displayName: 'Class 4/2',
            description: 'Grade 4/2 Coding Class',
            portfolioPath: '/portfolios/P4-2'
        }
    ]
}
```

## Directory Structure
The system uses a consistent directory structure for portfolios:
```
/portfolios/
├── M2-001/              # M2 2025 class portfolios
│   └── {username}/      # Individual student folders
│       ├── images/      # Student images
│       └── {username}.html  # Portfolio page
├── P4-1/               # Class 4/1 portfolios
│   └── {username}/
│       ├── images/
│       └── {username}.html
└── P4-2/               # Class 4/2 portfolios
    └── {username}/
        ├── images/
        └── {username}.html
```

## Registration Process
1. Student selects their school from the dropdown
2. Student selects their class
3. Student enters:
   - Username (e.g., "Peter")
   - Password (e.g., graduation year "2025")
4. System automatically:
   - Creates the student's portfolio directory
   - Generates the portfolio path based on class
   - Sets up initial portfolio page

## Portfolio Paths
Portfolio paths follow this format:
- M2 students: `/portfolios/M2-001/{username}/{username}.html`
- P4-1 students: `/portfolios/P4-1/{username}/{username}.html`
- P4-2 students: `/portfolios/P4-2/{username}/{username}.html`

## API Endpoints
- `GET /api/schools` - List all schools
- `GET /api/schools/:schoolId/classes` - List classes for a school
- `GET /api/m2-students` - Get M2 class students
- `GET /api/phumdham-students/:classId` - Get P4 class students
- `POST /register` - Register a new user

## Privacy Settings
- All portfolios are private by default
- Students can toggle their portfolio visibility
- Private portfolios are only visible to logged-in users
- Public portfolios are visible to everyone

## Maintenance
### Adding a New School
1. Edit `config/schools.js`
2. Add school configuration
3. Create necessary portfolio directories

### Adding a New Class
1. Edit `config/schools.js` to add class configuration:
```javascript
{
    id: 'M2-002',  // Use consistent ID format
    name: 'M2 2026',
    displayName: 'M2 2026',
    portfolioPath: '/portfolios/M2-002'
}
```
2. Create the portfolio directory:
```bash
mkdir -p portfolios/M2-002
```

### Troubleshooting
Common issues and solutions:
1. Portfolio not found
   - Verify the portfolio path matches the class ID format
   - Check directory permissions
   - Ensure username matches case sensitivity

2. Privacy toggle not working
   - Check database connection
   - Verify user authentication
   - Clear browser cache

3. Registration issues
   - Verify school and class IDs match configuration
   - Check portfolio path generation
   - Ensure all required directories exist 