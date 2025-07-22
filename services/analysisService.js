const OpenAI = require('openai');

class AnalysisService {
    constructor() {
        this.openai = new OpenAI({
            apiKey: process.env.OPENAI_API_KEY
        });
    }

    // Enhanced analysis with more detailed insights
    async analyzeCompany(company, options = {}) {
        try {
            const companyName = typeof company === 'string' ? company : company.name;
            const analysisType = options.analysisType || 'comprehensive';

            console.log(`🔍 Starting ${analysisType} analysis for: ${companyName}`);

            const prompt = this.buildAnalysisPrompt(companyName, analysisType);

            const response = await this.openai.chat.completions.create({
                model: "gpt-4",
                messages: [
                    {
                        role: "system",
                        content: "You are an expert business analyst specializing in startup and company research. Provide detailed, accurate, and actionable insights based on publicly available information."
                    },
                    {
                        role: "user",
                        content: prompt
                    }
                ],
                max_tokens: analysisType === 'quick' ? 1500 : 3000,
                temperature: 0.3
            });

            const analysis = response.choices[0].message.content;

            // Parse the analysis into structured data
            const structuredAnalysis = this.parseAnalysis(analysis, companyName);

            console.log(`✅ Analysis completed for: ${companyName}`);

            return {
                company: companyName,
                analysisType,
                timestamp: new Date().toISOString(),
                analysis: structuredAnalysis,
                rawAnalysis: analysis,
                metadata: {
                    model: 'gpt-4',
                    tokensUsed: response.usage?.total_tokens || 0,
                    processingTime: Date.now() - Date.now() // Will be calculated by caller
                }
            };

        } catch (error) {
            console.error(`❌ Analysis failed for ${company}:`, error);
            throw new Error(`Analysis failed: ${error.message}`);
        }
    }

    // Build analysis prompt based on type
    buildAnalysisPrompt(companyName, analysisType) {
        const basePrompt = `Analyze the company "${companyName}" and provide insights on:`;

        if (analysisType === 'quick') {
            return `${basePrompt}
1. Business Overview (1-2 sentences)
2. Key Products/Services
3. Market Position
4. Recent Performance (if public)
5. Key Strengths and Challenges

Format as JSON with clear sections. Be concise but informative.`;
        }

        if (analysisType === 'financial') {
            return `${basePrompt}
1. Financial Performance (revenue, profitability, growth)
2. Market Valuation and Investment History
3. Key Financial Metrics and Ratios
4. Funding History and Investors
5. Financial Strengths and Risks
6. Competitive Financial Position

Provide detailed financial analysis with specific numbers where available. Format as JSON.`;
        }

        // Comprehensive analysis (default)
        return `${basePrompt}
1. **Business Overview**: Core business model, mission, and value proposition
2. **Products & Services**: Detailed breakdown of offerings and innovations
3. **Market Analysis**: Target market, size, competition, and positioning
4. **Financial Performance**: Revenue, profitability, growth trends, funding history
5. **Leadership**: Key executives and their backgrounds
6. **Technology & Innovation**: Technical capabilities, R&D, patents
7. **Competitive Advantages**: Unique strengths and moat
8. **Challenges & Risks**: Current obstacles and potential threats
9. **Growth Strategy**: Expansion plans and strategic initiatives
10. **Investment Outlook**: Valuation, investment potential, and recommendation

Provide comprehensive analysis with specific data points and actionable insights. Format as structured JSON with clear sections and subsections.`;
    }

    // Parse analysis into structured format
    parseAnalysis(analysis, companyName) {
        try {
            // Try to parse as JSON first
            const jsonMatch = analysis.match(/\{[\s\S]*\}/);
            if (jsonMatch) {
                try {
                    return JSON.parse(jsonMatch[0]);
                } catch (e) {
                    // If JSON parsing fails, continue with text parsing
                }
            }

            // Fallback: Parse as structured text
            const sections = {};
            const lines = analysis.split('\n').filter(line => line.trim());

            let currentSection = 'overview';
            let currentContent = [];

            for (const line of lines) {
                // Detect section headers
                if (line.match(/^\d+\.\s*\*?\*?([^:*]+)[\*:]/) ||
                    line.match(/^\*\*([^:*]+)[\*:]/)) {

                    // Save previous section
                    if (currentContent.length > 0) {
                        sections[currentSection] = currentContent.join(' ').trim();
                        currentContent = [];
                    }

                    // Start new section
                    const sectionName = line.replace(/^\d+\.\s*\*?\*?/, '')
                        .replace(/[\*:]/g, '')
                        .toLowerCase()
                        .replace(/[^a-z0-9]/g, '_')
                        .replace(/_+/g, '_')
                        .replace(/^_|_$/g, '');
                    currentSection = sectionName;
                } else if (line.trim() && !line.match(/^-+$/) && !line.match(/^=+$/)) {
                    currentContent.push(line.trim());
                }
            }

            // Save last section
            if (currentContent.length > 0) {
                sections[currentSection] = currentContent.join(' ').trim();
            }

            // Ensure we have at least basic sections
            if (Object.keys(sections).length === 0) {
                sections.overview = analysis.trim();
            }

            return sections;

        } catch (error) {
            console.error('Analysis parsing error:', error);
            return { overview: analysis.trim() };
        }
    }

    // Batch analysis helper
    async analyzeMultiple(companies, options = {}) {
        const results = [];
        const errors = [];

        for (let i = 0; i < companies.length; i++) {
            try {
                const startTime = Date.now();
                const result = await this.analyzeCompany(companies[i], options);
                result.metadata.processingTime = Date.now() - startTime;
                results.push(result);

                // Progress callback if provided
                if (options.onProgress) {
                    options.onProgress(i + 1, companies.length, result);
                }

                // Rate limiting: wait between requests
                if (i < companies.length - 1) {
                    await new Promise(resolve => setTimeout(resolve, 1000));
                }

            } catch (error) {
                console.error(`Error analyzing ${companies[i]}:`, error);
                errors.push({
                    company: companies[i],
                    error: error.message,
                    timestamp: new Date().toISOString()
                });
            }
        }

        return { results, errors };
    }

    // Generate comparative analysis
    async generateComparativeAnalysis(analyses) {
        try {
            if (!analyses || analyses.length < 2) {
                throw new Error('At least 2 company analyses required for comparison');
            }

            const companies = analyses.map(a => a.company);
            const prompt = `Based on the following company analyses, provide a comparative analysis:

${analyses.map(a => `
Company: ${a.company}
Analysis Summary: ${JSON.stringify(a.analysis, null, 2)}
`).join('\n---\n')}

Please provide:
1. Market Position Comparison
2. Financial Performance Comparison
3. Competitive Advantages Analysis
4. Risk Assessment Comparison
5. Investment Recommendation Ranking
6. Strategic Insights and Patterns

Format as structured JSON with clear comparisons and rankings.`;

            const response = await this.openai.chat.completions.create({
                model: "gpt-4",
                messages: [
                    {
                        role: "system",
                        content: "You are an expert business analyst. Provide detailed comparative analysis between companies based on their individual analyses."
                    },
                    {
                        role: "user",
                        content: prompt
                    }
                ],
                max_tokens: 2500,
                temperature: 0.3
            });

            return {
                companies,
                comparison: response.choices[0].message.content,
                timestamp: new Date().toISOString(),
                metadata: {
                    companiesCount: companies.length,
                    tokensUsed: response.usage?.total_tokens || 0
                }
            };

        } catch (error) {
            console.error('Comparative analysis error:', error);
            throw error;
        }
    }

    // Generate executive summary
    generateExecutiveSummary(analyses) {
        if (!analyses || analyses.length === 0) {
            return null;
        }

        const totalCompanies = analyses.length;
        const successfulAnalyses = analyses.filter(a => a.analysis && Object.keys(a.analysis).length > 0);
        const avgProcessingTime = analyses.reduce((sum, a) => sum + (a.metadata?.processingTime || 0), 0) / analyses.length;

        // Extract key insights
        const industries = new Set();
        const strengths = new Set();
        const challenges = new Set();

        successfulAnalyses.forEach(analysis => {
            // Try to extract industry information
            const overview = analysis.analysis.overview || analysis.analysis.business_overview || '';
            if (overview.includes('technology') || overview.includes('tech')) industries.add('Technology');
            if (overview.includes('finance') || overview.includes('fintech')) industries.add('Finance');
            if (overview.includes('health') || overview.includes('medical')) industries.add('Healthcare');
            if (overview.includes('retail') || overview.includes('e-commerce')) industries.add('Retail');
        });

        return {
            overview: {
                totalCompanies,
                successfulAnalyses: successfulAnalyses.length,
                failedAnalyses: totalCompanies - successfulAnalyses.length,
                avgProcessingTime: Math.round(avgProcessingTime / 1000), // seconds
                industries: Array.from(industries)
            },
            keyInsights: {
                mostAnalyzedIndustries: Array.from(industries).slice(0, 3),
                analysisDepth: successfulAnalyses.length > 0 ? 'Comprehensive' : 'Limited',
                recommendedActions: [
                    'Review individual company analyses for detailed insights',
                    'Consider comparative analysis for strategic planning',
                    'Monitor industry trends and competitive positioning'
                ]
            },
            timestamp: new Date().toISOString()
        };
    }
}

module.exports = new AnalysisService();
