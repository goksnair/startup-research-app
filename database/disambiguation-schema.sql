-- Company Registry and Disambiguation Schema
-- This extends the existing schema with company disambiguation capabilities

-- Company registry table for disambiguation
CREATE TABLE IF NOT EXISTS company_registry (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    legal_name VARCHAR(255),
    aliases TEXT[] DEFAULT '{}',
    former_names TEXT[] DEFAULT '{}',
    industry VARCHAR(100),
    sub_industry VARCHAR(100),
    headquarters VARCHAR(255),
    country VARCHAR(100),
    founded_year INTEGER,
    company_type VARCHAR(50), -- public, private, nonprofit, government
    size_category VARCHAR(20), -- startup, small, medium, large, enterprise
    employee_count_range VARCHAR(50),
    website VARCHAR(255),
    description TEXT,
    ticker_symbol VARCHAR(10),
    parent_company VARCHAR(255),
    subsidiaries TEXT[],
    confidence_score DECIMAL(3,2) DEFAULT 1.0,
    data_source VARCHAR(50) DEFAULT 'manual', -- manual, api, ai_generated, user_contributed
    last_verified TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Company disambiguation history
CREATE TABLE IF NOT EXISTS company_disambiguation_history (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    original_query VARCHAR(255) NOT NULL,
    selected_company_id UUID REFERENCES company_registry(id) ON DELETE SET NULL,
    candidates_shown JSONB DEFAULT '[]',
    user_answers JSONB DEFAULT '{}',
    disambiguation_time INTEGER DEFAULT 0, -- milliseconds
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes for company registry
CREATE INDEX IF NOT EXISTS idx_company_registry_name ON company_registry (name);
CREATE INDEX IF NOT EXISTS idx_company_registry_name_lower ON company_registry (LOWER(name));
CREATE INDEX IF NOT EXISTS idx_company_registry_industry ON company_registry (industry);
CREATE INDEX IF NOT EXISTS idx_company_registry_headquarters ON company_registry (headquarters);
CREATE INDEX IF NOT EXISTS idx_company_registry_size ON company_registry (size_category);
CREATE INDEX IF NOT EXISTS idx_company_registry_aliases ON company_registry USING GIN (aliases);
CREATE INDEX IF NOT EXISTS idx_company_registry_confidence ON company_registry (confidence_score DESC);

-- Full text search index
CREATE INDEX IF NOT EXISTS idx_company_registry_search ON company_registry 
USING GIN (to_tsvector('english', name || ' ' || COALESCE(legal_name, '') || ' ' || array_to_string(aliases, ' ')));

-- Indexes for disambiguation history
CREATE INDEX IF NOT EXISTS idx_disambiguation_history_user ON company_disambiguation_history (user_id);
CREATE INDEX IF NOT EXISTS idx_disambiguation_history_original_query ON company_disambiguation_history (original_query);
CREATE INDEX IF NOT EXISTS idx_disambiguation_history_created_at ON company_disambiguation_history (created_at DESC);

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_company_registry_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Trigger to automatically update updated_at
DROP TRIGGER IF EXISTS trigger_update_company_registry_updated_at ON company_registry;
CREATE TRIGGER trigger_update_company_registry_updated_at
    BEFORE UPDATE ON company_registry
    FOR EACH ROW
    EXECUTE FUNCTION update_company_registry_updated_at();

-- Insert some common companies for initial disambiguation
INSERT INTO company_registry (name, legal_name, aliases, industry, headquarters, founded_year, size_category, description, confidence_score, data_source) VALUES
    ('OpenAI', 'OpenAI, Inc.', ARRAY['OpenAI Inc'], 'Artificial Intelligence', 'San Francisco, CA, USA', 2015, 'large', 'AI research and deployment company', 1.0, 'manual'),
    ('Google', 'Alphabet Inc.', ARRAY['Alphabet', 'Google LLC'], 'Technology', 'Mountain View, CA, USA', 1998, 'enterprise', 'Multinational technology corporation', 1.0, 'manual'),
    ('Microsoft', 'Microsoft Corporation', ARRAY['MSFT'], 'Technology', 'Redmond, WA, USA', 1975, 'enterprise', 'Multinational technology corporation', 1.0, 'manual'),
    ('Apple', 'Apple Inc.', ARRAY['Apple Computer'], 'Technology', 'Cupertino, CA, USA', 1976, 'enterprise', 'Consumer electronics and software company', 1.0, 'manual'),
    ('Meta', 'Meta Platforms, Inc.', ARRAY['Facebook', 'Facebook Inc'], 'Social Media', 'Menlo Park, CA, USA', 2004, 'enterprise', 'Social media and technology company', 1.0, 'manual'),
    ('Tesla', 'Tesla, Inc.', ARRAY['Tesla Motors'], 'Automotive', 'Austin, TX, USA', 2003, 'large', 'Electric vehicle and clean energy company', 1.0, 'manual'),
    ('Amazon', 'Amazon.com, Inc.', ARRAY['Amazon Web Services', 'AWS'], 'E-commerce', 'Seattle, WA, USA', 1994, 'enterprise', 'Multinational technology and e-commerce company', 1.0, 'manual'),
    ('Netflix', 'Netflix, Inc.', ARRAY[], 'Entertainment', 'Los Gatos, CA, USA', 1997, 'large', 'Streaming entertainment company', 1.0, 'manual'),
    ('Uber', 'Uber Technologies, Inc.', ARRAY['Uber Technologies'], 'Transportation', 'San Francisco, CA, USA', 2009, 'large', 'Ride-hailing and mobility company', 1.0, 'manual'),
    ('Airbnb', 'Airbnb, Inc.', ARRAY[], 'Travel', 'San Francisco, CA, USA', 2008, 'large', 'Online marketplace for lodging and tourism', 1.0, 'manual'),
    ('Stripe', 'Stripe, Inc.', ARRAY[], 'Fintech', 'San Francisco, CA, USA', 2010, 'large', 'Financial services and software company', 1.0, 'manual'),
    ('SpaceX', 'Space Exploration Technologies Corp.', ARRAY['Space Exploration Technologies'], 'Aerospace', 'Hawthorne, CA, USA', 2002, 'large', 'Aerospace manufacturer and space transportation company', 1.0, 'manual'),
    ('Salesforce', 'Salesforce, Inc.', ARRAY['Salesforce.com'], 'Software', 'San Francisco, CA, USA', 1999, 'large', 'Cloud-based software company', 1.0, 'manual')
ON CONFLICT (name) DO NOTHING;

-- Function to search companies with fuzzy matching
CREATE OR REPLACE FUNCTION search_companies(search_term TEXT, limit_count INTEGER DEFAULT 10)
RETURNS TABLE (
    id UUID,
    name VARCHAR(255),
    legal_name VARCHAR(255),
    aliases TEXT[],
    industry VARCHAR(100),
    headquarters VARCHAR(255),
    founded_year INTEGER,
    size_category VARCHAR(20),
    description TEXT,
    confidence_score DECIMAL(3,2),
    similarity REAL
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        cr.id,
        cr.name,
        cr.legal_name,
        cr.aliases,
        cr.industry,
        cr.headquarters,
        cr.founded_year,
        cr.size_category,
        cr.description,
        cr.confidence_score,
        GREATEST(
            SIMILARITY(LOWER(cr.name), LOWER(search_term)),
            COALESCE(MAX(SIMILARITY(LOWER(unnest_alias), LOWER(search_term))), 0)
        ) as similarity
    FROM company_registry cr
    LEFT JOIN LATERAL unnest(cr.aliases) AS unnest_alias ON true
    WHERE 
        LOWER(cr.name) % LOWER(search_term)
        OR EXISTS (
            SELECT 1 FROM unnest(cr.aliases) AS alias_item 
            WHERE LOWER(alias_item) % LOWER(search_term)
        )
        OR to_tsvector('english', cr.name || ' ' || COALESCE(cr.legal_name, '') || ' ' || array_to_string(cr.aliases, ' ')) 
           @@ plainto_tsquery('english', search_term)
    GROUP BY cr.id, cr.name, cr.legal_name, cr.aliases, cr.industry, cr.headquarters, 
             cr.founded_year, cr.size_category, cr.description, cr.confidence_score
    ORDER BY similarity DESC, cr.confidence_score DESC
    LIMIT limit_count;
END;
$$ LANGUAGE plpgsql;

-- Enable pg_trgm extension for similarity search (if not already enabled)
CREATE EXTENSION IF NOT EXISTS pg_trgm;

COMMENT ON TABLE company_registry IS 'Registry of companies for disambiguation and entity resolution';
COMMENT ON TABLE company_disambiguation_history IS 'History of user disambiguation choices for machine learning';
COMMENT ON FUNCTION search_companies IS 'Fuzzy search function for company disambiguation';