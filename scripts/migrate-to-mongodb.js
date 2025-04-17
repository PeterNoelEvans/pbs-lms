require('dotenv').config();
const mongoose = require('mongoose');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const bcrypt = require('bcryptjs');

// Import models
const User = require('../models/User');
const Subject = require('../models/Subject');
const Resource = require('../models/Resource');
const WeeklySchedule = require('../models/WeeklySchedule');

// Database paths
const sqlitePath = path.join(__dirname, '../data/teacher_resources.db');
const mongodbUri = process.env.MONGODB_URI;

// Connect to MongoDB
mongoose.connect(mongodbUri)
    .then(() => console.log('Connected to MongoDB'))
    .catch(err => {
        console.error('MongoDB connection error:', err);
        process.exit(1);
    });

// Connect to SQLite
const db = new sqlite3.Database(sqlitePath, (err) => {
    if (err) {
        console.error('SQLite connection error:', err);
        process.exit(1);
    }
    console.log('Connected to SQLite database');
});

async function migrateUsers() {
    return new Promise((resolve, reject) => {
        db.all('SELECT * FROM users', async (err, rows) => {
            if (err) {
                reject(err);
                return;
            }

            for (const row of rows) {
                try {
                    // Map SQLite fields to MongoDB schema
                    const userData = {
                        name: row.name || row.username || 'Unknown User',
                        email: row.email || `${row.username || 'user'}@school.com`,
                        password: row.password_hash || await bcrypt.hash('default123', 10),
                        role: row.role || 'teacher',
                        createdAt: new Date(row.created_at || Date.now())
                    };

                    const user = new User(userData);
                    await user.save();
                    console.log(`Migrated user: ${user.name}`);
                } catch (error) {
                    console.error(`Error migrating user:`, error);
                }
            }

            resolve();
        });
    });
}

async function migrateSubjects() {
    return new Promise((resolve, reject) => {
        db.all('SELECT * FROM subjects', async (err, rows) => {
            if (err) {
                reject(err);
                return;
            }

            for (const row of rows) {
                try {
                    // Get topics for this subject
                    const topicRows = await new Promise((resolve, reject) => {
                        db.all('SELECT * FROM topics WHERE subject_id = ?', [row.id], (err, rows) => {
                            if (err) reject(err);
                            else resolve(rows);
                        });
                    });

                    const topics = await Promise.all(topicRows.map(async (topicRow, index) => {
                        // Get subtopics for this topic
                        const subtopicRows = await new Promise((resolve, reject) => {
                            db.all('SELECT * FROM subtopics WHERE topic_id = ?', [topicRow.id], (err, rows) => {
                                if (err) reject(err);
                                else resolve(rows);
                            });
                        });

                        return {
                            name: topicRow.name,
                            description: topicRow.description || '',
                            order: index + 1, // Add order based on index
                            subtopics: subtopicRows.map((st, stIndex) => ({
                                name: st.name,
                                description: st.description || '',
                                order: stIndex + 1 // Add order based on index
                            }))
                        };
                    }));

                    const subject = new Subject({
                        name: row.name,
                        description: row.description || '',
                        year: row.year || 1,
                        topics: topics,
                        createdAt: new Date(row.created_at || Date.now()),
                        updatedAt: new Date(row.updated_at || Date.now())
                    });

                    await subject.save();
                    console.log(`Migrated subject: ${subject.name}`);
                } catch (error) {
                    console.error(`Error migrating subject:`, error);
                }
            }

            resolve();
        });
    });
}

async function migrateResources() {
    return new Promise((resolve, reject) => {
        db.all('SELECT * FROM resources', async (err, rows) => {
            if (err) {
                reject(err);
                return;
            }

            for (const row of rows) {
                try {
                    const resource = new Resource({
                        title: row.title,
                        description: row.description || '',
                        type: row.type || 'document',
                        fileUrl: row.file_url,
                        fileSize: row.file_size || 0,
                        mimeType: row.mime_type || 'application/octet-stream',
                        subject: row.subject_id,
                        topic: row.topic_id,
                        subtopic: row.subtopic_id,
                        targetAudience: (row.target_audience || 'teacher').split(','),
                        year: row.year || 1,
                        tags: row.tags ? row.tags.split(',') : [],
                        createdBy: row.created_by,
                        accessCount: row.access_count || 0,
                        isPublic: row.is_public === 1,
                        metadata: {
                            duration: row.duration || 0,
                            pages: row.pages || 0,
                            resolution: row.resolution || '',
                            language: row.language || 'en'
                        },
                        createdAt: new Date(row.created_at || Date.now()),
                        updatedAt: new Date(row.updated_at || Date.now())
                    });

                    await resource.save();
                    console.log(`Migrated resource: ${resource.title}`);
                } catch (error) {
                    console.error(`Error migrating resource:`, error);
                }
            }

            resolve();
        });
    });
}

async function migrateWeeklySchedules() {
    return new Promise((resolve, reject) => {
        db.all('SELECT * FROM weekly_schedule', async (err, rows) => {
            if (err) {
                reject(err);
                return;
            }

            for (const row of rows) {
                try {
                    const topicRows = await new Promise((resolve, reject) => {
                        db.all('SELECT * FROM weekly_topics WHERE schedule_id = ?', [row.id], (err, rows) => {
                            if (err) reject(err);
                            else resolve(rows);
                        });
                    });

                    const topics = topicRows.map(topicRow => ({
                        topic: topicRow.topic_id,
                        subtopics: topicRow.subtopic_ids ? topicRow.subtopic_ids.split(',').map(id => id.trim()) : [],
                        resources: topicRow.resource_ids ? topicRow.resource_ids.split(',').map(id => id.trim()) : [],
                        objectives: topicRow.objectives ? topicRow.objectives.split('\n') : [],
                        activities: topicRow.activities ? topicRow.activities.split('\n') : [],
                        assessments: topicRow.assessment_ids ? topicRow.assessment_ids.split(',').map(id => id.trim()) : []
                    }));

                    const schedule = new WeeklySchedule({
                        subject: row.subject_id,
                        year: row.year || 1,
                        term: row.term || 1,
                        week: row.week,
                        topics: topics,
                        notes: row.notes || '',
                        createdBy: row.created_by,
                        isPublished: row.is_published === 1,
                        createdAt: new Date(row.created_at || Date.now()),
                        updatedAt: new Date(row.updated_at || Date.now())
                    });

                    await schedule.save();
                    console.log(`Migrated weekly schedule for week ${schedule.week}`);
                } catch (error) {
                    console.error(`Error migrating weekly schedule:`, error);
                }
            }

            resolve();
        });
    });
}

async function migrate() {
    try {
        console.log('Starting migration...');

        // Clear existing collections
        await User.deleteMany({});
        await Subject.deleteMany({});
        await Resource.deleteMany({});
        await WeeklySchedule.deleteMany({});

        // Migrate data
        await migrateUsers();
        await migrateSubjects();
        await migrateResources();
        await migrateWeeklySchedules();

        console.log('Migration completed successfully');
    } catch (error) {
        console.error('Migration failed:', error);
    } finally {
        // Close connections
        db.close();
        mongoose.connection.close();
    }
}

// Run migration
migrate(); 