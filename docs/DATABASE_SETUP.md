# Database Setup Guide

## Quick Start

### 1. Start PostgreSQL

Using Docker:
```bash
docker-compose -f docker-compose.prod.yml up -d postgres
```

Or install locally:
```bash
# Ubuntu/Debian
sudo apt-get install postgresql

# macOS
brew install postgresql
```

### 2. Create Database

```bash
# Connect to PostgreSQL
psql -U postgres

# Create database and user
CREATE DATABASE scrapex;
CREATE USER scrapex WITH ENCRYPTED PASSWORD 'your_secure_password';
GRANT ALL PRIVILEGES ON DATABASE scrapex TO scrapex;
\q
```

### 3. Set Environment Variable

```bash
# .env
DATABASE_URL=postgresql://scrapex:your_secure_password@localhost:5432/scrapex
```

### 4. Run Migrations

```bash
cd core-engine
npm run db:migrate
```

## Migration Commands

```bash
# Run all pending migrations
npm run db:migrate

# Rollback last migration
npm run db:rollback
```

## Verify Setup

```bash
# Connect to database
psql $DATABASE_URL

# List tables
\dt

# Check users table
SELECT * FROM users;
\q
```

## Database Schema

### Tables Created:
- ✅ `users` - User accounts
- ✅ `api_keys` - Internal API keys
- ✅ `external_keys` - LLM provider keys
- ✅ `scraping_jobs` - Job history
- ✅ `usage_analytics` - API usage tracking
- ✅ `subscriptions` - User subscriptions
- ✅ `audit_logs` - Security audit trail
- ✅ `schema_migrations` - Migration tracking

## Default Admin User

**Email:** `admin@scrapex.com`  
**Password:** `admin123`

⚠️ **IMPORTANT:** Change this password immediately in production!

## Connection Pooling

The app uses connection pooling for optimal performance:
- Min connections: 2
- Max connections: 10
- Idle timeout: 30s

Configure in `.env`:
```bash
DATABASE_POOL_MIN=2
DATABASE_POOL_MAX=10
```

## Backup & Restore

### Backup
```bash
pg_dump $DATABASE_URL > backup.sql
```

### Restore
```bash
psql $DATABASE_URL < backup.sql
```

## Troubleshooting

### Connection Refused
```bash
# Check if PostgreSQL is running
sudo systemctl status postgresql

# Start PostgreSQL
sudo systemctl start postgresql
```

### Permission Denied
```bash
# Grant permissions
psql -U postgres
GRANT ALL PRIVILEGES ON DATABASE scrapex TO scrapex;
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO scrapex;
```

### Migration Failed
```bash
# Check migration status
psql $DATABASE_URL -c "SELECT * FROM schema_migrations;"

# Manually rollback if needed
npm run db:rollback
```
