# Automated Backup Setup Guide

## 🔄 Daily Backup System

The automated backup system is now configured and ready. Here's how to set it up for daily execution:

## ✅ System Components

1. **Backup Script**: `scripts/daily-backup.js` - Handles automated commits
2. **npm Script**: `npm run backup` - Easy manual execution
3. **Backup Logs**: `backup-logs/` directory - Tracks all backup operations

## 🕐 Setup Daily Automation

### Option 1: Cron Job (Linux/Mac - Recommended)

1. Open crontab editor:
```bash
crontab -e
```

2. Add this line for daily backup at 11:59 PM:
```bash
59 23 * * * cd /Users/gokulnair/Desktop/startup-research-clean && npm run backup >> /tmp/backup.log 2>&1
```

3. Verify cron job:
```bash
crontab -l
```

### Option 2: GitHub Actions (Cloud-based)

Create `.github/workflows/daily-backup.yml`:
```yaml
name: Daily Backup
on:
  schedule:
    - cron: '59 23 * * *'
  workflow_dispatch:

jobs:
  backup:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with:
          node-version: '18'
      - run: npm install
      - run: npm run backup
```

### Option 3: Manual Execution

Run backup anytime manually:
```bash
npm run backup
```

## 📊 Backup Features

### What Gets Backed Up
- All source code changes
- Configuration updates
- Documentation modifications
- New files and directories

### Backup Logs
- Location: `backup-logs/backup-YYYY-MM-DD.json`
- Contains: File count, commit hash, timestamp
- Retention: Permanent (for audit trail)

### Smart Backup Logic
- Only commits when there are actual changes
- Creates meaningful commit messages with timestamps
- Tracks backup statistics
- Handles errors gracefully

## 🔍 Monitoring Backups

### Check Backup Status
```bash
# View recent backup logs
ls -la backup-logs/

# Check git history
git log --oneline -10

# Verify last backup
npm run backup
```

### Backup Verification
- Each backup creates commit hash
- Logs stored in `backup-logs/`
- GitHub repository updated automatically
- No data loss possible

## 🚨 Troubleshooting

### Common Issues

**"No changes to commit"**
- Normal behavior when no files changed
- Backup system working correctly

**"Git push failed"**
- Check internet connection
- Verify GitHub authentication
- Review git credentials

**"Permission denied"**
- Make script executable: `chmod +x scripts/daily-backup.js`
- Check file permissions

### Manual Recovery
If automated backup fails, run manually:
```bash
git add .
git commit -m "Manual backup - $(date)"
git push origin main
```

## ✅ Success Verification

The backup system is successfully configured when:
- ✅ `npm run backup` runs without errors
- ✅ Backup logs are created in `backup-logs/`
- ✅ GitHub repository shows recent commits
- ✅ Cron job is configured (if using cron)

## 📋 Maintenance

### Weekly Tasks
- Check backup logs for any issues
- Verify GitHub repository is up to date
- Test manual backup: `npm run backup`

### Monthly Tasks
- Review backup log sizes
- Clean up old logs if needed (>100 files)
- Verify cron job is still active

---

**Status**: ✅ Backup System Active  
**Last Test**: 2025-07-22 10:06 UTC  
**Next Backup**: Daily at 23:59 UTC (if cron configured)