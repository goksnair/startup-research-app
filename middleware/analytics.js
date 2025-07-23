const analyticsService = require('../services/analyticsService');

// Middleware to track API usage automatically
const trackAPIUsage = (req, res, next) => {
    const startTime = Date.now();
    
    // Override res.end to capture response details
    const originalEnd = res.end;
    res.end = function(chunk, encoding) {
        const processingTime = Date.now() - startTime;
        
        // Track the API call
        setImmediate(() => {
            analyticsService.trackAPIUsage({
                userId: req.user?.id || null,
                apiKeyId: req.apiKey?.id || null,
                endpoint: req.route?.path || req.path,
                method: req.method,
                statusCode: res.statusCode,
                processingTimeMs: processingTime,
                tokensUsed: req.tokensUsed || 0,
                costUsd: req.apiCost || 0,
                ipAddress: req.ip || req.connection.remoteAddress,
                userAgent: req.get('User-Agent')
            }).catch(error => {
                console.error('Analytics tracking error:', error);
            });
        });
        
        // Call original end method
        originalEnd.call(this, chunk, encoding);
    };
    
    next();
};

// Middleware to track user actions
const trackUserAction = (action, getDetails = null) => {
    return (req, res, next) => {
        if (req.user?.id) {
            setImmediate(() => {
                const details = typeof getDetails === 'function' ? getDetails(req, res) : {};
                analyticsService.trackUserAction(req.user.id, action, details)
                    .catch(error => {
                        console.error('User action tracking error:', error);
                    });
            });
        }
        next();
    };
};

// Enhanced error tracking middleware
const trackError = (error, req, res, next) => {
    const processingTime = Date.now() - (req.startTime || Date.now());
    
    // Track error in analytics
    setImmediate(() => {
        analyticsService.trackAPIUsage({
            userId: req.user?.id || null,
            apiKeyId: req.apiKey?.id || null,
            endpoint: req.route?.path || req.path,
            method: req.method,
            statusCode: res.statusCode || 500,
            processingTimeMs: processingTime,
            tokensUsed: 0,
            costUsd: 0,
            ipAddress: req.ip || req.connection.remoteAddress,
            userAgent: req.get('User-Agent')
        }).catch(trackingError => {
            console.error('Error tracking error:', trackingError);
        });

        // Record error metric
        analyticsService.recordMetric('application_error', 1, {
            error_type: error.name || 'Unknown',
            error_message: error.message,
            endpoint: req.route?.path || req.path,
            method: req.method,
            user_id: req.user?.id || null,
            stack_trace: process.env.NODE_ENV === 'development' ? error.stack : undefined
        }).catch(metricError => {
            console.error('Error metric recording error:', metricError);
        });
    });
    
    next(error);
};

// Performance monitoring middleware
const monitorPerformance = (req, res, next) => {
    req.startTime = Date.now();
    
    // Track memory usage
    const memoryBefore = process.memoryUsage();
    
    const originalEnd = res.end;
    res.end = function(chunk, encoding) {
        const processingTime = Date.now() - req.startTime;
        const memoryAfter = process.memoryUsage();
        const memoryDelta = memoryAfter.heapUsed - memoryBefore.heapUsed;
        
        // Record performance metrics for slow requests (>1000ms)
        if (processingTime > 1000) {
            setImmediate(() => {
                analyticsService.recordMetric('slow_request', processingTime, {
                    endpoint: req.route?.path || req.path,
                    method: req.method,
                    status_code: res.statusCode,
                    memory_delta_mb: Math.round(memoryDelta / 1024 / 1024 * 100) / 100,
                    user_id: req.user?.id || null
                }).catch(error => {
                    console.error('Performance metric error:', error);
                });
            });
        }
        
        originalEnd.call(this, chunk, encoding);
    };
    
    next();
};

// Rate limiting analytics
const trackRateLimit = (req, res, next) => {
    const originalEnd = res.end;
    res.end = function(chunk, encoding) {
        // Track rate limit hits
        if (res.statusCode === 429) {
            setImmediate(() => {
                analyticsService.recordMetric('rate_limit_hit', 1, {
                    endpoint: req.route?.path || req.path,
                    method: req.method,
                    user_id: req.user?.id || null,
                    api_key_id: req.apiKey?.id || null,
                    ip_address: req.ip || req.connection.remoteAddress
                }).catch(error => {
                    console.error('Rate limit tracking error:', error);
                });
            });
        }
        
        originalEnd.call(this, chunk, encoding);
    };
    
    next();
};

// Security event tracking
const trackSecurityEvent = (eventType, details = {}) => {
    return (req, res, next) => {
        setImmediate(() => {
            analyticsService.recordMetric('security_event', 1, {
                event_type: eventType,
                ip_address: req.ip || req.connection.remoteAddress,
                user_agent: req.get('User-Agent'),
                endpoint: req.route?.path || req.path,
                method: req.method,
                user_id: req.user?.id || null,
                timestamp: new Date().toISOString(),
                ...details
            }).catch(error => {
                console.error('Security event tracking error:', error);
            });
        });
        
        next();
    };
};

// Batch operation tracking helper
const trackBatchOperation = async (batchData) => {
    try {
        await analyticsService.trackBatchProcessing({
            batchId: batchData.id,
            userId: batchData.user_id,
            companiesCount: batchData.companies?.length || 0,
            successCount: batchData.success_count || 0,
            failureCount: (batchData.companies?.length || 0) - (batchData.success_count || 0),
            processingTimeMs: batchData.processing_time_ms || 0,
            analysisType: batchData.options?.analysisType || 'comprehensive'
        });
    } catch (error) {
        console.error('Batch operation tracking error:', error);
    }
};

// PDF generation tracking helper
const trackPDFGeneration = async (reportData) => {
    try {
        await analyticsService.trackPDFGeneration({
            reportId: reportData.id,
            userId: reportData.user_id,
            reportType: reportData.report_type,
            companiesCount: reportData.companies?.length || 0,
            fileSizeBytes: reportData.file_size || 0,
            generationTimeMs: reportData.generation_time_ms || 0
        });
    } catch (error) {
        console.error('PDF generation tracking error:', error);
    }
};

// Email notification tracking helper
const trackEmailNotification = async (emailData) => {
    try {
        await analyticsService.trackEmailNotification({
            userId: emailData.user_id,
            emailType: emailData.email_type,
            status: emailData.status,
            processingTimeMs: emailData.processing_time_ms || 0
        });
    } catch (error) {
        console.error('Email notification tracking error:', error);
    }
};

// Analytics aggregation middleware for admin endpoints
const requireAnalyticsAccess = (req, res, next) => {
    // Check if user has admin access or analytics permissions
    if (!req.user) {
        return res.status(401).json({ error: 'Authentication required' });
    }
    
    // For now, allow all authenticated users to view their own analytics
    // In production, you might want to restrict this to admin users
    if (req.path.includes('/admin/') && !req.user.isAdmin) {
        return res.status(403).json({ error: 'Admin access required' });
    }
    
    next();
};

module.exports = {
    trackAPIUsage,
    trackUserAction,
    trackError,
    monitorPerformance,
    trackRateLimit,
    trackSecurityEvent,
    trackBatchOperation,
    trackPDFGeneration,
    trackEmailNotification,
    requireAnalyticsAccess
};