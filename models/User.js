const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const userSchema = new mongoose.Schema({
    name: {
        type: String,
        required: true,
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
        required: true
    },
    role: {
        type: String,
        enum: ['admin', 'teacher', 'student', 'parent'],
        required: true
    },
    nickname: {
        type: String,
        unique: true,
        sparse: true, // Allows null values for non-student users
        trim: true
    },
    class: {
        type: String,
        enum: ['M1/1', 'M1/2', 'M1/3', 'M1/4', 'M1/5', 'M1/6',
               'M2/1', 'M2/2', 'M2/3', 'M2/4', 'M2/5', 'M2/6',
               'M3/1', 'M3/2', 'M3/3', 'M3/4', 'M3/5', 'M3/6'],
        sparse: true // Allows null values for non-student users
    },
    children: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    }],
    parent: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    },
    sessions: [{
        token: String,
        createdAt: {
            type: Date,
            default: Date.now
        }
    }],
    lastLogin: {
        type: Date
    },
    createdAt: {
        type: Date,
        default: Date.now
    }
});

// Hash password before saving
userSchema.pre('save', async function(next) {
    if (this.isModified('password')) {
        this.password = await bcrypt.hash(this.password, 10);
    }
    next();
});

// Method to validate password
userSchema.methods.validatePassword = async function(password) {
    return await bcrypt.compare(password, this.password);
};

const User = mongoose.model('User', userSchema);

module.exports = User; 