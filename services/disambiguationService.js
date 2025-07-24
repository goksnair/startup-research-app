const OpenAI = require('openai');
const supabase = require('../database/supabase');
const { v4: uuidv4 } = require('uuid');

class CompanyDisambiguationService {
    constructor() {
        this.openai = new OpenAI({
            apiKey: process.env.OPENAI_API_KEY
        });
        this.companyCache = new Map(); // In-memory cache for common companies
        this.initializeCache();
    }

    // Initialize cache with common companies
    async initializeCache() {
        try {
            const { data: companies } = await supabase
                .from('company_registry')
                .select('*')
                .order('confidence_score', { ascending: false })
                .limit(1000);

            if (companies) {
                companies.forEach(company => {
                    this.companyCache.set(company.name.toLowerCase(), company);
                    // Add aliases to cache
                    if (company.aliases) {
                        company.aliases.forEach(alias => {
                            this.companyCache.set(alias.toLowerCase(), company);
                        });
                    }
                });
                console.log(`📊 Initialized company cache with ${companies.length} entries`);
            }
        } catch (error) {
            console.log('📝 Company registry not available, using AI-only disambiguation');
        }
    }

    // Main disambiguation entry point
    async disambiguateCompany(companyName, context = {}) {
        const normalizedName = this.normalizeCompanyName(companyName);
        
        console.log(`🔍 Disambiguating company: "${companyName}" (normalized: "${normalizedName}")`);

        // Step 1: Check for exact matches in cache
        const exactMatch = this.companyCache.get(normalizedName);
        if (exactMatch && exactMatch.confidence_score > 0.9) {
            console.log(`✅ Exact match found: ${exactMatch.name}`);
            return {
                isAmbiguous: false,
                company: this.formatCompanyResult(exactMatch),
                confidence: exactMatch.confidence_score
            };
        }

        // Step 2: Find potential matches using AI
        const candidates = await this.findCandidatesWithAI(companyName, context);
        
        // Step 3: Determine if disambiguation is needed
        if (candidates.length === 0) {
            return await this.handleUnknownCompany(companyName, context);
        }
        
        if (candidates.length === 1 && candidates[0].confidence > 0.8) {
            console.log(`✅ Single high-confidence match: ${candidates[0].name}`);
            return {
                isAmbiguous: false,
                company: candidates[0],
                confidence: candidates[0].confidence
            };
        }

        // Step 4: Return disambiguation options
        console.log(`❓ Multiple candidates found, requiring disambiguation`);
        return {
            isAmbiguous: true,
            candidates: candidates.slice(0, 5), // Top 5 matches
            originalQuery: companyName,
            suggestedQuestions: this.generateClarifyingQuestions(candidates)
        };
    }

    // AI-powered candidate finding
    async findCandidatesWithAI(companyName, context) {
        try {
            const contextStr = Object.keys(context).length > 0 ? JSON.stringify(context) : 'none provided';
            
            const prompt = `Given the company name "${companyName}" and context: ${contextStr}, identify the most likely companies this could refer to.

Consider:
- Similar spellings, abbreviations, or alternative names
- Industry context if provided  
- Geographic context if provided
- Company size if mentioned
- Well-known companies vs startups vs local businesses

Return a JSON array of up to 4 companies with this exact structure:
[
  {
    "name": "Official Company Name",
    "aliases": ["Alternative Name 1", "Alternative Name 2"],
    "industry": "Primary Industry Sector",
    "headquarters": "City, Country",
    "founded": "Year or null",
    "size": "startup|small|medium|large|enterprise",
    "description": "Brief 1-line description",
    "confidence": 0.95,
    "reasoning": "Why this is a likely match"
  }
]

IMPORTANT: 
- Only include companies you're confident about
- If uncertain, include fewer candidates rather than guessing
- Confidence should reflect actual likelihood (0.5-1.0 range)  
- Focus on the most probable matches based on the input`;

            const response = await this.openai.chat.completions.create({
                model: "gpt-4",
                messages: [
                    {
                        role: "system",
                        content: "You are an expert business intelligence analyst specializing in company identification. Be precise and only suggest companies you're confident about."
                    },
                    {
                        role: "user",
                        content: prompt
                    }
                ],
                temperature: 0.1,
                max_tokens: 1500
            });

            const candidatesText = response.choices[0].message.content;
            console.log('🤖 AI disambiguation response:', candidatesText);

            // Parse JSON response safely
            let candidates;
            try {
                candidates = JSON.parse(candidatesText);
            } catch (parseError) {
                console.error('Failed to parse AI response:', parseError);
                // Try to extract JSON from response if it has extra text
                const jsonMatch = candidatesText.match(/\[[\s\S]*\]/);
                if (jsonMatch) {
                    candidates = JSON.parse(jsonMatch[0]);
                } else {
                    return [];
                }
            }

            // Validate and format candidates
            const validCandidates = candidates
                .filter(c => c.name && c.confidence >= 0.5)
                .map(c => ({
                    ...c,
                    id: this.generateCompanyId(c.name),
                    source: 'ai_recognition'
                }))
                .sort((a, b) => b.confidence - a.confidence);

            console.log(`🎯 Found ${validCandidates.length} valid candidates`);
            return validCandidates;

        } catch (error) {
            console.error('AI disambiguation failed:', error);
            return [];
        }
    }

    // Generate clarifying questions based on candidates
    generateClarifyingQuestions(candidates) {
        const questions = [];
        
        // Industry-based questions
        const industries = [...new Set(candidates.map(c => c.industry).filter(Boolean))];
        if (industries.length > 1) {
            questions.push({
                type: 'industry',
                question: 'Which industry is the company in?',
                options: industries.map(industry => ({
                    value: industry,
                    label: industry,
                    count: candidates.filter(c => c.industry === industry).length
                }))
            });
        }

        // Location-based questions
        const locations = [...new Set(candidates.map(c => c.headquarters).filter(Boolean))];
        if (locations.length > 1) {
            questions.push({
                type: 'location',
                question: 'Where is the company headquartered?',
                options: locations.map(location => ({
                    value: location,
                    label: location,
                    count: candidates.filter(c => c.headquarters === location).length
                }))
            });
        }

        // Company size questions
        const sizes = [...new Set(candidates.map(c => c.size).filter(Boolean))];
        if (sizes.length > 1) {
            questions.push({
                type: 'size',
                question: 'What size is the company?',
                options: sizes.map(size => ({
                    value: size,
                    label: this.formatSizeLabel(size),
                    count: candidates.filter(c => c.size === size).length
                }))
            });
        }

        return questions;
    }

    // Filter candidates based on user answers
    filterCandidates(candidates, answers) {
        let filtered = candidates;

        if (answers.industry) {
            filtered = filtered.filter(c => c.industry === answers.industry);
        }

        if (answers.location) {
            filtered = filtered.filter(c => c.headquarters === answers.location);
        }

        if (answers.size) {
            filtered = filtered.filter(c => c.size === answers.size);
        }

        return filtered.sort((a, b) => b.confidence - a.confidence);
    }

    // Handle unknown companies
    async handleUnknownCompany(companyName, context) {
        console.log(`❓ Unknown company: ${companyName}`);
        
        return {
            isAmbiguous: false,
            isUnknown: true,
            company: {
                name: companyName,
                confidence: 0.5,
                source: 'user_input',
                warning: 'Company not found in our database. Analysis will proceed with limited information.'
            },
            suggestions: [
                'Double-check the company name spelling',
                'Try using the full legal name',
                'Include additional context like industry or location',
                'Verify the company exists and is publicly known'
            ]
        };
    }

    // Save disambiguation choice for learning
    async saveDisambiguationChoice(userId, data) {
        try {
            const record = {
                id: uuidv4(),
                user_id: userId,
                original_query: data.originalQuery,
                selected_company_id: data.selectedCompany?.id,
                candidates_shown: JSON.stringify(data.candidates || []),
                user_answers: JSON.stringify(data.answers || {}),
                disambiguation_time: data.disambiguationTime || 0,
                created_at: new Date().toISOString()
            };

            await supabase
                .from('company_disambiguation_history')
                .insert([record]);

            console.log('📊 Disambiguation choice saved for learning');
        } catch (error) {
            console.error('Failed to save disambiguation choice:', error);
        }
    }

    // Get company by ID
    async getCompanyById(companyId) {
        try {
            const { data: company } = await supabase
                .from('company_registry')
                .select('*')
                .eq('id', companyId)
                .single();

            return company ? this.formatCompanyResult(company) : null;
        } catch (error) {
            console.error('Failed to get company by ID:', error);
            return null;
        }
    }

    // Utility methods
    normalizeCompanyName(name) {
        return name
            .toLowerCase()
            .replace(/\b(inc|corp|ltd|llc|co|company|corporation|limited|pvt|private)\b\.?/g, '')
            .replace(/[^\w\s]/g, ' ')
            .replace(/\s+/g, ' ')
            .trim();
    }

    generateCompanyId(name) {
        return name.toLowerCase()
            .replace(/[^\w\s]/g, '')
            .replace(/\s+/g, '_')
            .substring(0, 50);
    }

    formatSizeLabel(size) {
        const labels = {
            startup: 'Startup (1-10 employees)',
            small: 'Small (11-50 employees)',
            medium: 'Medium (51-200 employees)',
            large: 'Large (201-1000 employees)',
            enterprise: 'Enterprise (1000+ employees)'
        };
        return labels[size] || size;
    }

    formatCompanyResult(company) {
        return {
            id: company.id,
            name: company.name,
            legal_name: company.legal_name,
            aliases: company.aliases || [],
            industry: company.industry,
            headquarters: company.headquarters,
            founded: company.founded_year,
            size: company.size_category,
            description: company.description,
            confidence: company.confidence_score || 1.0,
            source: company.data_source || 'database'
        };
    }
}

// Create singleton instance
const disambiguationService = new CompanyDisambiguationService();

module.exports = disambiguationService;