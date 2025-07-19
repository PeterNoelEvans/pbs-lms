# Development Considerations and Decisions

## Current System (Version 1)

### Core Architecture
1. **Technology Stack**
   - Frontend: Vanilla HTML/CSS/JavaScript
   - Backend: Node.js with Express
   - Database: SQLite
   - Deployment: Render.com
   - Version Control: GitHub

2. **Key Features**
   - User authentication
   - Portfolio management
   - School/class organization
   - Public visitor access


### Security Measures
1. **Authentication**
   - Session-based auth
   - Password hashing
   - CSRF protection
   - Rate limiting

2. **Data Protection**
   - Input validation
   - Output sanitization
   - Secure headers
   - CORS configuration

## Version 2 Planning

### Planned Improvements
1. **Authentication System**
   - Password reset functionality
   - Email verification
   - Two-factor authentication
   - Session management improvements

2. **Email System**
   - Transactional email service integration
   - Email templates
   - Delivery tracking
   - Bounce handling

3. **Database Enhancements**
   - Migration to PostgreSQL
   - Connection pooling optimization
   - Query performance improvements
   - Backup automation

4. **Assessment & Filtering Enhancements**
   - Add `class` property to assessment data model to associate assessments with specific classes (e.g., "M1/1", "M2/2", etc.)
   - Update backend and API endpoints to include class information in assessment responses
   - Support class-based filtering in the Manual Grading UI and other relevant pages

### Technical Decisions
1. **Email Service Provider**
   - Options considered:
     - SendGrid
     - Mailgun
     - Amazon SES
   - Selection criteria:
     - Render.com compatibility
     - Free tier availability
     - API reliability
     - Documentation quality

2. **Database Migration**
   - SQLite to PostgreSQL
   - Migration strategy
   - Data integrity checks
   - Rollback plan

### Implementation Considerations
1. **Development Process**
   - Feature branching
   - Code review process
   - Testing strategy
   - Documentation requirements

2. **Deployment Strategy**
   - Staging environment
   - Zero-downtime deployment
   - Rollback procedures
   - Monitoring setup

## Media File Labeling and Robust Linking

### Problem
Previously, uploaded media files (audio, images, etc.) were renamed for uniqueness on the server, making it difficult to reliably link them to specific questions or UI elements—especially when multiple files were involved in a single assessment.

### Solution
A `label` field was added to the `MediaFile` model in the database. This field stores the original field name (e.g., `audio_0`, `image_1`) from the upload form, which is also referenced in the question data (e.g., `audioFileName`).

- When uploading files, the frontend assigns a unique field name to each file input.
- The backend saves this field name as the `label` for each uploaded file.
- When rendering assessments, the frontend matches the question's `audioFileName` (or similar) to the `label` in `mediaFiles` to display the correct file.

### Benefits
- Supports multiple media files per assessment and per question.
- Prevents mismatches and errors when rendering or grading.
- Future-proofs the system for complex activities (e.g., drag-and-drop with multiple audio prompts).

### Developer Best Practices
- Always use unique and descriptive field names for file inputs in the frontend (e.g., `audio_0`, `audio_1`, `image_0`).
- When saving files, ensure the backend stores the field name as `label` in the database.
- When rendering, always match by `label`, not by file path or substring.
- Document any new media field conventions in both backend and frontend code for clarity.

## Lessons Learned

### Version 1 Challenges
1. **Deployment Issues**
   - Environment variable management
   - Database persistence
   - Build process optimization
   - Resource limitations

2. **Security Concerns**
   - Session handling
   - Input validation
   - Error messages
   - Access control

### Best Practices
1. **Code Organization**
   - Modular structure
   - Clear separation of concerns
   - Consistent naming conventions
   - Documentation standards

2. **Testing**
   - Unit testing strategy
   - Integration testing
   - End-to-end testing
   - Performance testing

## Future Considerations

### Scalability
1. **Performance Optimization**
   - Database indexing
   - Query optimization
   - Caching strategy
   - Load balancing

2. **Resource Management**
   - Memory usage
   - CPU utilization
   - Storage requirements
   - Network bandwidth

### Maintenance
1. **Monitoring**
   - Error tracking
   - Performance metrics
   - User analytics
   - Security alerts

2. **Updates**
   - Dependency management
   - Security patches
   - Feature updates
   - Documentation updates 


   ## [IMPORTANT] Assessment-Subject Mapping: Best Practices for Future Versions

**Recurring Issue:**  
When mapping or filtering assessments by subject, bugs often occur if the full section > part > unit > subjectId chain is not included in the Prisma query. This leads to incorrect progress, reporting, and filtering.

**Best Practice for Next Version:**
- **Always use a utility function** for fetching assessments by subject.
- The utility must include the full nested chain:  
  `section > part > unit > subjectId`
- **Always filter for attached assessments** (i.e., `resources.length > 0`) when calculating progress, reporting, or filtering for students/teachers.
- **Document this pattern** in the codebase and add tests or assertions to catch missing `subjectId` in assessment data.

**Why:**  
This prevents recurring bugs with progress and reporting endpoints, and ensures all subject/assessment mapping is always correct and maintainable.

---

*This note was generated as a persistent memory from the AI assistant to help future developers avoid known pitfalls in this codebase.*

## Assessment Bank / Staging (Planned for Version 2)

- Allow teachers to create assessments without requiring subject, unit, part, or section.
- Store these as “unattached” or “draft” assessments in an assessment bank.
- Provide a UI for teachers to browse, edit, and manage unattached assessments.
- Enable assignment of assessments to courses/subjects/sections at any time.
- Unattached assessments are not visible to students until assigned.
- This will support faster content creation, reusability, and better workflow for teachers.

### Assessment Editing & Assignment - Best Practices for v2

- Decouple assessment content (title, questions, media) from assignment (subject/unit/part/section).
- Allow assessments to exist in an “unassigned” state (draft/bank).
- Editing an assessment should always show and preserve all content, regardless of assignment.
- Assignment can be changed at any time, but should not affect the assessment’s content.
- UI should clearly separate “Content” and “Assignment” steps/tabs.
- Backend should allow nullable assignment fields and handle both attached and unattached assessments.

### Multiple Resources per Assessment (Planned for v2)

- Allow each assessment to have multiple resources (images, audio, PDFs, etc.).
- UI: “Resources” section with add, remove, reorder, and caption features.
- Data model: assessment.resources[] (one-to-many).
- API: Endpoints accept and return an array of resources per assessment.
- Display all resources in the order set by the teacher.

### Automated Course Structure Creation (Planned for v2)

- Allow teachers to quickly build the course structure by pasting or uploading the table of contents from a textbook.
- System parses the input and auto-creates units, parts, and sections in the correct hierarchy.
- Teacher can review and edit before saving.
- Supports manual paste, CSV/Excel upload, and (optionally) OCR from images.
- Greatly speeds up initial course setup and ensures alignment with published materials.

### Export/Print Course Structure (Planned for v2)

- Add an “Export” or “Print” button to the course structure page.
- Allow export as PDF, Word, or plain text.
- Export includes full hierarchy: units, parts, sections, and (optionally) descriptions.
- Output is formatted for easy printing and sharing with parents, teachers, or admins.
- Optionally, allow preview and customization before export.