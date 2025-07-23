const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs').promises;
const { v4: uuidv4 } = require('uuid');

const { authenticateToken } = require('../middleware/auth');
const pdfService = require('../services/pdfService');
const emailService = require('../services/emailService');
const { reportQueue, emailQueue } = require('../services/queueService');
const supabase = require('../database/supabase');

// Middleware to parse JSON
router.use(express.json());

// Get user's reports
router.get('/user', authenticateToken, async (req, res) => {
    try {
        const userId = req.user.id;

        const { data: reports, error } = await supabase
            .from('pdf_reports')
            .select(`
                id,
                batch_id,
                report_type,
                file_name,
                file_size,
                companies,
                generated_at,
                expires_at,
                download_count,
                is_emailed,
                metadata
            `)
            .eq('user_id', userId)
            .order('generated_at', { ascending: false });

        if (error) {
            throw error;
        }

        // Parse metadata for each report
        const reportsWithMetadata = reports.map(report => ({
            ...report,
            metadata: report.metadata ? JSON.parse(report.metadata) : {}
        }));

        res.json({
            success: true,
            reports: reportsWithMetadata
        });

    } catch (error) {
        console.error('Failed to fetch user reports:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to fetch reports'
        });
    }
});

// Get specific report details
router.get('/:reportId', authenticateToken, async (req, res) => {
    try {
        const { reportId } = req.params;
        const userId = req.user.id;

        const { data: report, error } = await supabase
            .from('pdf_reports')
            .select('*')
            .eq('id', reportId)
            .eq('user_id', userId)
            .single();

        if (error) {
            throw error;
        }

        if (!report) {
            return res.status(404).json({
                success: false,
                error: 'Report not found'
            });
        }

        // Parse metadata
        report.metadata = report.metadata ? JSON.parse(report.metadata) : {};

        res.json({
            success: true,
            report
        });

    } catch (error) {
        console.error('Failed to fetch report details:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to fetch report details'
        });
    }
});

// Download report PDF
router.get('/:reportId/download', authenticateToken, async (req, res) => {
    try {
        const { reportId } = req.params;
        const userId = req.user.id;

        // Get report details
        const { data: report, error } = await supabase
            .from('pdf_reports')
            .select('*')
            .eq('id', reportId)
            .eq('user_id', userId)
            .single();

        if (error) {
            throw error;
        }

        if (!report) {
            return res.status(404).json({
                success: false,
                error: 'Report not found'
            });
        }

        // Check if report has expired
        if (new Date(report.expires_at) < new Date()) {
            return res.status(410).json({
                success: false,
                error: 'Report has expired'
            });
        }

        // Check if file exists
        try {
            await fs.access(report.file_path);
        } catch {
            return res.status(404).json({
                success: false,
                error: 'Report file not found'
            });
        }

        // Increment download count
        await supabase
            .from('pdf_reports')
            .update({ download_count: report.download_count + 1 })
            .eq('id', reportId);

        // Set headers for PDF download
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename="${report.file_name}"`);
        res.setHeader('Content-Length', report.file_size);

        // Stream the file
        const fileStream = require('fs').createReadStream(report.file_path);
        fileStream.pipe(res);

        console.log(`📥 Report downloaded: ${report.file_name} by user ${userId}`);

    } catch (error) {
        console.error('Report download failed:', error);
        res.status(500).json({
            success: false,
            error: 'Download failed'
        });
    }
});

// Email report to user
router.post('/:reportId/email', authenticateToken, async (req, res) => {
    try {
        const { reportId } = req.params;
        const { email, message } = req.body;
        const userId = req.user.id;

        // Get report details
        const { data: report, error } = await supabase
            .from('pdf_reports')
            .select('*')
            .eq('id', reportId)
            .eq('user_id', userId)
            .single();

        if (error) {
            throw error;
        }

        if (!report) {
            return res.status(404).json({
                success: false,
                error: 'Report not found'
            });
        }

        // Use provided email or user's email
        let recipientEmail = email;
        let recipientName = '';

        if (!recipientEmail) {
            const { data: userData } = await supabase
                .from('users')
                .select('email, full_name')
                .eq('id', userId)
                .single();

            recipientEmail = userData?.email;
            recipientName = userData?.full_name;
        }

        if (!recipientEmail) {
            return res.status(400).json({
                success: false,
                error: 'Email address required'
            });
        }

        // Queue email sending
        const emailJobId = uuidv4();
        await emailQueue.add('send-report', {
            recipientEmail,
            recipientName,
            reportPath: report.file_path,
            reportFileName: report.file_name,
            companies: report.companies,
            reportType: report.report_type,
            batchId: report.batch_id,
            reportId: report.id,
            userId,
            customMessage: message
        }, {
            jobId: emailJobId,
            attempts: 3,
            delay: 1000
        });

        res.json({
            success: true,
            message: 'Report email queued successfully',
            emailJobId,
            recipientEmail
        });

        console.log(`📧 Report email queued: ${report.file_name} to ${recipientEmail}`);

    } catch (error) {
        console.error('Report email queueing failed:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to queue email'
        });
    }
});

// Generate new report from existing batch
router.post('/generate', authenticateToken, async (req, res) => {
    try {
        const { batchId, reportType = 'standard', includeCharts = true, customBranding = {}, autoEmail = false } = req.body;
        const userId = req.user.id;

        if (!batchId) {
            return res.status(400).json({
                success: false,
                error: 'Batch ID is required'
            });
        }

        // Get batch details
        const { data: batch, error: batchError } = await supabase
            .from('batch_jobs')
            .select('*')
            .eq('id', batchId)
            .eq('user_id', userId)
            .single();

        if (batchError || !batch) {
            return res.status(404).json({
                success: false,
                error: 'Batch not found'
            });
        }

        if (batch.status !== 'completed') {
            return res.status(400).json({
                success: false,
                error: 'Batch must be completed to generate report'
            });
        }

        // Parse batch results
        const results = batch.results ? JSON.parse(batch.results) : [];
        const comparativeAnalysis = batch.comparative_analysis ? JSON.parse(batch.comparative_analysis) : null;

        if (results.length === 0) {
            return res.status(400).json({
                success: false,
                error: 'No successful analyses found in batch'
            });
        }

        // Queue report generation
        const reportJobId = uuidv4();
        await reportQueue.add('generate-pdf', {
            batchId,
            userId,
            results,
            comparativeAnalysis,
            reportType,
            options: {
                includeCharts,
                customBranding,
                autoEmail
            }
        }, {
            jobId: reportJobId,
            attempts: 3,
            delay: 2000
        });

        res.json({
            success: true,
            message: 'Report generation queued successfully',
            reportJobId,
            batchId,
            reportType,
            companiesCount: results.length
        });

        console.log(`📊 Report generation queued: ${reportType} for batch ${batchId}`);

    } catch (error) {
        console.error('Report generation queueing failed:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to queue report generation'
        });
    }
});

// Delete report
router.delete('/:reportId', authenticateToken, async (req, res) => {
    try {
        const { reportId } = req.params;
        const userId = req.user.id;

        // Get report details
        const { data: report, error } = await supabase
            .from('pdf_reports')
            .select('*')
            .eq('id', reportId)
            .eq('user_id', userId)
            .single();

        if (error) {
            throw error;
        }

        if (!report) {
            return res.status(404).json({
                success: false,
                error: 'Report not found'
            });
        }

        // Delete physical file
        try {
            await fs.unlink(report.file_path);
            console.log(`🗑️ Report file deleted: ${report.file_path}`);
        } catch (fileError) {
            console.warn('Report file already deleted or not found:', fileError.message);
        }

        // Delete database record
        const { error: deleteError } = await supabase
            .from('pdf_reports')
            .delete()
            .eq('id', reportId);

        if (deleteError) {
            throw deleteError;
        }

        res.json({
            success: true,
            message: 'Report deleted successfully'
        });

        console.log(`🗑️ Report deleted: ${reportId} by user ${userId}`);

    } catch (error) {
        console.error('Report deletion failed:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to delete report'
        });
    }
});

// Get report generation status
router.get('/job/:jobId/status', authenticateToken, async (req, res) => {
    try {
        const { jobId } = req.params;

        // This would need to be implemented based on your queue system
        // For now, return a placeholder response
        res.json({
            success: true,
            status: 'completed', // pending, processing, completed, failed
            progress: 100,
            message: 'Report generation status endpoint - implementation depends on queue system'
        });

    } catch (error) {
        console.error('Failed to get job status:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to get job status'
        });
    }
});

// Get report statistics
router.get('/stats/overview', authenticateToken, async (req, res) => {
    try {
        const userId = req.user.id;

        // Get report statistics
        const { data: stats, error } = await supabase
            .from('pdf_reports')
            .select('report_type, generated_at, file_size, download_count')
            .eq('user_id', userId);

        if (error) {
            throw error;
        }

        // Calculate statistics
        const totalReports = stats.length;
        const totalDownloads = stats.reduce((sum, report) => sum + report.download_count, 0);
        const totalFileSize = stats.reduce((sum, report) => sum + report.file_size, 0);
        
        const reportsByType = stats.reduce((acc, report) => {
            acc[report.report_type] = (acc[report.report_type] || 0) + 1;
            return acc;
        }, {});

        // Recent reports (last 30 days)
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
        
        const recentReports = stats.filter(report => 
            new Date(report.generated_at) >= thirtyDaysAgo
        ).length;

        res.json({
            success: true,
            stats: {
                totalReports,
                totalDownloads,
                totalFileSize,
                recentReports,
                reportsByType,
                averageFileSize: totalReports > 0 ? Math.round(totalFileSize / totalReports) : 0
            }
        });

    } catch (error) {
        console.error('Failed to get report statistics:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to get statistics'
        });
    }
});

module.exports = router;