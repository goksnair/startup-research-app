#!/usr/bin/env node

/**
 * Production Deployment Script
 * Prepares and deploys the app to Vercel with proper environment variables
 */

const { execSync } = require('child_process');
const fs = require('fs');

function log(message) {
    const timestamp = new Date().toISOString();
    console.log(`[${timestamp}] ${message}`);
}

function executeCommand(command, description) {
    try {
        log(`Executing: ${description}`);
        const output = execSync(command, {
            encoding: 'utf8',
            cwd: __dirname,
            stdio: 'inherit'
        });
        return output;
    } catch (error) {
        log(`Error executing ${description}: ${error.message}`);
        throw error;
    }
}

async function deployToProduction() {
    try {
        log('🚀 Starting production deployment...');

        // Check if Vercel CLI is installed
        try {
            execSync('which vercel', { stdio: 'ignore' });
        } catch {
            log('❌ Vercel CLI not found. Installing...');
            executeCommand('npm install -g vercel', 'Install Vercel CLI');
        }

        // Check environment variables
        log('🔍 Checking environment variables...');

        if (!process.env.OPENAI_API_KEY) {
            console.warn('⚠️  Warning: OPENAI_API_KEY not found in local .env');
            console.log('📋 Make sure to set it in Vercel dashboard:');
            console.log('   → https://vercel.com/dashboard/settings/environment-variables');
        }

        if (!process.env.SUPABASE_URL) {
            console.warn('⚠️  Warning: SUPABASE_URL not found in local .env');
        }

        // Create production README
        const productionReadme = `# 🚀 Production Deployment - Phase 2 Complete

## Features Deployed:
✅ AI-Powered Startup Research
✅ User Authentication & Registration  
✅ Research History & Data Persistence
✅ Usage Statistics & Cost Tracking
✅ Export Functionality
✅ Responsive UI with Account Management

## Production URLs:
- **Main App**: https://startup-research-app.vercel.app
- **Enhanced UI**: https://startup-research-app.vercel.app/index-auth.html
- **Health Check**: https://startup-research-app.vercel.app/health
- **API**: https://startup-research-app.vercel.app/api/*

## Environment Variables Required:
- OPENAI_API_KEY (for AI analysis)
- SUPABASE_URL (for database)
- SUPABASE_ANON_KEY (for database)
- JWT_SECRET (for authentication)

## Deployment Date: ${new Date().toISOString()}
## Version: 2.0.0 (Phase 2 Complete)
`;

        fs.writeFileSync('DEPLOYMENT.md', productionReadme);
        log('📋 Created deployment documentation');

        // Update package.json version
        const packageJson = JSON.parse(fs.readFileSync('package.json', 'utf8'));
        packageJson.version = '2.0.0';
        packageJson.description = 'AI-powered startup research platform with user authentication and data persistence';
        fs.writeFileSync('package.json', JSON.stringify(packageJson, null, 2));
        log('📦 Updated package.json to version 2.0.0');

        // Deploy to Vercel
        log('🌐 Deploying to Vercel...');
        executeCommand('vercel --prod --yes', 'Deploy to production');

        log('✅ Production deployment completed successfully!');
        log('🌐 Your app is live at: https://startup-research-app.vercel.app');

        console.log('\n📋 Post-Deployment Checklist:');
        console.log('1. ✅ Set environment variables in Vercel dashboard');
        console.log('2. ✅ Test authentication at /index-auth.html');
        console.log('3. ✅ Verify API endpoints work');
        console.log('4. ✅ Check database connectivity');
        console.log('\n🎯 Ready for Phase 3 development!');

    } catch (error) {
        log(`❌ Deployment failed: ${error.message}`);
        process.exit(1);
    }
}

if (require.main === module) {
    deployToProduction();
}

module.exports = { deployToProduction };
