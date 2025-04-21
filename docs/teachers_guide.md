# Teacher's Resource Platform Guide

## Welcome to the Teacher Resource Platform

This guide will help you understand how to use our collaborative teaching resource platform effectively. Our platform is designed to foster collaboration and resource sharing among teachers while maintaining clear attribution and organization.

## Our Educational Philosophy: The Thinking Schools Approach

Our platform is built on the principles of the Thinking Schools approach, which emphasizes developing students' cognitive capabilities and intelligent learning behaviors. As defined by Professor Bob Burden (2006):

> "A Thinking School is an educational community in which all members share a common commitment to giving regular careful thought to everything that takes place. This will involve both students and staff learning how to think reflectively, critically and creatively, and to employing these skills and techniques in the co-construction of a meaningful curriculum and associated activities."

### Core Principles We Follow

1. **Explicit Thinking Skills**
   - Teaching fundamental cognitive processes
   - Using common language for thinking
   - Building better understanding through explicit cognitive strategies

2. **Tools and Strategies**
   - Visual mapping techniques
   - Graphic organizers
   - Conceptual mapping tools

3. **Intelligent Learning Behaviors**
   - Developing thinking dispositions
   - Fostering emotional intelligence
   - Encouraging self-managed learning

4. **Knowledge-Based Thinking**
   - Understanding memory and recall
   - Integrating curriculum requirements with thinking development
   - Building strong foundational knowledge

5. **Reflective Questioning**
   - Implementing high-quality questioning techniques
   - Encouraging metacognition
   - Developing critical reflection skills

6. **Collaborative Learning**
   - Promoting interdependent thinking
   - Facilitating cooperative learning
   - Building learning communities

7. **Supportive Learning Environment**
   - Organizing resources for student independence
   - Creating spaces conducive to thinking
   - Supporting social and emotional aspects of learning

These principles are integrated throughout our platform's features and tools, supporting teachers in creating an environment where thinking and learning flourish together.

## Getting Started

### 1. Registration and Login
- Register using your school email address
- Required information:
  - Full Name
  - Nickname (for easy identification)
  - Email (school email preferred)
  - Password (minimum 8 characters, must include letters and numbers)
- Select "Teacher" as your role

### 2. Understanding the Platform Structure

don't forget the use of npx prisma studio

#### Core Subjects
- Standard subjects (e.g., English, Science, Mathematics)
- Shared across all teachers
- Form the foundation of our resource organization

#### Your Teaching Subjects
- When you start teaching a subject, you'll be linked to the corresponding core subject
- You can access all resources created by other teachers for this subject
- Your contributions will be automatically shared with other teachers

#### Topics and Resources
- Each subject is organized into topics
- Topics contain various types of resources:
  - Documents
  - Videos
  - Links
  - Assessments (quizzes and assignments)

The hierarchy we have in the database:
1. CoreSubject: This is indeed the base subject category (like "English" or "Mathematics"). You were right - it's the raw/general subject area.

2. Subject: This represents a specific course/book implementation of a CoreSubject. For example, under the CoreSubject "English", you might have subjects like:
   "English - Let's Find Out M1"
   "English - Grammar Essentials P6"
   "English - Creative Writing M2"

3. Unit/Topic: Currently, we have both in the schema, which might be causing confusion. Based on your explanation, we should probably consolidate these since they represent the same level - main topics/units from the book.

4. Part: Subdivisions of a Unit (especially relevant for "Let's Find Out" structure)

5. Section: The smallest teaching unit, contained within Parts

## Course Structure Formatting Guide

### Text Formatting in Units and Parts

When creating or editing units and parts in the course structure, you can use special formatting to organize your content effectively:

#### 1. Automatic Numbering
- Lines without special formatting will be automatically numbered
- Example:
  ```
  This line will be numbered as 1
  This line will be numbered as 2
  This line will be numbered as 3
  ```

#### 2. Subtitles and Headers
You can create subtitles in two ways:
1. **Using Colons**: Any line ending with a colon will be treated as a subtitle
   ```
   Access to Information:
   This will be numbered as 1
   This will be numbered as 2
   ```

2. **Using ALL CAPS**: Lines in all capital letters will be treated as subtitles
   ```
   LITERATURE & CULTURE
   This will be numbered as 1
   This will be numbered as 2
   ```

#### 3. Manual Numbering
- If you prefer to use your own numbers, start the line with a number and period
- The system will preserve your manual numbering
- Example:
  ```
  1. My first point
  2. My second point
  3. My third point
  ```

#### 4. Resetting Numbers
- Numbers automatically reset after each subtitle
- This allows you to create separate numbered lists under different sections
- Example:
  ```
  Access to Information:
  1. First point about information
  2. Second point about information

  GRAMMAR:
  1. First point about grammar
  2. Second point about grammar
  ```

#### Tips for Formatting
1. Use subtitles to organize related content
2. Keep formatting consistent within each unit
3. Use manual numbering when you need specific number sequences
4. Use ALL CAPS subtitles for major sections
5. Use colon-ended subtitles for subsections

## Creating and Sharing Resources

### 1. Adding New Resources
- Select your subject and topic
- Click "Add Resource"
- Choose the resource type
- Upload or create your content
- Add a description to help others understand the resource
- Your name will be automatically attached as the creator

### 2. Resource Sharing Policy
- All resources created on the platform are school resources
- Resources are automatically shared with all teachers
- Creator attribution is always maintained
- No need to manually share or set permissions

### 3. Types of Resources You Can Create
- **Documents**: Lesson plans, worksheets, handouts
- **Videos**: Recorded lessons, demonstrations
- **Links**: External educational resources
- **Assessments**:
  - Quizzes (multiple choice questions)
  - Assignments (with descriptions and due dates)

### 4. Resource Usage Tracking
- Each resource has a usage counter showing how many times it's been used
- You can see which teachers have used your resources
- Usage statistics help identify popular and effective resources
- Top contributors are recognized based on resource usage
- Usage tracking helps in:
  - Identifying valuable resources
  - Understanding what works well
  - Recognizing teacher contributions
  - Improving resource quality

## Finding and Using Resources

### 1. Browsing Resources
- Navigate through subjects and topics
- Use the search function to find specific resources
- Filter by:
  - Resource type
  - Creation date
  - Topic
  - Creator

### 2. Using Existing Resources
- You can freely use any resource in the system
- Original creator's name will always be displayed
- Feel free to:
  - Use resources as-is
  - Modify them for your needs
  - Build upon existing materials

### 3. Best Practices
- Always review resources before using them
- Consider adding your own notes or modifications
- Provide feedback to resource creators
- Keep resources up-to-date

## Collaboration Features

### 1. Resource Building
- Build upon existing resources
- Create topic sequences
- Develop assessment collections

### 2. Teacher Transitions
- When taking over a subject:
  - Access all previous resources
  - See the teaching history
  - Continue building on existing work

### 3. Cross-Subject Collaboration
- Browse resources across different subjects
- Adapt resources for cross-curricular teaching
- Share teaching strategies

## Tips for Effective Use

1. **Regular Updates**
   - Keep your resources current
   - Add new materials as you create them
   - Update existing resources with improvements

2. **Organization**
   - Use clear, descriptive titles
   - Add detailed descriptions
   - Maintain consistent topic organization

3. **Quality Standards**
   - Ensure accuracy of content
   - Follow school curriculum guidelines
   - Consider student accessibility

## Support and Feedback

- For technical issues, contact IT support
- Share suggestions for platform improvements
- Collaborate with other teachers to enhance resources

## Remember

- All resources are shared for the benefit of our school community
- Your contributions help build a valuable teaching resource library
- Collaboration improves the quality of education for all students

## Technical Documentation

### Database Structure

#### Core Models

1. **Users and Authentication**
   - User profiles for teachers and students
   - Secure password hashing and JWT authentication
   - Role-based access control

2. **Core Subjects**
   - Standard subjects (English, Science, etc.)
   - Shared across all teachers
   - Year level organization

3. **Teacher's Subjects**
   - Teacher-specific implementations of core subjects
   - Links to shared resources
   - Custom organization options

4. **Topics and Resources**
   - Hierarchical organization of content
   - Multiple resource types (documents, videos, links)
   - Assessment integration

#### Resource Management

1. **Resource Types**
   - Documents: Lesson plans, worksheets, handouts
   - Videos: Recorded lessons, demonstrations
   - Links: External educational resources
   - Assessments: Quizzes and assignments

2. **Resource Metadata**
   - Title and description
   - Creation and modification dates
   - Creator attribution
   - Usage statistics

3. **Assessment Structure**
   - Multiple choice questions
   - Assignment descriptions
   - Due dates and time limits
   - Student response tracking

### Data Flow

1. **Resource Creation**
   ```
   Teacher -> Core Subject -> Topic -> Resource
   ```

2. **Resource Sharing**
   ```
   Creator Teacher -> Shared Resource Pool -> Other Teachers
   ```

3. **Assessment Flow**
   ```
   Teacher Creates Quiz -> Students Take Quiz -> Results Stored -> Analytics Generated
   ```

### System Architecture

1. **Frontend**
   - Bootstrap-based responsive design
   - Dynamic content loading
   - Real-time updates

2. **Backend**
   - Express.js server
   - Prisma ORM for database operations
   - JWT authentication
   - File handling system

3. **Database**
   - SQLite for development
   - Structured for efficient resource sharing
   - Maintains data relationships

### Security Features

1. **Authentication**
   - Secure password hashing
   - JWT token-based sessions
   - Role-based access control

2. **Data Protection**
   - Resource attribution
   - Audit trails
   - Backup systems

---

This guide will be updated regularly with new features and best practices. Your feedback and suggestions are welcome to help improve the platform. 