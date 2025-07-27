# Ubuntu Migration Guide

## Overview

This guide provides step-by-step instructions for migrating the PBS LMS system from Windows to Ubuntu. This migration will improve performance, stability, and ease of maintenance.

## Prerequisites

- Ubuntu 20.04 LTS or later
- Root/sudo access on the Ubuntu machine
- Access to your current Windows machine for backup
- Domain name (if using one)
- Cloudflare account (if using Cloudflare)

## 1. Pre-Migration Preparation (Windows)

### 1.1 Backup Critical Data

Before migrating, backup these essential components from your Windows machine:

```bash
# Create a backup folder
mkdir pbs-lms-backup
cd pbs-lms-backup

# Backup database
copy "O:\2025\LMS-weekend05172025\Peter-s-Teacher-Resource-Project\prisma\dev.db" .

# Backup uploads folder (all student/teacher files)
xcopy "O:\2025\LMS-weekend05172025\Peter-s-Teacher-Resource-Project\uploads" uploads /E /I

# Backup environment file
copy "O:\2025\LMS-weekend05172025\Peter-s-Teacher-Resource-Project\.env" .

# Backup PM2 configuration (if exists)
copy "O:\2025\LMS-weekend05172025\Peter-s-Teacher-Resource-Project\ecosystem.config.js" .
```

### 1.2 Document Current Configuration

Record these details from your Windows setup:

```bash
# Check Node.js version
node --version

# Check PM2 processes
pm2 list

# Check current port usage
netstat -an | findstr :3000

# Check database size
dir prisma\dev.db
```

**Document these values:**
- Node.js version: ________
- PM2 process name: ________
- Database size: ________ MB
- Current port: ________
- Domain/Cloudflare setup: ________

## 2. Ubuntu System Setup

### 2.1 Update System

```bash
# Update package list and upgrade system
sudo apt update && sudo apt upgrade -y

# Install essential packages
sudo apt install -y curl wget git unzip software-properties-common
```

### 2.2 Install Node.js

```bash
# Install Node.js LTS version
curl -fsSL https://deb.nodesource.com/setup_lts.x | sudo -E bash -
sudo apt-get install -y nodejs

# Verify installation
node --version
npm --version
```

### 2.3 Install PM2

```bash
# Install PM2 globally
sudo npm install -g pm2

# Verify installation
pm2 --version
```

### 2.4 Install Additional Dependencies

```bash
# Install SQLite and build tools
sudo apt install -y sqlite3 build-essential

# Install PostgreSQL (recommended for production)
sudo apt install -y postgresql postgresql-contrib libpq-dev

# Install nginx (optional, for reverse proxy)
sudo apt install -y nginx

# Install certbot for SSL (optional)
sudo apt install -y certbot python3-certbot-nginx
```

## 3. Project Setup

### 3.1 Clone Repository

```bash
# Navigate to desired directory
cd /opt

# Clone the repository
sudo git clone https://github.com/PeterNoelEvans/pbs-lms.git
sudo chown -R $USER:$USER pbs-lms
cd pbs-lms
```

### 3.2 Restore Data

```bash
# Copy database from backup
cp /path/to/backup/dev.db prisma/dev.db

# Copy uploads folder
cp -r /path/to/backup/uploads/ ./uploads/

# Copy environment file
cp /path/to/backup/.env ./
```

### 3.3 Install Dependencies

```bash
# Install project dependencies
npm install

# Generate Prisma client
npx prisma generate

# Run database migrations (if needed)
npx prisma migrate deploy

# Verify database connection
npx prisma studio
```

### 3.4 Database Choice: SQLite vs PostgreSQL

You have two options for the database:

#### Option A: Keep SQLite (Simple Setup)
- **Pros**: Simple setup, no additional configuration
- **Cons**: Limited concurrent access, not ideal for production
- **Use case**: Small number of users, simple deployment

#### Option B: Migrate to PostgreSQL (Recommended)
- **Pros**: Better performance, concurrent access, production-ready
- **Cons**: More complex setup, requires database server
- **Use case**: Production environment, multiple concurrent users

**For PostgreSQL migration, follow the [PostgreSQL Migration Guide](postgresql-migration-guide.md)**

## 4. PM2 Configuration

### 4.1 Create PM2 Ecosystem File

```bash
# Create ecosystem configuration
cat > ecosystem.config.js << 'EOF'
module.exports = {
  apps: [{
    name: 'teacher-resource-platform',
    script: 'server.js',
    instances: 1,
    autorestart: true,
    watch: false,
    max_memory_restart: '1G',
    env: {
      NODE_ENV: 'production',
      PORT: 3000
    },
    error_file: './logs/err.log',
    out_file: './logs/out.log',
    log_file: './logs/combined.log',
    time: true,
    log_date_format: 'YYYY-MM-DD HH:mm:ss Z'
  }]
}
EOF
```

### 4.2 Create Logs Directory

```bash
# Create logs directory
mkdir -p logs

# Set proper permissions
chmod 755 logs
```

### 4.3 Start Application

```bash
# Start the application
pm2 start ecosystem.config.js

# Save PM2 configuration
pm2 save

# Setup PM2 to start on boot
pm2 startup
# Follow the instructions provided by the command above
```

## 5. Firewall Configuration

### 5.1 Configure UFW Firewall

```bash
# Allow SSH (if not already allowed)
sudo ufw allow ssh

# Allow HTTP and HTTPS
sudo ufw allow 80
sudo ufw allow 443

# Allow application port
sudo ufw allow 3000

# Enable firewall
sudo ufw enable

# Check status
sudo ufw status
```

## 6. Nginx Reverse Proxy (Optional but Recommended)

### 6.1 Install and Configure Nginx

```bash
# Create nginx configuration
sudo nano /etc/nginx/sites-available/pbs-lms
```

Add this configuration:

```nginx
server {
    listen 80;
    server_name your-domain.com;  # Replace with your domain

    # Security headers
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-XSS-Protection "1; mode=block" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header Referrer-Policy "no-referrer-when-downgrade" always;
    add_header Content-Security-Policy "default-src 'self' http: https: data: blob: 'unsafe-inline'" always;

    # Proxy settings
    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
        
        # Timeout settings
        proxy_connect_timeout 60s;
        proxy_send_timeout 60s;
        proxy_read_timeout 60s;
    }

    # Static file caching
    location ~* \.(js|css|png|jpg|jpeg|gif|ico|svg)$ {
        expires 1y;
        add_header Cache-Control "public, immutable";
    }

    # Upload size limit
    client_max_body_size 100M;
}
```

### 6.2 Enable Nginx Site

```bash
# Enable the site
sudo ln -s /etc/nginx/sites-available/pbs-lms /etc/nginx/sites-enabled/

# Remove default site (optional)
sudo rm /etc/nginx/sites-enabled/default

# Test configuration
sudo nginx -t

# Restart nginx
sudo systemctl restart nginx

# Enable nginx on boot
sudo systemctl enable nginx
```

## 7. SSL Certificate (Optional)

### 7.1 Install SSL with Let's Encrypt

```bash
# Install SSL certificate
sudo certbot --nginx -d your-domain.com

# Test auto-renewal
sudo certbot renew --dry-run
```

## 8. Testing and Verification

### 8.1 Test Application

```bash
# Check if server is running
curl http://localhost:3000

# Check PM2 status
pm2 status

# Check logs
pm2 logs teacher-resource-platform

# Check nginx status (if using)
sudo systemctl status nginx
```

### 8.2 Test External Access

```bash
# Test from external machine
curl http://your-server-ip:3000

# Test domain access (if configured)
curl http://your-domain.com
```

## 9. Backup Strategy

### 9.1 Create Backup Script

```bash
# Create backup script
cat > backup.sh << 'EOF'
#!/bin/bash

# Configuration
DATE=$(date +%Y%m%d_%H%M%S)
BACKUP_DIR="/backups/pbs-lms"
PROJECT_DIR="/opt/pbs-lms"
RETENTION_DAYS=7

# Create backup directory
mkdir -p $BACKUP_DIR

# Backup database
cp $PROJECT_DIR/prisma/dev.db $BACKUP_DIR/dev.db.$DATE

# Backup uploads
tar -czf $BACKUP_DIR/uploads.$DATE.tar.gz -C $PROJECT_DIR uploads/

# Backup environment file
cp $PROJECT_DIR/.env $BACKUP_DIR/.env.$DATE

# Clean old backups
find $BACKUP_DIR -name "*.db.*" -mtime +$RETENTION_DAYS -delete
find $BACKUP_DIR -name "*.tar.gz" -mtime +$RETENTION_DAYS -delete
find $BACKUP_DIR -name ".env.*" -mtime +$RETENTION_DAYS -delete

# Log backup
echo "Backup completed: $DATE" >> $BACKUP_DIR/backup.log
EOF

# Make script executable
chmod +x backup.sh
```

### 9.2 Setup Automated Backups

```bash
# Add to crontab for daily backups at 2 AM
crontab -e

# Add this line:
0 2 * * * /opt/pbs-lms/backup.sh
```

## 10. Performance Optimization

### 10.1 System Optimizations

```bash
# Increase file watch limits
echo fs.inotify.max_user_watches=524288 | sudo tee -a /etc/sysctl.conf
sudo sysctl -p

# Optimize Node.js for production
export NODE_ENV=production
export NODE_OPTIONS="--max-old-space-size=2048"
```

### 10.2 PM2 Optimizations

```bash
# Monitor system resources
pm2 install pm2-server-monit

# Setup PM2 monitoring
pm2 set pm2-server-monit:email your-email@example.com
```

## 11. Monitoring and Maintenance

### 11.1 System Monitoring

```bash
# Install monitoring tools
sudo apt install -y htop iotop

# Check system resources
htop
df -h
free -h
```

### 11.2 Application Monitoring

```bash
# PM2 monitoring commands
pm2 monit
pm2 logs teacher-resource-platform --lines 100
pm2 show teacher-resource-platform
```

## 12. Troubleshooting

### 12.1 Common Issues

#### Port Already in Use
```bash
# Check what's using port 3000
sudo netstat -tlnp | grep :3000

# Kill process if needed
sudo kill -9 <PID>
```

#### Permission Issues
```bash
# Fix file permissions
sudo chown -R $USER:$USER /opt/pbs-lms
chmod -R 755 /opt/pbs-lms
```

#### Database Issues
```bash
# Check database integrity
sqlite3 prisma/dev.db "PRAGMA integrity_check;"

# Backup and restore if needed
cp prisma/dev.db prisma/dev.db.backup
npx prisma migrate reset
```

#### PM2 Issues
```bash
# Restart PM2 daemon
pm2 kill
pm2 start ecosystem.config.js
pm2 save
```

### 12.2 Log Analysis

```bash
# Check application logs
tail -f logs/combined.log

# Check nginx logs
sudo tail -f /var/log/nginx/access.log
sudo tail -f /var/log/nginx/error.log

# Check system logs
sudo journalctl -u nginx -f
```

## 13. Security Considerations

### 13.1 Basic Security

```bash
# Update system regularly
sudo apt update && sudo apt upgrade -y

# Configure firewall
sudo ufw enable

# Secure SSH (optional)
sudo nano /etc/ssh/sshd_config
# Change Port 22 to another port
# Disable root login
sudo systemctl restart ssh
```

### 13.2 Application Security

```bash
# Set proper file permissions
chmod 600 .env
chmod 644 prisma/dev.db

# Regular security updates
npm audit fix
```

## 14. Final Checklist

- [ ] **System updated** and dependencies installed
- [ ] **Project cloned** and dependencies installed
- [ ] **Database restored** and verified
- [ ] **Uploads folder** restored
- [ ] **Environment configured** properly
- [ ] **PM2 configured** and running
- [ ] **Firewall configured** and enabled
- [ ] **Nginx configured** (if using)
- [ ] **SSL certificate** installed (if using)
- [ ] **Domain pointing** to new server
- [ ] **Backup strategy** implemented
- [ ] **Monitoring** set up
- [ ] **Application accessible** via browser
- [ ] **All features tested** and working

## 15. Post-Migration Tasks

### 15.1 Update DNS/Cloudflare

1. **Update A record** to point to new Ubuntu server IP
2. **Update Cloudflare settings** if using Cloudflare
3. **Test domain access** from multiple locations

### 15.2 Notify Users

1. **Inform teachers** about the migration
2. **Test with a few students** before full rollout
3. **Monitor for issues** in the first few days

### 15.3 Performance Monitoring

1. **Monitor system resources** for the first week
2. **Check application logs** for errors
3. **Verify backup system** is working
4. **Test restore procedures**

## 16. Rollback Plan

If issues arise, you can rollback by:

1. **Revert DNS** to point back to Windows server
2. **Restore from backup** if needed
3. **Keep Windows server running** during transition period

## Support

If you encounter issues during migration:

1. **Check logs** using the troubleshooting commands above
2. **Verify all steps** in the checklist
3. **Test each component** individually
4. **Consult Ubuntu documentation** for system-specific issues

## Related Documents

- [System Structure](system-structure.md)
- [Deployment Guide](deployment/guide.md)
- [Troubleshooting](troubleshooting.md)
- [Database Schema](database.md)
- [PostgreSQL Migration Guide](postgresql-migration-guide.md)
- [Organization Separation Guide](splitting_organizations_guide.md) 