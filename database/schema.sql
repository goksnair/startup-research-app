-- Startup Research App Database Schema
-- Run this in your Supabase SQL editor

-- Users table
CREATE TABLE IF NOT EXISTS users (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    name VARCHAR(100) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    last_login TIMESTAMP WITH TIME ZONE,
    is_active BOOLEAN DEFAULT TRUE,
    subscription_tier VARCHAR(20) DEFAULT 'free' -- free, pro, enterprise
);

-- Research queries table (updated with user references)
CREATE TABLE IF NOT EXISTS research_queries (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    company VARCHAR(255) NOT NULL,
    query TEXT DEFAULT '',
    analysis_type VARCHAR(50) NOT NULL,
    analysis TEXT NOT NULL,
    tokens_used INTEGER DEFAULT 0,
    cost_usd DECIMAL(10,4) DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    is_favorite BOOLEAN DEFAULT FALSE,
    tags TEXT[] DEFAULT '{}',
    
    -- Indexes for better performance
    INDEX idx_research_user_id (user_id),
    INDEX idx_research_created_at (created_at),
    INDEX idx_research_company (company)
);

-- User sessions table (for tracking active sessions)
CREATE TABLE IF NOT EXISTS user_sessions (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    token_hash VARCHAR(255) NOT NULL,
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    last_used TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    user_agent TEXT,
    ip_address INET
);

-- User usage statistics
CREATE TABLE IF NOT EXISTS user_usage (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    date DATE NOT NULL,
    queries_count INTEGER DEFAULT 0,
    tokens_used INTEGER DEFAULT 0,
    cost_usd DECIMAL(10,4) DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    UNIQUE(user_id, date)
);

-- Row Level Security (RLS) policies
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE research_queries ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_usage ENABLE ROW LEVEL SECURITY;

-- Users can only see their own data
CREATE POLICY "Users can view own profile" ON users
    FOR ALL USING (auth.uid() = id);

-- Research queries policies
CREATE POLICY "Users can view own research" ON research_queries
    FOR ALL USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own research" ON research_queries
    FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Sessions policies
CREATE POLICY "Users can view own sessions" ON user_sessions
    FOR ALL USING (auth.uid() = user_id);

-- Usage policies
CREATE POLICY "Users can view own usage" ON user_usage
    FOR ALL USING (auth.uid() = user_id);

-- Functions for updating timestamps
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Trigger for users table
CREATE TRIGGER update_users_updated_at
    BEFORE UPDATE ON users
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Function to increment usage statistics
CREATE OR REPLACE FUNCTION increment_user_usage(
    p_user_id UUID,
    p_tokens INTEGER,
    p_cost DECIMAL
) RETURNS VOID AS $$
BEGIN
    INSERT INTO user_usage (user_id, date, queries_count, tokens_used, cost_usd)
    VALUES (p_user_id, CURRENT_DATE, 1, p_tokens, p_cost)
    ON CONFLICT (user_id, date)
    DO UPDATE SET
        queries_count = user_usage.queries_count + 1,
        tokens_used = user_usage.tokens_used + p_tokens,
        cost_usd = user_usage.cost_usd + p_cost;
END;
$$ LANGUAGE plpgsql;
