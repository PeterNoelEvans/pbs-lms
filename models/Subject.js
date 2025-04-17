const mongoose = require('mongoose');

const subjectSchema = new mongoose.Schema({
    name: {
        type: String,
        required: true,
        trim: true
    },
    description: {
        type: String,
        trim: true
    },
    year: {
        type: Number,
        required: true,
        enum: [1, 2, 3] // Mattayom 1, 2, 3
    },
    topics: [{
        name: {
            type: String,
            required: true,
            trim: true
        },
        description: {
            type: String,
            trim: true
        },
        order: {
            type: Number,
            required: true
        },
        subtopics: [{
            name: {
                type: String,
                required: true,
                trim: true
            },
            description: {
                type: String,
                trim: true
            },
            order: {
                type: Number,
                required: true
            }
        }]
    }],
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
subjectSchema.pre('save', function(next) {
    this.updatedAt = new Date();
    next();
});

const Subject = mongoose.model('Subject', subjectSchema);

module.exports = Subject; 