// Startup Research App - MVP Version
// Clean, simple, production-ready implementation

const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');
const OpenAI = require('openai');

const app = express();

// Environment configuration
const PORT = process.env.PORT || 3000;
const NODE_ENV = process.env.NODE_ENV || 'development';

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
        ? ['https://startup-research-app.vercel.app'] 
        : ['http://localhost:3000'],
    credentials: true
}));

// Body parsing and rate limiting
app.use(express.json({ limit: '1mb' }));
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

// Health check endpoint
app.get('/health', (req, res) => {
    res.json({
        status: 'healthy',
        timestamp: new Date().toISOString(),
        version: '1.0.0-mvp',
        environment: NODE_ENV
    });
});

// Main research endpoint
app.post('/api/research', async (req, res) => {
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
                await supabase
                    .from('research_queries')
                    .insert({
                        company,
                        query: query || '',
                        analysis_type,
                        analysis,
                        created_at: new Date().toISOString(),
                        tokens_used: completion.usage?.total_tokens || 0
                    });
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

// Serve static files
app.use(express.static(path.join(__dirname, 'public')));

// Catch-all route
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Error handler
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

// Export for Vercel
module.exports = app;