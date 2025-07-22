const express = require('express');
const { body, validationResult } = require('express-validator');
const auth = require('../middleware/auth');
const batchService = require('../services/batchService');
const { getQueueStats } = require('../services/queueService');

const router = express.Router();

// Create a new batch job
router.post('/create',
    auth,
    [
        body('companies')
            .isArray({ min: 1, max: 50 })
            .withMessage('Companies must be an array with 1-50 items'),
        body('companies.*')
            .isString()
            .isLength({ min: 1, max: 100 })
            .withMessage('Each company name must be 1-100 characters'),
        body('analysisType')
            .optional()
            .isIn(['quick', 'comprehensive', 'financial'])
            .withMessage('Invalid analysis type'),
        body('includePdf')
            .optional()
            .isBoolean()
            .withMessage('includePdf must be boolean'),
        body('sendEmail')
            .optional()
            .isBoolean()
            .withMessage('sendEmail must be boolean'),
        body('priority')
            .optional()
            .isIn(['low', 'normal', 'high'])
            .withMessage('Priority must be low, normal, or high')
    ],
    async (req, res) => {
        try {
            const errors = validationResult(req);
            if (!errors.isEmpty()) {
                return res.status(400).json({
                    success: false,
                    errors: errors.array()
                });
            }

            const { companies, analysisType, includePdf, sendEmail, priority } = req.body;
            const userId = req.user.id;

            // Check user's batch limits based on subscription tier
            const userBatchLimit = await checkUserBatchLimit(userId, req.user.subscription_tier);
            if (!userBatchLimit.allowed) {
                return res.status(429).json({
                    success: false,
                    error: 'Batch limit exceeded',
                    message: userBatchLimit.message,
                    limits: userBatchLimit.limits
                });
            }

            const result = await batchService.createBatch(userId, companies, {
                analysisType: analysisType || 'comprehensive',
                includePdf: includePdf || false,
                sendEmail: sendEmail || false,
                priority: priority || 'normal'
            });

            res.json({
                success: true,
                data: result
            });

        } catch (error) {
            console.error('Create batch error:', error);
            res.status(500).json({
                success: false,
                error: 'Failed to create batch job',
                message: error.message
            });
        }
    }
);

// Get batch status
router.get('/:batchId', auth, async (req, res) => {
    try {
        const { batchId } = req.params;
        const userId = req.user.id;

        const batchStatus = await batchService.getBatchStatus(batchId, userId);

        res.json({
            success: true,
            data: batchStatus
        });

    } catch (error) {
        console.error('Get batch status error:', error);
        const statusCode = error.message === 'Batch not found' ? 404 : 500;
        res.status(statusCode).json({
            success: false,
            error: 'Failed to get batch status',
            message: error.message
        });
    }
});

// Get user's batch history
router.get('/', auth, async (req, res) => {
    try {
        const userId = req.user.id;
        const limit = parseInt(req.query.limit) || 10;
        const offset = parseInt(req.query.offset) || 0;

        const batches = await batchService.getUserBatches(userId, limit, offset);

        res.json({
            success: true,
            data: {
                batches,
                pagination: {
                    limit,
                    offset,
                    hasMore: batches.length === limit
                }
            }
        });

    } catch (error) {
        console.error('Get user batches error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to get batch history',
            message: error.message
        });
    }
});

// Cancel batch job
router.delete('/:batchId', auth, async (req, res) => {
    try {
        const { batchId } = req.params;
        const userId = req.user.id;

        const result = await batchService.cancelBatch(batchId, userId);

        res.json({
            success: true,
            data: result
        });

    } catch (error) {
        console.error('Cancel batch error:', error);
        const statusCode = error.message === 'Batch not found' ? 404 : 500;
        res.status(statusCode).json({
            success: false,
            error: 'Failed to cancel batch job',
            message: error.message
        });
    }
});

// Get queue statistics (admin only)
router.get('/admin/queue-stats', auth, async (req, res) => {
    try {
        // Check if user has admin privileges (implement based on your auth system)
        if (req.user.subscription_tier !== 'enterprise') {
            return res.status(403).json({
                success: false,
                error: 'Insufficient permissions'
            });
        }

        const stats = await getQueueStats();

        res.json({
            success: true,
            data: stats
        });

    } catch (error) {
        console.error('Get queue stats error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to get queue statistics',
            message: error.message
        });
    }
});

// Get batch statistics (admin only)
router.get('/admin/batch-stats', auth, async (req, res) => {
    try {
        // Check admin permissions
        if (req.user.subscription_tier !== 'enterprise') {
            return res.status(403).json({
                success: false,
                error: 'Insufficient permissions'
            });
        }

        const stats = await batchService.getBatchStatistics();

        res.json({
            success: true,
            data: stats
        });

    } catch (error) {
        console.error('Get batch statistics error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to get batch statistics',
            message: error.message
        });
    }
});

// Helper function to check user batch limits
async function checkUserBatchLimit(userId, subscriptionTier) {
    try {
        const limits = {
            free: { maxBatchSize: 5, maxConcurrent: 1, maxPerDay: 3 },
            pro: { maxBatchSize: 25, maxConcurrent: 3, maxPerDay: 10 },
            enterprise: { maxBatchSize: 50, maxConcurrent: 10, maxPerDay: 50 }
        };

        const userLimits = limits[subscriptionTier] || limits.free;

        // Check current active batches
        const activeBatches = await batchService.getUserBatches(userId, 100, 0);
        const currentActive = activeBatches.filter(b =>
            b.status === 'queued' || b.status === 'processing'
        ).length;

        if (currentActive >= userLimits.maxConcurrent) {
            return {
                allowed: false,
                message: `Maximum concurrent batches (${userLimits.maxConcurrent}) exceeded`,
                limits: userLimits
            };
        }

        // Check daily limit
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const todayBatches = activeBatches.filter(b =>
            new Date(b.createdAt) >= today
        ).length;

        if (todayBatches >= userLimits.maxPerDay) {
            return {
                allowed: false,
                message: `Daily batch limit (${userLimits.maxPerDay}) exceeded`,
                limits: userLimits
            };
        }

        return {
            allowed: true,
            limits: userLimits
        };

    } catch (error) {
        console.error('Check batch limit error:', error);
        // Allow by default if check fails
        return {
            allowed: true,
            limits: { maxBatchSize: 5, maxConcurrent: 1, maxPerDay: 3 }
        };
    }
}

module.exports = router;
