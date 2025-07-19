# Splitting Organizations Guide

## Overview

This document outlines the current state of organization separation in the LMS and provides guidance on implementing proper multi-tenancy when needed.

## Current State (Single-Tenant with Organization Labels)

### What We Have
- **Organization field** added to User and Subject models
- **Organization-specific login pages** (`/login-pbs.html`, `/login-hospital.html`, `/login-codingschool.html`)
- **Organization field** in user registration and authentication
- **Basic organization filtering** in some endpoints (e.g., teacher students endpoint)

### What's NOT Working
- **Email uniqueness** is global, not organization-specific
- **Data visibility** is not properly filtered by organization
- **Teachers can see all subjects/courses** regardless of organization
- **Students can see all assessments** regardless of organization
- **Most endpoints don't filter by organization**

### Current Issues
1. **Registration Problem**: Can't register `john@hospital.com` if `john@hospital.com` already exists in PBS
2. **Data Leakage**: Hospital teachers can see PBS courses and students
3. **Incomplete Implementation**: Organization field exists but isn't consistently used

## When to Implement Proper Separation

### Keep Current Setup If:
- ✅ PBS is the main organization (90%+ of usage)
- ✅ Hospital and Coding School are small components
- ✅ Testing and development phase
- ✅ Core features still need work

### Implement Proper Separation When:
- 🚨 Hospital/Coding School usage grows significantly
- 🚨 Different features needed for each organization
- 🚨 Security requirements become stricter
- 🚨 Planning to sell/license to other schools
- 🚨 Data isolation becomes critical

## Implementation Options

### Option A: Complete Multi-Tenant Implementation

**What it involves:**
- Update **all endpoints** to filter by organization
- Make email uniqueness organization-specific
- Add organization filtering to all data queries
- Update database relationships to be organization-scoped

**Pros:**
- ✅ Single codebase to maintain
- ✅ Shared infrastructure
- ✅ Easier updates and deployments

**Cons:**
- ❌ Major refactoring required
- ❌ Complex testing needed
- ❌ Risk of data leakage if not done properly
- ❌ Performance impact from additional filtering

**Required Changes:**
```javascript
// Email uniqueness (current - WRONG)
const existingUser = await prisma.user.findFirst({ where: { email } });

// Email uniqueness (correct - organization-specific)
const existingUser = await prisma.user.findFirst({ 
    where: { 
        email, 
        organization: userOrganization 
    } 
});

// Data filtering (current - shows all data)
const subjects = await prisma.subject.findMany();

// Data filtering (correct - organization-specific)
const subjects = await prisma.subject.findMany({
    where: { organization: userOrganization }
});
```

### Option B: Separate Instances (Recommended)

**What it involves:**
- Run **separate LMS instances** for each organization
- Each has its own database and configuration
- Use subdomains or different ports for separation

**Pros:**
- ✅ True data isolation
- ✅ Simple to implement
- ✅ Easy to scale independently
- ✅ Professional appearance
- ✅ Can use same codebase with different configs

**Cons:**
- ❌ Multiple deployments to manage
- ❌ Separate databases to maintain
- ❌ Slightly more infrastructure

## Subdomain Implementation (Option B - Recommended)

### Architecture
```
pbs-lms.store          → PBS LMS (Port 3000)
hospital.pbs-lms.store → Hospital LMS (Port 3001)  
coding.pbs-lms.store   → Coding School LMS (Port 3002)
```

### Setup Steps

1. **Deploy Separate Instances**
   ```bash
   # PBS Instance
   PORT=3000 DB_NAME=pbs_lms pm2 start server.js --name pbs-lms
   
   # Hospital Instance  
   PORT=3001 DB_NAME=hospital_lms pm2 start server.js --name hospital-lms
   
   # Coding School Instance
   PORT=3002 DB_NAME=coding_lms pm2 start server.js --name coding-lms
   ```

2. **Configure Cloudflare DNS**
   - Add A records for each subdomain pointing to your server IP
   - Configure routing rules to direct traffic to appropriate ports

3. **Environment Configuration**
   ```env
   # PBS (.env.pbs)
   PORT=3000
   DATABASE_URL="postgresql://user:pass@localhost:5432/pbs_lms"
   ORGANIZATION=PBS
   
   # Hospital (.env.hospital)  
   PORT=3001
   DATABASE_URL="postgresql://user:pass@localhost:5432/hospital_lms"
   ORGANIZATION=HOSPITAL
   
   # Coding (.env.coding)
   PORT=3002
   DATABASE_URL="postgresql://user:pass@localhost:5432/coding_lms"
   ORGANIZATION=CODING
   ```

4. **Database Setup**
   ```sql
   -- Create separate databases
   CREATE DATABASE pbs_lms;
   CREATE DATABASE hospital_lms;
   CREATE DATABASE coding_lms;
   ```

### Alternative: Path-Based Separation

If subdomains aren't preferred:
```
pbs-lms.store/pbs/     → PBS LMS
pbs-lms.store/hospital/ → Hospital LMS
pbs-lms.store/coding/   → Coding School LMS
```

**Implementation:**
- Single Node.js instance
- Express.js middleware to route based on path
- Different database connections per organization
- More complex but single server

## Migration Strategy

### Phase 1: Preparation (Current)
- ✅ Organization field exists
- ✅ Basic organization awareness
- ✅ Identify all endpoints that need filtering

### Phase 2: Decision Point
- Monitor Hospital/Coding School usage
- Decide between Option A (multi-tenant) or Option B (separate instances)
- Plan migration timeline

### Phase 3: Implementation
- **If Option A**: Gradual endpoint updates with thorough testing
- **If Option B**: Set up separate instances and migrate data

### Phase 4: Testing & Deployment
- Comprehensive testing of organization separation
- Data migration and validation
- User communication and training

## Security Considerations

### Data Isolation
- Ensure no cross-organization data access
- Implement proper authentication per organization
- Regular security audits

### User Management
- Organization-specific user registration
- Proper role-based access control
- Audit trails for cross-organization activities

### Backup & Recovery
- Separate backup strategies per organization
- Disaster recovery plans
- Data retention policies

## Monitoring & Maintenance

### Usage Tracking
- Monitor organization-specific usage patterns
- Track feature adoption per organization
- Performance metrics per instance

### Maintenance Tasks
- Regular database maintenance per organization
- Update deployments across instances
- Monitor resource usage and scaling needs

## Conclusion

The current single-tenant setup with organization labels is **adequate for the current usage patterns** where PBS is the primary organization and Hospital/Coding School are small components.

**Recommendation:** Keep the current setup until Hospital/Coding School usage justifies the complexity of proper separation. When that time comes, **Option B (separate instances with subdomains)** is recommended for its simplicity, security, and scalability.

## Related Documents
- [System Structure](system-structure.md)
- [Database Schema](database.md)
- [Deployment Guide](deployment/guide.md) 