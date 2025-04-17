const mongoose = require('mongoose');

const resourceSchema = new mongoose.Schema({
    title: {
        type: String,
        required: true,
        trim: true
    },
    description: {
        type: String,
        trim: true
    },
    type: {
        type: String,
        enum: ['document', 'video', 'audio', 'image', 'link', 'assessment'],
        required: true
    },
    fileUrl: {
        type: String,
        trim: true
    },
    fileSize: {
        type: Number // Size in bytes
    },
    mimeType: {
        type: String
    },
    subject: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Subject',
        required: true
    },
    topic: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Subject.topics'
    },
    subtopic: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Subject.topics.subtopics'
    },
    targetAudience: [{
        type: String,
        enum: ['student', 'teacher', 'parent'],
        required: true
    }],
    year: {
        type: Number,
        required: true,
        enum: [1, 2, 3]
    },
    tags: [{
        type: String,
        trim: true
    }],
    createdBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    accessCount: {
        type: Number,
        default: 0
    },
    isPublic: {
        type: Boolean,
        default: false
    },
    metadata: {
        duration: Number, // For audio/video in seconds
        pages: Number,    // For documents
        resolution: String, // For images/videos
        language: String
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
resourceSchema.pre('save', function(next) {
    this.updatedAt = new Date();
    next();
});

const Resource = mongoose.model('Resource', resourceSchema);

module.exports = Resource; 