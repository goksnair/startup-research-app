const { reportQueue, emailQueue } = require('../services/queueService');
const pdfService = require('../services/pdfService');
const emailService = require('../services/emailService');
const supabase = require('../database/supabase');
const { trackPDFGeneration, trackEmailNotification } = require('../middleware/analytics');
const webhookService = require('../services/webhookService');

// PDF Report Generation Processor
const generatePDFReport = async (job) => {
    const { batchId, userId, results, comparativeAnalysis, reportType, options } = job.data;

    console.log(`📊 Generating ${reportType} PDF report for batch: ${batchId}`);

    try {
        // Update job progress
        if (job.progress) {
            job.progress(10);
        }

        // Prepare analysis data for PDF generation
        const analysisData = {
            results,
            comparativeAnalysis,
            companies: results.map(r => r.company),
            timestamp: new Date().toISOString()
        };

        // Generate PDF
        if (job.progress) {
            job.progress(30);
        }

        const reportResult = await pdfService.generateReport(analysisData, {
            reportType,
            reportId: batchId,
            userId,
            includeCharts: true,
            customBranding: options?.branding || {}
        });

        if (job.progress) {
            job.progress(70);
        }

        // Save report metadata to database
        const reportRecord = {
            id: require('uuid').v4(),
            user_id: userId,
            batch_id: batchId,
            report_type: reportType,
            file_name: reportResult.fileName,
            file_path: reportResult.filePath,
            file_size: reportResult.fileSize,
            companies: reportResult.companies,
            generated_at: reportResult.generatedAt,
            expires_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(), // 30 days
            metadata: JSON.stringify({
                includeCharts: true,
                companiesCount: results.length,
                hasComparativeAnalysis: !!comparativeAnalysis,
                generationOptions: options
            })
        };

        const { error: dbError } = await supabase
            .from('pdf_reports')
            .insert([reportRecord]);

        if (dbError) {
            console.error('Failed to save report metadata:', dbError);
        }

        if (job.progress) {
            job.progress(90);
        }

        // Auto-email report if requested
        if (options?.auto_email) {
            try {
                // Get user email
                const { data: userData } = await supabase
                    .from('users')
                    .select('email, full_name')
                    .eq('id', userId)
                    .single();

                if (userData?.email) {
                    await emailQueue.add('send-report', {
                        recipientEmail: userData.email,
                        recipientName: userData.full_name,
                        reportPath: reportResult.filePath,
                        reportFileName: reportResult.fileName,
                        companies: reportResult.companies,
                        reportType,
                        batchId
                    });

                    console.log(`📧 Report email queued for ${userData.email}`);
                }
            } catch (emailError) {
                console.error('Failed to queue report email:', emailError);
            }
        }

        if (job.progress) {
            job.progress(100);
        }

        // Track PDF generation analytics
        await trackPDFGeneration({
            id: reportRecord.id,
            user_id: userId,
            report_type: reportType,
            companies: reportResult.companies,
            file_size: reportResult.fileSize,
            generation_time_ms: Date.now() - (job.processedOn || Date.now())
        });

        console.log(`✅ PDF report generated successfully: ${reportResult.fileName}`);

        // Send webhook notification for report generation
        try {
            await webhookService.sendReportGeneratedWebhook(userId, {
                id: reportRecord.id,
                report_type: reportType,
                file_name: reportResult.fileName,
                companies: reportResult.companies,
                generated_at: reportResult.generatedAt
            });
        } catch (webhookError) {
            console.error('Report webhook notification failed:', webhookError);
        }

        return {
            success: true,
            reportId: reportRecord.id,
            fileName: reportResult.fileName,
            filePath: reportResult.filePath,
            fileSize: reportResult.fileSize,
            companies: reportResult.companies,
            reportType
        };

    } catch (error) {
        console.error(`❌ PDF generation failed for batch ${batchId}:`, error);
        throw error;
    }
};

// Email Report Sender Processor
const sendReportEmail = async (job) => {
    const emailData = job.data;
    
    console.log(`📧 Sending report email to: ${emailData.recipientEmail}`);

    try {
        // Update progress
        if (job.progress) {
            job.progress(20);
        }

        // Send email with report attachment
        const emailResult = await emailService.sendReport(emailData);

        if (job.progress) {
            job.progress(80);
        }

        // Record email notification in database
        const notificationRecord = {
            id: require('uuid').v4(),
            user_id: emailData.userId,
            batch_id: emailData.batchId,
            report_id: emailData.reportId,
            email_type: 'report_ready',
            recipient_email: emailData.recipientEmail,
            subject: `Your ${emailData.reportType} Analysis Report - ${emailData.companies}`,
            status: 'sent',
            sent_at: new Date().toISOString()
        };

        const { error: notificationError } = await supabase
            .from('email_notifications')
            .insert([notificationRecord]);

        if (notificationError) {
            console.error('Failed to record email notification:', notificationError);
        }

        // Update report as emailed
        if (emailData.reportId) {
            await supabase
                .from('pdf_reports')
                .update({ is_emailed: true })
                .eq('id', emailData.reportId);
        }

        if (job.progress) {
            job.progress(100);
        }

        // Track email notification analytics
        await trackEmailNotification({
            user_id: emailData.userId,
            email_type: 'report_ready',
            status: 'sent',
            processing_time_ms: Date.now() - (job.processedOn || Date.now())
        });

        console.log(`✅ Report email sent successfully to: ${emailData.recipientEmail}`);

        return emailResult;

    } catch (error) {
        console.error(`❌ Report email failed for ${emailData.recipientEmail}:`, error);

        // Record failed email notification
        try {
            const failedNotificationRecord = {
                id: require('uuid').v4(),
                user_id: emailData.userId,
                batch_id: emailData.batchId,
                email_type: 'report_ready',
                recipient_email: emailData.recipientEmail,
                subject: `Your ${emailData.reportType} Analysis Report - ${emailData.companies}`,
                status: 'failed',
                error_message: error.message,
                retry_count: job.attemptsMade || 0
            };

            await supabase
                .from('email_notifications')
                .insert([failedNotificationRecord]);

        } catch (dbError) {
            console.error('Failed to record failed email notification:', dbError);
        }

        throw error;
    }
};

// Batch Completion Email Processor
const sendBatchNotification = async (job) => {
    const { batchId, userId, companiesCount, successCount, failureCount, processingTime, includePdf } = job.data;

    console.log(`📧 Sending batch completion notification for: ${batchId}`);

    try {
        // Get user details
        const { data: userData } = await supabase
            .from('users')
            .select('email, full_name')
            .eq('id', userId)
            .single();

        if (!userData?.email) {
            throw new Error('User email not found');
        }

        // Update progress
        if (job.progress) {
            job.progress(30);
        }

        // Get report details if PDF was generated
        let reportPath = null;
        let reportFileName = null;

        if (includePdf) {
            const { data: reportData } = await supabase
                .from('pdf_reports')
                .select('file_path, file_name')
                .eq('batch_id', batchId)
                .order('generated_at', { ascending: false })
                .limit(1)
                .single();

            if (reportData) {
                reportPath = reportData.file_path;
                reportFileName = reportData.file_name;
            }
        }

        if (job.progress) {
            job.progress(60);
        }

        // Send batch completion notification
        const emailResult = await emailService.sendBatchNotification({
            recipientEmail: userData.email,
            recipientName: userData.full_name,
            batchId,
            companiesCount,
            successCount,
            failureCount,
            processingTime,
            reportPath,
            reportFileName
        });

        if (job.progress) {
            job.progress(90);
        }

        // Record notification in database
        const notificationRecord = {
            id: require('uuid').v4(),
            user_id: userId,
            batch_id: batchId,
            email_type: 'batch_complete',
            recipient_email: userData.email,
            subject: `Batch Analysis Complete - ${successCount}/${companiesCount} Companies Processed`,
            status: 'sent',
            sent_at: new Date().toISOString()
        };

        await supabase
            .from('email_notifications')
            .insert([notificationRecord]);

        if (job.progress) {
            job.progress(100);
        }

        console.log(`✅ Batch completion notification sent to: ${userData.email}`);

        return emailResult;

    } catch (error) {
        console.error(`❌ Batch notification failed for ${batchId}:`, error);

        // Record failed notification
        try {
            const { data: userData } = await supabase
                .from('users')
                .select('email')
                .eq('id', userId)
                .single();

            if (userData?.email) {
                const failedNotificationRecord = {
                    id: require('uuid').v4(),
                    user_id: userId,
                    batch_id: batchId,
                    email_type: 'batch_complete',
                    recipient_email: userData.email,
                    subject: `Batch Analysis Complete - ${successCount}/${companiesCount} Companies Processed`,
                    status: 'failed',
                    error_message: error.message,
                    retry_count: job.attemptsMade || 0
                };

                await supabase
                    .from('email_notifications')
                    .insert([failedNotificationRecord]);
            }
        } catch (dbError) {
            console.error('Failed to record failed batch notification:', dbError);
        }

        throw error;
    }
};

// Register processors with queues
reportQueue.process('generate-pdf', generatePDFReport);
reportQueue.process('send-report', sendReportEmail);
emailQueue.process('batch-complete', sendBatchNotification);
emailQueue.process('send-report', sendReportEmail);

// Queue event handlers
reportQueue.on('completed', (job, result) => {
    console.log(`✅ Report job ${job.id} completed: ${result.fileName || 'email sent'}`);
});

reportQueue.on('failed', (job, err) => {
    console.log(`❌ Report job ${job.id} failed: ${err.message}`);
});

emailQueue.on('completed', (job, result) => {
    console.log(`✅ Email job ${job.id} completed: sent to ${result.recipientEmail}`);
});

emailQueue.on('failed', (job, err) => {
    console.log(`❌ Email job ${job.id} failed: ${err.message}`);
});

console.log('📊 Report and email processors started');

module.exports = {
    generatePDFReport,
    sendReportEmail,
    sendBatchNotification
};