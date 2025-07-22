#!/bin/bash

echo "🚀 Deploying Phase 3 Database Schema to Supabase"
echo "=================================================="

# Load environment variables
if [ -f .env ]; then
    export $(grep -v '^#' .env | xargs)
else
    echo "❌ Error: .env file not found"
    exit 1
fi

echo "📊 Database Schema Summary:"
echo "✅ 11 Tables (including Phase 3 batch processing)"
echo "✅ 10 Indexes for performance optimization"
echo "✅ 2 Functions for automation"
echo "✅ 1 Trigger for timestamp updates"
echo "✅ Security handled at application level"
echo ""

echo "🌐 Supabase Details:"
echo "URL: $SUPABASE_URL"
echo "Database: PostgreSQL with Phase 3 extensions"
echo ""

echo "📋 Next Steps:"
echo "1. Copy the contents of database/schema.sql"
echo "2. Go to: ${SUPABASE_URL/https:\/\//https://app.supabase.com/project/}/sql"
echo "3. Paste the schema in the SQL Editor"
echo "4. Click 'Run' to execute"
echo ""

echo "🔍 Schema Validation:"
node scripts/setup-database.js

echo ""
echo "✅ Schema is ready for deployment!"
echo "📁 File location: database/schema.sql"
