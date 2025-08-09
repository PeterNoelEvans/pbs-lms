# Admin Quick Reference - Peter Evans

## Your Administrator Privileges

As the sole administrator of the Teacher Resource Platform, you have exclusive authority to manage teacher access.

## Quick Access

### Login Information
- **Email**: peter@pbs.ac.th  
- **Role**: System Administrator
- **Access Level**: Full administrative control

### Admin Dashboard
After logging in, access your admin features through:
1. Teacher Dashboard → Admin Section
2. Direct URL: `/admin/teacher-management` (coming soon)

## Teacher Management Tasks

### 1. Review Teacher Requests
**Frequency**: Check daily for new requests
**Location**: Admin Dashboard → Pending Teacher Requests

**What You'll See:**
- Applicant name and email
- Organization they want to join
- Their message/qualifications
- Request submission date

### 2. Approve Teachers
**Action**: Click "Approve" on qualified candidates
**Result**: 
- Teacher account created automatically
- Applicant receives notification email
- They can immediately log in

### 3. Reject Requests
**Action**: Click "Reject" with optional feedback
**Result**:
- Request marked as rejected
- Applicant receives notification
- No account created

### 4. Manage Existing Teachers
**Current Teachers**: Only you initially
**Actions Available**:
- View all teacher accounts
- Deactivate accounts if needed
- Assign subjects to teachers

## Important Notes

### Security
- You are the only person who can create teacher accounts
- Direct teacher registration is blocked for everyone except you
- Students can still register freely

### Quality Control
- Review each teacher request carefully
- Consider their qualifications and message
- Reject suspicious or unqualified requests

### Current Status
- **Total Teachers**: 1 (you)
- **Teacher Subjects**: 6 subjects assigned to you
- **Student Access**: Unrestricted registration

## Quick Commands

### Check System Status
```bash
# Check teacher count
node scripts/check-teacher-assignments.js

# Clean up old accounts (if needed)
node scripts/cleanup-teachers.js
```

### Emergency Access
If you're locked out, database access is available through:
1. Prisma Studio: `npx prisma studio`
2. Direct database file: `prisma/dev.db`

## Backup Important

### Before Approving Teachers
- Consider their qualifications
- Check their email domain for legitimacy
- Review their message for professionalism

### Regular Maintenance
- Monitor teacher activity
- Review subject assignments
- Maintain system security

## Support Contacts

### Technical Issues
- Check system documentation in `/docs` folder
- Review server logs for errors
- Database issues: Check Prisma migrations

### Platform Questions
- All teacher-related decisions are yours
- Student issues: Handle as needed
- System changes: Modify as required

## Future Features (Planned)

1. **Email Notifications**: Automatic emails to applicants
2. **Bulk Teacher Management**: Handle multiple requests at once
3. **Teacher Profiles**: Extended application information
4. **Subject Assignment**: Assign specific subjects during approval
5. **Activity Monitoring**: Track teacher usage and engagement

---

**Remember**: You have complete control over teacher access. Use this authority to maintain the quality and security of the platform.
