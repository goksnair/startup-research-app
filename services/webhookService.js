const axios = require('axios');
const crypto = require('crypto');
const supabase = require('../database/supabase');

class WebhookService {
    constructor() {
        this.maxRetries = 3;
        this.retryDelays = [1000, 5000, 15000]; // 1s, 5s, 15s
        this.timeout = 10000; // 10 seconds
    }

    // Create webhook endpoint for user
    async createWebhook(userId, webhookData) {
        try {
            const {
                url,
                events = ['batch.completed', 'report.generated'],
                secret = null,
                isActive = true,
                name = 'Default Webhook'
            } = webhookData;

            // Validate URL
            if (!this.isValidUrl(url)) {
                throw new Error('Invalid webhook URL');
            }

            // Generate signing secret if not provided
            const signingSecret = secret || crypto.randomBytes(32).toString('hex');

            const webhook = {
                id: require('uuid').v4(),
                user_id: userId,
                name,
                url,
                events: JSON.stringify(events),
                signing_secret: signingSecret,
                is_active: isActive,
                created_at: new Date().toISOString()
            };

            const { data: createdWebhook, error } = await supabase
                .from('webhooks')
                .insert([webhook])
                .select()
                .single();

            if (error) {
                throw error;
            }

            console.log(`🪝 Webhook created: ${webhook.id} for user ${userId}`);

            return {
                success: true,
                webhook: {
                    id: createdWebhook.id,
                    name: createdWebhook.name,
                    url: createdWebhook.url,
                    events: JSON.parse(createdWebhook.events),
                    signingSecret,
                    isActive: createdWebhook.is_active,
                    createdAt: createdWebhook.created_at
                }
            };

        } catch (error) {
            console.error('Webhook creation error:', error);
            throw error;
        }
    }

    // Send webhook notification
    async sendWebhook(userId, eventType, eventData, options = {}) {
        try {
            // Get user's active webhooks for this event type
            const { data: webhooks, error } = await supabase
                .from('webhooks')
                .select('*')
                .eq('user_id', userId)
                .eq('is_active', true);

            if (error) {
                console.error('Webhook query error:', error);
                return;
            }

            if (!webhooks || webhooks.length === 0) {
                console.log(`No active webhooks found for user ${userId}`);
                return;
            }

            // Filter webhooks that subscribe to this event type
            const relevantWebhooks = webhooks.filter(webhook => {
                const events = JSON.parse(webhook.events || '[]');
                return events.includes(eventType) || events.includes('*');
            });

            if (relevantWebhooks.length === 0) {
                console.log(`No webhooks subscribed to event ${eventType} for user ${userId}`);
                return;
            }

            // Send to each relevant webhook
            const deliveryPromises = relevantWebhooks.map(webhook =>
                this.deliverWebhook(webhook, eventType, eventData, options)
            );

            await Promise.allSettled(deliveryPromises);

        } catch (error) {
            console.error('Webhook sending error:', error);
        }
    }

    // Deliver webhook to a specific endpoint
    async deliverWebhook(webhook, eventType, eventData, options = {}) {
        const deliveryId = require('uuid').v4();
        const timestamp = new Date().toISOString();

        try {
            // Create webhook payload
            const payload = {
                id: deliveryId,
                event: eventType,
                timestamp,
                data: eventData,
                webhook: {
                    id: webhook.id,
                    name: webhook.name
                }
            };

            // Generate signature
            const signature = this.generateSignature(payload, webhook.signing_secret);

            // Prepare headers
            const headers = {
                'Content-Type': 'application/json',
                'User-Agent': 'StartupResearch-Webhooks/1.0',
                'X-Webhook-ID': deliveryId,
                'X-Webhook-Event': eventType,
                'X-Webhook-Timestamp': timestamp,
                'X-Webhook-Signature': signature
            };

            // Record delivery attempt
            const deliveryRecord = {
                id: deliveryId,
                webhook_id: webhook.id,
                user_id: webhook.user_id,
                event_type: eventType,
                payload: JSON.stringify(payload),
                status: 'pending',
                attempt_count: 0,
                created_at: timestamp
            };

            await supabase
                .from('webhook_deliveries')
                .insert([deliveryRecord]);

            // Attempt delivery with retries
            await this.attemptDelivery(webhook, payload, headers, deliveryId, 0);

        } catch (error) {
            console.error(`Webhook delivery error for ${webhook.id}:`, error);
            
            // Record failed delivery
            await supabase
                .from('webhook_deliveries')
                .update({
                    status: 'failed',
                    error_message: error.message,
                    completed_at: new Date().toISOString()
                })
                .eq('id', deliveryId);
        }
    }

    // Attempt webhook delivery with retries
    async attemptDelivery(webhook, payload, headers, deliveryId, attemptNumber) {
        try {
            console.log(`🪝 Attempting webhook delivery ${attemptNumber + 1}/${this.maxRetries + 1} to ${webhook.url}`);

            const startTime = Date.now();
            const response = await axios.post(webhook.url, payload, {
                headers,
                timeout: this.timeout,
                validateStatus: (status) => status < 500 // Retry on 5xx errors
            });

            const responseTime = Date.now() - startTime;

            // Update delivery record
            await supabase
                .from('webhook_deliveries')
                .update({
                    status: response.status < 400 ? 'delivered' : 'failed',
                    response_status: response.status,
                    response_headers: JSON.stringify(response.headers),
                    response_body: response.data ? JSON.stringify(response.data).substring(0, 1000) : null,
                    response_time_ms: responseTime,
                    attempt_count: attemptNumber + 1,
                    completed_at: new Date().toISOString()
                })
                .eq('id', deliveryId);

            if (response.status >= 400) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }

            console.log(`✅ Webhook delivered successfully to ${webhook.url} (${responseTime}ms)`);
            return response;

        } catch (error) {
            console.error(`❌ Webhook delivery attempt ${attemptNumber + 1} failed:`, error.message);

            // Update attempt count
            await supabase
                .from('webhook_deliveries')
                .update({
                    attempt_count: attemptNumber + 1,
                    error_message: error.message
                })
                .eq('id', deliveryId);

            // Retry if we haven't exhausted retries
            if (attemptNumber < this.maxRetries) {
                const delay = this.retryDelays[attemptNumber] || 15000;
                console.log(`⏳ Retrying webhook delivery in ${delay}ms`);
                
                await new Promise(resolve => setTimeout(resolve, delay));
                return this.attemptDelivery(webhook, payload, headers, deliveryId, attemptNumber + 1);
            } else {
                // Mark as permanently failed
                await supabase
                    .from('webhook_deliveries')
                    .update({
                        status: 'failed',
                        completed_at: new Date().toISOString()
                    })
                    .eq('id', deliveryId);

                throw error;
            }
        }
    }

    // Generate HMAC signature for webhook verification
    generateSignature(payload, secret) {
        const payloadString = JSON.stringify(payload);
        const hmac = crypto.createHmac('sha256', secret);
        hmac.update(payloadString);
        return `sha256=${hmac.digest('hex')}`;
    }

    // Verify webhook signature
    verifySignature(payload, signature, secret) {
        const expectedSignature = this.generateSignature(payload, secret);
        return crypto.timingSafeEqual(
            Buffer.from(signature),
            Buffer.from(expectedSignature)
        );
    }

    // Get user's webhooks
    async getUserWebhooks(userId) {
        try {
            const { data: webhooks, error } = await supabase
                .from('webhooks')
                .select('*')
                .eq('user_id', userId)
                .order('created_at', { ascending: false });

            if (error) {
                throw error;
            }

            return webhooks.map(webhook => ({
                ...webhook,
                events: JSON.parse(webhook.events || '[]')
            }));

        } catch (error) {
            console.error('Get user webhooks error:', error);
            throw error;
        }
    }

    // Update webhook
    async updateWebhook(webhookId, userId, updates) {
        try {
            const updateData = {};

            if (updates.name !== undefined) {
                updateData.name = updates.name;
            }

            if (updates.url !== undefined) {
                if (!this.isValidUrl(updates.url)) {
                    throw new Error('Invalid webhook URL');
                }
                updateData.url = updates.url;
            }

            if (updates.events !== undefined) {
                updateData.events = JSON.stringify(updates.events);
            }

            if (updates.isActive !== undefined) {
                updateData.is_active = updates.isActive;
            }

            const { error } = await supabase
                .from('webhooks')
                .update(updateData)
                .eq('id', webhookId)
                .eq('user_id', userId);

            if (error) {
                throw error;
            }

            console.log(`🪝 Webhook updated: ${webhookId} by user ${userId}`);
            return { success: true };

        } catch (error) {
            console.error('Webhook update error:', error);
            throw error;
        }
    }

    // Delete webhook
    async deleteWebhook(webhookId, userId) {
        try {
            const { error } = await supabase
                .from('webhooks')
                .delete()
                .eq('id', webhookId)
                .eq('user_id', userId);

            if (error) {
                throw error;
            }

            console.log(`🪝 Webhook deleted: ${webhookId} by user ${userId}`);
            return { success: true };

        } catch (error) {
            console.error('Webhook deletion error:', error);
            throw error;
        }
    }

    // Get webhook delivery history
    async getWebhookDeliveries(webhookId, userId, options = {}) {
        try {
            const { limit = 50, offset = 0, status = null } = options;

            let query = supabase
                .from('webhook_deliveries')
                .select('*')
                .eq('webhook_id', webhookId)
                .eq('user_id', userId)
                .order('created_at', { ascending: false })
                .range(offset, offset + limit - 1);

            if (status) {
                query = query.eq('status', status);
            }

            const { data: deliveries, error } = await query;

            if (error) {
                throw error;
            }

            return deliveries.map(delivery => ({
                ...delivery,
                payload: JSON.parse(delivery.payload || '{}')
            }));

        } catch (error) {
            console.error('Get webhook deliveries error:', error);
            throw error;
        }
    }

    // Test webhook endpoint
    async testWebhook(webhookId, userId) {
        try {
            // Get webhook details
            const { data: webhook, error } = await supabase
                .from('webhooks')
                .select('*')
                .eq('id', webhookId)
                .eq('user_id', userId)
                .single();

            if (error || !webhook) {
                throw new Error('Webhook not found');
            }

            // Send test event
            const testData = {
                message: 'This is a test webhook delivery',
                timestamp: new Date().toISOString(),
                test: true
            };

            await this.deliverWebhook(webhook, 'webhook.test', testData);

            return { success: true, message: 'Test webhook sent' };

        } catch (error) {
            console.error('Test webhook error:', error);
            throw error;
        }
    }

    // Get webhook statistics
    async getWebhookStats(userId, timeframe = '7d') {
        try {
            let timeCondition = '';
            const now = new Date();
            
             switch (timeframe) {
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
                    timeCondition = `created_at >= '${new Date(now.getTime() - 7*24*60*60*1000).toISOString()}'`;
            }

            const { data: deliveries, error } = await supabase
                .from('webhook_deliveries')
                .select('status, event_type, response_time_ms, created_at')
                .eq('user_id', userId)
                .where(timeCondition);

            if (error) {
                throw error;
            }

            const totalDeliveries = deliveries.length;
            const deliveredCount = deliveries.filter(d => d.status === 'delivered').length;
            const failedCount = deliveries.filter(d => d.status === 'failed').length;
            const pendingCount = deliveries.filter(d => d.status === 'pending').length;

            const avgResponseTime = deliveries
                .filter(d => d.response_time_ms)
                .reduce((sum, d, _, arr) => sum + d.response_time_ms / arr.length, 0);

            // Event type breakdown
            const eventTypes = deliveries.reduce((acc, d) => {
                acc[d.event_type] = (acc[d.event_type] || 0) + 1;
                return acc;
            }, {});

            return {
                timeframe,
                totalDeliveries,
                deliveredCount,
                failedCount,
                pendingCount,
                successRate: totalDeliveries > 0 ? ((deliveredCount / totalDeliveries) * 100).toFixed(2) : 0,
                avgResponseTime: Math.round(avgResponseTime),
                eventTypes,
                generatedAt: new Date().toISOString()
            };

        } catch (error) {
            console.error('Webhook stats error:', error);
            throw error;
        }
    }

    // Common webhook event helpers
    async sendBatchCompletedWebhook(userId, batchData) {
        await this.sendWebhook(userId, 'batch.completed', {
            batchId: batchData.id,
            status: batchData.status,
            companiesCount: batchData.companies?.length || 0,
            successCount: batchData.success_count || 0,
            errorCount: batchData.error_count || 0,
            completedAt: batchData.completed_at,
            results: batchData.results ? JSON.parse(batchData.results) : null
        });
    }

    async sendReportGeneratedWebhook(userId, reportData) {
        await this.sendWebhook(userId, 'report.generated', {
            reportId: reportData.id,
            reportType: reportData.report_type,
            fileName: reportData.file_name,
            companies: reportData.companies,
            generatedAt: reportData.generated_at,
            downloadUrl: `/api/v1/reports/${reportData.id}/download`
        });
    }

    async sendApiKeyCreatedWebhook(userId, apiKeyData) {
        await this.sendWebhook(userId, 'api_key.created', {
            keyId: apiKeyData.keyId,
            keyName: apiKeyData.keyName,
            keyPrefix: apiKeyData.keyPrefix,
            tier: apiKeyData.tier,
            permissions: apiKeyData.permissions,
            createdAt: new Date().toISOString()
        });
    }

    // Utility methods
    isValidUrl(url) {
        try {
            const parsedUrl = new URL(url);
            return ['http:', 'https:'].includes(parsedUrl.protocol);
        } catch {
            return false;
        }
    }

    // Cleanup old webhook deliveries
    async cleanupDeliveries(retentionDays = 30) {
        try {
            const cutoffDate = new Date();
            cutoffDate.setDate(cutoffDate.getDate() - retentionDays);

            const { error } = await supabase
                .from('webhook_deliveries')
                .delete()
                .lt('created_at', cutoffDate.toISOString());

            if (error) {
                console.error('Webhook cleanup error:', error);
            } else {
                console.log(`🧹 Webhook deliveries cleanup completed (${retentionDays} days retention)`);
            }

        } catch (error) {
            console.error('Webhook cleanup error:', error);
        }
    }
}

module.exports = new WebhookService();