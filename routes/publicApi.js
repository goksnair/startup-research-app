const express = require('express');
const router = express.Router();
const { authenticateApiKey, requirePermission, requireTier, trackApiUsage, apiCors, validateRequest } = require('../middleware/apiAuth');
const analysisService = require('../services/analysisService');
const disambiguationService = require('../services/disambiguationService');
const { batchQueue } = require('../services/queueService');
const pdfService = require('../services/pdfService');
const supabase = require('../database/supabase');

// Apply CORS and API tracking to all public API routes
router.use(apiCors);
router.use(express.json());
router.use(authenticateApiKey);
router.use(trackApiUsage);

/**
 * @swagger
 * /api/v1/research:
 *   post:
 *     summary: Analyze a single company
 *     description: Perform AI-powered analysis of a single company
 *     security:
 *       - ApiKeyAuth: []
 *     tags:
 *       - Research
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - company
 *             properties:
 *               company:
 *                 type: string
 *                 description: Company name to analyze
 *                 example: "Tesla"
 *               analysisType:
 *                 type: string
 *                 enum: [quick, comprehensive, financial]
 *                 default: comprehensive
 *                 description: Type of analysis to perform
 *     responses:
 *       200:
 *         description: Analysis completed successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   type: object
 *                   properties:
 *                     company:
 *                       type: string
 *                     analysisType:
 *                       type: string
 *                     analysis:
 *                       type: object
 *                     metadata:
 *                       type: object
 *       401:
 *         description: Invalid or missing API key
 *       429:
 *         description: Rate limit exceeded
 */

/**
 * @swagger
 * /api/v1/disambiguate:
 *   post:
 *     summary: Disambiguate company name
 *     description: Resolve ambiguous company names and get clarification options
 *     security:
 *       - ApiKeyAuth: []
 *     tags:
 *       - Research
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - company
 *             properties:
 *               company:
 *                 type: string
 *                 description: Company name to disambiguate
 *                 example: "Apple"
 *               context:
 *                 type: object
 *                 description: Additional context to help disambiguation
 *                 properties:
 *                   industry:
 *                     type: string
 *                     example: "Technology"
 *                   location:
 *                     type: string
 *                     example: "California"
 *     responses:
 *       200:
 *         description: Disambiguation options or resolved company
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   type: object
 *                   properties:
 *                     isAmbiguous:
 *                       type: boolean
 *                     company:
 *                       type: object
 *                     candidates:
 *                       type: array
 *                     suggestedQuestions:
 *                       type: array
 */
router.post('/disambiguate', requirePermission('research'), validateRequest({
    required: ['company']
}), async (req, res) => {
    try {
        const { company, context = {} } = req.body;
        
        const result = await disambiguationService.disambiguateCompany(company, context);
        
        res.json({
            success: true,
            data: result
        });

    } catch (error) {
        console.error('Disambiguation error:', error);
        res.status(500).json({
            success: false,
            error: 'Disambiguation failed',
            message: error.message
        });
    }
});

router.post('/research', requirePermission('research'), validateRequest({
    required: ['company']
}), async (req, res) => {
    try {
        const { 
            company, 
            companyId, 
            skipDisambiguation = false,
            disambiguationAnswers = {},
            analysisType = 'comprehensive' 
        } = req.body;

        let targetCompany = company;
        let companyMetadata = null;

        // Step 1: Disambiguation (unless skipped or companyId provided)
        if (!skipDisambiguation && !companyId) {
            console.log(`🔍 Starting disambiguation for: ${company}`);
            
            const disambiguationResult = await disambiguationService.disambiguateCompany(
                company, 
                req.body.context || {}
            );

            // If ambiguous, return disambiguation options
            if (disambiguationResult.isAmbiguous) {
                console.log(`❓ Company "${company}" requires disambiguation`);
                return res.json({
                    success: true,
                    requiresDisambiguation: true,
                    data: disambiguationResult
                });
            }

            if (disambiguationResult.isUnknown) {
                console.log(`⚠️ Unknown company: ${company}`);
                companyMetadata = disambiguationResult.company;
            } else {
                targetCompany = disambiguationResult.company.name;
                companyMetadata = disambiguationResult.company;
                console.log(`✅ Resolved to: ${targetCompany}`);
            }
        }

        // Step 2: Handle disambiguation answers
        if (companyId || Object.keys(disambiguationAnswers).length > 0) {
            console.log('📝 Processing disambiguation choice');
            
            if (companyId) {
                companyMetadata = await disambiguationService.getCompanyById(companyId);
                if (companyMetadata) {
                    targetCompany = companyMetadata.name;
                }
            } else if (req.body.candidates && Object.keys(disambiguationAnswers).length > 0) {
                // Filter candidates based on answers
                const filtered = disambiguationService.filterCandidates(
                    req.body.candidates, 
                    disambiguationAnswers
                );
                if (filtered.length > 0) {
                    companyMetadata = filtered[0];
                    targetCompany = companyMetadata.name;
                }
            }

            // Save disambiguation history
            try {
                await disambiguationService.saveDisambiguationChoice(req.apiKey.userId, {
                    originalQuery: company,
                    selectedCompany: companyMetadata,
                    candidates: req.body.candidates,
                    answers: disambiguationAnswers
                });
            } catch (historyError) {
                console.log('Failed to save disambiguation history:', historyError.message);
            }
        }

        // Step 3: Proceed with analysis
        console.log(`🚀 Starting analysis for: ${targetCompany}`);
        const startTime = Date.now();
        
        const result = await analysisService.analyzeCompany(targetCompany, { 
            analysisType,
            companyMetadata 
        });
        
        const processingTime = Date.now() - startTime;

        // Track tokens and cost for billing
        req.tokensUsed = result.metadata?.tokensUsed || 0;
        req.apiCost = (req.tokensUsed * 0.00001);

        // Enhanced result with disambiguation metadata
        res.json({
            success: true,
            data: {
                company: result.company,
                originalQuery: company !== targetCompany ? company : undefined,
                resolvedCompany: companyMetadata,
                analysisType: result.analysisType,
                analysis: result.analysis,
                timestamp: result.timestamp,
                processingTime,
                disambiguationUsed: !!companyMetadata,
                metadata: {
                    tokensUsed: req.tokensUsed,
                    cost: req.apiCost,
                    model: result.metadata?.model,
                    confidence: companyMetadata?.confidence
                }
            }
        });

    } catch (error) {
        console.error('Enhanced research error:', error);
        res.status(500).json({
            success: false,
            error: 'Analysis failed',
            message: error.message
        });
    }
});

/**
 * @swagger
 * /api/v1/batch:
 *   post:
 *     summary: Create a batch analysis job
 *     description: Analyze multiple companies in a single batch request
 *     security:
 *       - ApiKeyAuth: []
 *     tags:
 *       - Batch Processing
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - companies
 *             properties:
 *               companies:
 *                 type: array
 *                 items:
 *                   type: string
 *                 minItems: 1
 *                 maxItems: 50
 *                 description: List of company names to analyze
 *                 example: ["Tesla", "Apple", "Google"]
 *               analysisType:
 *                 type: string
 *                 enum: [quick, comprehensive, financial]
 *                 default: comprehensive
 *               priority:
 *                 type: string
 *                 enum: [low, normal, high]
 *                 default: normal
 *               generatePdf:
 *                 type: boolean
 *                 default: false
 *               sendEmail:
 *                 type: boolean
 *                 default: false
 *     responses:
 *       202:
 *         description: Batch job created successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 batchId:
 *                   type: string
 *                 status:
 *                   type: string
 *                 companiesCount:
 *                   type: number
 *                 estimatedTime:
 *                   type: string
 */
router.post('/batch', requirePermission('batch'), requireTier('pro'), validateRequest({
    required: ['companies']
}), async (req, res) => {
    try {
        const {
            companies,
            analysisType = 'comprehensive',
            priority = 'normal',
            generatePdf = false,
            sendEmail = false
        } = req.body;

        // Validate companies array
        if (!Array.isArray(companies) || companies.length === 0) {
            return res.status(400).json({
                success: false,
                error: 'Companies must be a non-empty array'
            });
        }

        if (companies.length > 50) {
            return res.status(400).json({
                success: false,
                error: 'Maximum 50 companies per batch'
            });
        }

        // Check tier limits
        const tierLimits = {
            free: 5,
            pro: 25,
            enterprise: 50
        };

        const maxCompanies = tierLimits[req.apiKey.tier] || 5;
        if (companies.length > maxCompanies) {
            return res.status(403).json({
                success: false,
                error: `Tier ${req.apiKey.tier} allows maximum ${maxCompanies} companies per batch`,
                limit: maxCompanies,
                requested: companies.length
            });
        }

        // Create batch job
        const batchId = require('uuid').v4();
        const batchData = {
            id: batchId,
            user_id: req.apiKey.userId,
            api_key_id: req.apiKey.id,
            companies: companies.map(c => typeof c === 'string' ? c.trim() : c),
            status: 'queued',
            options: {
                analysisType,
                priority,
                include_pdf: generatePdf,
                send_email: sendEmail,
                api_request: true
            },
            created_at: new Date().toISOString()
        };

        // Save to database
        const { error: dbError } = await supabase
            .from('batch_jobs')
            .insert([{
                id: batchId,
                user_id: req.apiKey.userId,
                companies: companies,
                status: 'queued',
                analysis_type: analysisType,
                priority,
                options: JSON.stringify(batchData.options)
            }]);

        if (dbError) {
            throw dbError;
        }

        // Add to queue
        const jobOptions = {
            priority: priority === 'high' ? 10 : priority === 'low' ? -10 : 0,
            attempts: 3,
            delay: 0
        };

        await batchQueue.add('process-batch', batchData, jobOptions);

        // Estimate processing time
        const estimatedSeconds = companies.length * 15; // ~15 seconds per company
        const estimatedTime = `${Math.ceil(estimatedSeconds / 60)} minutes`;

        res.status(202).json({
            success: true,
            batchId,
            status: 'queued',
            companiesCount: companies.length,
            analysisType,
            priority,
            estimatedTime,
            options: {
                generatePdf,
                sendEmail
            },
            message: 'Batch job created successfully'
        });

    } catch (error) {
        console.error('Public API batch error:', error);
        res.status(500).json({
            success: false,
            error: 'Batch creation failed',
            message: error.message
        });
    }
});

/**
 * @swagger
 * /api/v1/batch/{batchId}:
 *   get:
 *     summary: Get batch job status
 *     description: Retrieve the status and results of a batch analysis job
 *     security:
 *       - ApiKeyAuth: []
 *     tags:
 *       - Batch Processing
 *     parameters:
 *       - name: batchId
 *         in: path
 *         required: true
 *         schema:
 *           type: string
 *         description: Batch job ID
 *     responses:
 *       200:
 *         description: Batch status retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 batch:
 *                   type: object
 *                   properties:
 *                     id:
 *                       type: string
 *                     status:
 *                       type: string
 *                       enum: [queued, processing, completed, failed]
 *                     companiesCount:
 *                       type: number
 *                     processedCount:
 *                       type: number
 *                     successCount:
 *                       type: number
 *                     errorCount:
 *                       type: number
 *                     results:
 *                       type: array
 *                     errors:
 *                       type: array
 */
router.get('/batch/:batchId', requirePermission('batch'), async (req, res) => {
    try {
        const { batchId } = req.params;

        const { data: batch, error } = await supabase
            .from('batch_jobs')
            .select('*')
            .eq('id', batchId)
            .eq('user_id', req.apiKey.userId)
            .single();

        if (error || !batch) {
            return res.status(404).json({
                success: false,
                error: 'Batch not found'
            });
        }

        // Parse JSON fields
        const results = batch.results ? JSON.parse(batch.results) : [];
        const errors = batch.errors ? JSON.parse(batch.errors) : [];
        const options = batch.options ? JSON.parse(batch.options) : {};

        res.json({
            success: true,
            batch: {
                id: batch.id,
                status: batch.status,
                companiesCount: batch.companies?.length || 0,
                processedCount: batch.processed_companies || 0,
                successCount: batch.success_count || 0,
                errorCount: batch.error_count || 0,
                analysisType: batch.analysis_type,
                priority: batch.priority,
                createdAt: batch.created_at,
                startedAt: batch.started_at,
                completedAt: batch.completed_at,
                results: batch.status === 'completed' ? results : undefined,
                errors: errors.length > 0 ? errors : undefined,
                options
            }
        });

    } catch (error) {
        console.error('Public API batch status error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to retrieve batch status'
        });
    }
});

/**
 * @swagger
 * /api/v1/reports:
 *   get:
 *     summary: List user's reports
 *     description: Get a list of all reports generated for the API key owner
 *     security:
 *       - ApiKeyAuth: []
 *     tags:
 *       - Reports
 *     parameters:
 *       - name: limit
 *         in: query
 *         schema:
 *           type: integer
 *           minimum: 1
 *           maximum: 100
 *           default: 20
 *       - name: offset
 *         in: query
 *         schema:
 *           type: integer
 *           minimum: 0
 *           default: 0
 *     responses:
 *       200:
 *         description: Reports retrieved successfully
 */
router.get('/reports', requirePermission('reports'), async (req, res) => {
    try {
        const { limit = 20, offset = 0 } = req.query;
        const userId = req.apiKey.userId;

        const { data: reports, error } = await supabase
            .from('pdf_reports')
            .select(`
                id,
                report_type,
                file_name,
                file_size,
                companies,
                generated_at,
                download_count,
                is_emailed
            `)
            .eq('user_id', userId)
            .order('generated_at', { ascending: false })
            .range(offset, offset + limit - 1);

        if (error) {
            throw error;
        }

        res.json({
            success: true,
            reports,
            pagination: {
                limit: parseInt(limit),
                offset: parseInt(offset),
                total: reports.length
            }
        });

    } catch (error) {
        console.error('Public API reports list error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to retrieve reports'
        });
    }
});

/**
 * @swagger
 * /api/v1/reports/{reportId}/download:
 *   get:
 *     summary: Download a report
 *     description: Download a PDF report by ID
 *     security:
 *       - ApiKeyAuth: []
 *     tags:
 *       - Reports
 *     parameters:
 *       - name: reportId
 *         in: path
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Report downloaded successfully
 *         content:
 *           application/pdf:
 *             schema:
 *               type: string
 *               format: binary
 */
router.get('/reports/:reportId/download', requirePermission('reports'), async (req, res) => {
    try {
        const { reportId } = req.params;
        const userId = req.apiKey.userId;

        const { data: report, error } = await supabase
            .from('pdf_reports')
            .select('*')
            .eq('id', reportId)
            .eq('user_id', userId)
            .single();

        if (error || !report) {
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
        const fs = require('fs');
        if (!fs.existsSync(report.file_path)) {
            return res.status(404).json({
                success: false,
                error: 'Report file not found'
            });
        }

        // Update download count
        await supabase
            .from('pdf_reports')
            .update({ download_count: report.download_count + 1 })
            .eq('id', reportId);

        // Set headers and stream file
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename="${report.file_name}"`);
        res.setHeader('Content-Length', report.file_size);

        const fileStream = fs.createReadStream(report.file_path);
        fileStream.pipe(res);

    } catch (error) {
        console.error('Public API report download error:', error);
        res.status(500).json({
            success: false,
            error: 'Download failed'
        });
    }
});

/**
 * @swagger
 * /api/v1/usage:
 *   get:
 *     summary: Get API usage statistics
 *     description: Retrieve usage statistics for the current API key
 *     security:
 *       - ApiKeyAuth: []
 *     tags:
 *       - Usage
 *     parameters:
 *       - name: timeframe
 *         in: query
 *         schema:
 *           type: string
 *           enum: [1h, 24h, 7d, 30d]
 *           default: 24h
 *     responses:
 *       200:
 *         description: Usage statistics retrieved successfully
 */
router.get('/usage', async (req, res) => {
    try {
        const { timeframe = '24h' } = req.query;
        const keyId = req.apiKey.id;
        const userId = req.apiKey.userId;

        const apiKeyService = require('../services/apiKeyService');
        const stats = await apiKeyService.getKeyUsageStats(keyId, userId, timeframe);

        res.json({
            success: true,
            usage: stats,
            rateLimits: req.apiKey.rateLimits,
            tier: req.apiKey.tier
        });

    } catch (error) {
        console.error('Public API usage stats error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to retrieve usage statistics'
        });
    }
});

/**
 * @swagger
 * /api/v1/status:
 *   get:
 *     summary: Get API status
 *     description: Check the status of the API service
 *     tags:
 *       - Status
 *     responses:
 *       200:
 *         description: API status retrieved successfully
 */
router.get('/status', (req, res) => {
    res.json({
        success: true,
        status: 'operational',
        version: 'v1',
        timestamp: new Date().toISOString(),
        endpoints: {
            research: 'available',
            batch: 'available',
            reports: 'available',
            usage: 'available'
        }
    });
});

module.exports = router;