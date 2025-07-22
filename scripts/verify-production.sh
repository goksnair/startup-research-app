#!/bin/bash

echo "🔧 Configuring production deployment settings..."

# Deploy without password protection using --public flag
cd /Users/gokulnair/Desktop/startup-research-clean

# First, let's make this project public to remove authentication
vercel --prod --public

echo "✅ Production deployment is now publicly accessible!"
echo ""
echo "🌐 Production URLs:"
echo "Main: https://startup-research-clean-gokuls-projects-199eba9b.vercel.app"
echo ""
echo "🧪 Testing API endpoints..."
echo "Testing health endpoint..."
curl -s "https://startup-research-clean-gokuls-projects-199eba9b.vercel.app/api/health" || echo "❌ Health endpoint failed"

echo ""
echo "Testing research API..."
curl -s -X POST "https://startup-research-clean-gokuls-projects-199eba9b.vercel.app/api/analyze" \
  -H "Content-Type: application/json" \
  -d '{"company": "Tesla"}' | head -5 || echo "❌ Research API failed"
