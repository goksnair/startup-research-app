const express = require('express');
const router = express.Router();
const { authenticateToken } = require('../middleware/auth');
const webhookService = require('../services/webhookService');

// Middleware
router.use(express.json());
router.use(authenticateToken);

// Get user's webhooks
router.get('/', async (req, res) => {
    try {
        const userId = req.user.id;
        const webhooks = await webhookService.getUserWebhooks(userId);

        res.json({
            success: true,
            webhooks
        });

    } catch (error) {
        console.error('Get webhooks error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to retrieve webhooks'
        });
    }
});

// Create new webhook
router.post('/', async (req, res) => {
    try {
        const userId = req.user.id;
        const {
            name,
            url,
            events = ['batch.completed', 'report.generated'],
            secret = null
        } = req.body;

        // Validation
        if (!name || name.trim().length === 0) {
            return res.status(400).json({
                success: false,
                error: 'Webhook name is required'
            });
        }

        if (!url || !webhookService.isValidUrl(url)) {
            return res.status(400).json({
                success: false,
                error: 'Valid webhook URL is required'
            });
        }

        // Validate events
        const validEvents = [
            'batch.completed',
            'batch.failed',
            'report.generated',
            'api_key.created',
            'api_key.revoked',
            'webhook.test',
            '*' // All events
        ];

        const invalidEvents = events.filter(event => !validEvents.includes(event));
        if (invalidEvents.length > 0) {
            return res.status(400).json({
                success: false,
                error: 'Invalid events: ' + invalidEvents.join(', '),
                validEvents
            });
        }

        // Check webhook limit (based on user tier)
        const existingWebhooks = await webhookService.getUserWebhooks(userId);
        const activeWebhooks = existingWebhooks.filter(w => w.is_active);
        
        const webhookLimits = {
            free: 1,
            pro: 5,
            enterprise: 20
        };

        const userTier = req.user.subscription_tier || 'free';
        const maxWebhooks = webhookLimits[userTier] || webhookLimits.free;

        if (activeWebhooks.length >= maxWebhooks) {
            return res.status(403).json({
                success: false,
                error: `Maximum webhooks reached for ${userTier} tier`,
                limit: maxWebhooks,
                current: activeWebhooks.length
            });
        }

        const result = await webhookService.createWebhook(userId, {
            name: name.trim(),
            url,
            events,
            secret
        });

        res.status(201).json({
            success: true,
            message: 'Webhook created successfully',
            ...result
        });

    } catch (error) {
        console.error('Create webhook error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to create webhook'
        });
    }
});

// Get specific webhook details
router.get('/:webhookId', async (req, res) => {
    try {
        const userId = req.user.id;
        const { webhookId } = req.params;

        const webhooks = await webhookService.getUserWebhooks(userId);
        const webhook = webhooks.find(w => w.id === webhookId);

        if (!webhook) {
            return res.status(404).json({
                success: false,
                error: 'Webhook not found'
            });
        }

        res.json({
            success: true,
            webhook
        });

    } catch (error) {
        console.error('Get webhook details error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to retrieve webhook details'
        });
    }
});

// Update webhook
router.put('/:webhookId', async (req, res) => {
    try {
        const userId = req.user.id;
        const { webhookId } = req.params;
        const {
            name,
            url,
            events,
            isActive
        } = req.body;

        // Validation
        if (name !== undefined && (typeof name !== 'string' || name.trim().length === 0)) {
            return res.status(400).json({
                success: false,
                error: 'Invalid webhook name'
            });
        }

        if (url !== undefined && !webhookService.isValidUrl(url)) {
            return res.status(400).json({
                success: false,
                error: 'Invalid webhook URL'
            });
        }

        const result = await webhookService.updateWebhook(webhookId, userId, {
            name: name?.trim(),
            url,
            events,
            isActive
        });

        res.json({
            success: true,
            message: 'Webhook updated successfully'
        });

    } catch (error) {
        console.error('Update webhook error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to update webhook'
        });
    }
});

// Delete webhook
router.delete('/:webhookId', async (req, res) => {
    try {
        const userId = req.user.id;
        const { webhookId } = req.params;

        await webhookService.deleteWebhook(webhookId, userId);

        res.json({
            success: true,
            message: 'Webhook deleted successfully'
        });

    } catch (error) {
        console.error('Delete webhook error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to delete webhook'
        });
    }
});

// Test webhook
router.post('/:webhookId/test', async (req, res) => {
    try {
        const userId = req.user.id;
        const { webhookId } = req.params;

        const result = await webhookService.testWebhook(webhookId, userId);

        res.json({
            success: true,
            message: 'Test webhook sent successfully'
        });

    } catch (error) {
        console.error('Test webhook error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to send test webhook'
        });
    }
});

// Get webhook delivery history
router.get('/:webhookId/deliveries', async (req, res) => {
    try {
        const userId = req.user.id;
        const { webhookId } = req.params;
        const { 
            limit = 50, 
            offset = 0, 
            status = null 
        } = req.query;

        const deliveries = await webhookService.getWebhookDeliveries(webhookId, userId, {
            limit: parseInt(limit),
            offset: parseInt(offset),
            status
        });

        res.json({
            success: true,
            deliveries,
            pagination: {
                limit: parseInt(limit),
                offset: parseInt(offset),
                hasMore: deliveries.length === parseInt(limit)
            }
        });

    } catch (error) {
        console.error('Get webhook deliveries error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to retrieve webhook deliveries'
        });
    }
});

// Get webhook statistics
router.get('/:webhookId/stats', async (req, res) => {
    try {
        const userId = req.user.id;
        const { webhookId } = req.params;
        const { timeframe = '7d' } = req.query;

        // Verify webhook belongs to user
        const webhooks = await webhookService.getUserWebhooks(userId);
        const webhook = webhooks.find(w => w.id === webhookId);

        if (!webhook) {
            return res.status(404).json({
                success: false,
                error: 'Webhook not found'
            });
        }

        const stats = await webhookService.getWebhookStats(userId, timeframe);

        res.json({
            success: true,
            stats
        });

    } catch (error) {
        console.error('Get webhook stats error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to retrieve webhook statistics'
        });
    }
});

// Get available webhook events
router.get('/info/events', (req, res) => {
    try {
        const events = {
            'batch.completed': {
                description: 'Fired when a batch analysis job completes successfully',
                payload: {
                    batchId: 'string',
                    status: 'string',
                    companiesCount: 'number',
                    successCount: 'number',
                    errorCount: 'number',
                    completedAt: 'string (ISO 8601)',
                    results: 'array (if successful)'
                }
            },
            'batch.failed': {
                description: 'Fired when a batch analysis job fails',
                payload: {
                    batchId: 'string',
                    status: 'string',
                    errorMessage: 'string',
                    failedAt: 'string (ISO 8601)'
                }
            },
            'report.generated': {
                description: 'Fired when a PDF report is generated',
                payload: {
                    reportId: 'string',
                    reportType: 'string',
                    fileName: 'string',
                    companies: 'array',
                    generatedAt: 'string (ISO 8601)',
                    downloadUrl: 'string'
                }
            },
            'api_key.created': {
                description: 'Fired when a new API key is created',
                payload: {
                    keyId: 'string',
                    keyName: 'string',
                    keyPrefix: 'string',
                    tier: 'string',
                    permissions: 'object',
                    createdAt: 'string (ISO 8601)'
                }
            },
            'api_key.revoked': {
                description: 'Fired when an API key is revoked',
                payload: {
                    keyId: 'string',
                    keyName: 'string',
                    revokedAt: 'string (ISO 8601)'
                }
            },
            'webhook.test': {
                description: 'Test event for webhook verification',
                payload: {
                    message: 'string',
                    timestamp: 'string (ISO 8601)',
                    test: true
                }
            }
        };

        res.json({
            success: true,
            events,
            info: {
                maxRetries: 3,
                retryDelays: [1000, 5000, 15000],
                timeout: 10000,
                signatureHeader: 'X-Webhook-Signature',
                signatureFormat: 'sha256=<hex>'
            }
        });

    } catch (error) {
        console.error('Get webhook events info error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to retrieve webhook events information'
        });
    }
});

// Webhook verification endpoint (for users to test their endpoints)
router.post('/verify', async (req, res) => {
    try {
        const { url, secret } = req.body;

        if (!url || !webhookService.isValidUrl(url)) {
            return res.status(400).json({
                success: false,
                error: 'Valid URL is required'
            });
        }

        // Create a temporary webhook-like object for testing
        const testWebhook = {
            id: 'test-webhook',
            name: 'Verification Test',
            url,
            signing_secret: secret || 'test-secret',
            user_id: req.user.id
        };

        const testData = {
            message: 'This is a webhook verification test',
            timestamp: new Date().toISOString(),
            verification: true
        };

        await webhookService.deliverWebhook(testWebhook, 'webhook.verification', testData);

        res.json({
            success: true,
            message: 'Verification webhook sent successfully',
            note: 'Check your endpoint for the test delivery'
        });

    } catch (error) {
        console.error('Webhook verification error:', error);
        res.status(500).json({
            success: false,
            error: 'Webhook verification failed',
            message: error.message
        });
    }
});

module.exports = router;