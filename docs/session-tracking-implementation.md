# Session Tracking Implementation Guide

## Overview
This document details the implementation of a comprehensive session tracking system added to the Teacher Resource Project LMS. The system monitors student login patterns to identify potential gaming or activity switching behaviors.

## Implementation Date
**Added**: January 2025

## Database Changes

### New Prisma Model: UserSession
```prisma
model UserSession {
  id          String   @id @default(uuid())
  user        User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  userId      String
  startTime   DateTime @default(now())
  endTime     DateTime? // null if session is still active
  duration    Int?     // Duration in seconds (calculated when session ends)
  ipAddress   String?  // Optional: track IP address
  userAgent   String?  // Optional: track browser/device info
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt

  @@index([userId, startTime])
  @@index([startTime])
}
```

### Updated User Model
Added relationship to UserSession:
```prisma
model User {
  // ... existing fields ...
  sessions      UserSession[] // Track login sessions
}
```

### Migration Applied
- **Migration Name**: `20250711105940_add_user_sessions`
- **File**: `prisma/migrations/20250711105940_add_user_sessions/migration.sql`

## Server-Side Implementation

### Files Modified: `server.js`

#### 1. Enhanced Login Endpoint
**Location**: Around line 62-149
**Changes**:
- Added session creation after successful authentication
- Records IP address and user agent information
- Maintains existing functionality

```javascript
// Create a new session record
const session = await prisma.userSession.create({
    data: {
        userId: authenticatedUser.id,
        ipAddress: req.ip || req.connection.remoteAddress,
        userAgent: req.headers['user-agent']
    }
});
```

#### 2. New Logout Endpoint
**Location**: After login endpoint
**Purpose**: Properly end sessions and calculate duration

```javascript
app.post('/api/logout', auth, async (req, res) => {
    try {
        // Find the most recent active session for this user
        const activeSession = await prisma.userSession.findFirst({
            where: {
                userId: req.user.userId,
                endTime: null // Session is still active
            },
            orderBy: {
                startTime: 'desc'
            }
        });

        if (activeSession) {
            // End the session
            const endTime = new Date();
            const duration = Math.floor((endTime.getTime() - activeSession.startTime.getTime()) / 1000);
            
            await prisma.userSession.update({
                where: { id: activeSession.id },
                data: {
                    endTime: endTime,
                    duration: duration
                }
            });
        }

        res.json({ success: true, message: 'Logged out successfully' });
    } catch (error) {
        console.error('Logout error:', error);
        res.status(500).json({ 
            success: false, 
            error: error.message 
        });
    }
});
```

#### 3. Session Statistics API
**Endpoint**: `GET /api/user-sessions/:userId`
**Purpose**: Get detailed session statistics for a specific user

#### 4. Login Frequency Analysis API
**Endpoint**: `GET /api/user-sessions/:userId/frequency`
**Purpose**: Analyze login patterns for potential suspicious behavior

**Suspicious Pattern Detection Logic**:
```javascript
// Flag patterns that might indicate switching to games/other activities
if (minutesBetween >= 5 && minutesBetween <= 30 && sessions[i-1].duration < 600) {
    suspiciousPatterns.push({
        sessionIndex: i,
        timeBetween: Math.round(minutesBetween),
        previousSessionDuration: sessions[i-1].duration,
        timestamp: sessions[i].startTime
    });
}
```

#### 5. Class Session Analysis API
**Endpoint**: `GET /api/class-sessions/frequency`
**Purpose**: Get session analysis for all students in a class

## Frontend Implementation

### New Files Created

#### 1. Session Analytics Page
**File**: `public/teacher/session-analytics.html`
**Purpose**: Teacher dashboard for viewing session analytics

**Key Features**:
- Class-based filtering dropdown
- Time range selection (2 hours to 1 week)
- Summary statistics cards
- Student table with risk level indicators
- Color-coded risk levels (High/Medium/Low)

**Risk Level Algorithm**:
```javascript
function getRiskLevel(student) {
    if (student.suspiciousPatterns >= 3 || (student.shortSessions >= 5 && student.totalLogins >= 8)) {
        return 'High';
    } else if (student.suspiciousPatterns >= 1 || student.shortSessions >= 3) {
        return 'Medium';
    } else {
        return 'Low';
    }
}
```

#### 2. Logout Utility Script
**File**: `public/js/logout.js`
**Purpose**: Centralized logout functionality

**Features**:
- Calls server-side logout endpoint
- Clears local storage
- Redirects to login page
- Auto-checks token expiration every 5 minutes

```javascript
async function logout() {
    const token = localStorage.getItem('token');
    
    if (token) {
        try {
            await fetch('/api/logout', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                }
            });
        } catch (error) {
            console.error('Logout error:', error);
        }
    }
    
    localStorage.clear();
    window.location.href = '/login';
}
```

### Files Modified

#### 1. Teacher Dashboard
**File**: `public/teacher/dashboard.html`
**Changes**:
- Added link to Session Analytics in sidebar
- Integrated logout utility script
- Updated logout button to use new utility

```html
<a class="nav-link" href="/teacher/session-analytics.html">
    <i class="bi bi-clock-history"></i> Session Analytics
</a>
```

## Suspicious Pattern Detection Criteria

### High Risk Indicators
- **3+ suspicious patterns** OR
- **5+ short sessions** AND **8+ total logins** in 24 hours

### Medium Risk Indicators
- **1+ suspicious patterns** OR
- **3+ short sessions**

### Suspicious Pattern Definition
- **Time between sessions**: 5-30 minutes
- **Previous session duration**: Less than 10 minutes (600 seconds)
- **Short session**: Less than 5 minutes (300 seconds)
- **Very short session**: Less than 1 minute (60 seconds)

## API Endpoints Summary

| Endpoint | Method | Purpose | Access |
|----------|--------|---------|---------|
| `/api/login` | POST | Enhanced login with session creation | Public |
| `/api/logout` | POST | Enhanced logout with session ending | Authenticated |
| `/api/user-sessions/:userId` | GET | Individual session statistics | Teacher/Admin/Owner |
| `/api/user-sessions/:userId/frequency` | GET | Login pattern analysis | Teacher/Admin/Owner |
| `/api/class-sessions/frequency` | GET | Class-wide analysis | Teacher only |

## Usage Instructions

### For Teachers
1. Navigate to Teacher Dashboard
2. Click "Session Analytics" in sidebar
3. Select class and time range
4. Review summary statistics
5. Identify high-risk students (highlighted in red)
6. Click "Details" for individual analysis

### For Administrators
- Access all endpoints via API
- Monitor system-wide patterns
- Generate custom reports

## Data Privacy & Security

### Access Control
- Teachers can only view their assigned classes
- Administrators can view all data
- Students can view their own session data
- IP addresses are optional and can be disabled

### Data Storage
- Sessions stored in SQLite database
- Automatic cleanup via cascade deletes
- Indexed for efficient queries

## Monitoring & Maintenance

### Database Performance
- Indexes on `userId` and `startTime` for fast queries
- Consider archiving old session data for large deployments

### Token Expiration
- JWT tokens expire after 24 hours
- Auto-logout checks every 5 minutes
- Sessions properly ended on token expiration

## Future Enhancement Ideas

### Short Term
- Real-time notifications for suspicious patterns
- Export functionality for detailed reports
- Integration with assessment completion data

### Long Term
- Advanced pattern recognition algorithms
- Mobile app session tracking
- Machine learning for behavior prediction
- Integration with learning analytics

## Troubleshooting

### Common Issues
1. **Sessions not ending**: Check if logout endpoint is being called
2. **Missing data**: Verify database migration was applied
3. **Permission errors**: Check user role and class assignments

### Debug Endpoints
- Check active sessions: Query `UserSession` where `endTime` is null
- Verify user permissions: Check `User.role` and class assignments

## Testing

### Manual Testing Steps
1. Login as a student multiple times
2. Check session creation in database
3. Logout and verify session ending
4. Login as teacher and view analytics
5. Test different time ranges and classes

### Database Verification
```sql
-- Check for active sessions
SELECT * FROM UserSession WHERE endTime IS NULL;

-- Check session statistics
SELECT 
    userId,
    COUNT(*) as total_sessions,
    AVG(duration) as avg_duration,
    SUM(duration) as total_duration
FROM UserSession 
WHERE endTime IS NOT NULL
GROUP BY userId;
```

## Configuration

### Environment Variables
- `JWT_SECRET`: For token signing (existing)
- No new environment variables required

### Database Configuration
- SQLite database (existing setup)
- No additional configuration required

## Deployment Notes

### Migration Required
- Run `npx prisma migrate dev` to apply database changes
- Verify migration `20250711105940_add_user_sessions` is applied

### File Deployment
- Deploy all new files to server
- Update existing files with modifications
- Restart server after deployment

## Support & Documentation

### Related Documentation
- `docs/session-tracking.md`: User-facing documentation
- `docs/teachers_guide.md`: Teacher usage guide (update needed)

### Code Comments
- All new code includes detailed comments
- API endpoints documented with examples
- Risk level algorithms clearly explained

---

**Last Updated**: January 2025  
**Version**: 1.0  
**Status**: Production Ready 