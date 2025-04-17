# Deployment Guide for Teacher Resource Project

## Table of Contents
1. [Prerequisites](#prerequisites)
2. [Database Setup](#database-setup)
3. [File Storage Setup](#file-storage-setup)
4. [Code Changes Required](#code-changes-required)
5. [Deployment Steps](#deployment-steps)
6. [Post-Deployment Configuration](#post-deployment-configuration)
7. [Cost Overview](#cost-overview)
8. [Troubleshooting](#troubleshooting)

## Prerequisites

- Render.com account with active membership
- GitHub account
- Cloudinary account (for file storage)
- PostgreSQL client (optional, for database management)

## Database Setup

### 1. Create PostgreSQL Database on Render
1. Log in to your Render dashboard
2. Click "New +" and select "PostgreSQL"
3. Configure the database:
   - Name: `teacher-resource-db` (or your preferred name)
   - Database: `teacher_resource`
   - User: `teacher_resource_user`
   - Password: Generate a secure password
4. Note down the connection string provided by Render

### 2. Update Prisma Configuration
1. Update `prisma/schema.prisma`:
```prisma
datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}
```

2. Create a new migration:
```bash
npx prisma migrate dev --name init
```

## File Storage Setup

### 1. Set Up Cloudinary
1. Create a Cloudinary account at https://cloudinary.com
2. Note down your:
   - Cloud name
   - API Key
   - API Secret

### 2. Update File Upload Configuration
1. Install Cloudinary:
```bash
npm install cloudinary
```

2. Update `server.js`:
```javascript
const cloudinary = require('cloudinary').v2;

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET
});

// Update multer configuration
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, 'uploads/resources')
  },
  filename: function (req, file, cb) {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9)
    cb(null, uniqueSuffix + path.extname(file.originalname))
  }
});
```

## Code Changes Required

### 1. Environment Variables
Create a `.env` file with:
```
DATABASE_URL=your_postgres_connection_string
JWT_SECRET=your_secure_secret
PORT=3000
CLOUDINARY_CLOUD_NAME=your_cloud_name
CLOUDINARY_API_KEY=your_api_key
CLOUDINARY_API_SECRET=your_api_secret
NODE_ENV=production
```

### 2. Security Enhancements
Add to `server.js`:
```javascript
// Rate limiting
const rateLimit = require('express-rate-limit');
app.use(rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100 // limit each IP to 100 requests per windowMs
}));

// Security headers
const helmet = require('helmet');
app.use(helmet());

// CORS configuration
app.use(cors({
  origin: process.env.NODE_ENV === 'production' 
    ? ['https://your-render-app-url.onrender.com']
    : 'http://localhost:3000',
  credentials: true
}));

// Production error handling
if (process.env.NODE_ENV === 'production') {
  app.use((err, req, res, next) => {
    console.error(err.stack);
    res.status(500).json({ error: 'Something went wrong!' });
  });
}
```

## Deployment Steps

### 1. Create render.yaml
Create `render.yaml` in your project root:
```yaml
services:
  - type: web
    name: teacher-resource-app
    env: node
    buildCommand: npm install && npx prisma generate && npx prisma migrate deploy
    startCommand: node server.js
    envVars:
      - key: DATABASE_URL
        sync: false
      - key: JWT_SECRET
        sync: false
      - key: CLOUDINARY_CLOUD_NAME
        sync: false
      - key: CLOUDINARY_API_KEY
        sync: false
      - key: CLOUDINARY_API_SECRET
        sync: false
      - key: NODE_ENV
        value: production
```

### 2. Deploy to Render
1. Push your code to GitHub
2. In Render dashboard:
   - Click "New +" and select "Web Service"
   - Connect your GitHub repository
   - Render will detect the `render.yaml` file
   - Configure environment variables in the Render dashboard
   - Deploy the service

## Post-Deployment Configuration

### 1. Automatic Deployments
1. In Render dashboard, go to your service
2. Under "Settings", enable "Auto-Deploy"
3. Configure deployment triggers as needed

### 2. Monitoring Setup
1. Enable Render's built-in monitoring
2. Consider adding error tracking:
   - Sentry
   - LogRocket
   - New Relic

### 3. Backup Configuration
1. In Render dashboard, go to your PostgreSQL database
2. Configure backup frequency
3. Set up backup retention policy

## Cost Overview

### Included in Your Render Membership
- Web Service hosting
- Basic monitoring
- Automatic HTTPS
- Basic CI/CD

### Additional Costs
- Cloudinary: Free tier available, then pay-as-you-go
- Additional Render services if needed
- Optional monitoring services

## Troubleshooting

### Common Issues

1. **Database Connection Issues**
   - Verify DATABASE_URL is correct
   - Check PostgreSQL service status in Render
   - Ensure migrations have run successfully

2. **File Upload Issues**
   - Verify Cloudinary credentials
   - Check file size limits
   - Verify CORS settings

3. **Build Failures**
   - Check build logs in Render dashboard
   - Verify all dependencies are in package.json
   - Ensure Node.js version is compatible

4. **Performance Issues**
   - Check Render service logs
   - Monitor database performance
   - Review rate limiting settings

### Support Resources
- Render Documentation: https://render.com/docs
- Cloudinary Documentation: https://cloudinary.com/documentation
- Prisma Documentation: https://www.prisma.io/docs 