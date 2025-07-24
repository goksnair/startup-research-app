#!/bin/bash

# Quick Project Status Script
# Shows current deployment status and key information

echo "🚀 STARTUP RESEARCH APP - CURRENT STATUS"
echo "========================================"
echo ""

# Check if we're in the right directory
if [ ! -f "package.json" ]; then
    echo "❌ Error: Not in project root directory"
    exit 1
fi

# Production URL
echo "📊 PRODUCTION DEPLOYMENT:"
echo "   URL: https://startupresearchapp-production.up.railway.app"
echo "   Platform: Railway"
echo "   Status: $(curl -s https://startupresearchapp-production.up.railway.app/api/status | jq -r '.status' 2>/dev/null || echo 'Checking...')"
echo ""

# Quick health check
echo "🔍 HEALTH CHECK:"
HTTP_STATUS=$(curl -s -o /dev/null -w "%{http_code}" https://startupresearchapp-production.up.railway.app/api/status)
if [ "$HTTP_STATUS" = "200" ]; then
    echo "   ✅ API Status: Healthy"
else
    echo "   ⚠️  API Status: Error ($HTTP_STATUS)"
fi

# Check main page
HTTP_STATUS_MAIN=$(curl -s -o /dev/null -w "%{http_code}" https://startupresearchapp-production.up.railway.app/)
if [ "$HTTP_STATUS_MAIN" = "200" ]; then
    echo "   ✅ Main Page: Accessible"
else
    echo "   ⚠️  Main Page: Error ($HTTP_STATUS_MAIN)"
fi

echo ""

# Git status
echo "📝 GIT STATUS:"
if git status --porcelain | grep -q .; then
    echo "   ⚠️  Uncommitted changes present"
    echo "   Run: git status"
else
    echo "   ✅ Working directory clean"
fi

BRANCH=$(git branch --show-current)
echo "   Current branch: $BRANCH"
echo ""

# Available features
echo "🎯 AVAILABLE FEATURES:"
echo "   🔍 Research: https://startupresearchapp-production.up.railway.app/"
echo "   📊 Dashboard: https://startupresearchapp-production.up.railway.app/dashboard.html"
echo "   ⚡ Batch Processing: https://startupresearchapp-production.up.railway.app/batch.html"
echo "   🔐 User Portal: https://startupresearchapp-production.up.railway.app/index-auth.html"
echo "   ⚙️ Admin Panel: https://startupresearchapp-production.up.railway.app/admin.html"
echo "   📚 API Docs: https://startupresearchapp-production.up.railway.app/api/docs"
echo ""

# Documentation
echo "📚 DOCUMENTATION:"
echo "   • docs/CURRENT-PROJECT-STATUS.md"
echo "   • docs/RAILWAY-DEPLOYMENT-GUIDE.md"
echo "   • docs/chat-history/ (Development sessions)"
echo ""

# Quick commands
echo "🛠  QUICK COMMANDS:"
echo "   • Deploy update: railway up"
echo "   • View logs: railway logs"
echo "   • Test API: curl https://startupresearchapp-production.up.railway.app/api/status"
echo "   • Update docs: ./scripts/update-github-and-save-context.sh"
echo ""

echo "========================================"
echo "✅ Status check complete!"
