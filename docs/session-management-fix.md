# Session Management Fix

## Problem
Session durations were not being recorded because most frontend pages were not calling the `/api/logout` endpoint. They were only clearing localStorage without properly ending the session on the server.

## Solution Implemented

### 1. Frontend Fix
Updated all frontend pages to use the proper logout utility (`/js/logout.js`) instead of local logout functions.

**Pages Updated:**
- All student pages (`/student/*`)
- All teacher pages (`/teacher/*`) 
- Admin dashboard (`/admin/dashboard.html`)
- Parent dashboard (`/parent/dashboard.html`)

**What Changed:**
- Added `<script src="/js/logout.js"></script>` to all pages
- Removed local `logout()` functions that only cleared localStorage
- Now all logout actions call the server `/api/logout` endpoint

### 2. Backend Already Correct
The backend logout endpoint was already properly implemented:
- Finds the most recent active session for the user
- Sets `endTime` to current time
- Calculates and sets `duration` in seconds

### 3. Auto-Close Script (Backup)
Created `scripts/auto-close-sessions.js` to automatically close sessions open for more than 2 hours.

**Usage:**
```bash
npm run auto-close-sessions
```

**What it does:**
- Finds all sessions where `endTime` is null and `startTime` is more than 2 hours ago
- Sets `endTime` to current time and calculates `duration`
- Logs the results

## Testing the Fix

1. **Login as a student/teacher**
2. **Use the system for a few minutes**
3. **Click logout or close the browser tab**
4. **Check the session analytics page** - you should now see proper session durations

## Expected Results

- Session durations should now be recorded properly
- Analytics page should show accurate data
- Sessions will be automatically closed after 2 hours if not manually closed

## Files Modified

### Frontend Pages (All updated to use logout.js):
- `public/student/dashboard.html`
- `public/student/resources.html`
- `public/student/assessments.html`
- `public/student/resource-view.html`
- `public/student/upload-photo.html`
- `public/student/subject-dashboard.html`
- `public/teacher/assessments.html`
- `public/teacher/resources.html`
- `public/teacher/manual-grading.html`
- `public/teacher/grade-assessment.html`
- `public/teacher/core-subjects.html`
- `public/teacher/course-structure.html`
- `public/teacher/subjects/topics.html`
- `public/teacher/quizzes.html`
- `public/admin/dashboard.html`
- `public/parent/dashboard.html`

### New Files:
- `scripts/auto-close-sessions.js` - Auto-close script for stale sessions

### Updated Files:
- `package.json` - Added auto-close script command

## Next Steps

1. **Test the fix** by logging in and out a few times
2. **Check session analytics** to confirm durations are being recorded
3. **Set up a cron job** to run the auto-close script periodically (optional)
4. **Monitor the system** to ensure sessions are being properly managed

## Cron Job Setup (Optional)

To automatically close stale sessions every hour:

```bash
# Add to crontab
0 * * * * cd /path/to/your/project && npm run auto-close-sessions
```

This will run the auto-close script every hour at the top of the hour. 