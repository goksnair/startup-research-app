#!/usr/bin/env node

/**
 * Daily Automated Backup Script
 * Automatically commits and pushes changes to GitHub
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

function log(message) {
    const timestamp = new Date().toISOString();
    console.log(`[${timestamp}] ${message}`);
}

function executeCommand(command, description) {
    try {
        log(`Executing: ${description}`);
        const output = execSync(command, { 
            encoding: 'utf8',
            cwd: path.join(__dirname, '..')
        });
        if (output.trim()) {
            log(`Output: ${output.trim()}`);
        }
        return output;
    } catch (error) {
        log(`Error executing ${description}: ${error.message}`);
        throw error;
    }
}

function createBackupSummary() {
    const date = new Date().toISOString().split('T')[0];
    const time = new Date().toTimeString().split(' ')[0];
    
    const summary = {
        backup_date: date,
        backup_time: time,
        timestamp: new Date().toISOString(),
        git_status: null,
        files_changed: 0,
        commit_hash: null,
        branch: null
    };
    
    try {
        // Get git status
        const gitStatus = executeCommand('git status --porcelain', 'Get git status');
        summary.git_status = gitStatus.trim();
        summary.files_changed = gitStatus.trim() ? gitStatus.trim().split('\n').length : 0;
        
        // Get current branch
        const branch = executeCommand('git branch --show-current', 'Get current branch');
        summary.branch = branch.trim();
        
        return summary;
    } catch (error) {
        log(`Error creating backup summary: ${error.message}`);
        return summary;
    }
}

async function performDailyBackup() {
    try {
        log('🔄 Starting daily automated backup...');
        
        // Create backup summary
        const summary = createBackupSummary();
        
        if (summary.files_changed === 0) {
            log('✅ No changes to commit. Repository is up to date.');
            return;
        }
        
        log(`📊 Found ${summary.files_changed} changed files`);
        
        // Add all changes
        executeCommand('git add .', 'Add all changes');
        
        // Create commit message
        const date = new Date().toISOString().split('T')[0];
        const commitMessage = `🔄 Daily backup - ${date}

📋 Backup Summary:
- Files changed: ${summary.files_changed}
- Branch: ${summary.branch}
- Timestamp: ${summary.timestamp}

🤖 Generated with [Claude Code](https://claude.ai/code)

Co-Authored-By: Claude <noreply@anthropic.com>`;
        
        // Commit changes
        executeCommand(`git commit -m "${commitMessage}"`, 'Commit changes');
        
        // Get commit hash
        const commitHash = executeCommand('git rev-parse HEAD', 'Get commit hash');
        summary.commit_hash = commitHash.trim();
        
        // Push to GitHub
        executeCommand(`git push origin ${summary.branch}`, 'Push to GitHub');
        
        // Save backup log
        const backupLogPath = path.join(__dirname, '..', 'backup-logs', `backup-${date}.json`);
        const backupLogDir = path.dirname(backupLogPath);
        
        if (!fs.existsSync(backupLogDir)) {
            fs.mkdirSync(backupLogDir, { recursive: true });
        }
        
        fs.writeFileSync(backupLogPath, JSON.stringify(summary, null, 2));
        
        log('✅ Daily backup completed successfully!');
        log(`📝 Backup log saved: ${backupLogPath}`);
        log(`🔗 Commit hash: ${summary.commit_hash}`);
        
    } catch (error) {
        log(`❌ Backup failed: ${error.message}`);
        process.exit(1);
    }
}

// Create backup logs directory if it doesn't exist
const backupLogsDir = path.join(__dirname, '..', 'backup-logs');
if (!fs.existsSync(backupLogsDir)) {
    fs.mkdirSync(backupLogsDir, { recursive: true });
}

// Run backup if this script is executed directly
if (require.main === module) {
    performDailyBackup();
}

module.exports = { performDailyBackup, createBackupSummary };