const apiKeyService = require('../services/apiKeyService');
const analyticsService = require('../services/analyticsService');

// Middleware to authenticate API key requests
const authenticateApiKey = async (req, res, next) => {
    try {
        // Check for API key in header or query parameter
        const apiKey = req.headers['x-api-key'] || req.headers['authorization']?.replace('Bearer ', '') || req.query.api_key;

        if (!apiKey) {
            return res.status(401).json({
                error: 'API key required',
                message: 'Provide API key in X-API-Key header, Authorization header, or api_key query parameter'
            });
        }

        // Validate API key
        const validation = await apiKeyService.validateApiKey(apiKey);

        if (!validation.valid) {
            return res.status(401).json({
                error: 'Invalid API key',
                message: validation.error
            });
        }

        // Check rate limits
        const rateLimitCheck = await apiKeyService.checkRateLimit(validation.keyId, validation.rateLimits);

        if (!rateLimitCheck.allowed) {
            // Set rate limit headers
            if (rateLimitCheck.details) {
                res.set({
                    'X-RateLimit-Limit': rateLimitCheck.details.hourlyLimit || rateLimitCheck.details.dailyLimit,
                    'X-RateLimit-Remaining': 0,
                    'X-RateLimit-Reset': rateLimitCheck.details.resetsAt
                });
            }

            return res.status(429).json({
                error: 'Rate limit exceeded',
                message: `Rate limit exceeded: ${rateLimitCheck.reason}`,
                details: rateLimitCheck.details
            });
        }

        // Set rate limit headers for successful requests
        if (rateLimitCheck.usage) {
            res.set({
                'X-RateLimit-Limit-Hourly': rateLimitCheck.usage.hourlyLimit,
                'X-RateLimit-Remaining-Hourly': rateLimitCheck.usage.hourlyRemaining,
                'X-RateLimit-Limit-Daily': rateLimitCheck.usage.dailyLimit,
                'X-RateLimit-Remaining-Daily': rateLimitCheck.usage.dailyRemaining
            });
        }

        // Attach API key and user info to request
        req.apiKey = {
            id: validation.keyId,
            name: validation.keyName,
            permissions: validation.permissions,
            tier: validation.tier,
            userId: validation.userId
        };

        // Create user object for compatibility with existing auth middleware
        req.user = {
            id: validation.userId,
            apiKey: true
        };

        next();

    } catch (error) {
        console.error('API key authentication error:', error);
        res.status(500).json({
            error: 'Authentication failed',
            message: 'Internal server error during API key validation'
        });
    }
};

// Middleware to check API key permissions
const requirePermission = (permission) => {
    return (req, res, next) => {
        if (!req.apiKey) {
            return res.status(401).json({
                error: 'API authentication required'
            });
        }

        const permissions = req.apiKey.permissions || {};

        if (!permissions[permission]) {
            return res.status(403).json({
                error: 'Insufficient permissions',
                message: `This API key does not have '${permission}' permission`,
                required: permission,
                available: Object.keys(permissions).filter(p => permissions[p])
            });
        }

        next();
    };
};

// Middleware to check API key tier
const requireTier = (minTier) => {
    const tierHierarchy = { free: 0, pro: 1, enterprise: 2 };

    return (req, res, next) => {
        if (!req.apiKey) {
            return res.status(401).json({
                error: 'API authentication required'
            });
        }

        const currentTierLevel = tierHierarchy[req.apiKey.tier] || 0;
        const requiredTierLevel = tierHierarchy[minTier] || 0;

        if (currentTierLevel < requiredTierLevel) {
            return res.status(403).json({
                error: 'Tier upgrade required',
                message: `This endpoint requires '${minTier}' tier or higher`,
                currentTier: req.apiKey.tier,
                requiredTier: minTier
            });
        }

        next();
    };
};

// Enhanced rate limiting middleware with tier-based limits
const advancedRateLimit = (options = {}) => {
    const {
        skipSuccessfulRequests = false,
        skipFailedRequests = false,
        keyGenerator = (req) => req.apiKey?.id || req.ip
    } = options;

    // In-memory store for rate limiting (in production, use Redis)
    const requestCounts = new Map();
    const windowMs = 60 * 1000; // 1 minute window

    return async (req, res, next) => {
        const key = keyGenerator(req);
        const now = Date.now();
        const windowStart = now - windowMs;

        // Clean old entries
        const requests = requestCounts.get(key) || [];
        const validRequests = requests.filter(timestamp => timestamp > windowStart);
        requestCounts.set(key, validRequests);

        // Get rate limit for this key
        let limit = 100; // Default limit
        if (req.apiKey?.tier) {
            const tierLimits = {
                free: 60,      // 60 requests per minute
                pro: 300,      // 300 requests per minute  
                enterprise: 1000 // 1000 requests per minute
            };
            limit = tierLimits[req.apiKey.tier] || 60;
        }

        // Check if limit exceeded
        if (validRequests.length >= limit) {
            return res.status(429).json({
                error: 'Rate limit exceeded',
                message: `Too many requests. Limit: ${limit} per minute`,
                retryAfter: Math.ceil((validRequests[0] - windowStart) / 1000)
            });
        }

        // Record this request
        validRequests.push(now);
        requestCounts.set(key, validRequests);

        // Set rate limit headers
        res.set({
            'X-RateLimit-Limit': limit,
            'X-RateLimit-Remaining': Math.max(0, limit - validRequests.length),
            'X-RateLimit-Reset': Math.ceil((now + windowMs) / 1000)
        });

        next();
    };
};

// Concurrent request limiting
const concurrentRequestLimit = (req, res, next) => {
    if (!req.apiKey) {
        return next();
    }

    const maxConcurrent = req.apiKey.tier === 'enterprise' ? 100 : 
                         req.apiKey.tier === 'pro' ? 20 : 5;

    // In production, use Redis for concurrent request tracking
    // For now, we'll skip actual concurrent limiting and just set headers
    res.set({
        'X-Concurrent-Limit': maxConcurrent,
        'X-Concurrent-Remaining': maxConcurrent - 1 // Simplified
    });

    next();
};

// Track API usage for analytics
const trackApiUsage = (req, res, next) => {
    if (!req.apiKey) {
        return next();
    }

    const startTime = Date.now();

    // Override res.end to capture response details
    const originalEnd = res.end;
    res.end = function(chunk, encoding) {
        const processingTime = Date.now() - startTime;

        // Track API usage
        setImmediate(() => {
            analyticsService.trackAPIUsage({
                userId: req.apiKey.userId,
                apiKeyId: req.apiKey.id,
                endpoint: req.route?.path || req.path,
                method: req.method,
                statusCode: res.statusCode,
                processingTimeMs: processingTime,
                tokensUsed: req.tokensUsed || 0,
                costUsd: req.apiCost || 0,
                ipAddress: req.ip,
                userAgent: req.get('User-Agent')
            }).catch(error => {
                console.error('API usage tracking error:', error);
            });
        });

        originalEnd.call(this, chunk, encoding);
    };

    next();
};

// Webhook delivery middleware
const scheduleWebhook = (eventType, data) => {
    return (req, res, next) => {
        // Schedule webhook delivery (implementation would depend on your webhook service)
        setImmediate(() => {
            // This would integrate with a webhook service
            console.log(`📡 Webhook scheduled: ${eventType}`, {
                apiKeyId: req.apiKey?.id,
                userId: req.apiKey?.userId,
                data: data || req.body
            });
        });

        next();
    };
};

// API versioning middleware
const apiVersion = (version = 'v1') => {
    return (req, res, next) => {
        req.apiVersion = version;
        res.set('API-Version', version);
        next();
    };
};

// CORS for API endpoints
const apiCors = (req, res, next) => {
    res.set({
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-API-Key',
        'Access-Control-Expose-Headers': 'X-RateLimit-Limit, X-RateLimit-Remaining, X-RateLimit-Reset'
    });

    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    next();
};

// Request validation middleware
const validateRequest = (schema) => {
    return (req, res, next) => {
        // Basic validation - in production, use joi, yup, or similar
        if (schema.required) {
            for (const field of schema.required) {
                if (!req.body[field]) {
                    return res.status(400).json({
                        error: 'Validation failed',
                        message: `Missing required field: ${field}`,
                        required: schema.required
                    });
                }
            }
        }

        next();
    };
};

module.exports = {
    authenticateApiKey,
    requirePermission,
    requireTier,
    advancedRateLimit,
    concurrentRequestLimit,
    trackApiUsage,
    scheduleWebhook,
    apiVersion,
    apiCors,
    validateRequest
};