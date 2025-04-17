const mongoose = require('mongoose');

const subtopicSchema = new mongoose.Schema({
    name: {
        type: String,
        required: true,
        trim: true
    },
    description: {
        type: String,
        trim: true
    },
    topic: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Topic',
        required: true
    },
    order: {
        type: Number,
        required: true
    },
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
subtopicSchema.pre('save', function(next) {
    this.updatedAt = new Date();
    next();
});

// Check if model exists before creating it
const Subtopic = mongoose.models.Subtopic || mongoose.model('Subtopic', subtopicSchema);

module.exports = Subtopic; 