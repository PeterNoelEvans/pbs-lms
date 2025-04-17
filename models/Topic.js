const mongoose = require('mongoose');

const topicSchema = new mongoose.Schema({
    name: {
        type: String,
        required: true,
        trim: true
    },
    description: {
        type: String,
        trim: true
    },
    subject: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Subject',
        required: true
    },
    order: {
        type: Number,
        required: true
    },
    subtopics: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Subtopic'
    }],
    resources: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Resource'
    }],
    objectives: [{
        type: String,
        trim: true
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
topicSchema.pre('save', function(next) {
    this.updatedAt = new Date();
    next();
});

// Check if model exists before creating it
const Topic = mongoose.models.Topic || mongoose.model('Topic', topicSchema);

module.exports = Topic; 