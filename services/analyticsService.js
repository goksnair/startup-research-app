const supabase = require('../database/supabase');

class AnalyticsService {
    constructor() {
        // Initialize analytics collection
        this.startTime = Date.now();
        this.metrics = {
            requests: 0,
            errors: 0,
            totalProcessingTime: 0,
            peakMemoryUsage: 0
        };
        
        // Start periodic system metrics collection
        this.startSystemMetricsCollection();
    }

    // Track API usage
    async trackAPIUsage(data) {
        try {
            const {
                userId,
                apiKeyId = null,
                endpoint,
                method,
                statusCode,
                processingTimeMs = 0,
                tokensUsed = 0,
                costUsd = 0,
                ipAddress = null,
                userAgent = null
            } = data;

            const usageRecord = {
                user_id: userId,
                api_key_id: apiKeyId,
                endpoint,
                method,
                status_code: statusCode,
                processing_time_ms: processingTimeMs,
                tokens_used: tokensUsed,
                cost_usd: costUsd,
                ip_address: ipAddress,
                user_agent: userAgent
            };

            const { error } = await supabase
                .from('api_usage')
                .insert([usageRecord]);

            if (error) {
                console.error('Failed to track API usage:', error);
            }

            // Update in-memory metrics
            this.metrics.requests++;
            this.metrics.totalProcessingTime += processingTimeMs;
            if (statusCode >= 400) {
                this.metrics.errors++;
            }

        } catch (error) {
            console.error('API usage tracking error:', error);
        }
    }

    // Record system analytics
    async recordMetric(metricName, metricValue, dimensions = {}) {
        try {
            const analyticsRecord = {
                metric_name: metricName,
                metric_value: metricValue,
                dimensions
            };

            const { error } = await supabase
                .from('system_analytics')
                .insert([analyticsRecord]);

            if (error) {
                console.error('Failed to record metric:', error);
            }

        } catch (error) {
            console.error('Metric recording error:', error);
        }
    }

    // Track user behavior
    async trackUserAction(userId, action, details = {}) {
        try {
            await this.recordMetric('user_action', 1, {
                user_id: userId,
                action,
                ...details,
                timestamp: new Date().toISOString()
            });

        } catch (error) {
            console.error('User action tracking error:', error);
        }
    }

    // Track batch processing metrics
    async trackBatchProcessing(data) {
        try {
            const {
                batchId,
                userId,
                companiesCount,
                successCount,
                failureCount,
                processingTimeMs,
                analysisType
            } = data;

            // Record multiple metrics
            const metrics = [
                {
                    metric_name: 'batch_processed',
                    metric_value: 1,
                    dimensions: {
                        batch_id: batchId,
                        user_id: userId,
                        companies_count: companiesCount,
                        success_count: successCount,
                        failure_count: failureCount,
                        processing_time_ms: processingTimeMs,
                        analysis_type: analysisType
                    }
                },
                {
                    metric_name: 'companies_analyzed',
                    metric_value: successCount,
                    dimensions: {
                        batch_id: batchId,
                        analysis_type: analysisType
                    }
                },
                {
                    metric_name: 'batch_processing_time',
                    metric_value: processingTimeMs,
                    dimensions: {
                        companies_count: companiesCount,
                        analysis_type: analysisType
                    }
                }
            ];

            const { error } = await supabase
                .from('system_analytics')
                .insert(metrics);

            if (error) {
                console.error('Failed to track batch metrics:', error);
            }

        } catch (error) {
            console.error('Batch tracking error:', error);
        }
    }

    // Track PDF generation metrics
    async trackPDFGeneration(data) {
        try {
            const {
                reportId,
                userId,
                reportType,
                companiesCount,
                fileSizeBytes,
                generationTimeMs
            } = data;

            await this.recordMetric('pdf_generated', 1, {
                report_id: reportId,
                user_id: userId,
                report_type: reportType,
                companies_count: companiesCount,
                file_size_bytes: fileSizeBytes,
                generation_time_ms: generationTimeMs
            });

        } catch (error) {
            console.error('PDF generation tracking error:', error);
        }
    }

    // Track email notifications
    async trackEmailNotification(data) {
        try {
            const {
                userId,
                emailType,
                status,
                processingTimeMs = 0
            } = data;

            await this.recordMetric('email_notification', 1, {
                user_id: userId,
                email_type: emailType,
                status,
                processing_time_ms: processingTimeMs
            });

        } catch (error) {
            console.error('Email tracking error:', error);
        }
    }

    // Get usage statistics
    async getUsageStats(timeframe = '24h', userId = null) {
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

            const userCondition = userId ? `AND user_id = '${userId}'` : '';

            // Get API usage stats
            const { data: apiStats, error: apiError } = await supabase
                .from('api_usage')
                .select('endpoint, status_code, processing_time_ms, tokens_used')
                .where(timeCondition + userCondition);

            if (apiError) {
                console.error('API stats query error:', apiError);
                return null;
            }

            // Calculate metrics
            const totalRequests = apiStats.length;
            const successfulRequests = apiStats.filter(r => r.status_code < 400).length;
            const errorRequests = totalRequests - successfulRequests;
            const avgProcessingTime = totalRequests > 0 
                ? apiStats.reduce((sum, r) => sum + (r.processing_time_ms || 0), 0) / totalRequests 
                : 0;
            const totalTokensUsed = apiStats.reduce((sum, r) => sum + (r.tokens_used || 0), 0);

            // Get endpoint breakdown
            const endpointStats = apiStats.reduce((acc, record) => {
                const endpoint = record.endpoint;
                if (!acc[endpoint]) {
                    acc[endpoint] = { count: 0, avgTime: 0, errors: 0 };
                }
                acc[endpoint].count++;
                acc[endpoint].avgTime += record.processing_time_ms || 0;
                if (record.status_code >= 400) {
                    acc[endpoint].errors++;
                }
                return acc;
            }, {});

            // Calculate averages
            Object.keys(endpointStats).forEach(endpoint => {
                endpointStats[endpoint].avgTime = Math.round(
                    endpointStats[endpoint].avgTime / endpointStats[endpoint].count
                );
                endpointStats[endpoint].errorRate = 
                    (endpointStats[endpoint].errors / endpointStats[endpoint].count * 100).toFixed(2);
            });

            return {
                timeframe,
                totalRequests,
                successfulRequests,
                errorRequests,
                errorRate: totalRequests > 0 ? (errorRequests / totalRequests * 100).toFixed(2) : 0,
                avgProcessingTime: Math.round(avgProcessingTime),
                totalTokensUsed,
                endpointStats,
                generatedAt: new Date().toISOString()
            };

        } catch (error) {
            console.error('Usage stats error:', error);
            return null;
        }
    }

    // Get system analytics
    async getSystemAnalytics(timeframe = '24h') {
        try {
            let timeCondition = '';
            const now = new Date();
            
            switch (timeframe) {
                case '1h':
                    timeCondition = `recorded_at >= '${new Date(now.getTime() - 60*60*1000).toISOString()}'`;
                    break;
                case '24h':
                    timeCondition = `recorded_at >= '${new Date(now.getTime() - 24*60*60*1000).toISOString()}'`;
                    break;
                case '7d':
                    timeCondition = `recorded_at >= '${new Date(now.getTime() - 7*24*60*60*1000).toISOString()}'`;
                    break;
                case '30d':
                    timeCondition = `recorded_at >= '${new Date(now.getTime() - 30*24*60*60*1000).toISOString()}'`;
                    break;
                default:
                    timeCondition = `recorded_at >= '${new Date(now.getTime() - 24*60*60*1000).toISOString()}'`;
            }

            const { data: analytics, error } = await supabase
                .from('system_analytics')
                .select('metric_name, metric_value, dimensions, recorded_at')
                .where(timeCondition)
                .order('recorded_at', { ascending: false });

            if (error) {
                console.error('System analytics query error:', error);
                return null;
            }

            // Aggregate metrics
            const aggregated = analytics.reduce((acc, record) => {
                const metricName = record.metric_name;
                if (!acc[metricName]) {
                    acc[metricName] = {
                        count: 0,
                        totalValue: 0,
                        avgValue: 0,
                        maxValue: 0,
                        minValue: Number.MAX_VALUE,
                        dimensions: {}
                    };
                }

                const metric = acc[metricName];
                metric.count++;
                metric.totalValue += record.metric_value;
                metric.maxValue = Math.max(metric.maxValue, record.metric_value);
                metric.minValue = Math.min(metric.minValue, record.metric_value);

                // Aggregate dimensions
                if (record.dimensions) {
                    Object.entries(record.dimensions).forEach(([key, value]) => {
                        if (!metric.dimensions[key]) {
                            metric.dimensions[key] = {};
                        }
                        if (!metric.dimensions[key][value]) {
                            metric.dimensions[key][value] = 0;
                        }
                        metric.dimensions[key][value]++;
                    });
                }

                return acc;
            }, {});

            // Calculate averages
            Object.keys(aggregated).forEach(metricName => {
                const metric = aggregated[metricName];
                metric.avgValue = metric.count > 0 ? metric.totalValue / metric.count : 0;
                if (metric.minValue === Number.MAX_VALUE) {
                    metric.minValue = 0;
                }
            });

            return {
                timeframe,
                metrics: aggregated,
                totalRecords: analytics.length,
                generatedAt: new Date().toISOString()
            };

        } catch (error) {
            console.error('System analytics error:', error);
            return null;
        }
    }

    // Get user engagement metrics
    async getUserEngagement(timeframe = '30d') {
        try {
            let timeCondition = '';
            const now = new Date();
            
            switch (timeframe) {
                case '7d':
                    timeCondition = `created_at >= '${new Date(now.getTime() - 7*24*60*60*1000).toISOString()}'`;
                    break;
                case '30d':
                    timeCondition = `created_at >= '${new Date(now.getTime() - 30*24*60*60*1000).toISOString()}'`;
                    break;
                case '90d':
                    timeCondition = `created_at >= '${new Date(now.getTime() - 90*24*60*60*1000).toISOString()}'`;
                    break;
                default:
                    timeCondition = `created_at >= '${new Date(now.getTime() - 30*24*60*60*1000).toISOString()}'`;
            }

            // Get user registration trends
            const { data: users, error: usersError } = await supabase
                .from('users')
                .select('id, created_at')
                .where(timeCondition);

            if (usersError) {
                console.error('User engagement query error:', usersError);
                return null;
            }

            // Get batch job activity
            const { data: batches, error: batchesError } = await supabase
                .from('batch_jobs')
                .select('user_id, created_at, status, processed_companies')
                .where(timeCondition);

            if (batchesError) {
                console.error('Batch engagement query error:', batchesError);
                return null;
            }

            // Calculate engagement metrics
            const activeUsers = new Set(batches.map(b => b.user_id)).size;
            const totalUsers = users.length;
            const totalBatches = batches.length;
            const successfulBatches = batches.filter(b => b.status === 'completed').length;
            const avgCompaniesPerBatch = batches.length > 0 
                ? batches.reduce((sum, b) => sum + (b.processed_companies || 0), 0) / batches.length 
                : 0;

            // User activity distribution
            const userActivity = batches.reduce((acc, batch) => {
                const userId = batch.user_id;
                if (!acc[userId]) {
                    acc[userId] = 0;
                }
                acc[userId]++;
                return acc;
            }, {});

            const activityDistribution = {
                light: 0,  // 1-2 batches
                moderate: 0, // 3-10 batches
                heavy: 0    // 10+ batches
            };

            Object.values(userActivity).forEach(count => {
                if (count <= 2) activityDistribution.light++;
                else if (count <= 10) activityDistribution.moderate++;
                else activityDistribution.heavy++;
            });

            return {
                timeframe,
                totalUsers,
                activeUsers,
                engagementRate: totalUsers > 0 ? (activeUsers / totalUsers * 100).toFixed(2) : 0,
                totalBatches,
                successfulBatches,
                batchSuccessRate: totalBatches > 0 ? (successfulBatches / totalBatches * 100).toFixed(2) : 0,
                avgCompaniesPerBatch: Math.round(avgCompaniesPerBatch * 100) / 100,
                activityDistribution,
                generatedAt: new Date().toISOString()
            };

        } catch (error) {
            console.error('User engagement error:', error);
            return null;
        }
    }

    // Get real-time system status
    getSystemStatus() {
        const uptime = Date.now() - this.startTime;
        const memoryUsage = process.memoryUsage();
        
        return {
            uptime: {
                ms: uptime,
                formatted: this.formatUptime(uptime)
            },
            memory: {
                used: Math.round(memoryUsage.heapUsed / 1024 / 1024 * 100) / 100, // MB
                total: Math.round(memoryUsage.heapTotal / 1024 / 1024 * 100) / 100, // MB
                external: Math.round(memoryUsage.external / 1024 / 1024 * 100) / 100 // MB
            },
            cpu: {
                usage: process.cpuUsage()
            },
            metrics: {
                ...this.metrics,
                avgProcessingTime: this.metrics.requests > 0 
                    ? Math.round(this.metrics.totalProcessingTime / this.metrics.requests) 
                    : 0,
                errorRate: this.metrics.requests > 0 
                    ? (this.metrics.errors / this.metrics.requests * 100).toFixed(2) 
                    : 0
            },
            timestamp: new Date().toISOString()
        };
    }

    // Start collecting system metrics periodically
    startSystemMetricsCollection() {
        // Collect system metrics every 5 minutes
        setInterval(async () => {
            try {
                const status = this.getSystemStatus();
                
                // Record system metrics
                await this.recordMetric('system_memory_mb', status.memory.used);
                await this.recordMetric('system_uptime_ms', status.uptime.ms);
                await this.recordMetric('request_count', this.metrics.requests);
                await this.recordMetric('error_count', this.metrics.errors);
                
                // Update peak memory usage
                this.metrics.peakMemoryUsage = Math.max(this.metrics.peakMemoryUsage, status.memory.used);
                
            } catch (error) {
                console.error('System metrics collection error:', error);
            }
        }, 5 * 60 * 1000); // 5 minutes
    }

    // Utility functions
    formatUptime(ms) {
        const seconds = Math.floor(ms / 1000);
        const minutes = Math.floor(seconds / 60);
        const hours = Math.floor(minutes / 60);
        const days = Math.floor(hours / 24);

        if (days > 0) return `${days}d ${hours % 24}h ${minutes % 60}m`;
        if (hours > 0) return `${hours}h ${minutes % 60}m`;
        if (minutes > 0) return `${minutes}m ${seconds % 60}s`;
        return `${seconds}s`;
    }

    // Clean up old analytics data
    async cleanupAnalytics(retentionDays = 90) {
        try {
            const cutoffDate = new Date();
            cutoffDate.setDate(cutoffDate.getDate() - retentionDays);

            // Clean up old API usage records
            const { error: apiError } = await supabase
                .from('api_usage')
                .delete()
                .lt('created_at', cutoffDate.toISOString());

            if (apiError) {
                console.error('API usage cleanup error:', apiError);
            }

            // Clean up old system analytics
            const { error: analyticsError } = await supabase
                .from('system_analytics')
                .delete()
                .lt('recorded_at', cutoffDate.toISOString());

            if (analyticsError) {
                console.error('System analytics cleanup error:', analyticsError);
            }

            console.log(`🧹 Analytics cleanup completed (${retentionDays} days retention)`);

        } catch (error) {
            console.error('Analytics cleanup error:', error);
        }
    }
}

module.exports = new AnalyticsService();