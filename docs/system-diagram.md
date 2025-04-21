# System Relationship Diagrams

## Content Hierarchy
```
Subject (Let's Find Out Book 1)
├── Unit 1 (All About Me)
│   ├── Part 1 (Who Am I)
│   │   ├── Section 1 (Let's Read and Talk!)
│   │   │   └── Resources (documents, videos, etc.)
│   │   └── Section 2 (Let's Talk)
│   │       └── Resources
│   └── Part 2 (What is My Name?)
│       └── Sections...
├── Unit 2 (Lost and Found)
│   └── Parts...
└── Unit 3 (The Legend of the Lake Monster)
    └── Parts...
```

## Resource Organization
```
Unit 1 (All About Me)
└── Topic "Unit 1 All About Me"
    ├── Resource 1 (document)
    │   ├── Title
    │   ├── Description
    │   └── File/URL
    └── Resource 2 (video)
        ├── Title
        ├── Description
        └── URL
```

## Database Relationships
```
CoreSubject (English)
└── Subject (Let's Find Out Book 1)
    ├── Units
    │   ├── Parts
    │   │   └── Sections
    │   │       └── Resources
    │   └── Topic (matches Unit name)
    │       └── Resources
    └── Teachers
```

## Resource Flow
```
Teacher Upload
    │
    ▼
Select Unit/Part/Section
    │
    ▼
Create/Find Topic
    │
    ▼
Store Resource
    │
    ▼
Display in:
├── Student Dashboard (by Unit structure)
└── Learning Interface (by Topic)
```

This visualization helps understand:
- How content is organized hierarchically
- How resources are associated with both Topics and Units
- The flow of resource creation and display
- The relationships between different components 