# Deploying to Render.com

This guide explains how to deploy the Student Portfolio application to Render.com.

## Prerequisites

- A GitHub repository containing your application code
- A Render.com account (free tier is sufficient)

## Deployment Steps

### 1. Push Your Code to GitHub

Make sure your latest code is pushed to GitHub. Your repository should include:
- All application code
- package.json with dependencies
- render.yaml file
- Procfile

### 2. Connect Render to Your Repository

1. Log in to your Render dashboard
2. Click "New" and select "Blueprint"
3. Connect your GitHub account if you haven't already
4. Select the repository containing your application
5. Click "Apply Blueprint"

Render will read the `render.yaml` file and set up your service automatically.

### 3. Configure Environment Variables

The `render.yaml` file specifies that Render should automatically generate secure values for:
- SESSION_SECRET
- ADMIN_TOKEN
- CREDENTIAL_KEY

You can verify these values in your service settings after deployment.

### 4. Database Setup

The application uses SQLite, which will be stored in the persistent disk specified in `render.yaml`.

**Important:** For security reasons, the database is not automatically initialized during deployment. After your service is deployed, follow these steps:

1. In your service dashboard, click on the "Shell" tab
2. Run the command: `npm run init-db`
3. This will create and initialize the database with student accounts
4. See INIT-GUIDE.md for detailed instructions and troubleshooting

### 5. Verify Deployment

Once deployed, your application will be available at:
`https://codinghtml-presentation.onrender.com`

Visit this URL to ensure your application is working correctly.

## Troubleshooting

If you encounter issues:

1. Check the Render logs in your dashboard
2. Verify environment variables are set correctly
3. Ensure the persistent disk is mounted correctly

## Updating Your Application

To update your application:
1. Push changes to GitHub
2. Render will automatically deploy the new version

## Notes

- The free tier of Render will spin down after periods of inactivity
- The first request after inactivity may take a few seconds to respond 