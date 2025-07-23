# Production Redis Setup Guide

## Option 1: Upstash Redis (Recommended for Vercel)

### Step 1: Create Upstash Account
1. Go to https://upstash.com/
2. Sign up for a free account
3. Verify your email

### Step 2: Create Redis Database
1. Click "Create Database" in the Upstash dashboard
2. Choose a name (e.g., "startup-research-redis")
3. Select a region close to your users (e.g., us-east-1)
4. Choose "Free" tier (25MB limit)
5. Click "Create"

### Step 3: Get Connection Details
After creation, you'll see:
- **UPSTASH_REDIS_REST_URL**: `https://xxx-xxx-xxx.upstash.io`
- **UPSTASH_REDIS_REST_TOKEN**: `xxxxxxxxxxxxxxxx`

### Step 4: Set Environment Variables in Vercel
1. Go to your Vercel project dashboard
2. Go to Settings > Environment Variables
3. Add these variables:
   ```
   REDIS_URL = <your-upstash-redis-rest-url>
   REDIS_TOKEN = <your-upstash-redis-rest-token>
   ```

### Step 5: Update Application Code
The application is already updated to support Upstash Redis URLs.

## Option 2: Redis Cloud (Alternative)

### Step 1: Create Redis Cloud Account
1. Go to https://redis.com/try-free/
2. Sign up for a free account
3. Verify your email

### Step 2: Create Database
1. Click "New Database"
2. Choose "Fixed" plan (30MB free)
3. Select region
4. Set database name
5. Create database

### Step 3: Get Connection Details
You'll get:
- **Endpoint**: `redis-xxxxx.redislabs.com:xxxxx`
- **Password**: `xxxxxxxxx`

### Step 4: Set Environment Variables
Set in Vercel:
```
REDIS_URL = redis://:password@endpoint:port
```

## Testing Redis Connection

Once configured, the application will automatically:
1. Test Redis connection on startup
2. Use Redis queues if available
3. Fall back to in-memory processing if Redis is unavailable

## Vercel Deployment Commands

```bash
# Deploy to preview
vercel

# Deploy to production
vercel --prod
```

## Monitoring Redis Usage

### Upstash Dashboard
- Monitor memory usage
- View connection stats
- Check command statistics

### Application Logs
- Check Vercel function logs for Redis connection status
- Monitor queue processing logs

## Troubleshooting

### Connection Issues
1. Verify environment variables are set correctly
2. Check Redis instance is running
3. Verify network connectivity
4. Check authentication credentials

### Performance Issues
1. Monitor Redis memory usage
2. Check connection pool settings
3. Optimize queue processing parameters
4. Consider upgrading Redis plan if needed

## Production Checklist

- [ ] Redis database created and configured
- [ ] Environment variables set in Vercel
- [ ] Application deployed to production
- [ ] Redis connection tested
- [ ] Batch processing tested
- [ ] Real-time progress tracking verified
- [ ] Error handling tested
- [ ] Performance monitoring set up