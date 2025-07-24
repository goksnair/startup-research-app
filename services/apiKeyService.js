const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const supabase = require('../database/supabase');

class ApiKeyService {
    constructor() {
        // API key prefix for identification
        this.keyPrefix = 'srp_'; // startup-research-platform
        
        // Rate limit tiers
        this.rateLimitTiers = {
            free: {
                requestsPerHour: 100,
                requestsPerDay: 1000,
                requestsPerMonth: 10000,
                maxConcurrent: 5
            },
            pro: {
                requestsPerHour: 1000,
                requestsPerDay: 20000,
                requestsPerMonth: 500000,
                maxConcurrent: 20
            },
            enterprise: {
                requestsPerHour: 10000,
                requestsPerDay: 200000,
                requestsPerMonth: 5000000,
                maxConcurrent: 100
            }
        };
    }

    // Generate new API key
    async generateApiKey(userId, keyName, options = {}) {
        try {
            const {
                permissions = { research: true, batch: true, reports: true },
                tier = 'free',
                expiresInDays = null,
                customLimits = null
            } = options;

            // Generate random key
            const randomBytes = crypto.randomBytes(32);
            const apiKeySecret = randomBytes.toString('hex');
            const fullApiKey = `${this.keyPrefix}${apiKeySecret}`;

            // Hash the key for storage
            const keyHash = await bcrypt.hash(fullApiKey, 12);
            
            // Get key prefix for identification (first 8 characters after prefix)
            const keyPrefix = fullApiKey.substring(0, this.keyPrefix.length + 8);

            // Calculate expiration
            let expiresAt = null;
            if (expiresInDays) {
                expiresAt = new Date();
                expiresAt.setDate(expiresAt.getDate() + expiresInDays);
            }

            // Get rate limits based on tier
            const rateLimits = customLimits || this.rateLimitTiers[tier] || this.rateLimitTiers.free;

            // Create API key record
            const apiKeyData = {
                user_id: userId,
                key_name: keyName,
                key_hash: keyHash,
                key_prefix: keyPrefix,
                permissions: JSON.stringify(permissions),
                rate_limit_per_hour: rateLimits.requestsPerHour,
                rate_limit_per_day: rateLimits.requestsPerDay,
                rate_limit_per_month: rateLimits.requestsPerMonth || rateLimits.requestsPerDay * 30,
                max_concurrent: rateLimits.maxConcurrent || 5,
                tier,
                expires_at: expiresAt?.toISOString() || null,
                metadata: JSON.stringify({
                    created_by: 'api_key_service',
                    tier,
                    custom_limits: !!customLimits
                })
            };

            const { data: createdKey, error } = await supabase
                .from('api_keys')
                .insert([apiKeyData])
                .select()
                .single();

            if (error) {
                throw error;
            }

            console.log(`🔑 API key created: ${keyPrefix}... for user ${userId}`);

            return {
                success: true,
                apiKey: fullApiKey, // Return full key only on creation
                keyId: createdKey.id,
                keyPrefix,
                keyName,
                permissions,
                rateLimits,
                tier,
                expiresAt
            };

        } catch (error) {
            console.error('API key generation failed:', error);
            throw new Error(`API key generation failed: ${error.message}`);
        }
    }

    // Validate API key and return key details
    async validateApiKey(apiKey) {
        try {
            if (!apiKey || !apiKey.startsWith(this.keyPrefix)) {
                return { valid: false, error: 'Invalid API key format' };
            }

            // Get key prefix for lookup
            const keyPrefix = apiKey.substring(0, this.keyPrefix.length + 8);

            // Find key by prefix
            const { data: keys, error } = await supabase
                .from('api_keys')
                .select('*')
                .eq('key_prefix', keyPrefix)
                .eq('is_active', true);

            if (error) {
                throw error;
            }

            if (!keys || keys.length === 0) {
                return { valid: false, error: 'API key not found' };
            }

            // Validate hash for each matching key (should only be one)
            for (const keyRecord of keys) {
                const isValid = await bcrypt.compare(apiKey, keyRecord.key_hash);
                
                if (isValid) {
                    // Check expiration
                    if (keyRecord.expires_at && new Date(keyRecord.expires_at) < new Date()) {
                        return { valid: false, error: 'API key has expired' };
                    }

                    // Update last used timestamp and usage count
                    await this.updateKeyUsage(keyRecord.id);

                    return {
                        valid: true,
                        keyId: keyRecord.id,
                        userId: keyRecord.user_id,
                        keyName: keyRecord.key_name,
                        permissions: JSON.parse(keyRecord.permissions || '{}'),
                        rateLimits: {
                            perHour: keyRecord.rate_limit_per_hour,
                            perDay: keyRecord.rate_limit_per_day,
                            perMonth: keyRecord.rate_limit_per_month,
                            maxConcurrent: keyRecord.max_concurrent
                        },
                        tier: keyRecord.tier,
                        usageCount: keyRecord.usage_count,
                        lastUsed: keyRecord.last_used_at
                    };
                }
            }

            return { valid: false, error: 'Invalid API key' };

        } catch (error) {
            console.error('API key validation error:', error);
            return { valid: false, error: 'API key validation failed' };
        }
    }

    // Update key usage statistics
    async updateKeyUsage(keyId) {
        try {
            await supabase
                .from('api_keys')
                .update({
                    last_used_at: new Date().toISOString(),
                    usage_count: supabase.raw('usage_count + 1')
                })
                .eq('id', keyId);

        } catch (error) {
            console.error('Key usage update error:', error);
        }
    }

    // Get user's API keys
    async getUserApiKeys(userId) {
        try {
            const { data: keys, error } = await supabase
                .from('api_keys')
                .select(`
                    id,
                    key_name,
                    key_prefix,
                    permissions,
                    rate_limit_per_hour,
                    rate_limit_per_day,
                    rate_limit_per_month,
                    max_concurrent,
                    tier,
                    is_active,
                    last_used_at,
                    usage_count,
                    created_at,
                    expires_at,
                    metadata
                `)
                .eq('user_id', userId)
                .order('created_at', { ascending: false });

            if (error) {
                throw error;
            }

            return keys.map(key => ({
                ...key,
                permissions: JSON.parse(key.permissions || '{}'),
                metadata: JSON.parse(key.metadata || '{}')
            }));

        } catch (error) {
            console.error('Get user API keys error:', error);
            throw error;
        }
    }

    // Revoke API key
    async revokeApiKey(keyId, userId) {
        try {
            const { error } = await supabase
                .from('api_keys')
                .update({ is_active: false })
                .eq('id', keyId)
                .eq('user_id', userId);

            if (error) {
                throw error;
            }

            console.log(`🔑 API key revoked: ${keyId} by user ${userId}`);
            return { success: true };

        } catch (error) {
            console.error('API key revocation error:', error);
            throw error;
        }
    }

    // Update API key permissions or limits
    async updateApiKey(keyId, userId, updates) {
        try {
            const {
                keyName,
                permissions,
                tier,
                customLimits,
                isActive
            } = updates;

            const updateData = {};

            if (keyName !== undefined) {
                updateData.key_name = keyName;
            }

            if (permissions !== undefined) {
                updateData.permissions = JSON.stringify(permissions);
            }

            if (tier !== undefined) {
                updateData.tier = tier;
                
                // Update rate limits based on tier
                const rateLimits = customLimits || this.rateLimitTiers[tier] || this.rateLimitTiers.free;
                updateData.rate_limit_per_hour = rateLimits.requestsPerHour;
                updateData.rate_limit_per_day = rateLimits.requestsPerDay;
                updateData.rate_limit_per_month = rateLimits.requestsPerMonth || rateLimits.requestsPerDay * 30;
                updateData.max_concurrent = rateLimits.maxConcurrent || 5;
            }

            if (isActive !== undefined) {
                updateData.is_active = isActive;
            }

            const { error } = await supabase
                .from('api_keys')
                .update(updateData)
                .eq('id', keyId)
                .eq('user_id', userId);

            if (error) {
                throw error;
            }

            console.log(`🔑 API key updated: ${keyId} by user ${userId}`);
            return { success: true };

        } catch (error) {
            console.error('API key update error:', error);
            throw error;
        }
    }

    // Get API key usage statistics
    async getKeyUsageStats(keyId, userId, timeframe = '24h') {
        try {
            let timeCondition = '';
            const now = new Date();
            
            switch (timeframe) {
                case '1h':
                    timeCondition = `created_at >= '${new Date(now.getTime() - 60*60*1000).toISOString()}'`;
                    break;
                case '24h':
                    timeCondition = `created_at >= '${new Date(now.getTime() - 24*60*60*1000).toISOString()}'`;
                    break;
                case '7d':
                    timeCondition = `created_at >= '${new Date(now.getTime() - 7*24*60*60*1000).toISOString()}'`;
                    break;
                case '30d':
                    timeCondition = `created_at >= '${new Date(now.getTime() - 30*24*60*60*1000).toISOString()}'`;
                    break;
                default:
                    timeCondition = `created_at >= '${new Date(now.getTime() - 24*60*60*1000).toISOString()}'`;
            }

            const { data: usage, error } = await supabase
                .from('api_usage')
                .select('endpoint, method, status_code, processing_time_ms, tokens_used, cost_usd, created_at')
                .eq('api_key_id', keyId)
                .eq('user_id', userId)
                .where(timeCondition)
                .order('created_at', { ascending: false });

            if (error) {
                throw error;
            }

            // Calculate statistics
            const totalRequests = usage.length;
            const successfulRequests = usage.filter(r => r.status_code < 400).length;
            const errorRequests = totalRequests - successfulRequests;
            const totalTokens = usage.reduce((sum, r) => sum + (r.tokens_used || 0), 0);
            const totalCost = usage.reduce((sum, r) => sum + (r.cost_usd || 0), 0);
            const avgResponseTime = totalRequests > 0 
                ? usage.reduce((sum, r) => sum + (r.processing_time_ms || 0), 0) / totalRequests 
                : 0;

            // Endpoint breakdown
            const endpointStats = usage.reduce((acc, record) => {
                const endpoint = record.endpoint;
                if (!acc[endpoint]) {
                    acc[endpoint] = { count: 0, errors: 0, avgTime: 0, tokens: 0 };
                }
                acc[endpoint].count++;
                acc[endpoint].avgTime += record.processing_time_ms || 0;
                acc[endpoint].tokens += record.tokens_used || 0;
                if (record.status_code >= 400) {
                    acc[endpoint].errors++;
                }
                return acc;
            }, {});

            // Calculate averages
            Object.keys(endpointStats).forEach(endpoint => {
                const stats = endpointStats[endpoint];
                stats.avgTime = Math.round(stats.avgTime / stats.count);
                stats.errorRate = ((stats.errors / stats.count) * 100).toFixed(2);
            });

            return {
                timeframe,
                totalRequests,
                successfulRequests,
                errorRequests,
                errorRate: totalRequests > 0 ? ((errorRequests / totalRequests) * 100).toFixed(2) : 0,
                totalTokens,
                totalCost: totalCost.toFixed(6),
                avgResponseTime: Math.round(avgResponseTime),
                endpointStats,
                generatedAt: new Date().toISOString()
            };

        } catch (error) {
            console.error('Key usage stats error:', error);
            throw error;
        }
    }

    // Check rate limits for API key
    async checkRateLimit(keyId, rateLimits) {
        try {
            const now = new Date();
            const oneHourAgo = new Date(now.getTime() - 60*60*1000);
            const oneDayAgo = new Date(now.getTime() - 24*60*60*1000);

            // Get usage counts for different time periods
            const { data: hourlyUsage, error: hourlyError } = await supabase
                .from('api_usage')
                .select('id')
                .eq('api_key_id', keyId)
                .gte('created_at', oneHourAgo.toISOString());

            const { data: dailyUsage, error: dailyError } = await supabase
                .from('api_usage')
                .select('id')
                .eq('api_key_id', keyId)
                .gte('created_at', oneDayAgo.toISOString());

            if (hourlyError || dailyError) {
                console.error('Rate limit check error:', hourlyError || dailyError);
                return { allowed: true, reason: 'rate_limit_check_failed' };
            }

            const hourlyCount = hourlyUsage?.length || 0;
            const dailyCount = dailyUsage?.length || 0;

            // Check limits
            if (hourlyCount >= rateLimits.perHour) {
                return {
                    allowed: false,
                    reason: 'hourly_limit_exceeded',
                    details: {
                        hourlyCount,
                        hourlyLimit: rateLimits.perHour,
                        resetsAt: new Date(oneHourAgo.getTime() + 60*60*1000).toISOString()
                    }
                };
            }

            if (dailyCount >= rateLimits.perDay) {
                return {
                    allowed: false,
                    reason: 'daily_limit_exceeded',
                    details: {
                        dailyCount,
                        dailyLimit: rateLimits.perDay,
                        resetsAt: new Date(oneDayAgo.getTime() + 24*60*60*1000).toISOString()
                    }
                };
            }

            return {
                allowed: true,
                usage: {
                    hourlyCount,
                    hourlyLimit: rateLimits.perHour,
                    dailyCount,
                    dailyLimit: rateLimits.perDay,
                    hourlyRemaining: rateLimits.perHour - hourlyCount,
                    dailyRemaining: rateLimits.perDay - dailyCount
                }
            };

        } catch (error) {
            console.error('Rate limit check error:', error);
            return { allowed: true, reason: 'rate_limit_check_failed' };
        }
    }

    // Clean up expired and revoked keys
    async cleanupApiKeys(retentionDays = 90) {
        try {
            const cutoffDate = new Date();
            cutoffDate.setDate(cutoffDate.getDate() - retentionDays);

            // Delete expired and inactive keys older than retention period
            const { error } = await supabase
                .from('api_keys')
                .delete()
                .or(`expires_at.lt.${new Date().toISOString()},is_active.eq.false`)
                .lt('created_at', cutoffDate.toISOString());

            if (error) {
                console.error('API key cleanup error:', error);
            } else {
                console.log(`🧹 API key cleanup completed (${retentionDays} days retention)`);
            }

        } catch (error) {
            console.error('API key cleanup error:', error);
        }
    }

    // Get API key statistics for admin
    async getApiKeyStatistics() {
        try {
            const { data: stats, error } = await supabase
                .from('api_keys')
                .select('tier, is_active, created_at, usage_count');

            if (error) {
                throw error;
            }

            const totalKeys = stats.length;
            const activeKeys = stats.filter(k => k.is_active).length;
            const inactiveKeys = totalKeys - activeKeys;

            const tierBreakdown = stats.reduce((acc, key) => {
                const tier = key.tier || 'free';
                if (!acc[tier]) acc[tier] = 0;
                acc[tier]++;
                return acc;
            }, {});

            const totalUsage = stats.reduce((sum, key) => sum + (key.usage_count || 0), 0);

            // Recent keys (last 30 days)
            const thirtyDaysAgo = new Date();
            thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
            const recentKeys = stats.filter(key => 
                new Date(key.created_at) >= thirtyDaysAgo
            ).length;

            return {
                totalKeys,
                activeKeys,
                inactiveKeys,
                tierBreakdown,
                totalUsage,
                recentKeys,
                generatedAt: new Date().toISOString()
            };

        } catch (error) {
            console.error('API key statistics error:', error);
            throw error;
        }
    }
}

module.exports = new ApiKeyService();