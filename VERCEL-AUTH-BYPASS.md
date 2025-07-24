# How to Remove Vercel Authentication Protection

## Option 1: Vercel Dashboard Settings
1. Go to https://vercel.com/dashboard
2. Select your project: startup-research-clean
3. Go to Settings > Security
4. Disable "Password Protection" or "Team SSO"
5. Redeploy the project

## Option 2: Environment Variables
Set these in Vercel:
- VERCEL_PROTECT_BYPASS=true
- NODE_ENV=production

## Option 3: Change File Extensions
Rename .html files to avoid Vercel's auto-protection:
- batch.html → batch-ui.html
- admin.html → admin-ui.html
- dashboard.html → dashboard-ui.html

## Option 4: Use Alternative Hosting
Deploy to:
- Netlify (no auto-protection)
- Railway (simpler configuration)
- Your own server/VPS

## Current Workaround
Access via API endpoints:
- /api/ui/dashboard (serves dashboard.html)
- /api/ui/batch (serves batch.html)  
- /api/ui/admin (serves admin.html)
