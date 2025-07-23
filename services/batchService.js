const { v4: uuidv4 } = require('uuid');
const { batchQueue, redisAvailable, memoryQueueAvailable, memoryQueue } = require('./queueService');
const supabase = require('../database/supabase');
const analysisService = require('./analysisService');

class BatchService {
    constructor() {
        this.processingBatches = new Map();
    }

    // Create a new batch processing job
    async createBatch(userId, companies, options = {}) {
        try {
            if (!companies || !Array.isArray(companies) || companies.length === 0) {
                throw new Error('Companies array is required and must not be empty');
            }

            if (companies.length > 50) {
                throw new Error('Maximum 50 companies allowed per batch');
            }

            const batchId = uuidv4();
            const batchData = {
                id: batchId,
                user_id: userId,
                companies: companies.map(company =>
                    typeof company === 'string' ? { name: company } : company
                ),
                status: 'queued',
                total_companies: companies.length,
                processed_companies: 0,
                success_count: 0,
                error_count: 0,
                options: {
                    include_pdf: options.includePdf || false,
                    send_email: options.sendEmail || false,
                    priority: options.priority || 'normal'
                },
                created_at: new Date().toISOString(),
                started_at: null,
                completed_at: null,
                results: [],
                errors: []
            };

            // Store batch in database
            const { error: dbError } = await supabase
                .from('batch_jobs')
                .insert([{
                    id: batchId,
                    user_id: userId,
                    companies: JSON.stringify(batchData.companies),
                    status: 'queued',
                    total_companies: companies.length,
                    processed_companies: 0,
                    success_count: 0,
                    error_count: 0,
                    options: JSON.stringify(batchData.options),
                    created_at: batchData.created_at
                }]);

            if (dbError) {
                throw new Error(`Database error: ${dbError.message}`);
            }

            // Add job to queue system (Redis or enhanced memory)
            const jobOptions = {
                delay: 0,
                attempts: 3,
                priority: options.priority === 'high' ? 10 : options.priority === 'low' ? -10 : 0
            };

            if (redisAvailable()) {
                // Redis Bull queue
                jobOptions.backoff = {
                    type: 'exponential',
                    delay: 2000
                };
                jobOptions.removeOnComplete = 10;
                jobOptions.removeOnFail = 5;
                
                await batchQueue.add('process-batch', batchData, jobOptions);
                console.log(`📦 Batch ${batchId} added to Redis queue`);
            } else {
                // Enhanced memory queue
                await batchQueue.add('process-batch', batchData, jobOptions);
                console.log(`📦 Batch ${batchId} added to memory queue`);
            }

            console.log(`📦 Batch ${batchId} created with ${companies.length} companies`);

            return {
                batchId,
                status: 'queued',
                totalCompanies: companies.length,
                estimatedTime: this.estimateProcessingTime(companies.length),
                message: 'Batch job created and queued for processing'
            };

        } catch (error) {
            console.error('❌ Batch creation error:', error);
            throw error;
        }
    }

    // Get batch status and results
    async getBatchStatus(batchId, userId) {
        try {
            // Get from database
            const { data: batch, error } = await supabase
                .from('batch_jobs')
                .select('*')
                .eq('id', batchId)
                .eq('user_id', userId)
                .single();

            if (error || !batch) {
                throw new Error('Batch not found');
            }

            // Parse JSON fields
            const companies = JSON.parse(batch.companies || '[]');
            const options = JSON.parse(batch.options || '{}');
            const results = JSON.parse(batch.results || '[]');
            const errors = JSON.parse(batch.errors || '[]');

            return {
                id: batch.id,
                status: batch.status,
                totalCompanies: batch.total_companies,
                processedCompanies: batch.processed_companies,
                successCount: batch.success_count,
                errorCount: batch.error_count,
                progress: batch.total_companies > 0
                    ? Math.round((batch.processed_companies / batch.total_companies) * 100)
                    : 0,
                companies,
                options,
                results,
                errors,
                createdAt: batch.created_at,
                startedAt: batch.started_at,
                completedAt: batch.completed_at,
                estimatedTimeRemaining: this.calculateRemainingTime(batch)
            };
        } catch (error) {
            console.error('❌ Get batch status error:', error);
            throw error;
        }
    }

    // Get user's batch history
    async getUserBatches(userId, limit = 10, offset = 0) {
        try {
            const { data: batches, error } = await supabase
                .from('batch_jobs')
                .select('id, status, total_companies, success_count, error_count, created_at, completed_at')
                .eq('user_id', userId)
                .order('created_at', { ascending: false })
                .range(offset, offset + limit - 1);

            if (error) {
                throw new Error(`Database error: ${error.message}`);
            }

            return batches.map(batch => ({
                id: batch.id,
                status: batch.status,
                totalCompanies: batch.total_companies,
                successCount: batch.success_count,
                errorCount: batch.error_count,
                createdAt: batch.created_at,
                completedAt: batch.completed_at,
                duration: batch.completed_at
                    ? new Date(batch.completed_at) - new Date(batch.created_at)
                    : null
            }));
        } catch (error) {
            console.error('❌ Get user batches error:', error);
            throw error;
        }
    }

    // Cancel a batch job
    async cancelBatch(batchId, userId) {
        try {
            // Update database
            const { error } = await supabase
                .from('batch_jobs')
                .update({
                    status: 'cancelled',
                    completed_at: new Date().toISOString()
                })
                .eq('id', batchId)
                .eq('user_id', userId);

            if (error) {
                throw new Error(`Database error: ${error.message}`);
            }

            // Try to remove from queue (if still queued)
            const jobs = await batchQueue.getJobs(['waiting', 'active']);
            const job = jobs.find(j => j.data.id === batchId);
            if (job) {
                await job.remove();
            }

            console.log(`🚫 Batch ${batchId} cancelled`);
            return { message: 'Batch job cancelled successfully' };
        } catch (error) {
            console.error('❌ Cancel batch error:', error);
            throw error;
        }
    }

    // Estimate processing time
    estimateProcessingTime(companyCount) {
        // Rough estimate: 15 seconds per company analysis
        const baseTime = companyCount * 15;
        const queueTime = 30; // Base queue wait time
        const totalSeconds = baseTime + queueTime;

        if (totalSeconds < 60) {
            return `${totalSeconds} seconds`;
        } else if (totalSeconds < 3600) {
            return `${Math.round(totalSeconds / 60)} minutes`;
        } else {
            return `${Math.round(totalSeconds / 3600)} hours`;
        }
    }

    // Calculate remaining time for active batch
    calculateRemainingTime(batch) {
        if (batch.status !== 'processing') {
            return null;
        }

        const remaining = batch.total_companies - batch.processed_companies;
        if (remaining <= 0) {
            return '0 minutes';
        }

        const avgTimePerCompany = 15; // seconds
        const remainingSeconds = remaining * avgTimePerCompany;

        if (remainingSeconds < 60) {
            return `${remainingSeconds} seconds`;
        } else {
            return `${Math.round(remainingSeconds / 60)} minutes`;
        }
    }

    // Process batch in-memory (for development without Redis)
    async processInMemoryBatch(batchId) {
        try {
            console.log(`🔄 Starting in-memory processing for batch ${batchId}`);
            
            const batchData = this.processingBatches.get(batchId);
            if (!batchData) {
                console.error(`❌ Batch ${batchId} not found in memory`);
                return;
            }

            // Update status to processing
            await supabase
                .from('batch_jobs')
                .update({
                    status: 'processing',
                    started_at: new Date().toISOString()
                })
                .eq('id', batchId);

            const results = [];
            const errors = [];
            let processedCount = 0;
            let successCount = 0;

            for (const company of batchData.companies) {
                try {
                    console.log(`🔍 Processing company: ${company.name || company}`);
                    
                    // Simulate processing (in real implementation, call analysis service)
                    await new Promise(resolve => setTimeout(resolve, 2000)); // 2 second delay
                    
                    const result = {
                        company: company.name || company,
                        status: 'completed',
                        analysis: `Sample analysis for ${company.name || company}`,
                        processedAt: new Date().toISOString()
                    };
                    
                    results.push(result);
                    successCount++;
                    processedCount++;

                    // Update progress in database
                    await supabase
                        .from('batch_jobs')
                        .update({
                            processed_companies: processedCount,
                            success_count: successCount,
                            results: JSON.stringify(results)
                        })
                        .eq('id', batchId);

                } catch (error) {
                    console.error(`❌ Error processing ${company.name || company}:`, error);
                    errors.push({
                        company: company.name || company,
                        error: error.message,
                        timestamp: new Date().toISOString()
                    });
                    processedCount++;

                    // Update progress with error
                    await supabase
                        .from('batch_jobs')
                        .update({
                            processed_companies: processedCount,
                            error_count: errors.length,
                            errors: JSON.stringify(errors)
                        })
                        .eq('id', batchId);
                }
            }

            // Mark as completed
            await supabase
                .from('batch_jobs')
                .update({
                    status: 'completed',
                    completed_at: new Date().toISOString(),
                    processed_companies: processedCount,
                    success_count: successCount,
                    error_count: errors.length,
                    results: JSON.stringify(results),
                    errors: JSON.stringify(errors)
                })
                .eq('id', batchId);

            // Remove from memory
            this.processingBatches.delete(batchId);
            
            console.log(`✅ Batch ${batchId} completed: ${successCount} successes, ${errors.length} errors`);

        } catch (error) {
            console.error(`❌ In-memory batch processing failed for ${batchId}:`, error);
            
            // Mark as failed
            await supabase
                .from('batch_jobs')
                .update({
                    status: 'failed',
                    completed_at: new Date().toISOString(),
                    errors: JSON.stringify([{
                        error: error.message,
                        timestamp: new Date().toISOString()
                    }])
                })
                .eq('id', batchId);

            this.processingBatches.delete(batchId);
        }
    }

    // Get batch statistics for admin
    async getBatchStatistics() {
        try {
            const { data: stats, error } = await supabase
                .from('batch_jobs')
                .select('status, total_companies, success_count, error_count, created_at')
                .order('created_at', { ascending: false })
                .limit(100);

            if (error) {
                throw new Error(`Database error: ${error.message}`);
            }

            const now = new Date();
            const last24Hours = new Date(now - 24 * 60 * 60 * 1000);
            const last7Days = new Date(now - 7 * 24 * 60 * 60 * 1000);

            const recent24h = stats.filter(s => new Date(s.created_at) > last24Hours);
            const recent7d = stats.filter(s => new Date(s.created_at) > last7Days);

            return {
                total: stats.length,
                last24Hours: {
                    count: recent24h.length,
                    completed: recent24h.filter(s => s.status === 'completed').length,
                    failed: recent24h.filter(s => s.status === 'failed').length,
                    totalCompanies: recent24h.reduce((sum, s) => sum + s.total_companies, 0)
                },
                last7Days: {
                    count: recent7d.length,
                    completed: recent7d.filter(s => s.status === 'completed').length,
                    failed: recent7d.filter(s => s.status === 'failed').length,
                    totalCompanies: recent7d.reduce((sum, s) => sum + s.total_companies, 0)
                },
                statusBreakdown: {
                    queued: stats.filter(s => s.status === 'queued').length,
                    processing: stats.filter(s => s.status === 'processing').length,
                    completed: stats.filter(s => s.status === 'completed').length,
                    failed: stats.filter(s => s.status === 'failed').length,
                    cancelled: stats.filter(s => s.status === 'cancelled').length
                }
            };
        } catch (error) {
            console.error('❌ Get batch statistics error:', error);
            throw error;
        }
    }
}

module.exports = new BatchService();
