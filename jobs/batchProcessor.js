const { batchQueue, memoryQueue } = require('../services/queueService');
const analysisService = require('../services/analysisService');
const supabase = require('../database/supabase');
const { trackBatchOperation } = require('../middleware/analytics');
const webhookService = require('../services/webhookService');

// Enhanced batch processor that works with both Redis and Memory queues
const processBatchJob = async (job) => {
    const batchData = job.data;
    const { id: batchId, companies, user_id: userId, options } = batchData;

    console.log(`🚀 Starting batch processing for ${batchId}: ${companies.length} companies`);

    try {
        // Update status to processing
        await updateBatchStatus(batchId, {
            status: 'processing',
            started_at: new Date().toISOString()
        });

        const results = [];
        const errors = [];
        let processedCount = 0;

        // Process each company
        for (let i = 0; i < companies.length; i++) {
            const company = companies[i];
            const companyName = typeof company === 'string' ? company : company.name;

            try {
                console.log(`  📊 Analyzing ${i + 1}/${companies.length}: ${companyName}`);

                // Perform analysis
                const analysisResult = await analysisService.analyzeCompany(company, {
                    analysisType: options.analysisType || 'comprehensive'
                });

                results.push(analysisResult);
                processedCount++;

                // Update progress in database
                await updateBatchProgress(batchId, {
                    processed_companies: processedCount,
                    success_count: results.length,
                    error_count: errors.length,
                    results: JSON.stringify(results),
                    errors: JSON.stringify(errors)
                });

                // Update job progress (works for both Redis and Memory queues)
                const progressPercent = Math.round((processedCount / companies.length) * 100);
                if (job.progress) {
                    job.progress(progressPercent);
                } else if (memoryQueue && job.id) {
                    memoryQueue.updateProgress(job.id, progressPercent);
                }

                console.log(`  ✅ Analysis completed for ${companyName}`);

                // Rate limiting - wait between requests
                if (i < companies.length - 1) {
                    await new Promise(resolve => setTimeout(resolve, 2000));
                }

            } catch (error) {
                console.error(`  ❌ Analysis failed for ${companyName}:`, error);
                errors.push({
                    company: companyName,
                    error: error.message,
                    timestamp: new Date().toISOString()
                });
                processedCount++;

                // Update progress even on errors
                await updateBatchProgress(batchId, {
                    processed_companies: processedCount,
                    success_count: results.length,
                    error_count: errors.length,
                    results: JSON.stringify(results),
                    errors: JSON.stringify(errors)
                });
            }
        }

        // Generate comparative analysis if multiple successful results
        let comparativeAnalysis = null;
        if (results.length > 1) {
            try {
                console.log(`  🔄 Generating comparative analysis...`);
                comparativeAnalysis = await analysisService.generateComparativeAnalysis(results);
            } catch (error) {
                console.error('  ❌ Comparative analysis failed:', error);
            }
        }

        // Generate executive summary
        const executiveSummary = analysisService.generateExecutiveSummary(results);

        // Update final status
        const finalStatus = errors.length === companies.length ? 'failed' : 'completed';
        await updateBatchStatus(batchId, {
            status: finalStatus,
            completed_at: new Date().toISOString(),
            processed_companies: processedCount,
            success_count: results.length,
            error_count: errors.length,
            results: JSON.stringify(results),
            errors: JSON.stringify(errors),
            comparative_analysis: comparativeAnalysis ? JSON.stringify(comparativeAnalysis) : null,
            executive_summary: executiveSummary ? JSON.stringify(executiveSummary) : null
        });

        console.log(`🎉 Batch ${batchId} completed: ${results.length} successful, ${errors.length} failed`);

        // Track batch completion analytics
        await trackBatchOperation({
            id: batchId,
            user_id: userId,
            companies,
            success_count: results.length,
            processing_time_ms: Date.now() - new Date(batchData.created_at || Date.now()).getTime(),
            options
        });

        // Trigger post-processing tasks
        await triggerPostProcessing(batchId, userId, options, results, comparativeAnalysis, companies, batchData);

        // Send webhook notification for completed batch
        try {
            await webhookService.sendBatchCompletedWebhook(userId, {
                id: batchId,
                status: finalStatus,
                companies,
                success_count: results.length,
                error_count: errors.length,
                completed_at: new Date().toISOString(),
                results: finalStatus === 'completed' ? results : null
            });
        } catch (webhookError) {
            console.error('Webhook notification failed:', webhookError);
        }

        return {
            batchId,
            status: finalStatus,
            companiesProcessed: processedCount,
            successCount: results.length,
            errorCount: errors.length,
            hasComparativeAnalysis: !!comparativeAnalysis,
            hasExecutiveSummary: !!executiveSummary
        };

    } catch (error) {
        console.error(`💥 Batch ${batchId} processing failed:`, error);

        // Update status to failed
        await updateBatchStatus(batchId, {
            status: 'failed',
            completed_at: new Date().toISOString(),
            error_message: error.message
        });

        throw error;
    }
};

// Register the batch processor with the queue system
batchQueue.process('process-batch', processBatchJob);

console.log('🔄 Batch processing worker started');

// Update batch status in database
async function updateBatchStatus(batchId, updates) {
    try {
        const { error } = await supabase
            .from('batch_jobs')
            .update(updates)
            .eq('id', batchId);

        if (error) {
            console.error('Database update error:', error);
        }
    } catch (error) {
        console.error('Failed to update batch status:', error);
    }
}

// Update batch progress in database
async function updateBatchProgress(batchId, updates) {
    try {
        const { error } = await supabase
            .from('batch_jobs')
            .update(updates)
            .eq('id', batchId);

        if (error) {
            console.error('Database progress update error:', error);
        }
    } catch (error) {
        console.error('Failed to update batch progress:', error);
    }
}

// Trigger post-processing tasks (PDF generation, email notifications)
async function triggerPostProcessing(batchId, userId, options, results, comparativeAnalysis, companies, batchData) {
    try {
        // Generate PDF report if requested
        if (options.include_pdf && results.length > 0) {
            const { reportQueue } = require('../services/queueService');
            await reportQueue.add('generate-pdf', {
                batchId,
                userId,
                results,
                comparativeAnalysis,
                reportType: results.length > 1 ? 'comparative' : 'standard',
                options
            });
            console.log(`📄 PDF generation queued for batch ${batchId}`);
        }

        // Send email notification if requested  
        if (options.send_email) {
            const { emailQueue } = require('../services/queueService');
            await emailQueue.add('batch-complete', {
                batchId,
                userId,
                companiesCount: companies.length,
                successCount: results.length,
                failureCount: companies.length - results.length,
                processingTime: Date.now() - new Date(batchData.created_at).getTime(),
                includePdf: options.include_pdf
            });
            console.log(`📧 Email notification queued for batch ${batchId}`);
        }

        // Record analytics
        await recordBatchAnalytics(batchId, results.length, options);

    } catch (error) {
        console.error('Post-processing failed:', error);
    }
}

// Record batch analytics
async function recordBatchAnalytics(batchId, successCount, options) {
    try {
        const analytics = [
            {
                metric_name: 'batch_completed',
                metric_value: 1,
                dimensions: {
                    companies_count: successCount,
                    analysis_type: options.analysisType || 'comprehensive',
                    include_pdf: options.include_pdf || false
                }
            },
            {
                metric_name: 'companies_analyzed',
                metric_value: successCount,
                dimensions: {
                    batch_id: batchId,
                    analysis_type: options.analysisType || 'comprehensive'
                }
            }
        ];

        await supabase.from('system_analytics').insert(analytics);

    } catch (error) {
        console.error('Analytics recording failed:', error);
    }
}

// Batch queue error handler
batchQueue.on('error', (error) => {
    console.error('Batch queue error:', error);
});

batchQueue.on('stalled', (job) => {
    console.error(`Batch job ${job.id} stalled`);
});

console.log('🔄 Batch processing worker started');

module.exports = batchQueue;
