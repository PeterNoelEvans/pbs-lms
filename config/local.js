module.exports = {
    // Database configuration
    database: {
        provider: 'sqlite',
        url: 'file:./dev.db',
        // Use SQLite for local development
        // This ensures your local development is independent of production database
    },

    // File storage configuration
    fileStorage: {
        type: 'local',
        uploadDir: './uploads',
        // Use local file storage for development
        // Files will be stored in the uploads directory
    },

    // Server configuration
    server: {
        port: 3000,
        host: 'localhost',
        // Local development server settings
    },

    // Security settings
    security: {
        jwtSecret: 'your-local-development-secret',
        // Use a different secret for local development
    },

    // Environment
    environment: 'development',
    
    // Logging
    logging: {
        level: 'debug',
        file: './logs/local-development.log'
    }
}; 