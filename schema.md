I'll help design a schema that would prevent these inconsistencies. Looking at the current issues and the codebase, here's a better schema design:

1. First, let's define the core entities and their relationships:

```sql
-- Schools table - Base configuration for schools
CREATE TABLE schools (
    id TEXT PRIMARY KEY,           -- e.g., 'PBSChonburi'
    name TEXT NOT NULL,            -- e.g., 'Prabhassorn Vidhaya School Chonburi'
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Classes table - All classes across all schools
CREATE TABLE classes (
    id TEXT PRIMARY KEY,           -- e.g., 'M2-001', 'P4-1'
    school_id TEXT NOT NULL,       -- References schools.id
    name TEXT NOT NULL,            -- e.g., 'M2 2025', 'Class 4/1'
    display_name TEXT NOT NULL,    -- e.g., 'M2 2025', 'Class 4/1'
    description TEXT,
    academic_year TEXT NOT NULL,   -- e.g., '2025'
    portfolio_base_path TEXT NOT NULL,  -- e.g., '/portfolios/M2-001'
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (school_id) REFERENCES schools(id),
    UNIQUE (school_id, academic_year, id)
);

-- Users table - All users including students
CREATE TABLE users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    password TEXT NOT NULL,
    email TEXT UNIQUE,
    first_name TEXT,
    last_name TEXT,
    nickname TEXT,
    is_super_user BOOLEAN DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Student profiles - Links users to classes and contains student-specific info
CREATE TABLE student_profiles (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    class_id TEXT NOT NULL,
    portfolio_path TEXT NOT NULL,  -- Full path: /portfolios/M2-001/Peter/Peter.html
    avatar_path TEXT,             -- Path to avatar image
    is_public BOOLEAN DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id),
    FOREIGN KEY (class_id) REFERENCES classes(id),
    UNIQUE (user_id, class_id)
);

-- Public visitors table
CREATE TABLE public_visitors (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    full_name TEXT NOT NULL,
    email TEXT UNIQUE NOT NULL,
    password TEXT NOT NULL,
    reason TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Visitor access logs
CREATE TABLE visitor_access_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    visitor_id INTEGER NOT NULL,
    accessed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (visitor_id) REFERENCES public_visitors(id)
);
```

2. Add triggers to maintain data consistency:

```sql
-- Update timestamps on schools
CREATE TRIGGER update_schools_timestamp 
AFTER UPDATE ON schools
BEGIN
    UPDATE schools SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
END;

-- Update timestamps on classes
CREATE TRIGGER update_classes_timestamp 
AFTER UPDATE ON classes
BEGIN
    UPDATE classes SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
END;

-- Automatically generate portfolio paths
CREATE TRIGGER generate_portfolio_path
BEFORE INSERT ON student_profiles
BEGIN
    SELECT CASE
        WHEN NEW.portfolio_path IS NULL THEN
            -- Get class portfolio base path and construct full path
            SELECT NEW.portfolio_path = c.portfolio_base_path || '/' || 
                   (SELECT username FROM users WHERE id = NEW.user_id) || '/' ||
                   (SELECT username FROM users WHERE id = NEW.user_id) || '.html'
            FROM classes c WHERE c.id = NEW.class_id;
    END;
END;
```

3. Add indexes for performance:

```sql
-- Indexes for common queries
CREATE INDEX idx_student_profiles_class ON student_profiles(class_id);
CREATE INDEX idx_student_profiles_user ON student_profiles(user_id);
CREATE INDEX idx_classes_school ON classes(school_id);
CREATE INDEX idx_users_username ON users(username);
```

4. Example data insertion:

```sql
-- Insert a school
INSERT INTO schools (id, name) VALUES 
('PBSChonburi', 'Prabhassorn Vidhaya School Chonburi');

-- Insert a class
INSERT INTO classes (id, school_id, name, display_name, academic_year, portfolio_base_path) VALUES 
('M2-001', 'PBSChonburi', 'M2 2025', 'M2 2025', '2025', '/portfolios/M2-001');

-- Insert a user
INSERT INTO users (username, password, first_name, last_name) VALUES 
('Peter', '$2a$10$...', 'Peter', 'Smith');

-- Insert student profile
INSERT INTO student_profiles (user_id, class_id) VALUES 
(1, 'M2-001');
```

Benefits of this schema:

1. **Separation of Concerns**: 
   - User authentication data is separate from student profile data
   - Class configuration is separate from student data
   - School configuration is separate from class data

2. **Consistent Paths**:
   - Portfolio paths are generated automatically based on class configuration
   - No manual path construction in code
   - Single source of truth for path formats

3. **Better Data Integrity**:
   - Foreign key constraints ensure data consistency
   - Unique constraints prevent duplicates
   - Triggers maintain data consistency

4. **Easier Queries**:
   - Can easily find all students in a class
   - Can easily find all classes in a school
   - Can track changes with timestamps

5. **Flexibility**:
   - Can add new schools without code changes
   - Can add new classes without code changes
   - Can move students between classes

6. **Better Security**:
   - Authentication data is separate from profile data
   - Can easily implement role-based access control
   - Can track access patterns

To implement this:

1. Create a migration script to move from current schema
2. Update API endpoints to use new schema
3. Update frontend to work with new data structure
4. Add data validation middleware
5. Add proper error handling for constraints

Would you like me to create any of these implementation pieces?
