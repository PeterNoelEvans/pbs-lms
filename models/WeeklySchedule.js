const mongoose = require('mongoose');

const weeklyScheduleSchema = new mongoose.Schema({
    subject: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Subject',
        required: true
    },
    year: {
        type: Number,
        required: true,
        enum: [1, 2, 3]
    },
    term: {
        type: Number,
        required: true,
        enum: [1, 2]
    },
    week: {
        type: Number,
        required: true,
        min: 1,
        max: 20
    },
    topics: [{
        topic: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Subject.topics',
            required: true
        },
        subtopics: [{
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Subject.topics.subtopics'
        }],
        resources: [{
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Resource'
        }],
        objectives: [{
            type: String,
            trim: true
        }],
        activities: [{
            type: String,
            trim: true
        }],
        assessments: [{
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Resource'
        }]
    }],
    notes: {
        type: String,
        trim: true
    },
    createdBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    isPublished: {
        type: Boolean,
        default: false
    },
    createdAt: {
        type: Date,
        default: Date.now
    },
    updatedAt: {
        type: Date,
        default: Date.now
    }
});

// Update the updatedAt timestamp before saving
weeklyScheduleSchema.pre('save', function(next) {
    this.updatedAt = new Date();
    next();
});

// Check if model exists before creating it
const WeeklySchedule = mongoose.models.WeeklySchedule || mongoose.model('WeeklySchedule', weeklyScheduleSchema);

module.exports = WeeklySchedule; 