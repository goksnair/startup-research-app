#!/bin/bash

# Chat Context Management Script
# Usage: ./scripts/manage-context.sh [list|view|save|restore|delete] [session-name]

echo "📚 Chat Context Management System"
echo "================================"

CONTEXT_DIR="context-history"
ACTION="${1:-list}"

case "$ACTION" in
    "list")
        echo "📋 Available Chat Sessions:"
        echo ""
        if [ -d "$CONTEXT_DIR" ] && [ "$(ls -A "$CONTEXT_DIR"/*.json 2>/dev/null)" ]; then
            for context_file in "$CONTEXT_DIR"/*.json; do
                if [ -f "$context_file" ]; then
                    session_name=$(basename "$context_file" .json)
                    if command -v jq &> /dev/null; then
                        saved_at=$(jq -r '.session_info.saved_at' "$context_file" 2>/dev/null || echo "unknown")
                        phase=$(jq -r '.project_status.phase' "$context_file" 2>/dev/null || echo "unknown")
                        status=$(jq -r '.project_status.status' "$context_file" 2>/dev/null || echo "unknown")
                        echo "📁 $session_name"
                        echo "   🕐 Saved: $saved_at"
                        echo "   🔧 Phase: $phase"
                        echo "   ⚡ Status: $status"
                        echo ""
                    else
                        echo "📁 $session_name ($(date -r "$context_file" "+%Y-%m-%d %H:%M"))"
                    fi
                fi
            done
        else
            echo "   (No saved sessions found)"
            echo ""
            echo "💡 Save your first session with:"
            echo "   ./scripts/save-context.sh my-session-name"
        fi
        ;;
        
    "view")
        if [ -z "$2" ]; then
            echo "❌ Please provide a session name to view."
            echo "Usage: $0 view <session-name>"
            exit 1
        fi
        
        SESSION_NAME="$2"
        CONTEXT_FILE="$CONTEXT_DIR/$SESSION_NAME.json"
        
        if [ ! -f "$CONTEXT_FILE" ]; then
            echo "❌ Session not found: $SESSION_NAME"
            exit 1
        fi
        
        echo "📄 Viewing Session: $SESSION_NAME"
        echo "================================"
        
        if command -v jq &> /dev/null; then
            echo "📊 SESSION INFO:"
            jq -r '.session_info | to_entries[] | "   \(.key): \(.value)"' "$CONTEXT_FILE"
            echo ""
            echo "📊 PROJECT STATUS:"
            jq -r '.project_status | to_entries[] | "   \(.key): \(.value)"' "$CONTEXT_FILE"
            echo ""
            echo "🔧 GIT CONTEXT:"
            jq -r '.git_context | to_entries[] | "   \(.key): \(.value)"' "$CONTEXT_FILE"
            echo ""
            echo "🎯 NEXT STEPS:"
            jq -r '.immediate_next_steps | to_entries[] | "   \(.key): \(.value)"' "$CONTEXT_FILE"
            echo ""
            echo "📝 RECENT WORK:"
            jq -r '.chat_history_summary.major_achievements[]' "$CONTEXT_FILE" | while read achievement; do
                echo "   • $achievement"
            done
        else
            echo "📄 Raw JSON (install jq for better formatting):"
            cat "$CONTEXT_FILE"
        fi
        ;;
        
    "save")
        SESSION_NAME="${2:-"session-$(date +%Y-%m-%d-%H%M%S)"}"
        echo "💾 Saving current context as: $SESSION_NAME"
        ./scripts/save-context.sh "$SESSION_NAME"
        ;;
        
    "restore")
        if [ -z "$2" ]; then
            echo "❌ Please provide a session name to restore."
            echo "📋 Available sessions:"
            $0 list
            exit 1
        fi
        
        SESSION_NAME="$2"
        echo "🔄 Restoring session: $SESSION_NAME"
        ./scripts/restore-context.sh "$SESSION_NAME"
        ;;
        
    "delete")
        if [ -z "$2" ]; then
            echo "❌ Please provide a session name to delete."
            echo "📋 Available sessions:"
            $0 list
            exit 1
        fi
        
        SESSION_NAME="$2"
        CONTEXT_FILE="$CONTEXT_DIR/$SESSION_NAME.json"
        
        if [ ! -f "$CONTEXT_FILE" ]; then
            echo "❌ Session not found: $SESSION_NAME"
            exit 1
        fi
        
        echo "🗑️  Deleting session: $SESSION_NAME"
        echo "⚠️  This action cannot be undone!"
        read -p "Are you sure? (y/N): " -n 1 -r
        echo
        
        if [[ $REPLY =~ ^[Yy]$ ]]; then
            rm "$CONTEXT_FILE"
            echo "✅ Session deleted: $SESSION_NAME"
        else
            echo "❌ Deletion cancelled"
        fi
        ;;
        
    "export")
        if [ -z "$2" ]; then
            echo "❌ Please provide a session name to export."
            exit 1
        fi
        
        SESSION_NAME="$2"
        CONTEXT_FILE="$CONTEXT_DIR/$SESSION_NAME.json"
        EXPORT_FILE="$SESSION_NAME-export.json"
        
        if [ ! -f "$CONTEXT_FILE" ]; then
            echo "❌ Session not found: $SESSION_NAME"
            exit 1
        fi
        
        cp "$CONTEXT_FILE" "$EXPORT_FILE"
        echo "📤 Session exported to: $EXPORT_FILE"
        ;;
        
    "help"|"--help"|"-h")
        echo "📚 Chat Context Management Commands:"
        echo ""
        echo "   list              List all saved sessions"
        echo "   view <session>    View detailed session information"
        echo "   save [session]    Save current context (optional name)"
        echo "   restore <session> Restore a saved session"
        echo "   delete <session>  Delete a saved session"
        echo "   export <session>  Export session to current directory"
        echo "   help             Show this help message"
        echo ""
        echo "Examples:"
        echo "   $0 list"
        echo "   $0 save my-work-session"
        echo "   $0 view my-work-session"
        echo "   $0 restore my-work-session"
        echo ""
        ;;
        
    *)
        echo "❌ Unknown action: $ACTION"
        echo ""
        echo "Available actions: list, view, save, restore, delete, export, help"
        echo "Usage: $0 <action> [session-name]"
        echo ""
        echo "💡 Run '$0 help' for more information"
        exit 1
        ;;
esac
