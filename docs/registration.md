# Registration System Documentation

## Overview
The registration system is designed to handle multiple schools and classes dynamically through a configuration-based approach. It supports both student and parent registrations, with different requirements for each type of user.

## School and Class Configuration
Schools and their classes are defined in `config/schools.js`. Each school has:
- A unique ID
- A display name
- A list of classes

Example configuration:
```javascript
{
    id: "prabhassorn",
    name: "Prabhassorn Vidhaya School Chonburi",
    classes: [
        {
            id: "M2-001",
            name: "M2 2025",
            displayName: "M2 2025"
        },
        {
            id: "P4-1",
            name: "Class 4/1",
            displayName: "Class 4/1"
        },
        {
            id: "P4-2",
            name: "Class 4/2",
            displayName: "Class 4/2"
        }
    ]
}
```

## Adding New Schools
To add a new school:
1. Run the setup script:
   ```bash
   node scripts/setup-new-school.js
   ```
2. Follow the prompts to:
   - Enter school ID (e.g., "prabhassorn")
   - Enter school name
   - Specify number of classes
   - Enter class details (ID, name, display name)

The script will:
- Add the school to `config/schools.js`
- Create necessary portfolio directories
- Set up class configurations

## Adding Classes to Existing Schools
To add a new class to an existing school:
1. Edit `config/schools.js` directly to add the new class configuration
2. Create the necessary portfolio directory:
   ```bash
   mkdir -p portfolios/M2-002
   ```

The new class will automatically appear in:
- Registration form dropdown
- Schools page
- Class viewer
- Other parts of the system

No server restart is required - changes are reflected immediately.

## Registration Form
The registration form (`register.html`) dynamically loads schools and classes from the server. When a user registers:

1. They select their school from a dropdown
2. They select their class from a dynamically populated dropdown
3. They enter their username and password
4. The system automatically generates the correct portfolio path

Example portfolio paths:
- For M2 students: `/portfolios/M2-001/Peter/Peter.html`
- For P4 students: `/portfolios/P4-1/Peter41/Peter41.html`

## API Endpoints
- `GET /api/schools` - List all schools
- `GET /api/schools/:schoolId/classes` - List classes for a school
- `POST /register` - Register a new user

## Error Handling
The registration form handles various error cases:
- Invalid school/class selection
- Username already exists
- Password requirements not met
- API connection failures

## Usage Notes
### Student Registration
- Username: First name (e.g., "Peter")
- Password: Year of graduation (e.g., "2025")
- Portfolio path: Automatically generated based on class and username

### Parent Registration
- Username: Student's username + "Parent" (e.g., "PeterParent")
- Password: Choose a secure password
- Portfolio path: Same as student's portfolio

## Maintenance
### Adding Schools
1. Use the setup script
2. Verify directory creation
3. Test registration with new school

### Adding Classes
1. Edit `config/schools.js`
2. Create portfolio directory
3. Verify in registration form

### Modifying Schools
1. Edit `config/schools.js`
2. Update portfolio directories if needed
3. Test affected functionality

### Troubleshooting
Common issues and solutions:
1. Registration fails
   - Check school/class configuration
   - Verify directory permissions
   - Check database connection

2. Portfolio not found
   - Verify portfolio path format
   - Check directory structure
   - Verify file permissions

3. Class not appearing
   - Check class configuration
   - Verify API response
   - Clear browser cache 