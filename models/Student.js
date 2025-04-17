const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const studentSchema = new mongoose.Schema({
    name: {
        type: String,
        required: true,
        trim: true
    },
    nickname: {
        type: String,
        required: true,
        unique: true,
        trim: true
    },
    email: {
        type: String,
        required: true,
        unique: true,
        trim: true,
        lowercase: true
    },
    password: {
        type: String,
        required: true,
        minlength: 6
    },
    year: {
        type: Number,
        required: true,
        enum: [1, 2, 3]
    },
    class: {
        type: String,
        required: true,
        enum: [
            'M1/1', 'M1/2', 'M1/3',
            'M2/1', 'M2/2', 'M2/3',
            'M3/1', 'M3/2', 'M3/3'
        ]
    },
    teacher: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    subjects: [{
        subject: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Subject'
        },
        progress: [{
            topic: {
                type: mongoose.Schema.Types.ObjectId,
                ref: 'Topic'
            },
            status: {
                type: String,
                enum: ['not_started', 'in_progress', 'completed'],
                default: 'not_started'
            },
            lastAccessed: Date,
            score: Number
        }]
    }],
    results: [{
        subject: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Subject'
        },
        topic: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Topic'
        },
        score: Number,
        totalQuestions: Number,
        timestamp: {
            type: Date,
            default: Date.now
        },
        timeSpent: {
            type: Number,  // Time spent in seconds
            default: 0
        },
        startTime: Date,
        endTime: Date,
        answers: {
            type: Map,
            of: mongoose.Schema.Types.Mixed
        },
        isGraded: {
            type: Boolean,
            default: false
        },
        teacherFeedback: String
    }],
    sessions: [{
        token: {
            type: String,
            required: true
        }
    }],
    lastLogin: {
        type: Date
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

// Hash password before saving
studentSchema.pre('save', async function(next) {
    if (!this.isModified('password')) {
        return next();
    }
    try {
        const salt = await bcrypt.genSalt(10);
        this.password = await bcrypt.hash(this.password, salt);
        next();
    } catch (error) {
        next(error);
    }
});

// Method to validate password
studentSchema.methods.validatePassword = async function(password) {
    return bcrypt.compare(password, this.password);
};

// Update the updatedAt timestamp before saving
studentSchema.pre('save', function(next) {
    this.updatedAt = new Date();
    next();
});

// Check if model exists before creating it
const Student = mongoose.models.Student || mongoose.model('Student', studentSchema);

module.exports = Student; 