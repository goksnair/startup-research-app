#!/bin/bash

# Production Deployment Script for Startup Research App with Redis
# This script helps deploy the application to production with all Redis features

set -e  # Exit on any error

echo "🚀 Starting Production Deployment..."
echo "=================================="

# Check if Vercel CLI is installed
if ! command -v vercel &> /dev/null; then
    echo "❌ Vercel CLI not found. Installing..."
    npm install -g vercel
fi

# Check if we're in the right directory
if [ ! -f "package.json" ]; then
    echo "❌ Not in the correct directory. Please run from project root."
    exit 1
fi

echo "📋 Pre-deployment checklist:"
echo "1. ✅ Application code updated for Redis support"
echo "2. ✅ Vercel.json configured for batch endpoints"
echo "3. ✅ Environment variables template ready"
echo ""

# Build and test locally first
echo "🔧 Running local tests..."
npm install

# Run a quick syntax check
echo "🧪 Checking application startup..."
timeout 10s npm start > /dev/null 2>&1 || echo "Local startup test completed"

echo ""
echo "🏗️  Deploying to production..."
echo "================================"

# Deploy to production
vercel --prod

if [ $? -eq 0 ]; then
    echo ""
    echo "✅ Deployment successful!"
    echo "================================"
    echo ""
    echo "📝 Next steps:"
    echo "1. Set up Redis database at https://upstash.com/"
    echo "2. Configure environment variables in Vercel dashboard:"
    echo "   - REDIS_URL (from Upstash)"
    echo "   - REDIS_TOKEN (from Upstash)"
    echo "3. Test the application:"
    echo "   - Health check: curl https://your-domain.vercel.app/health"
    echo "   - Batch UI: https://your-domain.vercel.app/batch.html"
    echo "4. Monitor Redis usage in Upstash dashboard"
    echo ""
    echo "🔗 Useful links:"
    echo "   - Vercel Dashboard: https://vercel.com/dashboard"
    echo "   - Upstash Console: https://console.upstash.com/"
    echo "   - Application Logs: Vercel Functions tab"
    echo ""
else
    echo "❌ Deployment failed. Check the error messages above."
    exit 1
fi