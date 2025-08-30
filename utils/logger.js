const winston = require('winston');
const path = require('path');

// Ensure logs directory exists
const fs = require('fs');
const logsDir = path.join(__dirname, '..', 'logs');
if (!fs.existsSync(logsDir)) {
    fs.mkdirSync(logsDir, { recursive: true });
}

// Define log levels
const levels = {
    error: 0,
    warn: 1,
    info: 2,
    http: 3,
    debug: 4,
};

// Define colors for each level
const colors = {
    error: 'red',
    warn: 'yellow',
    info: 'cyan',
    http: 'magenta',
    debug: 'white',
};

winston.addColors(colors);

// Define log format
const format = winston.format.combine(
    winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss:ms' }),
    winston.format.colorize({ all: true }),
    winston.format.printf(
        (info) => `${info.timestamp} ${info.level}: ${info.message}`,
    ),
);

// Define transports
const transports = [
    // Console transport for development
    new winston.transports.Console({
        format: format,
        level: process.env.NODE_ENV === 'production' ? 'info' : 'debug'
    }),
    
    // File transport for errors
    new winston.transports.File({
        filename: path.join(logsDir, 'error.log'),
        level: 'error',
        format: winston.format.combine(
            winston.format.timestamp(),
            winston.format.json()
        )
    }),
    
    // File transport for all logs
    new winston.transports.File({
        filename: path.join(logsDir, 'combined.log'),
        format: winston.format.combine(
            winston.format.timestamp(),
            winston.format.json()
        ),
        maxsize: 5242880, // 5MB
        maxFiles: 5, // Keep 5 backup files
    }),
];

// Create the logger
const logger = winston.createLogger({
    level: process.env.NODE_ENV === 'production' ? 'info' : 'debug',
    levels,
    format,
    transports,
    exitOnError: false,
});

// Add request logging middleware
logger.requestLogger = (req, res, next) => {
    const start = Date.now();
    
    res.on('finish', () => {
        const duration = Date.now() - start;
        const message = `${req.method} ${req.originalUrl} ${res.statusCode} - ${duration}ms`;
        
        if (res.statusCode >= 500) {
            logger.error(message);
        } else if (res.statusCode >= 400) {
            logger.warn(message);
        } else {
            logger.http(message);
        }
    });
    
    next();
};

// Helper methods for common logging patterns
logger.logError = (error, context = '') => {
    const message = context ? `${context}: ${error.message}` : error.message;
    logger.error(message, { 
        stack: error.stack,
        context,
        timestamp: new Date().toISOString()
    });
};

logger.logUserAction = (userId, action, details = {}) => {
    logger.info(`User ${userId} performed action: ${action}`, {
        userId,
        action,
        details,
        timestamp: new Date().toISOString()
    });
};

logger.logDatabaseQuery = (query, duration, recordCount = null) => {
    const message = recordCount !== null 
        ? `Database query completed: ${query} (${duration}ms, ${recordCount} records)`
        : `Database query completed: ${query} (${duration}ms)`;
    
    logger.debug(message, {
        query,
        duration,
        recordCount,
        timestamp: new Date().toISOString()
    });
};

logger.logBackupOperation = (type, status, details = {}) => {
    const message = `Backup operation ${type}: ${status}`;
    logger.info(message, {
        type,
        status,
        details,
        timestamp: new Date().toISOString()
    });
};

module.exports = logger;
