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