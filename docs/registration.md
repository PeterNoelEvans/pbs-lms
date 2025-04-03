# Registration System Documentation

## Overview
The registration system is designed to handle multiple schools and classes dynamically. It uses a configuration-based approach where schools and classes are defined in the system configuration and loaded at runtime.

## School and Class Configuration
Schools and classes are configured in `config/schools.js`. Each school can have multiple classes, and each class has its own configuration:

```javascript
const schools = [
  {
    id: 'PBSChonburi',
    name: 'Prabhassorn Vidhaya School Chonburi',
    classes: [
      {
        id: 'ClassM2-001',
        name: 'Class 001',
        displayName: 'M2 2025',
        description: 'This is a presentation of M2 2025 001 Coding Class.',
        portfolioPath: '/portfolios/ClassM2-001'
      }
    ]
  }
  // More schools can be added here
];
```

## Adding New Schools
To add a new school to the system:

1. Use the `setup-new-school.js` script:
   ```bash
   node scripts/setup-new-school.js
   ```

2. Follow the prompts to:
   - Enter school ID (e.g., 'school2')
   - Enter school name
   - Enter number of classes
   - For each class:
     - Enter class ID
     - Enter class name
     - Enter display name
     - Enter description

3. The script will:
   - Add the school to the configuration
   - Create necessary portfolio directories
   - Set up class configurations

## Adding Classes to Existing Schools
To add a new class to an existing school:

1. Edit `config/schools.js` directly:
   ```javascript
   {
     id: 'PBSChonburi',
     name: 'Prabhassorn Vidhaya School Chonburi',
     classes: [
       // Existing classes...
       {
         id: 'ClassM2-002',  // New class ID
         name: 'Class 002',
         displayName: 'M2 2026',
         description: 'This is a presentation of M2 2026 002 Coding Class.',
         portfolioPath: '/portfolios/ClassM2-002'
       }
     ]
   }
   ```

2. Create the necessary portfolio directory:
   ```bash
   mkdir -p portfolios/ClassM2-002
   ```

3. The new class will automatically appear in:
   - The registration form dropdown
   - The schools page
   - The class viewer
   - All other parts of the system

## Registration Form
The registration form (`register.html`) dynamically loads schools and classes:

1. **School Selection**:
   - Loads all schools from `/api/schools`
   - Displays school names in a dropdown
   - When a school is selected, loads its classes

2. **Class Selection**:
   - Loads classes for the selected school from `/api/schools/{schoolId}/classes`
   - Displays class display names in a dropdown
   - Updates when school selection changes

3. **Portfolio Path Generation**:
   - Automatically generates the portfolio path based on:
     - Selected class ID
     - Entered username
   - Format: `/portfolios/{classId}/{username}/{username}.html`

## API Endpoints
The system provides these API endpoints for registration:

- `GET /api/schools`: Returns all configured schools
- `GET /api/schools/{schoolId}`: Returns details of a specific school
- `GET /api/schools/{schoolId}/classes`: Returns all classes for a school
- `GET /api/schools/{schoolId}/classes/{classId}`: Returns details of a specific class
- `POST /register`: Handles user registration

## Error Handling
The registration form includes error handling for:
- API failures when loading schools/classes
- Missing required fields
- Password validation
- Password confirmation
- Registration failures

## Usage Notes
1. **Student Registration**:
   - Use the given username format (e.g., Peter41)
   - Select the appropriate school and class
   - Password must be at least 8 characters

2. **Parent Registration**:
   - Use format "parent-" + child's username (e.g., parent-peter41)
   - Select the child's school and class
   - Password must be at least 8 characters

3. **Portfolio Path**:
   - Automatically generated based on selections
   - No manual entry required
   - Ensures consistent path structure

## Maintenance
To maintain the registration system:

1. **Adding Schools**:
   - Use the setup script for new schools
   - Update documentation for new schools

2. **Adding Classes**:
   - Edit `config/schools.js` to add new classes
   - Create necessary portfolio directories
   - No server restart required
   - Changes are reflected immediately

3. **Modifying Schools**:
   - Edit `config/schools.js` directly
   - Ensure portfolio paths are updated accordingly

4. **Troubleshooting**:
   - Check server logs for API errors
   - Verify school/class configuration
   - Ensure portfolio directories exist 