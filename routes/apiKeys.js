const express = require('express');
const router = express.Router();
const { authenticateToken } = require('../middleware/auth');
const apiKeyService = require('../services/apiKeyService');

// Middleware
router.use(express.json());
router.use(authenticateToken);

// Get user's API keys
router.get('/', async (req, res) => {
    try {
        const userId = req.user.id;
        const apiKeys = await apiKeyService.getUserApiKeys(userId);

        res.json({
            success: true,
            apiKeys
        });

    } catch (error) {
        console.error('Get API keys error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to retrieve API keys'
        });
    }
});

// Create new API key
router.post('/', async (req, res) => {
    try {
        const userId = req.user.id;
        const {
            keyName,
            permissions = { research: true, batch: true, reports: true },
            tier = 'free',
            expiresInDays = null
        } = req.body;

        if (!keyName || keyName.trim().length === 0) {
            return res.status(400).json({
                success: false,
                error: 'API key name is required'
            });
        }

        if (keyName.length > 100) {
            return res.status(400).json({
                success: false,
                error: 'API key name must be 100 characters or less'
            });
        }

        // Validate tier
        const validTiers = ['free', 'pro', 'enterprise'];
        if (!validTiers.includes(tier)) {
            return res.status(400).json({
                success: false,
                error: 'Invalid tier. Must be one of: ' + validTiers.join(', ')
            });
        }

        // Validate permissions
        const validPermissions = ['research', 'batch', 'reports', 'analytics'];
        const invalidPerms = Object.keys(permissions).filter(p => !validPermissions.includes(p));
        if (invalidPerms.length > 0) {
            return res.status(400).json({
                success: false,
                error: 'Invalid permissions: ' + invalidPerms.join(', '),
                validPermissions
            });
        }

        // Check if user can create more keys (limit based on plan)
        const existingKeys = await apiKeyService.getUserApiKeys(userId);
        const activeKeys = existingKeys.filter(key => key.is_active);
        
        const keyLimits = {
            free: 2,
            pro: 10,
            enterprise: 50
        };

        const userTier = req.user.subscription_tier || 'free';
        const maxKeys = keyLimits[userTier] || keyLimits.free;

        if (activeKeys.length >= maxKeys) {
            return res.status(403).json({
                success: false,
                error: `Maximum API keys reached for ${userTier} tier`,
                limit: maxKeys,
                current: activeKeys.length
            });
        }

        const result = await apiKeyService.generateApiKey(userId, keyName.trim(), {
            permissions,
            tier,
            expiresInDays
        });

        res.status(201).json({
            success: true,
            message: 'API key created successfully',
            ...result
        });

    } catch (error) {
        console.error('Create API key error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to create API key'
        });
    }
});

// Get specific API key details
router.get('/:keyId', async (req, res) => {
    try {
        const userId = req.user.id;
        const { keyId } = req.params;

        const apiKeys = await apiKeyService.getUserApiKeys(userId);
        const apiKey = apiKeys.find(key => key.id === keyId);

        if (!apiKey) {
            return res.status(404).json({
                success: false,
                error: 'API key not found'
            });
        }

        res.json({
            success: true,
            apiKey
        });

    } catch (error) {
        console.error('Get API key details error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to retrieve API key details'
        });
    }
});

// Update API key
router.put('/:keyId', async (req, res) => {
    try {
        const userId = req.user.id;
        const { keyId } = req.params;
        const {
            keyName,
            permissions,
            tier,
            isActive
        } = req.body;

        // Validate inputs
        if (keyName !== undefined && (typeof keyName !== 'string' || keyName.trim().length === 0)) {
            return res.status(400).json({
                success: false,
                error: 'Invalid key name'
            });
        }

        if (tier !== undefined && !['free', 'pro', 'enterprise'].includes(tier)) {
            return res.status(400).json({
                success: false,
                error: 'Invalid tier'
            });
        }

        const result = await apiKeyService.updateApiKey(keyId, userId, {
            keyName: keyName?.trim(),
            permissions,
            tier,
            isActive
        });

        res.json({
            success: true,
            message: 'API key updated successfully'
        });

    } catch (error) {
        console.error('Update API key error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to update API key'
        });
    }
});

// Revoke/delete API key
router.delete('/:keyId', async (req, res) => {
    try {
        const userId = req.user.id;
        const { keyId } = req.params;

        await apiKeyService.revokeApiKey(keyId, userId);

        res.json({
            success: true,
            message: 'API key revoked successfully'
        });

    } catch (error) {
        console.error('Revoke API key error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to revoke API key'
        });
    }
});

// Get API key usage statistics
router.get('/:keyId/usage', async (req, res) => {
    try {
        const userId = req.user.id;
        const { keyId } = req.params;
        const { timeframe = '24h' } = req.query;

        const stats = await apiKeyService.getKeyUsageStats(keyId, userId, timeframe);

        res.json({
            success: true,
            usage: stats
        });

    } catch (error) {
        console.error('Get API key usage error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to retrieve usage statistics'
        });
    }
});

// Regenerate API key (revoke old, create new with same settings)
router.post('/:keyId/regenerate', async (req, res) => {
    try {
        const userId = req.user.id;
        const { keyId } = req.params;

        // Get current key details
        const apiKeys = await apiKeyService.getUserApiKeys(userId);
        const currentKey = apiKeys.find(key => key.id === keyId);

        if (!currentKey) {
            return res.status(404).json({
                success: false,
                error: 'API key not found'
            });
        }

        // Revoke current key
        await apiKeyService.revokeApiKey(keyId, userId);

        // Create new key with same settings
        const result = await apiKeyService.generateApiKey(userId, currentKey.key_name, {
            permissions: currentKey.permissions,
            tier: currentKey.tier
        });

        res.json({
            success: true,
            message: 'API key regenerated successfully',
            ...result
        });

    } catch (error) {
        console.error('Regenerate API key error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to regenerate API key'
        });
    }
});

// Test API key (validate without using it)
router.post('/test', async (req, res) => {
    try {
        const { apiKey } = req.body;

        if (!apiKey) {
            return res.status(400).json({
                success: false,
                error: 'API key is required'
            });
        }

        const validation = await apiKeyService.validateApiKey(apiKey);

        if (!validation.valid) {
            return res.status(401).json({
                success: false,
                error: 'Invalid API key',
                message: validation.error
            });
        }

        // Don't update usage for test requests
        res.json({
            success: true,
            message: 'API key is valid',
            keyInfo: {
                keyName: validation.keyName,
                permissions: validation.permissions,
                tier: validation.tier,
                rateLimits: validation.rateLimits
            }
        });

    } catch (error) {
        console.error('Test API key error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to test API key'
        });
    }
});

// Get available tiers and their limits
router.get('/info/tiers', (req, res) => {
    try {
        const tiers = {
            free: {
                name: 'Free',
                description: 'Basic API access for personal projects',
                limits: {
                    requestsPerHour: 100,
                    requestsPerDay: 1000,
                    requestsPerMonth: 10000,
                    maxConcurrent: 5,
                    maxApiKeys: 2
                },
                features: ['Basic research', 'Batch processing', 'PDF reports'],
                price: 0
            },
            pro: {
                name: 'Professional',
                description: 'Enhanced API access for businesses',
                limits: {
                    requestsPerHour: 1000,
                    requestsPerDay: 20000,
                    requestsPerMonth: 500000,
                    maxConcurrent: 20,
                    maxApiKeys: 10
                },
                features: ['All Free features', 'Priority support', 'Advanced analytics', 'Webhooks'],
                price: 49
            },
            enterprise: {
                name: 'Enterprise',
                description: 'Unlimited API access for large organizations',
                limits: {
                    requestsPerHour: 10000,
                    requestsPerDay: 200000,
                    requestsPerMonth: 5000000,
                    maxConcurrent: 100,
                    maxApiKeys: 50
                },
                features: ['All Pro features', 'Dedicated support', 'Custom integrations', 'SLA guarantee'],
                price: 199
            }
        };

        res.json({
            success: true,
            tiers
        });

    } catch (error) {
        console.error('Get tiers info error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to retrieve tier information'
        });
    }
});

module.exports = router;