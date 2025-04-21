# Learning Resource Hub - System Structure

## Overview

The Learning Resource Hub is organized in a hierarchical structure that manages educational content. This document explains how different components relate to each other and how resources are organized.

## Core Components

### 1. Subjects
- Base unit of course organization (e.g., "Let's Find Out Book 1")
- Contains multiple units
- Associated with:
  - Core Subject (e.g., "English")
  - Year Level (e.g., M1/Year 7)
  - Description
  - Teachers

### 2. Units
- Major divisions within a subject (e.g., "Unit 1 All About Me")
- Contains multiple parts
- Properties:
  - Name
  - Description
  - Order
  - Associated Subject

### 3. Parts
- Subdivisions of units (e.g., "Part 1 Who Am I")
- Contains multiple sections
- Properties:
  - Name
  - Description
  - Order
  - Associated Unit

### 4. Sections
- Smallest organizational unit (e.g., "Let's Read and Talk!")
- Contains actual learning content
- Properties:
  - Name
  - Description
  - Order
  - Associated Part

### 5. Topics
- Used to organize resources
- Mapped to Units for resource organization
- Properties:
  - Name (matches Unit name)
  - Description
  - Order
  - Associated Subject
  - Resources

### 6. Resources
- Actual learning materials
- Types: document, video, audio, link
- Properties:
  - Title
  - Description
  - Type
  - URL/File Path
  - Associated Topic
  - Created By (Teacher)

## Resource Organization

### How Resources are Stored
1. When a teacher adds a resource:
   - The system finds or creates a Topic matching the Unit name
   - The resource is associated with this Topic
   - The resource maintains a reference to its Unit

### How Resources are Displayed
1. In the Student Dashboard:
   - Resources are grouped by Unit
   - Within each Unit, they're organized by Parts and Sections
   - This creates a clear, hierarchical navigation structure

2. In the Learning Interface:
   - Resources specific to the current Topic (Unit) are displayed
   - Assessment activities related to the Topic are shown

## API Endpoints

### Resource Management
- `GET /api/subjects/:subjectId/resources`
  - Returns all resources for a subject
  - Organized by unit structure
  - Includes creator information

- `POST /api/resources`
  - Creates a new resource
  - Associates it with the appropriate Topic/Unit
  - Handles file uploads if necessary

- `GET /api/topics/:topicId/resources`
  - Returns resources for a specific Topic
  - Used in the learning interface

### Structure Management
- `GET /api/subjects/:subjectId/structure`
  - Returns complete subject structure
  - Includes units, parts, and sections

## Common Operations

### Adding a Resource
1. Teacher selects a subject
2. Chooses a unit, part, and section
3. Uploads or links the resource
4. System:
   - Creates/finds Topic matching the Unit
   - Associates resource with Topic
   - Maintains unit/part/section organization

### Viewing Resources
1. Student accesses their enrolled subject
2. System:
   - Loads subject structure
   - Retrieves resources
   - Organizes them by unit/part/section
   - Displays in hierarchical view

## Notes

- Topics serve as a bridge between Units and Resources
- This structure allows for:
  - Flexible resource organization
  - Clear navigation hierarchy
  - Efficient resource retrieval
  - Proper content organization 