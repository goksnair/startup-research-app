const nodemailer = require('nodemailer');
const fs = require('fs').promises;
const path = require('path');

class EmailService {
    constructor() {
        this.transporter = null;
        this.templatesDir = path.join(__dirname, '..', 'templates');
        this.initializeTransporter();
        this.ensureTemplatesDirectory();
    }

    async initializeTransporter() {
        try {
            // Configure email transporter based on environment
            if (process.env.SMTP_HOST && process.env.SMTP_USER) {
                // Production SMTP configuration
                this.transporter = nodemailer.createTransport({
                    host: process.env.SMTP_HOST,
                    port: process.env.SMTP_PORT || 587,
                    secure: process.env.SMTP_SECURE === 'true',
                    auth: {
                        user: process.env.SMTP_USER,
                        pass: process.env.SMTP_PASS
                    },
                    tls: {
                        rejectUnauthorized: process.env.NODE_ENV === 'production'
                    }
                });
            } else if (process.env.SENDGRID_API_KEY) {
                // SendGrid configuration
                this.transporter = nodemailer.createTransport({
                    service: 'SendGrid',
                    auth: {
                        user: 'apikey',
                        pass: process.env.SENDGRID_API_KEY
                    }
                });
            } else {
                // Development/test configuration
                console.log('📧 Email service: Using test configuration (emails will be logged, not sent)');
                this.transporter = nodemailer.createTransport({
                    jsonTransport: true
                });
            }

            console.log('✅ Email service initialized');

        } catch (error) {
            console.error('❌ Email service initialization failed:', error);
            // Fallback to test transporter
            this.transporter = nodemailer.createTransport({
                jsonTransport: true
            });
        }
    }

    async ensureTemplatesDirectory() {
        try {
            await fs.access(this.templatesDir);
        } catch {
            await fs.mkdir(this.templatesDir, { recursive: true });
            await this.createDefaultTemplates();
        }
    }

    // Send report via email
    async sendReport(emailData) {
        try {
            const {
                recipientEmail,
                recipientName,
                reportPath,
                reportFileName,
                companies,
                reportType = 'standard',
                batchId
            } = emailData;

            console.log(`📧 Sending ${reportType} report to: ${recipientEmail}`);

            // Validate required fields
            if (!recipientEmail || !reportPath) {
                throw new Error('Recipient email and report path are required');
            }

            // Check if report file exists
            try {
                await fs.access(reportPath);
            } catch {
                throw new Error('Report file not found');
            }

            // Generate email content
            const emailTemplate = await this.getReportEmailTemplate(reportType);
            const emailContent = await this.populateTemplate(emailTemplate, {
                recipientName: recipientName || 'Valued User',
                companies: Array.isArray(companies) ? companies.join(', ') : companies,
                reportType: reportType.charAt(0).toUpperCase() + reportType.slice(1),
                generatedDate: new Date().toLocaleDateString(),
                batchId
            });

            const mailOptions = {
                from: process.env.FROM_EMAIL || 'noreply@startup-research.com',
                to: recipientEmail,
                subject: `Your ${reportType.charAt(0).toUpperCase() + reportType.slice(1)} Analysis Report - ${companies}`,
                html: emailContent.html,
                text: emailContent.text,
                attachments: [
                    {
                        filename: reportFileName || path.basename(reportPath),
                        path: reportPath,
                        contentType: 'application/pdf'
                    }
                ]
            };

            const result = await this.transporter.sendMail(mailOptions);

            // Log email for development
            if (result.message) {
                console.log('📧 Development email:', JSON.stringify(result, null, 2));
            }

            console.log(`✅ Report email sent successfully to: ${recipientEmail}`);

            return {
                success: true,
                messageId: result.messageId,
                recipientEmail,
                reportFileName,
                sentAt: new Date().toISOString()
            };

        } catch (error) {
            console.error('❌ Email sending failed:', error);
            throw new Error(`Email sending failed: ${error.message}`);
        }
    }

    // Send batch completion notification
    async sendBatchNotification(notificationData) {
        try {
            const {
                recipientEmail,
                recipientName,
                batchId,
                companiesCount,
                successCount,
                failureCount,
                processingTime,
                reportPath,
                reportFileName
            } = notificationData;

            console.log(`📧 Sending batch completion notification to: ${recipientEmail}`);

            const emailTemplate = await this.getBatchNotificationTemplate();
            const emailContent = await this.populateTemplate(emailTemplate, {
                recipientName: recipientName || 'Valued User',
                batchId,
                companiesCount,
                successCount,
                failureCount,
                processingTime: Math.round(processingTime / 1000), // Convert to seconds
                completedAt: new Date().toLocaleString(),
                hasReport: !!reportPath
            });

            const mailOptions = {
                from: process.env.FROM_EMAIL || 'noreply@startup-research.com',
                to: recipientEmail,
                subject: `Batch Analysis Complete - ${successCount}/${companiesCount} Companies Processed`,
                html: emailContent.html,
                text: emailContent.text
            };

            // Add report attachment if available
            if (reportPath && reportFileName) {
                try {
                    await fs.access(reportPath);
                    mailOptions.attachments = [
                        {
                            filename: reportFileName,
                            path: reportPath,
                            contentType: 'application/pdf'
                        }
                    ];
                } catch {
                    console.warn('⚠️ Report file not found, sending notification without attachment');
                }
            }

            const result = await this.transporter.sendMail(mailOptions);

            // Log email for development
            if (result.message) {
                console.log('📧 Development email:', JSON.stringify(result, null, 2));
            }

            console.log(`✅ Batch notification sent successfully to: ${recipientEmail}`);

            return {
                success: true,
                messageId: result.messageId,
                recipientEmail,
                batchId,
                sentAt: new Date().toISOString()
            };

        } catch (error) {
            console.error('❌ Batch notification failed:', error);
            throw new Error(`Batch notification failed: ${error.message}`);
        }
    }

    // Send system notification
    async sendSystemNotification(notificationData) {
        try {
            const {
                recipientEmail,
                recipientName,
                subject,
                message,
                notificationType = 'system_update'
            } = notificationData;

            console.log(`📧 Sending system notification to: ${recipientEmail}`);

            const emailTemplate = await this.getSystemNotificationTemplate();
            const emailContent = await this.populateTemplate(emailTemplate, {
                recipientName: recipientName || 'Valued User',
                subject,
                message,
                notificationType,
                sentAt: new Date().toLocaleString()
            });

            const mailOptions = {
                from: process.env.FROM_EMAIL || 'noreply@startup-research.com',
                to: recipientEmail,
                subject: subject || 'System Notification - Startup Research Platform',
                html: emailContent.html,
                text: emailContent.text
            };

            const result = await this.transporter.sendMail(mailOptions);

            // Log email for development
            if (result.message) {
                console.log('📧 Development email:', JSON.stringify(result, null, 2));
            }

            console.log(`✅ System notification sent successfully to: ${recipientEmail}`);

            return {
                success: true,
                messageId: result.messageId,
                recipientEmail,
                sentAt: new Date().toISOString()
            };

        } catch (error) {
            console.error('❌ System notification failed:', error);
            throw new Error(`System notification failed: ${error.message}`);
        }
    }

    // Email template methods
    async getReportEmailTemplate(reportType) {
        const templatePath = path.join(this.templatesDir, 'report-email.html');
        
        try {
            const template = await fs.readFile(templatePath, 'utf-8');
            return template;
        } catch {
            // Return default template if file doesn't exist
            return this.getDefaultReportTemplate();
        }
    }

    async getBatchNotificationTemplate() {
        const templatePath = path.join(this.templatesDir, 'batch-notification.html');
        
        try {
            const template = await fs.readFile(templatePath, 'utf-8');
            return template;
        } catch {
            return this.getDefaultBatchNotificationTemplate();
        }
    }

    async getSystemNotificationTemplate() {
        const templatePath = path.join(this.templatesDir, 'system-notification.html');
        
        try {
            const template = await fs.readFile(templatePath, 'utf-8');
            return template;
        } catch {
            return this.getDefaultSystemNotificationTemplate();
        }
    }

    // Template population
    async populateTemplate(template, data) {
        let html = template;
        let text = this.htmlToText(template);

        // Replace placeholders
        Object.entries(data).forEach(([key, value]) => {
            const placeholder = new RegExp(`{{${key}}}`, 'g');
            html = html.replace(placeholder, value || '');
            text = text.replace(placeholder, value || '');
        });

        return { html, text };
    }

    // Convert HTML to text
    htmlToText(html) {
        return html
            .replace(/<[^>]*>/g, '') // Remove HTML tags
            .replace(/&nbsp;/g, ' ')
            .replace(/&amp;/g, '&')
            .replace(/&lt;/g, '<')
            .replace(/&gt;/g, '>')
            .replace(/\s+/g, ' ')
            .trim();
    }

    // Default email templates
    getDefaultReportTemplate() {
        return `
<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Your Analysis Report</title>
    <style>
        body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
        .container { max-width: 600px; margin: 0 auto; padding: 20px; }
        .header { background: #2563eb; color: white; padding: 20px; text-align: center; }
        .content { padding: 20px; background: #f9fafb; }
        .footer { padding: 20px; text-align: center; color: #6b7280; font-size: 12px; }
        .button { display: inline-block; padding: 12px 24px; background: #2563eb; color: white; text-decoration: none; border-radius: 6px; }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>Your {{reportType}} Analysis Report</h1>
        </div>
        <div class="content">
            <p>Dear {{recipientName}},</p>
            
            <p>Your {{reportType}} analysis report for <strong>{{companies}}</strong> has been generated and is attached to this email.</p>
            
            <p><strong>Report Details:</strong></p>
            <ul>
                <li>Report Type: {{reportType}}</li>
                <li>Companies: {{companies}}</li>
                <li>Generated: {{generatedDate}}</li>
                {{#batchId}}<li>Batch ID: {{batchId}}</li>{{/batchId}}
            </ul>
            
            <p>The attached PDF contains comprehensive analysis including business overview, market analysis, financial performance, and strategic recommendations.</p>
            
            <p>If you have any questions about your report, please don't hesitate to contact our support team.</p>
            
            <p>Best regards,<br>
            The Startup Research Team</p>
        </div>
        <div class="footer">
            <p>© 2025 Startup Research Platform. All rights reserved.</p>
            <p>This is an automated message. Please do not reply to this email.</p>
        </div>
    </div>
</body>
</html>`;
    }

    getDefaultBatchNotificationTemplate() {
        return `
<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Batch Analysis Complete</title>
    <style>
        body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
        .container { max-width: 600px; margin: 0 auto; padding: 20px; }
        .header { background: #059669; color: white; padding: 20px; text-align: center; }
        .content { padding: 20px; background: #f9fafb; }
        .stats { background: white; padding: 15px; border-radius: 8px; margin: 15px 0; }
        .stat-item { display: inline-block; margin: 10px 20px 10px 0; }
        .stat-number { font-size: 24px; font-weight: bold; color: #059669; }
        .stat-label { font-size: 12px; color: #6b7280; }
        .footer { padding: 20px; text-align: center; color: #6b7280; font-size: 12px; }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>✅ Batch Analysis Complete</h1>
        </div>
        <div class="content">
            <p>Dear {{recipientName}},</p>
            
            <p>Your batch analysis (ID: <strong>{{batchId}}</strong>) has been completed successfully!</p>
            
            <div class="stats">
                <div class="stat-item">
                    <div class="stat-number">{{companiesCount}}</div>
                    <div class="stat-label">Total Companies</div>
                </div>
                <div class="stat-item">
                    <div class="stat-number">{{successCount}}</div>
                    <div class="stat-label">Successful</div>
                </div>
                {{#failureCount}}
                <div class="stat-item">
                    <div class="stat-number">{{failureCount}}</div>
                    <div class="stat-label">Failed</div>
                </div>
                {{/failureCount}}
                <div class="stat-item">
                    <div class="stat-number">{{processingTime}}s</div>
                    <div class="stat-label">Processing Time</div>
                </div>
            </div>
            
            <p><strong>Completed:</strong> {{completedAt}}</p>
            
            {{#hasReport}}
            <p>📊 A comprehensive PDF report has been generated and is attached to this email containing detailed analysis for all processed companies.</p>
            {{/hasReport}}
            
            <p>You can access your batch results and individual company analyses through your dashboard.</p>
            
            <p>Thank you for using our platform!</p>
            
            <p>Best regards,<br>
            The Startup Research Team</p>
        </div>
        <div class="footer">
            <p>© 2025 Startup Research Platform. All rights reserved.</p>
            <p>This is an automated message. Please do not reply to this email.</p>
        </div>
    </div>
</body>
</html>`;
    }

    getDefaultSystemNotificationTemplate() {
        return `
<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>System Notification</title>
    <style>
        body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
        .container { max-width: 600px; margin: 0 auto; padding: 20px; }
        .header { background: #7c3aed; color: white; padding: 20px; text-align: center; }
        .content { padding: 20px; background: #f9fafb; }
        .footer { padding: 20px; text-align: center; color: #6b7280; font-size: 12px; }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>System Notification</h1>
        </div>
        <div class="content">
            <p>Dear {{recipientName}},</p>
            
            <p>{{message}}</p>
            
            <p><strong>Notification Type:</strong> {{notificationType}}</p>
            <p><strong>Sent:</strong> {{sentAt}}</p>
            
            <p>If you have any questions, please contact our support team.</p>
            
            <p>Best regards,<br>
            The Startup Research Team</p>
        </div>
        <div class="footer">
            <p>© 2025 Startup Research Platform. All rights reserved.</p>
        </div>
    </div>
</body>
</html>`;
    }

    // Create default email templates
    async createDefaultTemplates() {
        try {
            const templates = [
                { name: 'report-email.html', content: this.getDefaultReportTemplate() },
                { name: 'batch-notification.html', content: this.getDefaultBatchNotificationTemplate() },
                { name: 'system-notification.html', content: this.getDefaultSystemNotificationTemplate() }
            ];

            for (const template of templates) {
                const templatePath = path.join(this.templatesDir, template.name);
                await fs.writeFile(templatePath, template.content);
            }

            console.log('✅ Default email templates created');

        } catch (error) {
            console.error('❌ Template creation failed:', error);
        }
    }

    // Test email configuration
    async testEmailConfiguration() {
        try {
            if (this.transporter.options && this.transporter.options.jsonTransport) {
                console.log('📧 Email test: Using development mode (JSON transport)');
                return { success: true, mode: 'development' };
            }

            const testResult = await this.transporter.verify();
            console.log('✅ Email configuration test successful');
            return { success: true, verified: testResult };

        } catch (error) {
            console.error('❌ Email configuration test failed:', error);
            return { success: false, error: error.message };
        }
    }

    // Get email statistics
    getEmailStats() {
        return {
            transporterType: this.transporter?.options?.service || 'custom',
            templatesDirectory: this.templatesDir,
            configurationMode: process.env.NODE_ENV || 'development'
        };
    }
}

module.exports = new EmailService();