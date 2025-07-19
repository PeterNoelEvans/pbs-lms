# Session Tracking System

## Overview

The session tracking system monitors student login patterns to help identify potential gaming or activity switching behaviors. It records:

- **Login/Logout Times**: When students start and end sessions
- **Session Duration**: How long each session lasts
- **Login Frequency**: How often students log in over time periods
- **Suspicious Patterns**: Potential indicators of switching between learning and other activities

## Database Schema

### UserSession Model

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

## API Endpoints

### 1. Login (Enhanced)
**POST** `/api/login`

Creates a new session record when a user logs in.

**Response includes:**
- JWT token
- User information
- Session tracking begins automatically

### 2. Logout (Enhanced)
**POST** `/api/logout`

Ends the current session and calculates duration.

**Headers:**
```
Authorization: Bearer <token>
```

**Response:**
```json
{
  "success": true,
  "message": "Logged out successfully"
}
```

### 3. User Session Statistics
**GET** `/api/user-sessions/:userId`

Get detailed session statistics for a specific user.

**Query Parameters:**
- `startDate` (optional): Start date for filtering
- `endDate` (optional): End date for filtering

**Response:**
```json
{
  "sessions": [...],
  "statistics": {
    "totalSessions": 15,
    "totalDuration": 7200,
    "averageDuration": 480,
    "longestSession": 1800,
    "totalHours": 2.0
  }
}
```

### 4. Login Frequency Analysis
**GET** `/api/user-sessions/:userId/frequency`

Analyze login patterns for potential suspicious behavior.

**Query Parameters:**
- `hours` (default: 24): Time range to analyze

**Response:**
```json
{
  "timeRange": {
    "start": "2024-01-15T00:00:00Z",
    "end": "2024-01-16T00:00:00Z",
    "hours": 24
  },
  "loginFrequency": {
    "totalLogins": 8,
    "shortSessions": 3,
    "veryShortSessions": 1,
    "averageTimeBetweenLogins": 45,
    "suspiciousPatterns": 2
  },
  "patterns": {
    "hourlyDistribution": {...},
    "suspiciousPatterns": [...]
  }
}
```

### 5. Class Session Analysis
**GET** `/api/class-sessions/frequency`

Get session analysis for all students in a class.

**Query Parameters:**
- `class`: Class name (e.g., "M1/1")
- `hours` (default: 24): Time range to analyze

**Response:**
```json
{
  "timeRange": {...},
  "class": "M1/1",
  "totalStudents": 25,
  "students": [
    {
      "name": "John Doe",
      "nickname": "john123",
      "totalLogins": 5,
      "shortSessions": 2,
      "suspiciousPatterns": 1,
      "totalDurationMinutes": 120,
      "averageSessionMinutes": 24
    }
  ]
}
```

## Suspicious Pattern Detection

The system identifies potential gaming/activity switching patterns:

### Criteria for Suspicious Patterns:
1. **Time Between Sessions**: 5-30 minutes
2. **Previous Session Duration**: Less than 10 minutes
3. **Multiple Short Sessions**: 3+ sessions under 5 minutes
4. **High Login Frequency**: 8+ logins in 24 hours

### Risk Levels:
- **High Risk**: 3+ suspicious patterns OR (5+ short sessions AND 8+ total logins)
- **Medium Risk**: 1+ suspicious patterns OR 3+ short sessions
- **Low Risk**: Normal patterns

## Teacher Dashboard Integration

### Session Analytics Page
Access via: `/teacher/session-analytics.html`

**Features:**
- Class-based filtering
- Time range selection (2 hours to 1 week)
- Summary statistics
- Student risk level indicators
- Detailed session breakdowns

**Summary Cards:**
- Total Students
- Total Logins
- Short Sessions (< 5 minutes)
- Suspicious Patterns

**Student Table Columns:**
- Student Name/Nickname
- Total Logins
- Short Sessions
- Total Time
- Average Session Duration
- Suspicious Patterns
- Risk Level (High/Medium/Low)
- Actions (View Details)

## Implementation Details

### Client-Side Logout
The system includes a utility script (`/js/logout.js`) that:
- Calls the server-side logout endpoint
- Clears local storage
- Redirects to login page
- Auto-checks token expiration every 5 minutes

### Session Management
- Sessions are created automatically on login
- Sessions are ended on logout or token expiration
- Duration is calculated in seconds
- IP address and user agent are optionally tracked

## Usage Examples

### For Teachers:
1. Navigate to Session Analytics in teacher dashboard
2. Select class and time range
3. Review summary statistics
4. Identify high-risk students
5. Click "Details" for individual student analysis

### For Administrators:
- Access all session data via API endpoints
- Monitor system-wide patterns
- Generate reports for specific time periods

## Benefits

1. **Behavioral Insights**: Identify students who may be switching between learning and other activities
2. **Engagement Monitoring**: Track actual time spent in the learning platform
3. **Early Intervention**: Flag potential issues before they become problems
4. **Data-Driven Decisions**: Use analytics to improve learning strategies

## Privacy Considerations

- Session data is stored securely
- Access is restricted to teachers and administrators
- IP addresses are optional and can be disabled
- Data retention policies should be established
- Students can view their own session data

## Future Enhancements

Potential improvements:
- Real-time notifications for suspicious patterns
- Integration with assessment completion data
- Advanced pattern recognition algorithms
- Export functionality for detailed reports
- Mobile app session tracking 