const PDFDocument = require('pdfkit');
const fs = require('fs').promises;
const path = require('path');
const { createCanvas } = require('canvas');
const Chart = require('chart.js/auto');

class PDFService {
    constructor() {
        this.reportsDir = path.join(__dirname, '..', 'reports');
        this.ensureReportsDirectory();
    }

    async ensureReportsDirectory() {
        try {
            await fs.access(this.reportsDir);
        } catch {
            await fs.mkdir(this.reportsDir, { recursive: true });
        }
    }

    // Generate PDF report from analysis data
    async generateReport(analysisData, options = {}) {
        try {
            const {
                reportType = 'standard',
                reportId,
                userId,
                includeCharts = true,
                customBranding = {}
            } = options;

            console.log(`📊 Generating ${reportType} PDF report for: ${analysisData.companies || analysisData.company}`);

            const doc = new PDFDocument({
                size: 'A4',
                margin: 50,
                info: {
                    Title: this.getReportTitle(analysisData, reportType),
                    Author: 'Startup Research Platform',
                    Subject: 'Company Analysis Report',
                    Keywords: 'startup analysis business intelligence',
                    CreationDate: new Date()
                }
            });

            const fileName = this.generateFileName(analysisData, reportType, reportId);
            const filePath = path.join(this.reportsDir, fileName);

            // Create write stream
            const stream = fs.createWriteStream ? 
                require('fs').createWriteStream(filePath) : 
                null;

            if (stream) {
                doc.pipe(stream);
            }

            // Generate report content based on type
            await this.generateReportContent(doc, analysisData, reportType, includeCharts, customBranding);

            // Finalize the document
            doc.end();

            // Wait for stream to finish if using file system
            if (stream) {
                await new Promise((resolve, reject) => {
                    stream.on('finish', resolve);
                    stream.on('error', reject);
                });
            }

            const stats = await fs.stat(filePath);

            console.log(`✅ PDF report generated: ${fileName} (${stats.size} bytes)`);

            return {
                fileName,
                filePath,
                fileSize: stats.size,
                reportType,
                generatedAt: new Date().toISOString(),
                companies: this.extractCompanyNames(analysisData)
            };

        } catch (error) {
            console.error('❌ PDF generation failed:', error);
            throw new Error(`PDF generation failed: ${error.message}`);
        }
    }

    // Generate report content based on type
    async generateReportContent(doc, analysisData, reportType, includeCharts, customBranding) {
        // Add header with branding
        this.addHeader(doc, customBranding);

        // Add title page
        this.addTitlePage(doc, analysisData, reportType);

        // Add content based on report type
        switch (reportType) {
            case 'standard':
                await this.generateStandardReport(doc, analysisData, includeCharts);
                break;
            case 'comparative':
                await this.generateComparativeReport(doc, analysisData, includeCharts);
                break;
            case 'executive':
                await this.generateExecutiveReport(doc, analysisData, includeCharts);
                break;
            default:
                await this.generateStandardReport(doc, analysisData, includeCharts);
        }

        // Add footer
        this.addFooter(doc);
    }

    // Add header with branding
    addHeader(doc, customBranding = {}) {
        const { 
            logoUrl, 
            companyName = 'Startup Research Platform',
            primaryColor = '#2563eb' 
        } = customBranding;

        // Header background
        doc.rect(0, 0, doc.page.width, 80)
           .fill(primaryColor);

        // Company name/logo
        doc.fontSize(20)
           .fillColor('white')
           .text(companyName, 50, 25);

        // Reset position
        doc.y = 100;
    }

    // Add title page
    addTitlePage(doc, analysisData, reportType) {
        const title = this.getReportTitle(analysisData, reportType);
        const companies = this.extractCompanyNames(analysisData);
        
        doc.fontSize(28)
           .fillColor('#1f2937')
           .text(title, 50, 200, { align: 'center' });

        doc.fontSize(16)
           .fillColor('#6b7280')
           .text(`Companies Analyzed: ${companies.join(', ')}`, 50, 280, { align: 'center' });

        doc.fontSize(12)
           .text(`Generated: ${new Date().toLocaleDateString()}`, 50, 320, { align: 'center' });

        // Add new page for content
        doc.addPage();
    }

    // Generate standard report (single company)
    async generateStandardReport(doc, analysisData, includeCharts) {
        const analysis = Array.isArray(analysisData.results) ? analysisData.results[0] : analysisData;
        
        if (!analysis || !analysis.analysis) {
            throw new Error('Invalid analysis data for standard report');
        }

        const { company, analysis: companyAnalysis } = analysis;

        // Table of Contents
        this.addTableOfContents(doc, [
            'Executive Summary',
            'Business Overview', 
            'Market Analysis',
            'Financial Performance',
            'Competitive Analysis',
            'Key Insights'
        ]);

        doc.addPage();

        // Executive Summary
        this.addSection(doc, 'Executive Summary');
        this.addParagraph(doc, companyAnalysis.overview || companyAnalysis.business_overview || 'Analysis overview not available');

        // Business Overview
        this.addSection(doc, 'Business Overview');
        this.addParagraph(doc, companyAnalysis.products_services || companyAnalysis.business_model || 'Business information not available');

        // Market Analysis
        this.addSection(doc, 'Market Analysis');
        this.addParagraph(doc, companyAnalysis.market_analysis || companyAnalysis.market_position || 'Market analysis not available');

        // Financial Performance
        this.addSection(doc, 'Financial Performance');
        this.addParagraph(doc, companyAnalysis.financial_performance || companyAnalysis.financial_analysis || 'Financial data not available');

        // Add charts if requested
        if (includeCharts && companyAnalysis.financial_performance) {
            await this.addFinancialChart(doc, company, companyAnalysis);
        }

        // Competitive Analysis
        this.addSection(doc, 'Competitive Analysis');
        this.addParagraph(doc, companyAnalysis.competitive_advantages || companyAnalysis.competition || 'Competitive analysis not available');

        // Key Insights
        this.addSection(doc, 'Key Insights & Recommendations');
        this.addParagraph(doc, companyAnalysis.investment_outlook || companyAnalysis.recommendations || 'Key insights not available');
    }

    // Generate comparative report (multiple companies)
    async generateComparativeReport(doc, analysisData, includeCharts) {
        if (!analysisData.results || analysisData.results.length < 2) {
            throw new Error('Comparative report requires at least 2 companies');
        }

        const companies = analysisData.results.map(r => r.company);

        // Table of Contents
        this.addTableOfContents(doc, [
            'Executive Summary',
            'Company Overviews',
            'Market Position Comparison',
            'Financial Comparison',
            'Competitive Matrix',
            'Investment Recommendations'
        ]);

        doc.addPage();

        // Executive Summary
        this.addSection(doc, 'Executive Summary');
        this.addParagraph(doc, `Comparative analysis of ${companies.length} companies: ${companies.join(', ')}`);

        // Company Overviews
        this.addSection(doc, 'Company Overviews');
        analysisData.results.forEach((result, index) => {
            this.addSubsection(doc, `${index + 1}. ${result.company}`);
            this.addParagraph(doc, result.analysis.overview || result.analysis.business_overview || 'Overview not available');
        });

        // Add comparison table
        if (includeCharts) {
            await this.addComparisonChart(doc, analysisData.results);
        }

        // Market Position Comparison
        this.addSection(doc, 'Market Position Comparison');
        this.addComparisonTable(doc, analysisData.results, 'market_analysis');

        // Financial Comparison
        this.addSection(doc, 'Financial Comparison');
        this.addComparisonTable(doc, analysisData.results, 'financial_performance');

        // Investment Recommendations
        this.addSection(doc, 'Investment Recommendations');
        analysisData.results.forEach((result, index) => {
            this.addSubsection(doc, result.company);
            this.addParagraph(doc, result.analysis.investment_outlook || 'Investment analysis not available');
        });
    }

    // Generate executive report (summary format)
    async generateExecutiveReport(doc, analysisData, includeCharts) {
        const results = Array.isArray(analysisData.results) ? analysisData.results : [analysisData];
        const companies = results.map(r => r.company);

        // Table of Contents
        this.addTableOfContents(doc, [
            'Executive Summary',
            'Key Findings',
            'Market Insights',
            'Financial Highlights',
            'Strategic Recommendations'
        ]);

        doc.addPage();

        // Executive Summary
        this.addSection(doc, 'Executive Summary');
        this.addParagraph(doc, `Executive analysis covering ${companies.length} ${companies.length === 1 ? 'company' : 'companies'}: ${companies.join(', ')}`);

        // Key Findings (bullet points)
        this.addSection(doc, 'Key Findings');
        results.forEach((result, index) => {
            this.addBulletPoint(doc, `${result.company}: ${this.extractKeyFinding(result.analysis)}`);
        });

        // Market Insights
        this.addSection(doc, 'Market Insights');
        const marketInsights = results.map(r => r.analysis.market_analysis || r.analysis.market_position)
                                    .filter(Boolean)
                                    .slice(0, 3);
        marketInsights.forEach(insight => {
            this.addParagraph(doc, insight.substring(0, 200) + '...');
        });

        // Add executive chart if requested
        if (includeCharts && results.length > 1) {
            await this.addExecutiveChart(doc, results);
        }

        // Strategic Recommendations
        this.addSection(doc, 'Strategic Recommendations');
        results.forEach((result, index) => {
            const recommendation = result.analysis.investment_outlook || result.analysis.recommendations;
            if (recommendation) {
                this.addBulletPoint(doc, `${result.company}: ${recommendation.substring(0, 150)}...`);
            }
        });
    }

    // Helper methods for PDF formatting
    addSection(doc, title) {
        if (doc.y > 700) doc.addPage();
        
        doc.fontSize(18)
           .fillColor('#1f2937')
           .text(title, 50, doc.y + 20);
        
        doc.y += 40;
    }

    addSubsection(doc, title) {
        if (doc.y > 720) doc.addPage();
        
        doc.fontSize(14)
           .fillColor('#374151')
           .text(title, 50, doc.y + 15);
        
        doc.y += 25;
    }

    addParagraph(doc, text) {
        if (doc.y > 700) doc.addPage();
        
        doc.fontSize(11)
           .fillColor('#4b5563')
           .text(text, 50, doc.y, {
               width: doc.page.width - 100,
               align: 'justify',
               lineGap: 5
           });
        
        doc.y += 20;
    }

    addBulletPoint(doc, text) {
        if (doc.y > 720) doc.addPage();
        
        doc.fontSize(11)
           .fillColor('#4b5563')
           .text('•', 60, doc.y)
           .text(text, 80, doc.y, {
               width: doc.page.width - 130,
               lineGap: 3
           });
        
        doc.y += 15;
    }

    addTableOfContents(doc, sections) {
        this.addSection(doc, 'Table of Contents');
        
        sections.forEach((section, index) => {
            doc.fontSize(12)
               .fillColor('#6b7280')
               .text(`${index + 1}. ${section}`, 70, doc.y);
            doc.y += 20;
        });
    }

    addComparisonTable(doc, results, field) {
        const tableY = doc.y;
        let currentY = tableY;

        // Headers
        doc.fontSize(10)
           .fillColor('#1f2937')
           .text('Company', 50, currentY)
           .text('Analysis', 200, currentY);

        currentY += 20;

        // Draw line
        doc.moveTo(50, currentY)
           .lineTo(doc.page.width - 50, currentY)
           .stroke('#d1d5db');

        currentY += 10;

        // Data rows
        results.forEach(result => {
            if (currentY > 720) {
                doc.addPage();
                currentY = 50;
            }

            const analysis = result.analysis[field] || 'Not available';
            
            doc.fontSize(9)
               .fillColor('#374151')
               .text(result.company, 50, currentY)
               .text(analysis.substring(0, 100) + '...', 200, currentY, {
                   width: doc.page.width - 250
               });

            currentY += 30;
        });

        doc.y = currentY + 20;
    }

    // Chart generation methods
    async addFinancialChart(doc, company, analysis) {
        try {
            // Create a simple chart representation
            const chartY = doc.y;
            
            doc.fontSize(12)
               .fillColor('#1f2937')
               .text(`${company} - Performance Overview`, 50, chartY);

            // Simple bar representation
            const metrics = ['Revenue', 'Growth', 'Market Share', 'Innovation'];
            const values = [75, 60, 45, 80]; // Mock values - in real implementation, extract from analysis

            let barY = chartY + 30;
            metrics.forEach((metric, index) => {
                const barWidth = (values[index] / 100) * 200;
                
                // Label
                doc.fontSize(10)
                   .text(metric, 50, barY);

                // Bar
                doc.rect(150, barY, barWidth, 15)
                   .fill('#3b82f6');

                // Value
                doc.fillColor('#6b7280')
                   .text(`${values[index]}%`, 360, barY);

                barY += 25;
            });

            doc.y = barY + 20;

        } catch (error) {
            console.error('Chart generation error:', error);
            // Continue without chart
        }
    }

    async addComparisonChart(doc, results) {
        try {
            const chartY = doc.y;
            
            doc.fontSize(12)
               .fillColor('#1f2937')
               .text('Company Comparison Matrix', 50, chartY);

            doc.y = chartY + 200; // Reserve space for chart
        } catch (error) {
            console.error('Comparison chart error:', error);
        }
    }

    async addExecutiveChart(doc, results) {
        try {
            const chartY = doc.y;
            
            doc.fontSize(12)
               .fillColor('#1f2937')
               .text('Executive Summary Dashboard', 50, chartY);

            doc.y = chartY + 150; // Reserve space for chart
        } catch (error) {
            console.error('Executive chart error:', error);
        }
    }

    // Add footer
    addFooter(doc) {
        const pages = doc.bufferedPageRange();
        
        for (let i = 0; i < pages.count; i++) {
            doc.switchToPage(i);
            
            // Footer line
            doc.moveTo(50, doc.page.height - 50)
               .lineTo(doc.page.width - 50, doc.page.height - 50)
               .stroke('#d1d5db');

            // Page number and info
            doc.fontSize(8)
               .fillColor('#6b7280')
               .text(`Page ${i + 1} of ${pages.count}`, 50, doc.page.height - 35)
               .text('Generated by Startup Research Platform', doc.page.width - 200, doc.page.height - 35);
        }
    }

    // Utility methods
    getReportTitle(analysisData, reportType) {
        const companies = this.extractCompanyNames(analysisData);
        const typeLabel = reportType.charAt(0).toUpperCase() + reportType.slice(1);
        
        if (companies.length === 1) {
            return `${typeLabel} Analysis: ${companies[0]}`;
        } else {
            return `${typeLabel} Analysis: ${companies.length} Companies`;
        }
    }

    extractCompanyNames(analysisData) {
        if (analysisData.company) {
            return [analysisData.company];
        } else if (analysisData.results) {
            return analysisData.results.map(r => r.company);
        } else if (analysisData.companies) {
            return Array.isArray(analysisData.companies) ? analysisData.companies : [analysisData.companies];
        }
        return ['Unknown Company'];
    }

    extractKeyFinding(analysis) {
        const overview = analysis.overview || analysis.business_overview || '';
        const sentences = overview.split('.').filter(s => s.trim().length > 10);
        return sentences[0] || 'Key finding not available';
    }

    generateFileName(analysisData, reportType, reportId) {
        const companies = this.extractCompanyNames(analysisData);
        const timestamp = new Date().toISOString().slice(0, 10);
        const companySuffix = companies.length === 1 ? 
            companies[0].replace(/[^a-zA-Z0-9]/g, '_') : 
            `${companies.length}_companies`;
        
        return `${reportType}_report_${companySuffix}_${timestamp}_${reportId || Date.now()}.pdf`;
    }

    // Clean up old reports
    async cleanupOldReports(olderThanDays = 30) {
        try {
            const files = await fs.readdir(this.reportsDir);
            const cutoffDate = new Date();
            cutoffDate.setDate(cutoffDate.getDate() - olderThanDays);

            let deletedCount = 0;

            for (const file of files) {
                if (file.endsWith('.pdf')) {
                    const filePath = path.join(this.reportsDir, file);
                    const stats = await fs.stat(filePath);
                    
                    if (stats.mtime < cutoffDate) {
                        await fs.unlink(filePath);
                        deletedCount++;
                    }
                }
            }

            console.log(`🧹 Cleaned up ${deletedCount} old report files`);
            return deletedCount;

        } catch (error) {
            console.error('Report cleanup error:', error);
            return 0;
        }
    }
}

module.exports = new PDFService();