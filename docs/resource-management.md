# Resource Management System

## Course Structure Overview

### Visible Structure (User Interface)
The system presents a clear hierarchical structure to users:

1. **Unit** (e.g., "Unit 1: All About Me")
2. **Part** (e.g., "Part 1: Who Am I")
3. **Section** (e.g., "Let's Read and Talk!")

### Database Structure
Behind the scenes, the system uses a more complex structure to manage resources and track progress:

```
Unit
├── Parts
│   └── Sections
└── Topic (internal)
    ├── Resources
    ├── Progress Tracking
    └── Assessments
```

## The Topic Model

### Purpose
The Topic model serves as an internal mechanism that:
- Groups related resources together
- Tracks student progress
- Links assessments to specific content
- Provides a bridge between the UI structure and backend features

### How It Works
When resources are added to a section, the system:
1. Creates or finds a Topic with the name format: `${unit.name} - ${part.name} - ${section.name}`
2. Attaches the resource to this Topic
3. Uses the Topic for tracking student progress on this content

### Benefits of This Architecture
1. **Flexible Resource Management**
   - Resources can be organized hierarchically
   - Multiple resources can be grouped logically
   - Easy to track usage and progress

2. **Simplified Progress Tracking**
   - Topics provide a natural unit for tracking completion
   - Progress can be aggregated at different levels
   - Assessments can be linked to specific content areas

3. **Clean Separation of Concerns**
   - UI structure (Units/Parts/Sections) focuses on content organization
   - Topics handle the technical aspects of resource management
   - Students and teachers can focus on the content without worrying about the backend structure

## Implementation Details

### Database Schema
The system uses the following models:
- `Unit`: Represents a major content unit
- `Part`: Subdivisions within a unit
- `Section`: Specific content areas within parts
- `Topic`: Internal model for resource management
- `Resource`: Actual learning materials (files, links, etc.)

### Resource Creation Process
1. Teacher selects a location in the Unit-Part-Section hierarchy
2. Uploads or links a resource
3. System automatically:
   - Creates/finds appropriate Topic
   - Links resource to the Topic
   - Updates necessary relationships

### Progress Tracking
- Progress is tracked at the Topic level
- System automatically aggregates progress up the hierarchy
- Teachers see progress in the familiar Unit-Part-Section structure

## Best Practices

1. **Resource Organization**
   - Add resources at the most specific applicable level
   - Use consistent naming for Units, Parts, and Sections
   - Let the system handle Topic management automatically

2. **Content Management**
   - Focus on the logical organization of content
   - Use the Unit-Part-Section structure for content hierarchy
   - Don't worry about the underlying Topic structure

3. **Progress Monitoring**
   - Monitor progress through the standard interface
   - Use the provided progress tracking tools
   - Remember that all progress data is organized by Topics internally

## Technical Implementation & Debugging

### Key Files
- `server.js`: Contains resource management endpoints and Topic creation logic
- `prisma/schema.prisma`: Defines the database schema including Topic and Resource models
- `public/teacher/resources.html`: Frontend interface for resource management
- `public/student/resources.html`: Student view of resources

### Important Endpoints
1. **Resource Creation**
   ```javascript
   POST /api/resources
   // Required fields:
   {
     title: string,
     description: string,
     type: 'document' | 'video' | 'audio' | 'link' | 'image',
     subjectId: string,
     unitId: string,
     partId?: string,
     sectionId?: string,
     file?: File | null,
     url?: string | null
   }
   ```

2. **Resource Retrieval**
   ```javascript
   GET /api/subjects/:subjectId/resources
   GET /api/topics/:topicId/resources
   ```

### Common Issues & Solutions

1. **Missing Resources**
   - Check if Topic was created successfully
   - Verify resource-to-Topic linking
   - Ensure proper file upload configuration

2. **File Upload Issues**
   - Verify uploads directory exists: `uploads/resources`
   - Check file permissions
   - Confirm proper Multer configuration

3. **Progress Tracking Problems**
   - Verify Topic exists for the content
   - Check student enrollment status
   - Ensure proper progress record creation

### Debugging Steps

1. **Resource Creation**
   ```javascript
   // Check Topic creation/retrieval
   const topic = await prisma.topic.findFirst({
     where: { name: unit.name, subjectId }
   });
   console.log('Topic:', topic);

   // Verify resource creation
   const resource = await prisma.resource.create({
     data: { ... }
   });
   console.log('Resource:', resource);
   ```

2. **Resource Retrieval**
   ```javascript
   // Debug subject resources query
   const subject = await prisma.subject.findUnique({
     where: { id: subjectId },
     include: {
       units: { include: { parts: { include: { sections: true } } } },
       topics: { include: { resources: true } }
     }
   });
   console.log('Subject with resources:', subject);
   ```

### Database Maintenance

1. **Check Resource Status**
   ```sql
   SELECT r.*, t.name as topic_name 
   FROM Resource r 
   JOIN Topic t ON r.topicId = t.id;
   ```

2. **Verify Topic Relationships**
   ```sql
   SELECT t.*, s.name as subject_name 
   FROM Topic t 
   JOIN Subject s ON t.subjectId = s.id;
   ```

3. **Clean Up Orphaned Records**
   ```sql
   -- Find resources without topics
   SELECT * FROM Resource WHERE topicId IS NULL;
   
   -- Find topics without resources
   SELECT * FROM Topic t 
   LEFT JOIN Resource r ON t.id = r.topicId 
   WHERE r.id IS NULL;
   ``` 