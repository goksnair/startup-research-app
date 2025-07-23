#!/bin/bash

# Start local Redis using Docker for testing
# This provides a faster alternative to Homebrew installation

echo "🐳 Starting Redis using Docker..."

# Check if Docker is running
if ! docker info > /dev/null 2>&1; then
    echo "❌ Docker is not running. Please start Docker first."
    exit 1
fi

# Stop existing Redis container if running
docker stop redis-local 2>/dev/null || echo "No existing Redis container to stop"
docker rm redis-local 2>/dev/null || echo "No existing Redis container to remove"

# Start Redis container
docker run -d \
    --name redis-local \
    -p 6379:6379 \
    redis:7-alpine \
    redis-server --appendonly yes

if [ $? -eq 0 ]; then
    echo "✅ Redis started successfully on port 6379"
    echo "🔧 You can now test the application with Redis"
    echo "📝 To stop Redis: docker stop redis-local"
    echo "🗑️  To remove Redis: docker rm redis-local"
    
    # Wait a moment for Redis to fully start
    sleep 2
    
    # Test connection
    echo "🧪 Testing Redis connection..."
    docker exec redis-local redis-cli ping
    
    if [ $? -eq 0 ]; then
        echo "✅ Redis is ready for testing!"
        echo ""
        echo "📋 Next steps:"
        echo "  1. Uncomment REDIS_HOST=localhost in .env"
        echo "  2. Start your application: npm run dev"
        echo "  3. Test batch processing with Redis queues"
    else
        echo "❌ Redis connection test failed"
    fi
else
    echo "❌ Failed to start Redis container"
    exit 1
fi