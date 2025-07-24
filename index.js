// Startup Research App - MVP Version
// Clean, simple, production-ready implementation

// Load environment variables
require('dotenv').config();

const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');
const OpenAI = require('openai');
const fs = require('fs');

// Import routes and middleware
const authRoutes = require('./routes/auth');
const researchRoutes = require('./routes/research');
const batchRoutes = require('./routes/batch');
const reportsRoutes = require('./routes/reports');
const analyticsRoutes = require('./routes/analytics');
const apiKeysRoutes = require('./routes/apiKeys');
const webhooksRoutes = require('./routes/webhooks');
const publicApiRoutes = require('./routes/publicApi');
const { router: swaggerRouter } = require('./routes/swagger');
const { optionalAuth } = require('./middleware/auth');
const { trackAPIUsage, monitorPerformance, trackError } = require('./middleware/analytics');

const app = express();

// Environment configuration
const PORT = process.env.PORT || 3000;
const NODE_ENV = process.env.NODE_ENV || 'development';

// Initialize batch processing workers (only in production or when Redis is available)
if (NODE_ENV === 'production' || process.env.REDIS_URL) {
    try {
        require('./jobs/batchProcessor');
        require('./jobs/reportProcessor');
        console.log('✅ Batch and report processing workers initialized');
    } catch (error) {
        console.log('📝 Processing workers not available:', error.message);
    }
}

// OpenAI configuration
const openai = process.env.OPENAI_API_KEY ? new OpenAI({
    apiKey: process.env.OPENAI_API_KEY
}) : null;

// Supabase configuration
const supabase = process.env.SUPABASE_URL ? createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_ANON_KEY
) : null;

// Security middleware
app.use(helmet({
    contentSecurityPolicy: {
        directives: {
            defaultSrc: ["'self'"],
            styleSrc: ["'self'", "'unsafe-inline'", "https://cdn.jsdelivr.net"],
            scriptSrc: ["'self'", "'unsafe-inline'"],
            imgSrc: ["'self'", "data:", "https:"],
            connectSrc: ["'self'"]
        }
    }
}));

// CORS configuration
app.use(cors({
    origin: NODE_ENV === 'production'
        ? ['https://startup-research-clean.vercel.app', 'https://startup-research-clean-bp0k8iv94-gokuls-projects-199eba9b.vercel.app']
        : ['http://localhost:3000', 'http://localhost:3001'],
    credentials: true
}));

// Body parsing and rate limiting
app.use(express.json({ limit: '1mb' }));

// Analytics and monitoring middleware
app.use(trackAPIUsage);
app.use(monitorPerformance);
app.use(rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100, // limit each IP to 100 requests per windowMs
    message: { error: 'Too many requests, please try again later.' }
}));

// Basic logging
app.use((req, res, next) => {
    console.log(`${new Date().toISOString()} - ${req.method} ${req.path}`);
    next();
});

// Supabase middleware (make supabase available to all routes)
app.use((req, res, next) => {
    req.supabase = supabase;
    next();
});

// Authentication routes
app.use('/api/auth', authRoutes);
app.use('/api/user', optionalAuth, researchRoutes);
app.use('/api/batch', optionalAuth, batchRoutes);
app.use('/api/reports', reportsRoutes);
app.use('/api/analytics', analyticsRoutes);
app.use('/api/keys', apiKeysRoutes);
app.use('/api/webhooks', webhooksRoutes);

// Public API routes (v1)
app.use('/api/v1', publicApiRoutes);

// API documentation
app.use('/api', swaggerRouter);

// Health check endpoint
app.get('/health', (req, res) => {
    res.json({
        status: 'healthy',
        timestamp: new Date().toISOString(),
        version: '1.0.0-mvp',
        environment: NODE_ENV
    });
});

// Main research endpoint (with optional authentication)
app.post('/api/research', optionalAuth, async (req, res) => {
    try {
        const { company, query, analysis_type = 'comprehensive' } = req.body;

        if (!company) {
            return res.status(400).json({
                error: 'Company name is required'
            });
        }

        // Check if OpenAI is configured
        if (!openai) {
            return res.status(200).json({
                company,
                analysis_type,
                timestamp: new Date().toISOString(),
                status: 'demo',
                data: {
                    analysis: `Demo Analysis for ${company}\n\nThis is a demo response. To get AI-powered analysis, please configure your OpenAI API key in the environment variables.\n\nThe system would normally provide:\n- Company overview and background\n- Market position and competitive analysis\n- Funding history and investor information\n- Growth opportunities and strategic recommendations\n- Risk assessment and mitigation strategies`,
                    source: 'demo',
                    model: 'demo'
                }
            });
        }

        // Create research prompt
        const systemPrompt = `You are an expert startup and business analyst. Provide professional, factual analysis based on publicly available information.`;

        let userPrompt;
        switch (analysis_type) {
            case 'market':
                userPrompt = `Analyze the market position and opportunities for ${company}. ${query ? `Focus on: ${query}` : ''}`;
                break;
            case 'competitors':
                userPrompt = `Analyze the competitive landscape for ${company}. ${query ? `Focus on: ${query}` : ''}`;
                break;
            case 'funding':
                userPrompt = `Analyze the funding history and financial status of ${company}. ${query ? `Focus on: ${query}` : ''}`;
                break;
            default:
                userPrompt = `Provide a comprehensive analysis of ${company} including market position, competitors, funding, and growth opportunities. ${query ? `Additional focus: ${query}` : ''}`;
        }

        // Get AI analysis
        const completion = await openai.chat.completions.create({
            model: 'gpt-4o-mini',
            messages: [
                { role: 'system', content: systemPrompt },
                { role: 'user', content: userPrompt }
            ],
            temperature: 0.7,
            max_tokens: 2000
        });

        const analysis = completion.choices[0].message.content;

        // Save to database if configured
        if (supabase) {
            try {
                const dbRecord = {
                    company,
                    query: query || '',
                    analysis_type,
                    analysis,
                    created_at: new Date().toISOString(),
                    tokens_used: completion.usage?.total_tokens || 0
                };

                // Add user_id if user is authenticated
                if (req.user) {
                    dbRecord.user_id = req.user.id;

                    // Calculate estimated cost (rough estimate: $0.002 per 1K tokens)
                    const estimatedCost = (completion.usage?.total_tokens || 0) * 0.000002;
                    dbRecord.cost_usd = estimatedCost;

                    // Update user usage statistics
                    await supabase.rpc('increment_user_usage', {
                        p_user_id: req.user.id,
                        p_tokens: completion.usage?.total_tokens || 0,
                        p_cost: estimatedCost
                    });
                }

                await supabase
                    .from('research_queries')
                    .insert(dbRecord);
            } catch (dbError) {
                console.warn('Failed to save to database:', dbError.message);
            }
        }

        res.json({
            company,
            analysis_type,
            timestamp: new Date().toISOString(),
            status: 'completed',
            data: {
                analysis,
                source: 'openai',
                model: completion.model,
                tokens_used: completion.usage?.total_tokens || 0
            }
        });

    } catch (error) {
        console.error('Research error:', error);
        res.status(500).json({
            error: 'Research analysis failed',
            message: NODE_ENV === 'development' ? error.message : 'Internal server error'
        });
    }
});

// API endpoints to serve HTML content (bypass Vercel auth)
app.get('/api/ui/dashboard', (req, res) => {
    const filePath = path.join(__dirname, 'public', 'dashboard.html');
    res.sendFile(filePath);
});

app.get('/api/ui/batch', (req, res) => {
    const filePath = path.join(__dirname, 'public', 'batch.html');
    res.sendFile(filePath);
});

app.get('/api/ui/admin', (req, res) => {
    const filePath = path.join(__dirname, 'public', 'admin.html');
    res.sendFile(filePath);
});

app.get('/api/ui/auth', (req, res) => {
    const filePath = path.join(__dirname, 'public', 'index-auth.html');
    res.sendFile(filePath);
});

// Serve static files
app.use(express.static(path.join(__dirname, 'public')));

// Catch-all route
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Error handler with analytics tracking
app.use(trackError);
app.use((err, req, res, next) => {
    console.error('Unhandled error:', err);
    res.status(500).json({
        error: 'Internal Server Error',
        message: NODE_ENV === 'development' ? err.message : 'Something went wrong'
    });
});

// Start server (for local development)
if (require.main === module) {
    app.listen(PORT, () => {
        console.log(`✅ Startup Research MVP running on port ${PORT}`);
        console.log(`🔧 Environment: ${NODE_ENV}`);
        console.log(`🤖 OpenAI: ${openai ? 'Configured' : 'Not configured (demo mode)'}`);
        console.log(`💾 Supabase: ${supabase ? 'Configured' : 'Not configured'}`);
    });
}

// Start job processors for Phase 3 features
if (NODE_ENV === 'production' || process.env.ENABLE_JOBS === 'true') {
    console.log('🔄 Starting job processors...');
    // require('./jobs/batchProcessor'); // Temporarily disabled for testing
    // Additional job processors will be added here
}

// Export for Vercel
module.exports = app;