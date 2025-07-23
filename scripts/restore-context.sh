#!/bin/bash

# Restore Chat Context and History Script
# Usage: ./scripts/restore-context.sh [session-name]

echo "🔄 Restoring Chat Context and Development History..."

CONTEXT_DIR="context-history"

# Check if session name provided
if [ -z "$1" ]; then
    echo "❌ Please provide a session name to restore."
    echo "📋 Available sessions:"
    if [ -d "$CONTEXT_DIR" ]; then
        ls -1 "$CONTEXT_DIR"/*.json 2>/dev/null | sed 's/.*\///' | sed 's/\.json$//' | while read session; do
            echo "   • $session"
        done
    else
        echo "   (No saved sessions found)"
    fi
    echo ""
    echo "Usage: ./scripts/restore-context.sh <session-name>"
    exit 1
fi

SESSION_NAME="$1"
CONTEXT_FILE="$CONTEXT_DIR/$SESSION_NAME.json"

# Check if context file exists
if [ ! -f "$CONTEXT_FILE" ]; then
    echo "❌ Context file not found: $CONTEXT_FILE"
    echo "📋 Available sessions:"
    ls -1 "$CONTEXT_DIR"/*.json 2>/dev/null | sed 's/.*\///' | sed 's/\.json$//' | while read session; do
        echo "   • $session"
    done
    exit 1
fi

echo "📁 Found context file: $CONTEXT_FILE"

# Parse and display context information
echo ""
echo "📋 CONTEXT RESTORATION SUMMARY"
echo "================================"

# Extract key information using jq if available, otherwise use basic parsing
if command -v jq &> /dev/null; then
    echo "🕐 Saved At: $(jq -r '.session_info.saved_at' "$CONTEXT_FILE")"
    echo "👤 Saved By: $(jq -r '.session_info.saved_by' "$CONTEXT_FILE")"
    echo "🔧 Phase: $(jq -r '.project_status.phase' "$CONTEXT_FILE")"
    echo "⚡ Status: $(jq -r '.project_status.status' "$CONTEXT_FILE")"
    echo "🌐 Deployment: $(jq -r '.deployment_info.production_url' "$CONTEXT_FILE")"
    echo ""
    echo "📊 PROJECT STATE:"
    echo "   • Server: $(jq -r '.project_status.server_status' "$CONTEXT_FILE")"
    echo "   • Database: $(jq -r '.project_status.database_status' "$CONTEXT_FILE")"
    echo "   • Git Commit: $(jq -r '.git_context.current_commit' "$CONTEXT_FILE" | cut -c1-8)"
    echo "   • Git Branch: $(jq -r '.git_context.current_branch' "$CONTEXT_FILE")"
    echo ""
    echo "🎯 NEXT PRIORITIES:"
    jq -r '.immediate_next_steps | to_entries[] | "   • \(.key): \(.value)"' "$CONTEXT_FILE"
    echo ""
    echo "🚀 TESTING COMMANDS:"
    jq -r '.testing_commands | to_entries[] | "   \(.key): \(.value)"' "$CONTEXT_FILE"
    echo ""
    echo "📁 OPERATIONAL ENDPOINTS:"
    jq -r '.api_endpoints.operational | to_entries[] | "   • \(.key): \(.value)"' "$CONTEXT_FILE"
    echo ""
    echo "🔨 PHASE 3 READY:"
    jq -r '.api_endpoints.phase_3_ready | to_entries[] | "   • \(.key): \(.value)"' "$CONTEXT_FILE"
    echo ""
    echo "📝 RECENT ACHIEVEMENTS:"
    jq -r '.chat_history_summary.major_achievements[]' "$CONTEXT_FILE" | while read achievement; do
        echo "   • $achievement"
    done
else
    # Fallback parsing without jq
    echo "📄 Context file found and ready to use"
    echo "⚠️  Install 'jq' for detailed context parsing: brew install jq"
fi

echo ""
echo "================================"
echo ""

# Offer to start development server
echo "🚀 Ready to continue development!"
echo ""
echo "Quick actions:"
echo "   1️⃣  Start server: npm run dev"
echo "   2️⃣  Test health: curl http://localhost:3001/api/health"
echo "   3️⃣  Test database: node scripts/test-db.js"
echo "   4️⃣  View full context: cat $CONTEXT_FILE | jq ."
echo ""

# Ask if user wants to start the server
read -p "🔧 Start development server now? (y/n): " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
    echo "🚀 Starting development server..."
    npm run dev
fi

echo ""
echo "✅ Context restored successfully!"
echo "📁 Session: $SESSION_NAME"
echo "📋 Context file: $CONTEXT_FILE"
echo ""
echo "💡 Tip: Use 'node scripts/save-context.sh' to save your current progress"
