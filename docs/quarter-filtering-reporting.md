# Quarter Filtering and Reporting Guide

## Overview

The system now supports comprehensive quarter filtering for both viewing and reporting purposes. This allows you to access data from specific quarters (Q1, Q2, Q3, Q4) while maintaining the current quarter as the default view.

## Quarter Filtering Capabilities

### 1. **API Endpoints with Quarter Parameters**

#### Resources by Quarter
```javascript
// Get Q1 resources
GET /api/subjects/:subjectId/resources?quarter=Q1

// Get Q2 resources  
GET /api/subjects/:subjectId/resources?quarter=Q2

// Get Q3 resources
GET /api/subjects/:subjectId/resources?quarter=Q3

// Get Q4 resources
GET /api/subjects/:subjectId/resources?quarter=Q4

// Get all resources (no quarter filter)
GET /api/subjects/:subjectId/resources
```

#### Assessments by Quarter
```javascript
// Get Q1 assessments
GET /api/teacher/assessments?quarter=Q1

// Get Q2 assessments
GET /api/teacher/assessments?quarter=Q2

// Get all assessments (no quarter filter)
GET /api/teacher/assessments
```

#### Topic Resources by Quarter
```javascript
// Get topic resources for specific quarter
GET /api/topics/:topicId/resources
// (Automatically filters by active quarter)
```

### 2. **Database Export with Quarter Filtering**

The database export functionality now supports quarter filtering:

#### Export Interface
- **Location**: Teacher Portal → Database Export
- **Quarter Filter**: Dropdown to select Q1, Q2, Q3, Q4, or "All Quarters"
- **Export Options**: Select specific tables or export all data

#### Export Features
- **Quarter-Specific Worksheets**: Resources, assessments, and submissions are exported in separate worksheets with quarter suffix
- **Filename Convention**: `student-performance-dashboard-{QUARTER}-{DATE}.xlsx`
- **Comprehensive Data**: Includes all related data (creators, topics, submissions, etc.)

#### Example Export Structure
```
student-performance-dashboard-Q2-2025-08-08.xlsx
├── Student Performance Dashboard
├── Login vs Activity Analysis  
├── Summary Statistics
├── Resources_Q2
├── Assessments_Q2
└── Submissions_Q2
```

### 3. **Quarter-Specific Reporting API**

#### New Endpoint: `/api/teacher/quarter-report`
```javascript
GET /api/teacher/quarter-report?quarter=Q1
GET /api/teacher/quarter-report?quarter=Q2
GET /api/teacher/quarter-report?quarter=Q3
GET /api/teacher/quarter-report?quarter=Q4
```

#### Response Structure
```json
{
  "quarter": "Q2",
  "summary": {
    "totalResources": 68,
    "totalAssessments": 84,
    "totalSubmissions": 4707,
    "publishedAssessments": 84,
    "averageScore": 62.02,
    "completionRate": "100.0"
  },
  "subjectStats": {
    "Listening&Speaking M2": {
      "assessments": 84,
      "submissions": 4707,
      "averageScore": "62.02"
    }
  },
  "resources": [...],
  "assessments": [...],
  "submissions": [...]
}
```

## User Interface Features

### 1. **Teacher Resources Page**
- **Quarter Filter Dropdown**: Select Q1, Q2, Q3, Q4
- **Quarter Badges**: Resources display their quarter
- **Dynamic Filtering**: Resources update based on selected quarter
- **Add Resource**: New resources automatically get current active quarter

### 2. **Student Resources Page**
- **Quarter Badges**: Resources show their quarter
- **Automatic Filtering**: Only shows resources for current active quarter
- **Assessment Links**: Only shows assessments for current quarter

### 3. **Database Export Page**
- **Quarter Filter**: Dropdown to select specific quarter for export
- **All Quarters Option**: Export data from all quarters
- **Quarter-Specific Filenames**: Exported files include quarter in filename

## Current Data Distribution

Based on the test results:

| Quarter | Resources | Assessments | Submissions | Avg Score |
|---------|-----------|-------------|-------------|-----------|
| Q1      | 0         | 1           | 0           | 0%        |
| Q2      | 68        | 84          | 4707        | 62.02%    |
| Q3      | 0         | 0           | 0           | 0%        |
| Q4      | 0         | 0           | 0           | 0%        |

## Usage Examples

### 1. **Access Q1 Data for Reporting**
```javascript
// Get Q1 resources
const q1Resources = await fetch('/api/subjects/subjectId/resources?quarter=Q1');

// Get Q1 assessments
const q1Assessments = await fetch('/api/teacher/assessments?quarter=Q1');

// Get Q1 quarter report
const q1Report = await fetch('/api/teacher/quarter-report?quarter=Q1');
```

### 2. **Export Q1 Data**
```javascript
// In the database export page:
// 1. Select "Q1" from the quarter dropdown
// 2. Select "Resources" and "Assessments" tables
// 3. Click "Export Selected"
// 4. Download: student-performance-dashboard-Q1-2025-08-08.xlsx
```

### 3. **Compare Quarters**
```javascript
// Get reports for different quarters
const q1Report = await fetch('/api/teacher/quarter-report?quarter=Q1');
const q2Report = await fetch('/api/teacher/quarter-report?quarter=Q2');

// Compare statistics
console.log('Q1 vs Q2 Resources:', q1Report.summary.totalResources, 'vs', q2Report.summary.totalResources);
```

## Benefits for Reporting

### 1. **Historical Analysis**
- Access Q1 data even when Q2 is active
- Compare performance across quarters
- Track content development over time

### 2. **Quarter-Specific Reports**
- Generate reports for specific quarters
- Export quarter-specific data for external analysis
- Create quarter comparison reports

### 3. **Content Management**
- Review Q1 content while working on Q2
- Plan Q3 content based on Q1/Q2 performance
- Archive completed quarters

### 4. **Performance Tracking**
- Track student performance by quarter
- Compare assessment completion rates
- Monitor resource usage patterns

## Technical Implementation

### Database Schema
```prisma
model Resource {
  // ... other fields
  quarter     String   @default("Q1") // "Q1", "Q2", "Q3", "Q4"
}

model Assessment {
  // ... other fields  
  quarter     String   @default("Q1") // "Q1", "Q2", "Q3", "Q4"
}
```

### Filtering Logic
```javascript
// Resources filtering
const resources = await prisma.resource.findMany({
  where: { quarter: activeQuarter }
});

// Assessments filtering
const assessments = await prisma.assessment.findMany({
  where: { 
    quarter: activeQuarter,
    published: true 
  }
});

// Submissions filtering (for assessments in specific quarter)
const submissions = await prisma.assessmentSubmission.findMany({
  where: {
    assessment: {
      quarter: quarter
    }
  }
});
```

## Future Enhancements

### 1. **Quarter Management Interface**
- Admin interface to manage quarter transitions
- Bulk quarter updates for content
- Quarter-specific settings

### 2. **Advanced Reporting**
- Quarter-over-quarter comparison charts
- Trend analysis across quarters
- Predictive analytics for future quarters

### 3. **Content Migration**
- Tools to move content between quarters
- Quarter archiving functionality
- Historical content access controls

## Best Practices

### 1. **Quarter Planning**
- Plan content creation by quarter
- Review previous quarter performance
- Set quarter-specific goals

### 2. **Data Management**
- Regularly export quarter data for backup
- Clean up old quarter data as needed
- Maintain quarter-specific documentation

### 3. **Reporting Workflows**
- Use quarter reports for performance reviews
- Export data before quarter transitions
- Keep historical quarter data for analysis

## Conclusion

The quarter filtering system provides comprehensive access to historical data while maintaining clean separation between quarters. This enables effective reporting, analysis, and content management across different time periods.
