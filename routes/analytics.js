const express = require('express');
const router = express.Router();
const { authenticateToken } = require('../middleware/auth');
const { requireAnalyticsAccess } = require('../middleware/analytics');
const analyticsService = require('../services/analyticsService');

// Middleware
router.use(express.json());
router.use(authenticateToken);
router.use(requireAnalyticsAccess);

// Get user's personal analytics
router.get('/user/stats', async (req, res) => {
    try {
        const { timeframe = '24h' } = req.query;
        const userId = req.user.id;

        const stats = await analyticsService.getUsageStats(timeframe, userId);

        if (!stats) {
            return res.status(500).json({
                success: false,
                error: 'Failed to retrieve user statistics'
            });
        }

        res.json({
            success: true,
            stats,
            user: {
                id: userId,
                email: req.user.email
            }
        });

    } catch (error) {
        console.error('User stats error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to retrieve statistics'
        });
    }
});

// Get user engagement metrics
router.get('/user/engagement', async (req, res) => {
    try {
        const { timeframe = '30d' } = req.query;
        const userId = req.user.id;

        // Get user-specific engagement data
        const engagement = await analyticsService.getUserEngagement(timeframe);

        res.json({
            success: true,
            engagement,
            userId
        });

    } catch (error) {
        console.error('User engagement error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to retrieve engagement metrics'
        });
    }
});

// Get system performance metrics (admin only)
router.get('/admin/system', async (req, res) => {
    try {
        if (!req.user.isAdmin) {
            return res.status(403).json({
                success: false,
                error: 'Admin access required'
            });
        }

        const { timeframe = '24h' } = req.query;

        const [usageStats, systemAnalytics, systemStatus] = await Promise.all([
            analyticsService.getUsageStats(timeframe),
            analyticsService.getSystemAnalytics(timeframe),
            Promise.resolve(analyticsService.getSystemStatus())
        ]);

        res.json({
            success: true,
            data: {
                usage: usageStats,
                analytics: systemAnalytics,
                status: systemStatus
            },
            timeframe
        });

    } catch (error) {
        console.error('System analytics error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to retrieve system analytics'
        });
    }
});

// Get overall platform analytics (admin only)
router.get('/admin/platform', async (req, res) => {
    try {
        if (!req.user.isAdmin) {
            return res.status(403).json({
                success: false,
                error: 'Admin access required'
            });
        }

        const { timeframe = '30d' } = req.query;

        const [usageStats, engagement, systemAnalytics] = await Promise.all([
            analyticsService.getUsageStats(timeframe),
            analyticsService.getUserEngagement(timeframe),
            analyticsService.getSystemAnalytics(timeframe)
        ]);

        res.json({
            success: true,
            platform: {
                usage: usageStats,
                engagement,
                system: systemAnalytics,
                generatedAt: new Date().toISOString()
            },
            timeframe
        });

    } catch (error) {
        console.error('Platform analytics error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to retrieve platform analytics'
        });
    }
});

// Get real-time system status
router.get('/system/status', async (req, res) => {
    try {
        const status = analyticsService.getSystemStatus();

        res.json({
            success: true,
            status
        });

    } catch (error) {
        console.error('System status error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to retrieve system status'
        });
    }
});

// Record custom metric (for API users)
router.post('/metric', async (req, res) => {
    try {
        const { metricName, metricValue, dimensions = {} } = req.body;

        if (!metricName || metricValue === undefined) {
            return res.status(400).json({
                success: false,
                error: 'Metric name and value are required'
            });
        }

        // Add user context to dimensions
        const enrichedDimensions = {
            ...dimensions,
            user_id: req.user.id,
            recorded_by: 'api'
        };

        await analyticsService.recordMetric(metricName, metricValue, enrichedDimensions);

        res.json({
            success: true,
            message: 'Metric recorded successfully',
            metric: {
                name: metricName,
                value: metricValue,
                dimensions: enrichedDimensions
            }
        });

    } catch (error) {
        console.error('Custom metric error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to record metric'
        });
    }
});

// Get analytics dashboard data
router.get('/dashboard', async (req, res) => {
    try {
        const { timeframe = '24h' } = req.query;
        const userId = req.user.id;
        const isAdmin = req.user.isAdmin;

        // Get user-specific or system-wide data based on permissions
        const [usageStats, systemStatus] = await Promise.all([
            analyticsService.getUsageStats(timeframe, isAdmin ? null : userId),
            Promise.resolve(analyticsService.getSystemStatus())
        ]);

        let engagement = null;
        if (isAdmin) {
            engagement = await analyticsService.getUserEngagement(timeframe);
        }

        const dashboard = {
            overview: {
                requests: usageStats?.totalRequests || 0,
                errors: usageStats?.errorRequests || 0,
                errorRate: usageStats?.errorRate || 0,
                avgResponseTime: usageStats?.avgProcessingTime || 0,
                tokensUsed: usageStats?.totalTokensUsed || 0
            },
            system: {
                uptime: systemStatus.uptime,
                memory: systemStatus.memory,
                status: 'healthy' // Could be determined by various health checks
            },
            endpoints: usageStats?.endpointStats || {},
            ...(engagement && { engagement })
        };

        res.json({
            success: true,
            dashboard,
            timeframe,
            generatedAt: new Date().toISOString()
        });

    } catch (error) {
        console.error('Dashboard error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to retrieve dashboard data'
        });
    }
});

// Get analytics export (CSV format)
router.get('/export', async (req, res) => {
    try {
        const { 
            timeframe = '30d', 
            format = 'json',
            includeSystem = false 
        } = req.query;
        
        const userId = req.user.isAdmin ? null : req.user.id;

        if (includeSystem && !req.user.isAdmin) {
            return res.status(403).json({
                success: false,
                error: 'Admin access required for system data export'
            });
        }

        const [usageStats, systemAnalytics] = await Promise.all([
            analyticsService.getUsageStats(timeframe, userId),
            includeSystem ? analyticsService.getSystemAnalytics(timeframe) : null
        ]);

        const exportData = {
            exportedAt: new Date().toISOString(),
            timeframe,
            user: req.user.isAdmin ? 'admin' : req.user.id,
            usage: usageStats,
            ...(systemAnalytics && { system: systemAnalytics })
        };

        if (format === 'csv') {
            // Convert to CSV format
            let csv = 'Timestamp,Metric,Value,Details\n';
            
            if (usageStats?.endpointStats) {
                Object.entries(usageStats.endpointStats).forEach(([endpoint, stats]) => {
                    csv += `${new Date().toISOString()},endpoint_requests,${stats.count},"endpoint: ${endpoint}"\n`;
                    csv += `${new Date().toISOString()},endpoint_avg_time,${stats.avgTime},"endpoint: ${endpoint}"\n`;
                    csv += `${new Date().toISOString()},endpoint_errors,${stats.errors},"endpoint: ${endpoint}"\n`;
                });
            }

            res.setHeader('Content-Type', 'text/csv');
            res.setHeader('Content-Disposition', `attachment; filename="analytics-${timeframe}-${Date.now()}.csv"`);
            res.send(csv);
        } else {
            res.json({
                success: true,
                export: exportData
            });
        }

    } catch (error) {
        console.error('Analytics export error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to export analytics data'
        });
    }
});

// Health check for analytics service
router.get('/health', (req, res) => {
    try {
        const status = analyticsService.getSystemStatus();
        
        res.json({
            success: true,
            service: 'analytics',
            status: 'operational',
            uptime: status.uptime,
            memory: status.memory,
            timestamp: new Date().toISOString()
        });

    } catch (error) {
        console.error('Analytics health check error:', error);
        res.status(500).json({
            success: false,
            service: 'analytics',
            status: 'error',
            error: error.message
        });
    }
});

module.exports = router;