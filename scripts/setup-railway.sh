#!/bin/bash

# Railway Deployment Script
# This script sets up Railway deployment as an alternative to Vercel

echo "🚀 Setting up Railway deployment..."

# Check if Railway CLI is installed
if ! command -v railway &> /dev/null; then
    echo "Installing Railway CLI..."
    npm install -g @railway/cli
fi

# Login to Railway (this will open browser)
echo "Please login to Railway in the browser that opens..."
railway login

# Initialize Railway project
echo "Creating Railway project..."
railway init

# Set environment variables
echo "Setting environment variables..."
railway variables set NODE_ENV=production
railway variables set PORT=3000

# Add Railway-specific files
echo "Adding Railway configuration..."

# Create railway.json
cat > railway.json << 'EOF'
{
  "$schema": "https://railway.app/railway.schema.json",
  "build": {
    "builder": "NIXPACKS"
  },
  "deploy": {
    "startCommand": "npm start",
    "restartPolicyType": "ON_FAILURE",
    "restartPolicyMaxRetries": 10
  }
}
EOF

# Create .railwayignore
cat > .railwayignore << 'EOF'
node_modules
.env.local
.env.example
.git
.gitignore
README.md
*.md
.vercel
vercel.json
backup-logs
EOF

echo "✅ Railway setup complete!"
echo ""
echo "Next steps:"
echo "1. Set your environment variables: railway variables set OPENAI_API_KEY=your_key"
echo "2. Set other env vars: SUPABASE_URL, SUPABASE_ANON_KEY, JWT_SECRET"
echo "3. Deploy: railway up"
echo ""
echo "Railway will provide a public URL with NO SSO protection!"
