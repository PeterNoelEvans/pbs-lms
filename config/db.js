const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const bcrypt = require('bcrypt');

// Database file path
const dbPath = path.join(__dirname, '../data/teacher_resources.db');

// Create database connection
const db = new sqlite3.Database(dbPath, (err) => {
    if (err) {
        console.error('Error connecting to database:', err);
    } else {
        console.log('Connected to the SQLite database');
        initializeDatabase();
    }
});

// Initialize database tables
function initializeDatabase() {
    return new Promise((resolve, reject) => {
        db.serialize(() => {
            // Users table
            db.run(`CREATE TABLE IF NOT EXISTS users (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                username TEXT UNIQUE NOT NULL,
                password TEXT NOT NULL,
                role TEXT NOT NULL CHECK(role IN ('admin', 'teacher', 'parent')),
                email TEXT,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                last_login DATETIME
            )`);

            // Students table
            db.run(`CREATE TABLE IF NOT EXISTS students (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL,
                nickname TEXT UNIQUE,  -- For integration with English Assessment Platform
                parent_id INTEGER,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (parent_id) REFERENCES users(id)
            )`);

            // Subjects table
            db.run(`CREATE TABLE IF NOT EXISTS subjects (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL,
                description TEXT,
                year INTEGER NOT NULL,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )`);

            // Topics table
            db.run(`CREATE TABLE IF NOT EXISTS topics (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                subject_id INTEGER NOT NULL,
                name TEXT NOT NULL,
                description TEXT,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (subject_id) REFERENCES subjects(id)
            )`);

            // Subtopics table
            db.run(`CREATE TABLE IF NOT EXISTS subtopics (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                topic_id INTEGER NOT NULL,
                name TEXT NOT NULL,
                description TEXT,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (topic_id) REFERENCES topics(id)
            )`);

            // Weekly Schedule table
            db.run(`CREATE TABLE IF NOT EXISTS weekly_schedule (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                subject_id INTEGER NOT NULL,
                week_number INTEGER NOT NULL,
                term INTEGER NOT NULL,
                academic_year TEXT NOT NULL,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (subject_id) REFERENCES subjects(id)
            )`);

            // Weekly Topics table
            db.run(`CREATE TABLE IF NOT EXISTS weekly_topics (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                schedule_id INTEGER NOT NULL,
                topic_id INTEGER,
                subtopic_id INTEGER,
                notes TEXT,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (schedule_id) REFERENCES weekly_schedule(id),
                FOREIGN KEY (topic_id) REFERENCES topics(id),
                FOREIGN KEY (subtopic_id) REFERENCES subtopics(id)
            )`);

            // Resources table
            db.run(`CREATE TABLE IF NOT EXISTS resources (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                subtopic_id INTEGER NOT NULL,
                name TEXT NOT NULL,
                description TEXT,
                file_path TEXT NOT NULL,
                file_type TEXT NOT NULL,
                resource_type TEXT NOT NULL CHECK(resource_type IN ('student', 'parent', 'teacher')),
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (subtopic_id) REFERENCES subtopics(id)
            )`);

            // Question Sets table (for integration with English Assessment Platform)
            db.run(`CREATE TABLE IF NOT EXISTS question_sets (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                subject_id INTEGER NOT NULL,  -- Link to specific subject
                subtopic_id INTEGER NOT NULL,
                name TEXT NOT NULL,
                description TEXT,
                total_questions INTEGER NOT NULL,
                time_limit INTEGER,  -- in minutes
                passing_score INTEGER,
                difficulty_level TEXT CHECK(difficulty_level IN ('easy', 'medium', 'hard')),
                question_format TEXT CHECK(question_format IN ('multiple_choice', 'true_false', 'short_answer', 'essay', 'matching', 'fill_in_blank')),
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (subject_id) REFERENCES subjects(id),
                FOREIGN KEY (subtopic_id) REFERENCES subtopics(id)
            )`);

            // Questions table
            db.run(`CREATE TABLE IF NOT EXISTS questions (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                question_set_id INTEGER NOT NULL,
                question_text TEXT NOT NULL,
                question_type TEXT NOT NULL CHECK(question_type IN ('multiple_choice', 'true_false', 'short_answer', 'essay', 'matching', 'fill_in_blank')),
                options TEXT,  -- JSON string for multiple choice options
                correct_answer TEXT NOT NULL,
                explanation TEXT,  -- Explanation of the correct answer
                points INTEGER DEFAULT 1,
                difficulty_level TEXT CHECK(difficulty_level IN ('easy', 'medium', 'hard')),
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (question_set_id) REFERENCES question_sets(id)
            )`);

            // Assessments table
            db.run(`CREATE TABLE IF NOT EXISTS assessments (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                subtopic_id INTEGER NOT NULL,
                name TEXT NOT NULL,
                description TEXT,
                assessment_type TEXT NOT NULL CHECK(assessment_type IN ('quiz', 'test', 'project', 'homework')),
                total_marks INTEGER NOT NULL,
                question_set_id INTEGER,  -- Link to question sets for quizzes
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (subtopic_id) REFERENCES subtopics(id),
                FOREIGN KEY (question_set_id) REFERENCES question_sets(id)
            )`);

            // Student Results table
            db.run(`CREATE TABLE IF NOT EXISTS student_results (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                student_id INTEGER NOT NULL,
                assessment_id INTEGER NOT NULL,
                question_set_id INTEGER NOT NULL,
                marks_obtained INTEGER NOT NULL,
                total_marks INTEGER NOT NULL,
                percentage_score REAL NOT NULL,
                time_taken INTEGER,  -- in seconds
                feedback TEXT,
                date_taken DATETIME DEFAULT CURRENT_TIMESTAMP,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (student_id) REFERENCES students(id),
                FOREIGN KEY (assessment_id) REFERENCES assessments(id),
                FOREIGN KEY (question_set_id) REFERENCES question_sets(id)
            )`);

            // Student Answers table (for detailed quiz results)
            db.run(`CREATE TABLE IF NOT EXISTS student_answers (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                student_id INTEGER NOT NULL,
                question_id INTEGER NOT NULL,
                answer TEXT NOT NULL,
                is_correct BOOLEAN NOT NULL,
                time_taken INTEGER,  -- in seconds
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (student_id) REFERENCES students(id),
                FOREIGN KEY (question_id) REFERENCES questions(id)
            )`);

            // Progress Tracking table
            db.run(`CREATE TABLE IF NOT EXISTS progress_tracking (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                student_id INTEGER NOT NULL,
                subject_id INTEGER NOT NULL,
                subtopic_id INTEGER NOT NULL,
                status TEXT NOT NULL CHECK(status IN ('not_started', 'in_progress', 'completed')),
                last_assessment_score REAL,
                last_assessment_date DATETIME,
                total_attempts INTEGER DEFAULT 0,
                average_score REAL,
                last_updated DATETIME DEFAULT CURRENT_TIMESTAMP,
                notes TEXT,
                FOREIGN KEY (student_id) REFERENCES students(id),
                FOREIGN KEY (subject_id) REFERENCES subjects(id),
                FOREIGN KEY (subtopic_id) REFERENCES subtopics(id)
            )`);

            // Parent Access Logs table
            db.run(`CREATE TABLE IF NOT EXISTS parent_access_logs (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                parent_id INTEGER NOT NULL,
                resource_id INTEGER,
                assessment_id INTEGER,
                access_time DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (parent_id) REFERENCES users(id),
                FOREIGN KEY (resource_id) REFERENCES resources(id),
                FOREIGN KEY (assessment_id) REFERENCES assessments(id)
            )`);

            // Create default admin user if not exists
            db.get("SELECT * FROM users WHERE username = 'admin'", (err, row) => {
                if (!row) {
                    const hashedPassword = bcrypt.hashSync('admin123', 10);
                    db.run("INSERT INTO users (username, password, role) VALUES (?, ?, ?)",
                        ['admin', hashedPassword, 'admin']);
                }
            });

            resolve();
        });
    });
}

module.exports = {
    db,
    initializeDatabase
}; 