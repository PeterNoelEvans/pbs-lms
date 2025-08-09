# Teacher Authorization System

## Overview
The Teacher Authorization System ensures that only Peter Evans (peter@pbs.ac.th) can authorize new teachers to access the platform. This provides complete control over who can join as a teacher while maintaining an open registration process for students.

## System Administrator
**Peter Evans (peter@pbs.ac.th)** is the sole administrator with the authority to:
- Approve or reject teacher requests
- Manage all teacher accounts
- Access the admin dashboard for teacher management

## How Teacher Authorization Works

### For Prospective Teachers

1. **Visit the Registration Page**
   - Go to the teacher registration form
   - Fill out the required information

2. **Submit Teacher Request**
   - **Name**: Full legal name
   - **Email**: Professional email address (must be unique)
   - **Password**: Secure password (8+ characters)
   - **Organization**: Select from PBS, Hospital, CodingSchool, or Other
   - **Message**: Optional explanation of your request and qualifications

3. **Wait for Approval**
   - Request is submitted with "PENDING" status
   - Peter Evans will receive notification of your request
   - You will be notified via email when your request is reviewed

4. **Account Creation (Upon Approval)**
   - If approved, your teacher account is automatically created
   - You can immediately log in using your submitted credentials
   - You'll have access to all teacher features

### For Peter Evans (Administrator)

1. **Access Admin Dashboard**
   - Log in with peter@pbs.ac.th credentials
   - Navigate to Teacher Management section

2. **Review Pending Requests**
   - View all pending teacher requests
   - See applicant information and messages
   - Review request dates and details

3. **Make Decision**
   - **Approve**: Creates teacher account immediately
   - **Reject**: Denies request with optional feedback notes

4. **Manage Existing Teachers**
   - View all current teachers
   - Deactivate teacher accounts if needed
   - Assign subjects to teachers

## Database Structure

### TeacherApprovalRequest Table
```sql
- id: Unique identifier
- name: Applicant's full name
- email: Applicant's email address
- password: Hashed password (ready for account creation)
- organization: Selected organization
- message: Optional message from applicant
- status: PENDING | APPROVED | REJECTED
- requestedAt: When request was submitted
- reviewedAt: When Peter Evans reviewed it
- reviewedBy: Peter Evans' user ID
- reviewNotes: Optional notes from Peter Evans
```

## API Endpoints

### Public Endpoints

#### Submit Teacher Request
```http
POST /api/teacher-request
Content-Type: application/json

{
  "name": "John Smith",
  "email": "john.smith@school.edu",
  "password": "securePassword123",
  "organization": "PBS",
  "message": "I am an experienced English teacher looking to join your platform..."
}
```

**Response (Success):**
```json
{
  "success": true,
  "message": "Teacher request submitted successfully. You will be notified when reviewed.",
  "requestId": "uuid-string"
}
```

### Admin-Only Endpoints (Peter Evans only)

#### List Pending Requests
```http
GET /api/admin/teacher-requests
Authorization: Bearer <peter_evans_jwt_token>
```

**Response:**
```json
{
  "success": true,
  "requests": [
    {
      "id": "uuid",
      "name": "John Smith",
      "email": "john.smith@school.edu",
      "organization": "PBS",
      "message": "I am an experienced...",
      "status": "PENDING",
      "requestedAt": "2025-08-09T04:00:00.000Z"
    }
  ]
}
```

#### Approve Teacher Request
```http
POST /api/admin/approve-teacher/uuid
Authorization: Bearer <peter_evans_jwt_token>
Content-Type: application/json

{
  "notes": "Approved - excellent qualifications"
}
```

**Response:**
```json
{
  "success": true,
  "message": "Teacher request approved. Account created successfully.",
  "teacherId": "new-teacher-uuid"
}
```

#### Reject Teacher Request
```http
POST /api/admin/reject-teacher/uuid
Authorization: Bearer <peter_evans_jwt_token>
Content-Type: application/json

{
  "notes": "Thank you for your interest. Please contact us directly for more information."
}
```

## Security Features

1. **Single Administrator**: Only Peter Evans can approve teachers
2. **Request Validation**: All requests are validated before submission
3. **Secure Password Storage**: Passwords are hashed before storage
4. **Audit Trail**: All approval/rejection actions are logged
5. **Email Verification**: Ensures valid contact information

## User Experience Flow

### For Teachers Requesting Access
```
Registration Form → Submit Request → Wait for Review → Email Notification → Login
```

### For Peter Evans (Admin)
```
Login → Admin Dashboard → Review Requests → Approve/Reject → Teacher Account Created
```

## Benefits

1. **Quality Control**: Ensures only qualified teachers join the platform
2. **Security**: Prevents unauthorized teacher registrations
3. **Centralized Management**: Peter Evans controls all teacher access
4. **Audit Trail**: Complete record of all teacher approvals
5. **Professional Process**: Formal application and review process

## Configuration

The system requires these environment variables:
```env
JWT_SECRET=your-secret-key
EMAIL_HOST=smtp.example.com    # For notifications (optional)
EMAIL_PORT=587                 # For notifications (optional)
EMAIL_USER=notifications@platform.com
EMAIL_PASS=email-password
```

## Future Enhancements

1. **Email Notifications**: Automatic emails to applicants
2. **Bulk Actions**: Approve/reject multiple requests
3. **Teacher Profiles**: Extended information for applications
4. **Subject Preferences**: Teachers can specify preferred subjects
5. **Interview Scheduling**: Integration with calendar systems

## Troubleshooting

### Common Issues

1. **Request Not Submitted**
   - Check all required fields are filled
   - Ensure email is not already in use
   - Verify password meets requirements

2. **Cannot Access Admin Dashboard**
   - Ensure logged in as peter@pbs.ac.th
   - Check JWT token validity
   - Verify admin permissions

3. **Approved Teacher Cannot Login**
   - Check account was created successfully
   - Verify email/password combination
   - Ensure account is set to active status

## Support

For issues with the teacher authorization system:
- Contact Peter Evans directly
- Check system logs for error messages
- Verify database connectivity and migrations
