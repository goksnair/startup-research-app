const express = require('express');
const router = express.Router();
const swaggerJsdoc = require('swagger-jsdoc');
const swaggerUi = require('swagger-ui-express');

// Swagger configuration
const swaggerOptions = {
    definition: {
        openapi: '3.0.0',
        info: {
            title: 'Startup Research Platform API',
            version: '1.0.0',
            description: 'AI-powered startup and company research API with batch processing, PDF generation, and analytics',
            contact: {
                name: 'API Support',
                email: 'support@startup-research.com'
            },
            license: {
                name: 'MIT',
                url: 'https://opensource.org/licenses/MIT'
            }
        },
        servers: [
            {
                url: process.env.NODE_ENV === 'production' 
                    ? 'https://startup-research-clean.vercel.app' 
                    : 'http://localhost:3000',
                description: process.env.NODE_ENV === 'production' ? 'Production server' : 'Development server'
            }
        ],
        components: {
            securitySchemes: {
                ApiKeyAuth: {
                    type: 'apiKey',
                    in: 'header',
                    name: 'X-API-Key',
                    description: 'API key for authentication. Format: srp_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx'
                },
                BearerAuth: {
                    type: 'http',
                    scheme: 'bearer',
                    bearerFormat: 'API Key',
                    description: 'API key in Authorization header. Format: Bearer srp_xxxxxxxx...'
                }
            },
            schemas: {
                Error: {
                    type: 'object',
                    required: ['success', 'error'],
                    properties: {
                        success: {
                            type: 'boolean',
                            example: false
                        },
                        error: {
                            type: 'string',
                            description: 'Error message'
                        },
                        message: {
                            type: 'string',
                            description: 'Detailed error description'
                        }
                    }
                },
                CompanyAnalysis: {
                    type: 'object',
                    properties: {
                        company: {
                            type: 'string',
                            description: 'Company name'
                        },
                        analysisType: {
                            type: 'string',
                            enum: ['quick', 'comprehensive', 'financial']
                        },
                        analysis: {
                            type: 'object',
                            description: 'Structured analysis data',
                            properties: {
                                overview: {
                                    type: 'string',
                                    description: 'Business overview'
                                },
                                market_analysis: {
                                    type: 'string',
                                    description: 'Market position and opportunities'
                                },
                                financial_performance: {
                                    type: 'string',
                                    description: 'Financial analysis and metrics'
                                },
                                competitive_advantages: {
                                    type: 'string',
                                    description: 'Competitive positioning'
                                },
                                investment_outlook: {
                                    type: 'string',
                                    description: 'Investment recommendations'
                                }
                            }
                        },
                        timestamp: {
                            type: 'string',
                            format: 'date-time',
                            description: 'Analysis timestamp'
                        },
                        metadata: {
                            type: 'object',
                            properties: {
                                tokensUsed: {
                                    type: 'integer',
                                    description: 'AI tokens consumed'
                                },
                                processingTime: {
                                    type: 'integer',
                                    description: 'Processing time in milliseconds'
                                },
                                model: {
                                    type: 'string',
                                    description: 'AI model used'
                                }
                            }
                        }
                    }
                },
                BatchJob: {
                    type: 'object',
                    properties: {
                        id: {
                            type: 'string',
                            format: 'uuid',
                            description: 'Unique batch job identifier'
                        },
                        status: {
                            type: 'string',
                            enum: ['queued', 'processing', 'completed', 'failed'],
                            description: 'Current batch status'
                        },
                        companiesCount: {
                            type: 'integer',
                            description: 'Total number of companies in batch'
                        },
                        processedCount: {
                            type: 'integer',
                            description: 'Number of companies processed'
                        },
                        successCount: {
                            type: 'integer',
                            description: 'Number of successful analyses'
                        },
                        errorCount: {
                            type: 'integer',
                            description: 'Number of failed analyses'
                        },
                        createdAt: {
                            type: 'string',
                            format: 'date-time',
                            description: 'Batch creation timestamp'
                        },
                        completedAt: {
                            type: 'string',
                            format: 'date-time',
                            description: 'Batch completion timestamp'
                        },
                        results: {
                            type: 'array',
                            items: {
                                $ref: '#/components/schemas/CompanyAnalysis'
                            },
                            description: 'Analysis results (available when completed)'
                        }
                    }
                },
                Report: {
                    type: 'object',
                    properties: {
                        id: {
                            type: 'string',
                            format: 'uuid',
                            description: 'Unique report identifier'
                        },
                        reportType: {
                            type: 'string',
                            enum: ['standard', 'comparative', 'executive'],
                            description: 'Type of report'
                        },
                        fileName: {
                            type: 'string',
                            description: 'Report file name'
                        },
                        fileSize: {
                            type: 'integer',
                            description: 'File size in bytes'
                        },
                        companies: {
                            type: 'array',
                            items: {
                                type: 'string'
                            },
                            description: 'Companies included in report'
                        },
                        generatedAt: {
                            type: 'string',
                            format: 'date-time',
                            description: 'Report generation timestamp'
                        },
                        downloadCount: {
                            type: 'integer',
                            description: 'Number of times downloaded'
                        }
                    }
                },
                UsageStats: {
                    type: 'object',
                    properties: {
                        timeframe: {
                            type: 'string',
                            description: 'Statistics timeframe'
                        },
                        totalRequests: {
                            type: 'integer',
                            description: 'Total API requests'
                        },
                        successfulRequests: {
                            type: 'integer',
                            description: 'Successful requests'
                        },
                        errorRequests: {
                            type: 'integer',
                            description: 'Failed requests'
                        },
                        errorRate: {
                            type: 'string',
                            description: 'Error rate percentage'
                        },
                        totalTokens: {
                            type: 'integer',
                            description: 'Total AI tokens used'
                        },
                        totalCost: {
                            type: 'string',
                            description: 'Total cost in USD'
                        },
                        avgResponseTime: {
                            type: 'integer',
                            description: 'Average response time in milliseconds'
                        }
                    }
                },
                RateLimitError: {
                    allOf: [
                        { $ref: '#/components/schemas/Error' },
                        {
                            type: 'object',
                            properties: {
                                details: {
                                    type: 'object',
                                    properties: {
                                        hourlyCount: {
                                            type: 'integer',
                                            description: 'Current hourly usage'
                                        },
                                        hourlyLimit: {
                                            type: 'integer',
                                            description: 'Hourly rate limit'
                                        },
                                        dailyCount: {
                                            type: 'integer',
                                            description: 'Current daily usage'
                                        },
                                        dailyLimit: {
                                            type: 'integer',
                                            description: 'Daily rate limit'
                                        },
                                        resetsAt: {
                                            type: 'string',
                                            format: 'date-time',
                                            description: 'When the limit resets'
                                        }
                                    }
                                }
                            }
                        }
                    ]
                }
            },
            responses: {
                Unauthorized: {
                    description: 'Invalid or missing API key',
                    content: {
                        'application/json': {
                            schema: {
                                $ref: '#/components/schemas/Error'
                            },
                            example: {
                                success: false,
                                error: 'Invalid API key',
                                message: 'API key not found or expired'
                            }
                        }
                    }
                },
                RateLimitExceeded: {
                    description: 'Rate limit exceeded',
                    headers: {
                        'X-RateLimit-Limit': {
                            description: 'Rate limit per hour',
                            schema: {
                                type: 'integer'
                            }
                        },
                        'X-RateLimit-Remaining': {
                            description: 'Remaining requests',
                            schema: {
                                type: 'integer'
                            }
                        },
                        'X-RateLimit-Reset': {
                            description: 'Reset time',
                            schema: {
                                type: 'string',
                                format: 'date-time'
                            }
                        }
                    },
                    content: {
                        'application/json': {
                            schema: {
                                $ref: '#/components/schemas/RateLimitError'
                            }
                        }
                    }
                },
                ValidationError: {
                    description: 'Request validation failed',
                    content: {
                        'application/json': {
                            schema: {
                                allOf: [
                                    { $ref: '#/components/schemas/Error' },
                                    {
                                        type: 'object',
                                        properties: {
                                            required: {
                                                type: 'array',
                                                items: {
                                                    type: 'string'
                                                },
                                                description: 'Required fields'
                                            }
                                        }
                                    }
                                ]
                            }
                        }
                    }
                }
            }
        },
        tags: [
            {
                name: 'Research',
                description: 'Single company analysis endpoints'
            },
            {
                name: 'Batch Processing',
                description: 'Multiple company batch analysis'
            },
            {
                name: 'Reports', 
                description: 'PDF report generation and management'
            },
            {
                name: 'Usage',
                description: 'API usage statistics and monitoring'
            },
            {
                name: 'Status',
                description: 'API health and status checks'
            }
        ]
    },
    apis: [
        './routes/publicApi.js',
        './routes/apiKeys.js'
    ]
};

// Generate swagger specification
const specs = swaggerJsdoc(swaggerOptions);

// Custom CSS for Swagger UI
const customCss = `
    .swagger-ui .topbar { display: none; }
    .swagger-ui .info .title { color: #2563eb; }
    .swagger-ui .scheme-container { background: #f8fafc; padding: 20px; border-radius: 8px; }
    .swagger-ui .auth-wrapper { margin-top: 20px; }
`;

// Swagger UI options
const swaggerUiOptions = {
    customCss,
    customSiteTitle: 'Startup Research API Documentation',
    customfavIcon: '/favicon.ico',
    swaggerOptions: {
        persistAuthorization: true,
        displayRequestDuration: true,
        filter: true,
        tryItOutEnabled: true,
        supportedSubmitMethods: ['get', 'post', 'put', 'delete'],
        docExpansion: 'list',
        defaultModelsExpandDepth: 2,
        defaultModelExpandDepth: 2
    }
};

// Serve Swagger documentation
router.use('/docs', swaggerUi.serve);
router.get('/docs', swaggerUi.setup(specs, swaggerUiOptions));

// Serve OpenAPI JSON spec
router.get('/openapi.json', (req, res) => {
    res.setHeader('Content-Type', 'application/json');
    res.send(specs);
});

// API documentation landing page
router.get('/', (req, res) => {
    res.send(`
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Startup Research Platform API</title>
    <style>
        body {
            font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
            max-width: 1200px;
            margin: 0 auto;
            padding: 2rem;
            line-height: 1.6;
            background: #f8fafc;
        }
        .header {
            text-align: center;
            margin-bottom: 3rem;
            padding: 2rem;
            background: linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%);
            color: white;
            border-radius: 12px;
        }
        .header h1 {
            margin: 0;
            font-size: 2.5rem;
            font-weight: 700;
        }
        .header p {
            margin: 1rem 0 0 0;
            font-size: 1.2rem;
            opacity: 0.9;
        }
        .section {
            background: white;
            padding: 2rem;
            margin-bottom: 2rem;
            border-radius: 8px;
            box-shadow: 0 1px 3px rgba(0,0,0,0.1);
        }
        .section h2 {
            color: #1e293b;
            margin-top: 0;
            font-size: 1.5rem;
        }
        .features {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
            gap: 1.5rem;
            margin: 2rem 0;
        }
        .feature {
            padding: 1.5rem;
            background: #f1f5f9;
            border-radius: 8px;
            border: 1px solid #e2e8f0;
        }
        .feature h3 {
            margin-top: 0;
            color: #2563eb;
            font-size: 1.2rem;
        }
        .cta {
            display: flex;
            gap: 1rem;
            justify-content: center;
            margin: 2rem 0;
            flex-wrap: wrap;
        }
        .btn {
            display: inline-block;
            padding: 12px 24px;
            background: #2563eb;
            color: white;
            text-decoration: none;
            border-radius: 6px;
            font-weight: 600;
            transition: background-color 0.2s;
        }
        .btn:hover {
            background: #1d4ed8;
        }
        .btn.secondary {
            background: #6b7280;
        }
        .btn.secondary:hover {
            background: #4b5563;
        }
        .code {
            background: #1e293b;
            color: #e2e8f0;
            padding: 1rem;
            border-radius: 6px;
            font-family: 'Monaco', 'Menlo', monospace;
            font-size: 0.9rem;
            overflow-x: auto;
        }
        .endpoints {
            display: grid;
            gap: 1rem;
        }
        .endpoint {
            display: flex;
            align-items: center;
            padding: 0.75rem;
            background: #f8fafc;
            border-radius: 6px;
            border: 1px solid #e2e8f0;
        }
        .method {
            padding: 0.25rem 0.5rem;
            border-radius: 4px;
            font-weight: 600;
            font-size: 0.8rem;
            margin-right: 1rem;
            min-width: 60px;
            text-align: center;
        }
        .method.get { background: #10b981; color: white; }
        .method.post { background: #f59e0b; color: white; }
        .method.put { background: #3b82f6; color: white; }
        .method.delete { background: #ef4444; color: white; }
        .endpoint-path {
            font-family: monospace;
            color: #374151;
            font-weight: 500;
        }
        .endpoint-desc {
            margin-left: auto;
            color: #6b7280;
            font-size: 0.9rem;
        }
    </style>
</head>
<body>
    <div class="header">
        <h1>🚀 Startup Research Platform API</h1>
        <p>AI-powered company analysis, batch processing, and report generation</p>
    </div>

    <div class="section">
        <h2>🎯 Overview</h2>
        <p>The Startup Research Platform API provides powerful AI-driven company analysis capabilities through a RESTful interface. Analyze individual companies or process multiple companies in batches, generate professional PDF reports, and access comprehensive usage analytics.</p>
        
        <div class="features">
            <div class="feature">
                <h3>🤖 AI-Powered Analysis</h3>
                <p>Comprehensive company analysis using GPT-4, including market position, financial performance, and investment insights.</p>
            </div>
            <div class="feature">
                <h3>⚡ Batch Processing</h3>
                <p>Process up to 50 companies simultaneously with real-time progress tracking and queue management.</p>
            </div>
            <div class="feature">
                <h3>📊 PDF Reports</h3>
                <p>Generate professional PDF reports with charts, analysis, and customizable branding options.</p>
            </div>
            <div class="feature">
                <h3>📈 Usage Analytics</h3>
                <p>Track API usage, monitor performance, and access detailed statistics for optimization.</p>
            </div>
        </div>
    </div>

    <div class="section">
        <h2>🚀 Quick Start</h2>
        <p>Get started with the API in 3 simple steps:</p>
        
        <h3>1. Get your API key</h3>
        <p>Sign up and generate an API key from your dashboard. Choose from Free, Pro, or Enterprise tiers based on your needs.</p>
        
        <h3>2. Make your first request</h3>
        <div class="code">curl -X POST "https://startup-research-clean.vercel.app/api/v1/research" \\
  -H "X-API-Key: your_api_key_here" \\
  -H "Content-Type: application/json" \\
  -d '{
    "company": "Tesla",
    "analysisType": "comprehensive"
  }'</div>
        
        <h3>3. Process the response</h3>
        <p>Receive detailed AI analysis including business overview, market position, financial insights, and investment recommendations.</p>
    </div>

    <div class="section">
        <h2>🛠️ API Endpoints</h2>
        <div class="endpoints">
            <div class="endpoint">
                <span class="method post">POST</span>
                <span class="endpoint-path">/api/v1/research</span>
                <span class="endpoint-desc">Analyze a single company</span>
            </div>
            <div class="endpoint">
                <span class="method post">POST</span>
                <span class="endpoint-path">/api/v1/batch</span>
                <span class="endpoint-desc">Create batch analysis job</span>
            </div>
            <div class="endpoint">
                <span class="method get">GET</span>
                <span class="endpoint-path">/api/v1/batch/{id}</span>
                <span class="endpoint-desc">Get batch job status</span>
            </div>
            <div class="endpoint">
                <span class="method get">GET</span>
                <span class="endpoint-path">/api/v1/reports</span>
                <span class="endpoint-desc">List generated reports</span>
            </div>
            <div class="endpoint">
                <span class="method get">GET</span>
                <span class="endpoint-path">/api/v1/reports/{id}/download</span>
                <span class="endpoint-desc">Download PDF report</span>
            </div>
            <div class="endpoint">
                <span class="method get">GET</span>
                <span class="endpoint-path">/api/v1/usage</span>
                <span class="endpoint-desc">Get usage statistics</span>
            </div>
        </div>
    </div>

    <div class="section">
        <h2>🔑 Authentication</h2>
        <p>All API requests require authentication using an API key. Include your API key in requests using one of these methods:</p>
        <ul>
            <li><strong>Header:</strong> <code>X-API-Key: your_api_key</code></li>
            <li><strong>Authorization header:</strong> <code>Authorization: Bearer your_api_key</code></li>
            <li><strong>Query parameter:</strong> <code>?api_key=your_api_key</code></li>
        </ul>
    </div>

    <div class="section">
        <h2>⚡ Rate Limits</h2>
        <p>API usage is limited based on your subscription tier:</p>
        <ul>
            <li><strong>Free:</strong> 100 requests/hour, 1,000 requests/day</li>
            <li><strong>Pro:</strong> 1,000 requests/hour, 20,000 requests/day</li>
            <li><strong>Enterprise:</strong> 10,000 requests/hour, 200,000 requests/day</li>
        </ul>
        <p>Rate limit headers are included in all responses to help you track usage.</p>
    </div>

    <div class="cta">
        <a href="/api/docs" class="btn">📚 View Full Documentation</a>
        <a href="/api/openapi.json" class="btn secondary">📄 OpenAPI Spec</a>
    </div>
</body>
</html>
    `);
});

module.exports = { router, specs };