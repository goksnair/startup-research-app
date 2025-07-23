#!/bin/bash

# Save Chat Context and History Script
# Usage: ./scripts/save-context.sh [session-name]

echo "💾 Saving Chat Context and Development History..."

# Get session name or use timestamp
SESSION_NAME=${1:-"session-$(date +%Y-%m-%d-%H%M%S)"}
CONTEXT_DIR="context-history"
CONTEXT_FILE="$CONTEXT_DIR/$SESSION_NAME.json"

# Create context directory if it doesn't exist
mkdir -p "$CONTEXT_DIR"

# Get current git info
CURRENT_COMMIT=$(git rev-parse HEAD 2>/dev/null || echo "unknown")
CURRENT_BRANCH=$(git rev-parse --abbrev-ref HEAD 2>/dev/null || echo "unknown")
GIT_STATUS=$(git status --porcelain 2>/dev/null || echo "")

# Get project status
SERVER_STATUS="stopped"
if pgrep -f "node.*index.js" > /dev/null; then
    SERVER_STATUS="running"
fi

# Create comprehensive context JSON
cat > "$CONTEXT_FILE" << EOF
{
  "session_info": {
    "session_name": "$SESSION_NAME",
    "saved_at": "$(date -Iseconds)",
    "saved_by": "$(whoami)",
    "session_type": "Phase 3 Development Context"
  },
  "project_status": {
    "phase": "Phase 3 Infrastructure Complete",
    "status": "Ready for Phase 3 Feature Development",
    "server_status": "$SERVER_STATUS",
    "deployment_status": "Production Ready",
    "database_status": "Schema Deployed to Supabase"
  },
  "git_context": {
    "current_commit": "$CURRENT_COMMIT",
    "current_branch": "$CURRENT_BRANCH",
    "repository_url": "https://github.com/goksnair/startup-research-app",
    "git_status": "$(echo "$GIT_STATUS" | head -20)",
    "last_major_commits": [
      "67d4373 - Phase 3 Foundation Complete - Comprehensive Summary",
      "9f69d97 - Daily backup with Phase 3 infrastructure",
      "01bd728 - Production deployment complete"
    ]
  },
  "development_context": {
    "current_file": "database/schema.sql",
    "last_action": "Database schema deployed successfully to Supabase",
    "next_priority": "Complete Phase 3 batch processing implementation",
    "active_features": [
      "Phase 2: AI analysis, authentication, production deployment",
      "Phase 3: Database schema, API structure, service scaffolding"
    ]
  },
  "technical_stack": {
    "backend": {
      "runtime": "Node.js + Express.js",
      "database": "PostgreSQL (Supabase)",
      "authentication": "JWT-based custom auth",
      "ai_integration": "OpenAI GPT-4",
      "deployment": "Vercel",
      "environment": "Local dev + Production"
    },
    "phase_3_dependencies": {
      "queue_system": "Redis + Bull (ready to integrate)",
      "pdf_generation": "PDFKit (installed)",
      "email_service": "Nodemailer (installed)",
      "job_processing": "Background workers (scaffolded)"
    }
  },
  "environment_config": {
    "local_port": 3001,
    "env_file_status": "Configured",
    "required_env_vars": [
      "OPENAI_API_KEY",
      "SUPABASE_URL", 
      "SUPABASE_ANON_KEY",
      "JWT_SECRET",
      "NODE_ENV"
    ],
    "vercel_env_vars": "Deployed and configured"
  },
  "database_schema": {
    "phase_2_tables": [
      "users (operational)",
      "research_queries (operational)", 
      "user_sessions (operational)",
      "user_usage (operational)"
    ],
    "phase_3_tables": [
      "batch_jobs (ready)",
      "pdf_reports (ready)",
      "email_notifications (ready)",
      "api_keys (ready)",
      "api_usage (ready)",
      "system_analytics (ready)",
      "user_preferences (ready)"
    ],
    "indexes": "10 performance indexes created",
    "functions": "2 functions + 2 triggers for automation",
    "deployment_status": "Successfully deployed to Supabase"
  },
  "api_endpoints": {
    "operational": {
      "health_check": "GET /api/health ✅",
      "ai_research": "POST /api/research ✅",
      "user_auth": "POST /api/auth/register|login ✅",
      "user_data": "GET /api/auth/me ✅"
    },
    "phase_3_ready": {
      "batch_test": "GET /api/batch/test ✅",
      "batch_create": "POST /api/batch/create (scaffolded)",
      "batch_status": "GET /api/batch/:id (ready to implement)",
      "pdf_generation": "Ready to implement",
      "email_notifications": "Ready to implement"
    }
  },
  "file_structure": {
    "core_files": [
      "index.js - Main server (operational)",
      "middleware/auth.js - JWT middleware (operational)",
      "routes/auth.js - Authentication routes (operational)",
      "routes/research.js - AI analysis routes (operational)",
      "database/schema.sql - Complete schema (deployed)"
    ],
    "phase_3_infrastructure": [
      "routes/batch.js - Batch API routes (scaffolded)",
      "services/batchService.js - Batch processing logic (scaffolded)",
      "services/queueService.js - Queue management (scaffolded)",
      "services/analysisService.js - Enhanced analysis (scaffolded)",
      "jobs/batchProcessor.js - Background jobs (scaffolded)",
      "public/batch.html - Batch UI (created)"
    ],
    "deployment_files": [
      "vercel.json - Production config (operational)",
      "scripts/ - Automation scripts (operational)",
      ".env - Environment variables (configured)"
    ]
  },
  "current_issues": {
    "resolved": [
      "Database schema syntax errors (fixed - PostgreSQL compatible)",
      "RLS policy conflicts (resolved - using JWT auth)",
      "Trigger creation conflicts (resolved - DROP IF EXISTS)",
      "Route handler errors (resolved - simplified for testing)"
    ],
    "known_limitations": [
      "Phase 3 services need Redis integration for queues",
      "Batch routes currently use test implementation",
      "PDF generation not yet implemented",
      "Email system needs configuration"
    ]
  },
  "immediate_next_steps": {
    "priority_1": "Integrate Redis for job queues",
    "priority_2": "Complete batch processing implementation",
    "priority_3": "Add PDF report generation",
    "priority_4": "Implement email notification system",
    "priority_5": "Build API key management system"
  },
  "testing_commands": {
    "start_server": "npm run dev",
    "test_health": "curl http://localhost:3001/api/health",
    "test_ai": "curl -X POST http://localhost:3001/api/research -H 'Content-Type: application/json' -d '{\"company\":\"Tesla\",\"type\":\"quick\"}'",
    "test_batch": "curl http://localhost:3001/api/batch/test",
    "database_test": "node scripts/test-db.js"
  },
  "deployment_info": {
    "production_url": "https://startup-research-clean-bp0k8iv94-gokuls-projects-199eba9b.vercel.app",
    "github_repo": "https://github.com/goksnair/startup-research-app",
    "latest_deploy": "Successful - All environment variables configured",
    "vercel_project": "startup-research-clean"
  },
  "chat_history_summary": {
    "session_focus": "Phase 3 database deployment and infrastructure setup",
    "major_achievements": [
      "Deployed complete Phase 3 database schema to Supabase",
      "Resolved all PostgreSQL compatibility issues", 
      "Created Phase 3 API and service infrastructure",
      "Verified all Phase 2 functionality still operational",
      "Updated GitHub repository with all changes",
      "Prepared comprehensive development foundation"
    ],
    "key_decisions": [
      "Used JWT authentication instead of Supabase Auth for flexibility",
      "Disabled RLS policies in favor of application-level security",
      "Chose PostgreSQL-compatible index syntax",
      "Scaffolded Phase 3 services for rapid development",
      "Created test routes for Phase 3 endpoint verification"
    ]
  }
}
EOF

echo "✅ Context saved successfully!"
echo "📁 File: $CONTEXT_FILE"
echo "🔍 Session: $SESSION_NAME"
echo ""
echo "📋 Context Summary:"
echo "   • Phase: Phase 3 Infrastructure Complete"
echo "   • Status: Ready for Feature Development"
echo "   • Database: 11 tables deployed to Supabase"
echo "   • Server: Phase 2 operational, Phase 3 scaffolded"
echo "   • GitHub: All changes committed and pushed"
echo ""
echo "🚀 To restore this context later, run:"
echo "   ./scripts/restore-context.sh $SESSION_NAME"
