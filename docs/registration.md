# Registration System Documentation

## Overview
The registration system uses Prisma with SQLite as the database backend. This system handles student registrations and teacher approval requests with Peter Evans as the sole administrator who can authorize new teachers.

## Teacher Authorization System
**Only Peter Evans (peter@pbs.ac.th) can authorize new teachers.** The system implements a secure approval workflow where prospective teachers submit requests that must be approved before they can access the system.

## Database Schema
The system uses the following Prisma models:

### User Model
```prisma
model User {
  id                String              @id @default(uuid())
  name              String
  email             String
  password          String
  role              String              // ADMIN, TEACHER, STUDENT
  organization      String              @default("PBS")
  nickname          String?             @unique
  yearLevel         Int?
  class             String?
  active            Boolean             @default(true)
  // ... other fields
  approvedTeacherRequests TeacherApprovalRequest[] // Teacher requests approved by this user
}
```

### Teacher Approval Request Model
```prisma
model TeacherApprovalRequest {
  id            String   @id @default(uuid())
  name          String
  email         String   @unique
  password      String   // Hashed password
  organization  String
  message       String?  // Optional message from applicant
  status        String   @default("PENDING") // PENDING, APPROVED, REJECTED
  requestedAt   DateTime @default(now())
  reviewedAt    DateTime?
  reviewedBy    String?  // User ID of Peter Evans
  reviewNotes   String?  // Optional notes from reviewer
  approvedBy    User?    @relation(fields: [reviewedBy], references: [id])
  createdAt     DateTime @default(now())
  updatedAt     DateTime @updatedAt
}
```

## Registration Process

### Teacher Registration (New Authorization System)
**For prospective teachers (requires approval):**

1. **Submit Teacher Request** - Teacher candidate enters:
   - Full Name
   - Email (must be unique)
   - Password (must be at least 8 characters with letters and numbers)
   - Organization (PBS, Hospital, CodingSchool, etc.)
   - Optional message explaining their request

2. **Request Review** - System creates a pending approval request

3. **Admin Approval** - Peter Evans reviews and either:
   - **Approves**: Creates teacher account automatically
   - **Rejects**: Request is denied with optional notes

4. **Account Creation** - Upon approval, teacher account is created and they can log in

### Direct Teacher Access
- **Peter Evans (peter@pbs.ac.th)** can register directly as he is the system administrator

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

### Student Registration
- `POST /api/register` (for students only)
  - Request body:
    ```json
    {
      "name": "Full Name",
      "nickname": "Nickname",
      "email": "email@example.com",
      "password": "password123",
      "role": "student",
      "year": 1,
      "class": "M1/1",
      "organization": "PBS"
    }
    ```

### Teacher Request Submission
- `POST /api/teacher-request` (for prospective teachers)
  - Request body:
    ```json
    {
      "name": "Full Name",
      "email": "email@example.com",
      "password": "password123",
      "organization": "PBS",
      "message": "Optional message explaining request"
    }
    ```
  - Response:
    ```json
    {
      "success": true,
      "message": "Teacher request submitted successfully. You will be notified when reviewed.",
      "requestId": "uuid"
    }
    ```

### Teacher Request Management (Peter Evans only)
- `GET /api/admin/teacher-requests` - List all pending teacher requests
- `POST /api/admin/approve-teacher/:requestId` - Approve a teacher request
- `POST /api/admin/reject-teacher/:requestId` - Reject a teacher request

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