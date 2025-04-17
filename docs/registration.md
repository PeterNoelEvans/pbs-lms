# Registration System Documentation

## Overview
The registration system uses Prisma with SQLite as the database backend. This system handles both teacher and student registrations with appropriate role-based access.

## Database Schema
The system uses the following Prisma schema:

```prisma
model User {
  id        Int      @id @default(autoincrement())
  name      String
  email     String   @unique
  password  String
  role      String
  nickname  String
  year      Int?
  class     String?
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
}
```

## Registration Process

### Teacher Registration
1. Teacher enters:
   - Full Name
   - Nickname
   - Email (must be unique)
   - Password (must be at least 8 characters with letters and numbers)
   - Role (teacher)

### Student Registration
1. Student enters:
   - Full Name
   - Nickname
   - Email (must be unique)
   - Password (must be at least 8 characters with letters and numbers)
   - Role (student)
   - Year Level (M1, M2, M3)
   - Class (e.g., M1/1, M2/2, etc.)

## API Endpoints

### Registration
- `POST /api/register`
  - Request body:
    ```json
    {
      "name": "Full Name",
      "nickname": "Nickname",
      "email": "email@example.com",
      "password": "password123",
      "role": "teacher|student",
      "year": 1,  // Optional, for students only
      "class": "M1/1"  // Optional, for students only
    }
    ```
  - Response:
    ```json
    {
      "success": true,
      "token": "jwt_token",
      "user": {
        "name": "Full Name",
        "email": "email@example.com",
        "role": "teacher|student"
      }
    }
    ```

### Account Deletion
- `POST /api/delete-account`
  - Request body:
    ```json
    {
      "email": "email@example.com"
    }
    ```
  - Response:
    ```json
    {
      "success": true,
      "message": "Account successfully deleted"
    }
    ```

## Security Features
1. Password hashing using bcrypt
2. JWT token authentication
3. Email uniqueness validation
4. Password complexity requirements
5. Role-based access control

## Maintenance

### Adding a New Class
1. Update the class options in `register.html`:
```javascript
const classOptions = {
    1: ['M1/1', 'M1/2', 'M1/3', 'M1/4', 'M1/5'],
    2: ['M2/1', 'M2/2', 'M2/3', 'M2/4', 'M2/5'],
    3: ['M3/1', 'M3/2', 'M3/3', 'M3/4', 'M3/5']
};
```

### Troubleshooting
Common issues and solutions:
1. Email already registered
   - Use the account deletion feature to remove the existing account
   - Or contact an administrator for assistance

2. Registration failed
   - Check if all required fields are filled
   - Verify password meets requirements
   - Ensure email is in correct format
   - Check database connection

3. Database issues
   - Run `npx prisma generate` to update Prisma client
   - Run `npx prisma db push` to update database schema
   - Check `prisma/dev.db` file permissions

## Account Management
Users can:
1. Register new accounts
2. Delete their own accounts
3. Update their information (future feature)
4. Reset passwords (future feature)

## Notes
- The system uses SQLite for development and testing
- All passwords are hashed before storage
- Email addresses must be unique across all users
- Account deletion is permanent and cannot be undone 