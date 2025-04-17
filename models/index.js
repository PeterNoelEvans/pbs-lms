const mongoose = require('mongoose');

// Import all models
const User = require('./User');
const Subject = require('./Subject');
const Resource = require('./Resource');
const WeeklySchedule = require('./WeeklySchedule');
const Topic = require('./Topic');
const Subtopic = require('./Subtopic');

// Export all models
module.exports = {
    User,
    Subject,
    Resource,
    WeeklySchedule,
    Topic,
    Subtopic
}; 