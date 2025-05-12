# Database Documentation

## Overview
The database manages users, subjects, topics, resources, weekly planning, assessments, and student progress across multiple subjects. It supports a comprehensive educational resource system with assessment capabilities for all subjects.

## Tables

### Users
- **Purpose**: Stores user information for admin, teachers, and parents
- **Fields**:
  - `id`: Unique identifier
  - `username`: Unique username
  - `password`: Hashed password
  - `role`: User role (admin, teacher, parent)
  - `email`: Contact email
  - `created_at`: Account creation timestamp
  - `last_login`: Last login timestamp

### Students
- **Purpose**: Stores student information and links to parents
- **Fields**:
  - `id`: Unique identifier
  - `name`: Student's full name
  - `nickname`: Unique nickname (for assessment platform integration)
  - `parent_id`: Reference to parent user
  - `created_at`: Record creation timestamp

### Subjects
- **Purpose**: Stores subject information
- **Fields**:
  - `id`: Unique identifier
  - `name`: Subject name
  - `description`: Subject description
  - `year`: Academic year
  - `created_at`: Record creation timestamp
  - `updated_at`: Last update timestamp

### Topics and Subtopics
- **Purpose**: Organizes subject content hierarchically
- **Fields**:
  - `id`: Unique identifier
  - `subject_id`/`topic_id`: Parent reference
  - `name`: Topic/subtopic name
  - `description`: Detailed description
  - `created_at`: Record creation timestamp
  - `updated_at`: Last update timestamp

### Weekly Schedule
- **Purpose**: Tracks weekly curriculum planning
- **Fields**:
  - `id`: Unique identifier
  - `subject_id`: Reference to subject
  - `week_number`: Week number in term
  - `term`: Academic term
  - `academic_year`: Academic year
  - `created_at`: Record creation timestamp
  - `updated_at`: Last update timestamp

### Question Sets
- **Purpose**: Organizes questions for assessments
- **Fields**:
  - `id`: Unique identifier
  - `subject_id`: Reference to subject
  - `subtopic_id`: Reference to subtopic
  - `name`: Question set name
  - `description`: Set description
  - `total_questions`: Number of questions
  - `time_limit`: Time limit in minutes
  - `passing_score`: Required passing score
  - `difficulty_level`: Easy, medium, or hard
  - `question_format`: Type of questions included
  - `created_at`: Record creation timestamp
  - `updated_at`: Last update timestamp

### Questions
- **Purpose**: Stores individual assessment questions
- **Fields**:
  - `id`: Unique identifier
  - `question_set_id`: Reference to question set
  - `question_text`: Question content
  - `question_type`: Type of question
  - `options`: JSON string of options (for multiple choice)
  - `correct_answer`: Correct answer
  - `explanation`: Explanation of correct answer
  - `points`: Question point value
  - `difficulty_level`: Question difficulty
  - `created_at`: Record creation timestamp
  - `updated_at`: Last update timestamp

### Student Results
- **Purpose**: Tracks student assessment performance
- **Fields**:
  - `id`: Unique identifier
  - `student_id`: Reference to student
  - `assessment_id`: Reference to assessment
  - `question_set_id`: Reference to question set
  - `marks_obtained`: Score achieved
  - `total_marks`: Total possible marks
  - `percentage_score`: Score percentage
  - `time_taken`: Time taken in seconds
  - `feedback`: Teacher feedback
  - `date_taken`: Assessment date
  - `created_at`: Record creation timestamp

### Progress Tracking
- **Purpose**: Monitors student progress across subjects
- **Fields**:
  - `id`: Unique identifier
  - `student_id`: Reference to student
  - `subject_id`: Reference to subject
  - `subtopic_id`: Reference to subtopic
  - `status`: Progress status
  - `last_assessment_score`: Most recent score
  - `last_assessment_date`: Date of last assessment
  - `total_attempts`: Number of attempts
  - `average_score`: Average performance
  - `last_updated`: Last update timestamp
  - `notes`: Additional notes

### Media Files
- **Purpose**: Stores uploaded media files (audio, image, video) associated with assessments.
- **Fields**:
  - `id`: Unique identifier
  - `type`: Media type (e.g., 'audio', 'video', 'image')
  - `url`: For externally hosted media (optional)
  - `filePath`: Path to the uploaded file on the server
  - `duration`: Duration in seconds (for audio/video)
  - `label`: Original field name or label (e.g., 'audio_0', 'image_1') used to link the file to a specific question or UI element
  - `assessmentId`: Reference to the associated assessment
  - `createdAt`: Record creation timestamp
  - `updatedAt`: Last update timestamp

**Usage Notes:**
- The `label` field is critical for linking each uploaded file to the correct question or UI element in an assessment.
- When creating or editing an assessment, each file input (audio, image, etc.) should have a unique field name (e.g., 'audio_0', 'audio_1', 'image_0').
- The frontend stores this field name in the question data (e.g., `audioFileName`), and the backend saves it as the `label` in the MediaFile record.
- When rendering assessments, the frontend matches the question's `audioFileName` (or similar) to the `label` in `mediaFiles` to display the correct file.
- This approach supports multiple media files per assessment and per question, and is robust for complex activities (e.g., drag-and-drop with multiple audio prompts).

## Relationships
- Users (parents) → Students (one-to-many)
- Subjects → Topics (one-to-many)
- Topics → Subtopics (one-to-many)
- Subjects → Question Sets (one-to-many)
- Question Sets → Questions (one-to-many)
- Students → Results (one-to-many)
- Students → Progress Tracking (one-to-many)

## Security Features
- Password hashing for user authentication
- Role-based access control
- Foreign key constraints for data integrity
- Timestamp tracking for auditing

## Assessment System Features
- Support for multiple question types
- Difficulty level tracking
- Detailed performance analytics
- Progress monitoring across subjects
- Parent access to results
- Time tracking for assessments
- Comprehensive feedback system

## Resource-Assessment Linking

- The `Resource` model now has an `assessments` field (many-to-many with `Assessment`).
- The `Assessment` model has a `resources` field (many-to-many with `Resource`).
- This allows any resource to be linked to multiple assessments (quizzes or assignments), and vice versa.
- Students can access all related assessments directly from the resource view in the UI.

## Maintenance
- Regular backups required
- Database file included in backup routines
- Access logs should be periodically archived
- Database should be vacuumed periodically
- Regular integrity checks recommended 