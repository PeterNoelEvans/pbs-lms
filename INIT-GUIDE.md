# Database Initialization Guide

This guide explains how to initialize the database after deployment to Render.com.

## Why Separate Initialization?

We've separated the database initialization from the deployment process for security reasons. The database initialization requires sensitive environment variables that should only be used in the production environment after deployment.

## Steps to Initialize the Database

1. **Deploy the application to Render.com**:
   Follow the instructions in README-deployment.md to deploy your application.

2. **Verify environment variables**:
   - Log in to your Render dashboard
   - Select your service (codinghtml-presentation)
   - Go to the Environment section
   - Verify that the following environment variables are set:
     - SESSION_SECRET
     - ADMIN_TOKEN
     - CREDENTIAL_KEY
     - NODE_ENV=production
     - SESSION_STORE=sqlite
     - PORT=10000

3. **Access the Render Shell**:
   - In your service dashboard, click on the "Shell" tab
   - This gives you a command-line interface to your deployed application

4. **Run the database initialization script**:
   ```bash
   npm run init-db
   ```

5. **Verify the initialization**:
   - Check the logs for any errors
   - Confirm that all students were registered successfully

## Troubleshooting

If you encounter any issues during initialization:

1. **Check environment variables**:
   - Ensure CREDENTIAL_KEY is properly set and is a 64-character hex string
   - Verify that all other environment variables are set correctly

2. **Check file permissions**:
   - The application needs write access to the /opt/render/project/src/data directory
   - Run `ls -la /opt/render/project/src/data` to check permissions

3. **Check logs**:
   - Review the shell output for any specific error messages

## Security Notes

- Never share your CREDENTIAL_KEY or other sensitive environment variables
- The default key is only used in development environments, never in production
- After initialization, consider rotating the ADMIN_TOKEN for additional security 