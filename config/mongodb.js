require('dotenv').config();
const mongoose = require('mongoose');

const mongodbUri = process.env.MONGODB_URI || 'mongodb://localhost:27017/teacher_resources';

// Connection options
const options = {
    useNewUrlParser: true,
    useUnifiedTopology: true,
    serverSelectionTimeoutMS: 5000,
    socketTimeoutMS: 45000,
    family: 4
};

// Connection event handlers
mongoose.connection.on('connected', () => {
    console.log('MongoDB connected successfully');
    console.log('Database:', mongoose.connection.name);
});

mongoose.connection.on('error', (err) => {
    console.error('MongoDB connection error:', err);
});

mongoose.connection.on('disconnected', () => {
    console.log('MongoDB disconnected');
});

// Graceful shutdown
process.on('SIGINT', async () => {
    try {
        await mongoose.connection.close();
        console.log('MongoDB connection closed through app termination');
        process.exit(0);
    } catch (err) {
        console.error('Error during MongoDB disconnection:', err);
        process.exit(1);
    }
});

// Connect to MongoDB
async function connect() {
    try {
        await mongoose.connect(mongodbUri, options);
    } catch (error) {
        console.error('MongoDB connection error:', error);
        throw error;
    }
}

// User Schema
const userSchema = new mongoose.Schema({
    username: { type: String, required: true, unique: true },
    password: { type: String, required: true },
    role: { type: String, required: true, enum: ['admin', 'teacher', 'parent'] },
    email: { type: String },
    created_at: { type: Date, default: Date.now },
    last_login: { type: Date }
});

// Student Schema
const studentSchema = new mongoose.Schema({
    name: { type: String, required: true },
    nickname: { type: String, unique: true },
    parent_id: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    created_at: { type: Date, default: Date.now }
});

// Subject Schema
const subjectSchema = new mongoose.Schema({
    name: { type: String, required: true },
    description: { type: String },
    year: { type: Number, required: true },
    created_at: { type: Date, default: Date.now },
    updated_at: { type: Date, default: Date.now }
});

// Topic Schema
const topicSchema = new mongoose.Schema({
    subject_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Subject', required: true },
    name: { type: String, required: true },
    description: { type: String },
    created_at: { type: Date, default: Date.now },
    updated_at: { type: Date, default: Date.now }
});

// Subtopic Schema
const subtopicSchema = new mongoose.Schema({
    topic_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Topic', required: true },
    name: { type: String, required: true },
    description: { type: String },
    created_at: { type: Date, default: Date.now },
    updated_at: { type: Date, default: Date.now }
});

// Weekly Schedule Schema
const weeklyScheduleSchema = new mongoose.Schema({
    subject_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Subject', required: true },
    week_number: { type: Number, required: true },
    term: { type: Number, required: true },
    academic_year: { type: String, required: true },
    created_at: { type: Date, default: Date.now },
    updated_at: { type: Date, default: Date.now }
});

// Weekly Topics Schema
const weeklyTopicsSchema = new mongoose.Schema({
    schedule_id: { type: mongoose.Schema.Types.ObjectId, ref: 'WeeklySchedule', required: true },
    topic_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Topic' },
    subtopic_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Subtopic' },
    notes: { type: String },
    created_at: { type: Date, default: Date.now }
});

// Question Set Schema
const questionSetSchema = new mongoose.Schema({
    subject_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Subject', required: true },
    subtopic_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Subtopic', required: true },
    name: { type: String, required: true },
    description: { type: String },
    total_questions: { type: Number, required: true },
    time_limit: { type: Number },
    passing_score: { type: Number },
    difficulty_level: { type: String, enum: ['easy', 'medium', 'hard'] },
    question_format: { type: String, enum: ['multiple_choice', 'true_false', 'short_answer', 'essay', 'matching', 'fill_in_blank'] },
    created_at: { type: Date, default: Date.now },
    updated_at: { type: Date, default: Date.now }
});

// Question Schema
const questionSchema = new mongoose.Schema({
    question_set_id: { type: mongoose.Schema.Types.ObjectId, ref: 'QuestionSet', required: true },
    question_text: { type: String, required: true },
    question_type: { type: String, required: true, enum: ['multiple_choice', 'true_false', 'short_answer', 'essay', 'matching', 'fill_in_blank'] },
    options: { type: [String] },
    correct_answer: { type: String, required: true },
    explanation: { type: String },
    points: { type: Number, default: 1 },
    difficulty_level: { type: String, enum: ['easy', 'medium', 'hard'] },
    created_at: { type: Date, default: Date.now },
    updated_at: { type: Date, default: Date.now }
});

// Student Results Schema
const studentResultsSchema = new mongoose.Schema({
    student_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Student', required: true },
    assessment_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Assessment', required: true },
    question_set_id: { type: mongoose.Schema.Types.ObjectId, ref: 'QuestionSet', required: true },
    marks_obtained: { type: Number, required: true },
    total_marks: { type: Number, required: true },
    percentage_score: { type: Number, required: true },
    time_taken: { type: Number },
    feedback: { type: String },
    date_taken: { type: Date, default: Date.now },
    created_at: { type: Date, default: Date.now }
});

// Progress Tracking Schema
const progressTrackingSchema = new mongoose.Schema({
    student_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Student', required: true },
    subject_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Subject', required: true },
    subtopic_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Subtopic', required: true },
    status: { type: String, required: true, enum: ['not_started', 'in_progress', 'completed'] },
    last_assessment_score: { type: Number },
    last_assessment_date: { type: Date },
    total_attempts: { type: Number, default: 0 },
    average_score: { type: Number },
    last_updated: { type: Date, default: Date.now },
    notes: { type: String }
});

// Create models
const User = mongoose.model('User', userSchema);
const Student = mongoose.model('Student', studentSchema);
const Subject = mongoose.model('Subject', subjectSchema);
const Topic = mongoose.model('Topic', topicSchema);
const Subtopic = mongoose.model('Subtopic', subtopicSchema);
const WeeklySchedule = mongoose.model('WeeklySchedule', weeklyScheduleSchema);
const WeeklyTopics = mongoose.model('WeeklyTopics', weeklyTopicsSchema);
const QuestionSet = mongoose.model('QuestionSet', questionSetSchema);
const Question = mongoose.model('Question', questionSchema);
const StudentResults = mongoose.model('StudentResults', studentResultsSchema);
const ProgressTracking = mongoose.model('ProgressTracking', progressTrackingSchema);

// Export connection function and mongoose instance
module.exports = {
    connect,
    mongoose,
    User,
    Student,
    Subject,
    Topic,
    Subtopic,
    WeeklySchedule,
    WeeklyTopics,
    QuestionSet,
    Question,
    StudentResults,
    ProgressTracking
}; 