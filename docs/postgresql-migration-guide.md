# PostgreSQL Migration Guide

## Overview

This guide covers migrating the PBS LMS from SQLite to PostgreSQL during the Ubuntu migration. PostgreSQL offers better performance, concurrent access, and production-ready features compared to SQLite.

## Why PostgreSQL?

### Advantages over SQLite:
- **Better concurrent access** - Multiple users can write simultaneously
- **ACID compliance** - Full transaction support
- **Better performance** - Optimized for larger datasets
- **Production ready** - Used by major applications
- **Backup and recovery** - Robust backup strategies
- **Scalability** - Can handle growth better

### Considerations:
- **More complex setup** - Requires database server
- **Resource usage** - Uses more memory and CPU
- **Maintenance** - Requires regular maintenance

## 1. Pre-Migration Assessment

### 1.1 Current Database Analysis

```bash
# Check current SQLite database size
ls -lh prisma/dev.db

# Check table sizes
sqlite3 prisma/dev.db "SELECT name, sql FROM sqlite_master WHERE type='table';"

# Check record counts
sqlite3 prisma/dev.db "SELECT 'User' as table_name, COUNT(*) as count FROM User UNION ALL SELECT 'Assessment', COUNT(*) FROM Assessment UNION ALL SELECT 'Resource', COUNT(*) FROM Resource UNION ALL SELECT 'AssessmentSubmission', COUNT(*) FROM AssessmentSubmission;"
```

### 1.2 Data Backup

```bash
# Create comprehensive backup
mkdir postgresql-migration-backup
cd postgresql-migration-backup

# Backup SQLite database
cp ../prisma/dev.db .

# Export data as SQL (optional)
sqlite3 dev.db ".dump" > database_dump.sql

# Backup Prisma schema
cp ../prisma/schema.prisma .

# Backup environment file
cp ../.env .
```

## 2. PostgreSQL Installation (Ubuntu)

### 2.1 Install PostgreSQL

```bash
# Update package list
sudo apt update

# Install PostgreSQL
sudo apt install -y postgresql postgresql-contrib

# Install development headers (for Prisma)
sudo apt install -y libpq-dev

# Verify installation
psql --version
```

### 2.2 Configure PostgreSQL

```bash
# Switch to postgres user
sudo -u postgres psql

# Create database and user
CREATE DATABASE pbs_lms;
CREATE USER pbs_user WITH ENCRYPTED PASSWORD 'your_secure_password';
GRANT ALL PRIVILEGES ON DATABASE pbs_lms TO pbs_user;
ALTER USER pbs_user CREATEDB;

# Exit PostgreSQL
\q
```

### 2.3 Configure PostgreSQL for Remote Access (Optional)

```bash
# Edit PostgreSQL configuration
sudo nano /etc/postgresql/*/main/postgresql.conf

# Uncomment and modify:
# listen_addresses = 'localhost'

# Edit client authentication
sudo nano /etc/postgresql/*/main/pg_hba.conf

# Add line for local connections:
# local   pbs_lms    pbs_user    md5

# Restart PostgreSQL
sudo systemctl restart postgresql
sudo systemctl enable postgresql
```

## 3. Update Prisma Configuration

### 3.1 Update Schema

```bash
# Backup current schema
cp prisma/schema.prisma prisma/schema.sqlite.backup

# Update schema for PostgreSQL
```

Update `prisma/schema.prisma`:

```prisma
// This is your Prisma schema file,
// learn more about it in the docs: https://pris.ly/d/prisma-schema

generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

model User {
  id                String   @id @default(cuid())
  email             String   @unique
  password          String
  name              String
  role              String   @default("student")
  organization      String   @default("PBS")
  studentNumber     Int?     @unique
  profilePicture    String?
  resetToken        String?
  resetTokenExpiry  DateTime?
  createdAt         DateTime @default(now())
  updatedAt         DateTime @updatedAt

  // Relations
  subjects          Subject[]
  assessments       Assessment[]
  submissions       AssessmentSubmission[]
  sessions          UserSession[]

  @@map("users")
}

model Subject {
  id          String   @id @default(cuid())
  name        String
  yearLevel   String
  teacherId   String
  organization String  @default("PBS")
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt

  // Relations
  teacher     User     @relation(fields: [teacherId], references: [id], onDelete: Cascade)
  sections    Section[]

  @@map("subjects")
}

model Section {
  id        String   @id @default(cuid())
  name      String
  order     Int      @default(0)
  subjectId String
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  // Relations
  subject   Subject  @relation(fields: [subjectId], references: [id], onDelete: Cascade)
  parts     Part[]

  @@map("sections")
}

model Part {
  id        String   @id @default(cuid())
  name      String
  order     Int      @default(0)
  sectionId String
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  // Relations
  section   Section  @relation(fields: [sectionId], references: [id], onDelete: Cascade)
  units     Unit[]

  @@map("parts")
}

model Unit {
  id        String   @id @default(cuid())
  name      String
  order     Int      @default(0)
  partId    String
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  // Relations
  part      Part     @relation(fields: [partId], references: [id], onDelete: Cascade)
  resources Resource[]

  @@map("units")
}

model Resource {
  id          String   @id @default(cuid())
  title       String
  description String?
  filePath    String
  fileType    String
  fileSize    Int?
  thumbnail   String?
  order       Int      @default(0)
  unitId      String
  organization String  @default("PBS")
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt

  // Relations
  unit        Unit     @relation(fields: [unitId], references: [id], onDelete: Cascade)
  assessments Assessment[]

  @@map("resources")
}

model Assessment {
  id              String   @id @default(cuid())
  title           String
  description     String?
  type            String
  content         String
  category        String   @default("quiz")
  quarter         String?
  published       Boolean  @default(false)
  teacherId       String
  organization    String   @default("PBS")
  createdAt       DateTime @default(now())
  updatedAt       DateTime @updatedAt

  // Relations
  teacher         User     @relation(fields: [teacherId], references: [id], onDelete: Cascade)
  resources       Resource[]
  submissions     AssessmentSubmission[]

  @@map("assessments")
}

model AssessmentSubmission {
  id           String   @id @default(cuid())
  studentId    String
  assessmentId String
  answers      String
  score        Float?
  attempts     Int      @default(1)
  totalTime    Int      @default(0)
  comment      String?
  submittedAt  DateTime @default(now())
  gradedAt     DateTime?
  gradedBy     String?

  // Relations
  student      User     @relation(fields: [studentId], references: [id], onDelete: Cascade)
  assessment   Assessment @relation(fields: [assessmentId], references: [id], onDelete: Cascade)

  @@map("assessment_submissions")
}

model UserSession {
  id        String   @id @default(cuid())
  userId    String
  startTime DateTime @default(now())
  endTime   DateTime?
  duration  Int?     // in minutes

  // Relations
  user      User     @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@map("user_sessions")
}
```

### 3.2 Update Environment Variables

```bash
# Update .env file
nano .env
```

Add PostgreSQL connection string:

```env
# Database
DATABASE_URL="postgresql://pbs_user:your_secure_password@localhost:5432/pbs_lms"

# Keep existing variables
JWT_SECRET=your_jwt_secret
PORT=3000
NODE_ENV=production
```

## 4. Data Migration

### 4.1 Create Migration Script

```bash
# Create migration script
cat > migrate-to-postgresql.js << 'EOF'
const { PrismaClient } = require('@prisma/client');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const sqliteDb = new sqlite3.Database(path.join(__dirname, 'prisma', 'dev.db'));
const prisma = new PrismaClient();

async function migrateData() {
  console.log('Starting migration from SQLite to PostgreSQL...');

  try {
    // Migrate Users
    console.log('Migrating users...');
    const users = await new Promise((resolve, reject) => {
      sqliteDb.all('SELECT * FROM User', (err, rows) => {
        if (err) reject(err);
        else resolve(rows);
      });
    });

    for (const user of users) {
      await prisma.user.create({
        data: {
          id: user.id,
          email: user.email,
          password: user.password,
          name: user.name,
          role: user.role,
          organization: user.organization || 'PBS',
          studentNumber: user.studentNumber ? parseInt(user.studentNumber) : null,
          profilePicture: user.profilePicture,
          resetToken: user.resetToken,
          resetTokenExpiry: user.resetTokenExpiry ? new Date(user.resetTokenExpiry) : null,
          createdAt: new Date(user.createdAt),
          updatedAt: new Date(user.updatedAt)
        }
      });
    }

    // Migrate Subjects
    console.log('Migrating subjects...');
    const subjects = await new Promise((resolve, reject) => {
      sqliteDb.all('SELECT * FROM Subject', (err, rows) => {
        if (err) reject(err);
        else resolve(rows);
      });
    });

    for (const subject of subjects) {
      await prisma.subject.create({
        data: {
          id: subject.id,
          name: subject.name,
          yearLevel: subject.yearLevel,
          teacherId: subject.teacherId,
          organization: subject.organization || 'PBS',
          createdAt: new Date(subject.createdAt),
          updatedAt: new Date(subject.updatedAt)
        }
      });
    }

    // Migrate Sections
    console.log('Migrating sections...');
    const sections = await new Promise((resolve, reject) => {
      sqliteDb.all('SELECT * FROM Section', (err, rows) => {
        if (err) reject(err);
        else resolve(rows);
      });
    });

    for (const section of sections) {
      await prisma.section.create({
        data: {
          id: section.id,
          name: section.name,
          order: section.order || 0,
          subjectId: section.subjectId,
          createdAt: new Date(section.createdAt),
          updatedAt: new Date(section.updatedAt)
        }
      });
    }

    // Migrate Parts
    console.log('Migrating parts...');
    const parts = await new Promise((resolve, reject) => {
      sqliteDb.all('SELECT * FROM Part', (err, rows) => {
        if (err) reject(err);
        else resolve(rows);
      });
    });

    for (const part of parts) {
      await prisma.part.create({
        data: {
          id: part.id,
          name: part.name,
          order: part.order || 0,
          sectionId: part.sectionId,
          createdAt: new Date(part.createdAt),
          updatedAt: new Date(part.updatedAt)
        }
      });
    }

    // Migrate Units
    console.log('Migrating units...');
    const units = await new Promise((resolve, reject) => {
      sqliteDb.all('SELECT * FROM Unit', (err, rows) => {
        if (err) reject(err);
        else resolve(rows);
      });
    });

    for (const unit of units) {
      await prisma.unit.create({
        data: {
          id: unit.id,
          name: unit.name,
          order: unit.order || 0,
          partId: unit.partId,
          createdAt: new Date(unit.createdAt),
          updatedAt: new Date(unit.updatedAt)
        }
      });
    }

    // Migrate Resources
    console.log('Migrating resources...');
    const resources = await new Promise((resolve, reject) => {
      sqliteDb.all('SELECT * FROM Resource', (err, rows) => {
        if (err) reject(err);
        else resolve(rows);
      });
    });

    for (const resource of resources) {
      await prisma.resource.create({
        data: {
          id: resource.id,
          title: resource.title,
          description: resource.description,
          filePath: resource.filePath,
          fileType: resource.fileType,
          fileSize: resource.fileSize ? parseInt(resource.fileSize) : null,
          thumbnail: resource.thumbnail,
          order: resource.order || 0,
          unitId: resource.unitId,
          organization: resource.organization || 'PBS',
          createdAt: new Date(resource.createdAt),
          updatedAt: new Date(resource.updatedAt)
        }
      });
    }

    // Migrate Assessments
    console.log('Migrating assessments...');
    const assessments = await new Promise((resolve, reject) => {
      sqliteDb.all('SELECT * FROM Assessment', (err, rows) => {
        if (err) reject(err);
        else resolve(rows);
      });
    });

    for (const assessment of assessments) {
      await prisma.assessment.create({
        data: {
          id: assessment.id,
          title: assessment.title,
          description: assessment.description,
          type: assessment.type,
          content: assessment.content,
          category: assessment.category || 'quiz',
          quarter: assessment.quarter,
          published: assessment.published === 1,
          teacherId: assessment.teacherId,
          organization: assessment.organization || 'PBS',
          createdAt: new Date(assessment.createdAt),
          updatedAt: new Date(assessment.updatedAt)
        }
      });
    }

    // Migrate Assessment Submissions
    console.log('Migrating assessment submissions...');
    const submissions = await new Promise((resolve, reject) => {
      sqliteDb.all('SELECT * FROM AssessmentSubmission', (err, rows) => {
        if (err) reject(err);
        else resolve(rows);
      });
    });

    for (const submission of submissions) {
      await prisma.assessmentSubmission.create({
        data: {
          id: submission.id,
          studentId: submission.studentId,
          assessmentId: submission.assessmentId,
          answers: submission.answers,
          score: submission.score ? parseFloat(submission.score) : null,
          attempts: submission.attempts || 1,
          totalTime: submission.totalTime || 0,
          comment: submission.comment,
          submittedAt: new Date(submission.submittedAt),
          gradedAt: submission.gradedAt ? new Date(submission.gradedAt) : null,
          gradedBy: submission.gradedBy
        }
      });
    }

    // Migrate User Sessions
    console.log('Migrating user sessions...');
    const sessions = await new Promise((resolve, reject) => {
      sqliteDb.all('SELECT * FROM UserSession', (err, rows) => {
        if (err) reject(err);
        else resolve(rows);
      });
    });

    for (const session of sessions) {
      await prisma.userSession.create({
        data: {
          id: session.id,
          userId: session.userId,
          startTime: new Date(session.startTime),
          endTime: session.endTime ? new Date(session.endTime) : null,
          duration: session.duration ? parseInt(session.duration) : null
        }
      });
    }

    console.log('Migration completed successfully!');

  } catch (error) {
    console.error('Migration failed:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
    sqliteDb.close();
  }
}

migrateData();
EOF
```

### 4.2 Run Migration

```bash
# Install sqlite3 for migration script
npm install sqlite3

# Run migration
node migrate-to-postgresql.js

# Verify migration
npx prisma studio
```

## 5. Update Application Code

### 5.1 Update Server Configuration

```bash
# Update server.js to handle PostgreSQL connection
nano server.js
```

Add PostgreSQL connection handling:

```javascript
// Add at the top of server.js
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient({
  log: ['query', 'info', 'warn', 'error'],
});

// Handle graceful shutdown
process.on('SIGINT', async () => {
  await prisma.$disconnect();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  await prisma.$disconnect();
  process.exit(0);
});
```

### 5.2 Update Database Queries

Review and update any direct SQLite queries in your codebase to use Prisma ORM instead.

## 6. Testing and Verification

### 6.1 Test Database Connection

```bash
# Test connection
npx prisma db pull

# Generate Prisma client
npx prisma generate

# Test with Prisma Studio
npx prisma studio
```

### 6.2 Verify Data Integrity

```bash
# Create verification script
cat > verify-migration.js << 'EOF'
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

async function verifyMigration() {
  console.log('Verifying migration...');

  try {
    // Count records in each table
    const userCount = await prisma.user.count();
    const subjectCount = await prisma.subject.count();
    const resourceCount = await prisma.resource.count();
    const assessmentCount = await prisma.assessment.count();
    const submissionCount = await prisma.assessmentSubmission.count();

    console.log('Record counts:');
    console.log(`Users: ${userCount}`);
    console.log(`Subjects: ${subjectCount}`);
    console.log(`Resources: ${resourceCount}`);
    console.log(`Assessments: ${assessmentCount}`);
    console.log(`Submissions: ${submissionCount}`);

    // Test a few sample queries
    const sampleUser = await prisma.user.findFirst();
    const sampleAssessment = await prisma.assessment.findFirst({
      include: { teacher: true }
    });

    console.log('Sample user:', sampleUser?.name);
    console.log('Sample assessment:', sampleAssessment?.title);

    console.log('Verification completed successfully!');

  } catch (error) {
    console.error('Verification failed:', error);
  } finally {
    await prisma.$disconnect();
  }
}

verifyMigration();
EOF

# Run verification
node verify-migration.js
```

## 7. Performance Optimization

### 7.1 PostgreSQL Configuration

```bash
# Edit PostgreSQL configuration
sudo nano /etc/postgresql/*/main/postgresql.conf
```

Add these optimizations:

```conf
# Memory settings
shared_buffers = 256MB
effective_cache_size = 1GB
work_mem = 4MB
maintenance_work_mem = 64MB

# Connection settings
max_connections = 100

# Logging
log_statement = 'all'
log_duration = on
```

### 7.2 Create Indexes

```bash
# Create performance indexes
npx prisma db execute --stdin << 'EOF'
-- User indexes
CREATE INDEX IF NOT EXISTS idx_user_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_user_organization ON users(organization);
CREATE INDEX IF NOT EXISTS idx_user_student_number ON users("studentNumber");

-- Assessment indexes
CREATE INDEX IF NOT EXISTS idx_assessment_teacher ON assessments("teacherId");
CREATE INDEX IF NOT EXISTS idx_assessment_organization ON assessments(organization);
CREATE INDEX IF NOT EXISTS idx_assessment_published ON assessments(published);

-- Submission indexes
CREATE INDEX IF NOT EXISTS idx_submission_student ON assessment_submissions("studentId");
CREATE INDEX IF NOT EXISTS idx_submission_assessment ON assessment_submissions("assessmentId");
CREATE INDEX IF NOT EXISTS idx_submission_submitted_at ON assessment_submissions("submittedAt");

-- Resource indexes
CREATE INDEX IF NOT EXISTS idx_resource_unit ON resources("unitId");
CREATE INDEX IF NOT EXISTS idx_resource_organization ON resources(organization);
EOF
```

## 8. Backup Strategy

### 8.1 PostgreSQL Backup Script

```bash
# Create PostgreSQL backup script
cat > backup-postgresql.sh << 'EOF'
#!/bin/bash

# Configuration
DATE=$(date +%Y%m%d_%H%M%S)
BACKUP_DIR="/backups/postgresql"
DB_NAME="pbs_lms"
DB_USER="pbs_user"
RETENTION_DAYS=7

# Create backup directory
mkdir -p $BACKUP_DIR

# Create backup
PGPASSWORD=your_secure_password pg_dump -h localhost -U $DB_USER -d $DB_NAME > $BACKUP_DIR/pbs_lms_$DATE.sql

# Compress backup
gzip $BACKUP_DIR/pbs_lms_$DATE.sql

# Clean old backups
find $BACKUP_DIR -name "*.sql.gz" -mtime +$RETENTION_DAYS -delete

# Log backup
echo "PostgreSQL backup completed: $DATE" >> $BACKUP_DIR/backup.log
EOF

# Make script executable
chmod +x backup-postgresql.sh
```

### 8.2 Setup Automated Backups

```bash
# Add to crontab for daily backups at 3 AM
crontab -e

# Add this line:
0 3 * * * /opt/pbs-lms/backup-postgresql.sh
```

## 9. Monitoring and Maintenance

### 9.1 Database Monitoring

```bash
# Install monitoring tools
sudo apt install -y postgresql-contrib

# Enable pg_stat_statements
sudo -u postgres psql -d pbs_lms -c "CREATE EXTENSION IF NOT EXISTS pg_stat_statements;"

# Monitor slow queries
sudo -u postgres psql -d pbs_lms -c "SELECT query, calls, total_time, mean_time FROM pg_stat_statements ORDER BY total_time DESC LIMIT 10;"
```

### 9.2 Regular Maintenance

```bash
# Create maintenance script
cat > maintain-postgresql.sh << 'EOF'
#!/bin/bash

# Vacuum and analyze database
sudo -u postgres vacuumdb --analyze --verbose pbs_lms

# Reindex database
sudo -u postgres reindexdb --verbose pbs_lms

echo "PostgreSQL maintenance completed: $(date)"
EOF

# Make script executable
chmod +x maintain-postgresql.sh

# Add to crontab for weekly maintenance
crontab -e

# Add this line:
0 4 * * 0 /opt/pbs-lms/maintain-postgresql.sh
```

## 10. Rollback Plan

### 10.1 Keep SQLite Backup

```bash
# Keep SQLite database as backup
cp prisma/dev.db prisma/dev.sqlite.backup

# Keep original schema
cp prisma/schema.sqlite.backup prisma/schema.sqlite
```

### 10.2 Rollback Procedure

If issues arise:

1. **Stop the application**
2. **Restore SQLite schema**: `cp prisma/schema.sqlite prisma/schema.prisma`
3. **Restore SQLite database**: `cp prisma/dev.sqlite.backup prisma/dev.db`
4. **Update DATABASE_URL** in `.env` to use SQLite
5. **Regenerate Prisma client**: `npx prisma generate`
6. **Restart application**

## 11. Final Checklist

- [ ] **PostgreSQL installed** and configured
- [ ] **Database created** with proper user permissions
- [ ] **Prisma schema updated** for PostgreSQL
- [ ] **Environment variables** updated
- [ ] **Data migration completed** successfully
- [ ] **Application code updated** for PostgreSQL
- [ ] **Performance indexes** created
- [ ] **Backup strategy** implemented
- [ ] **Monitoring** set up
- [ ] **Testing completed** and verified
- [ ] **Rollback plan** prepared

## 12. Performance Comparison

### Expected Improvements:
- **Concurrent users**: 10x better performance
- **Large datasets**: Better query optimization
- **Data integrity**: Full ACID compliance
- **Backup/restore**: Faster and more reliable
- **Scalability**: Can handle growth better

## Support

If you encounter issues during PostgreSQL migration:

1. **Check PostgreSQL logs**: `sudo tail -f /var/log/postgresql/postgresql-*.log`
2. **Verify connection**: `psql -h localhost -U pbs_user -d pbs_lms`
3. **Test Prisma connection**: `npx prisma db pull`
4. **Check data integrity**: Run verification script

## Related Documents

- [Ubuntu Migration Guide](ubuntu-migration-guide.md)
- [Database Schema](database.md)
- [Deployment Guide](deployment/guide.md)
- [Troubleshooting](troubleshooting.md) 