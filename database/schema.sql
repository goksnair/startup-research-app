-- Startup Research App Database Schema
-- Run this in your Supabase SQL editor
-- 
-- 🚀 Phase 3 Complete Database Schema
-- ✅ 11 Tables (Phase 2 + Phase 3 batch processing)
-- ✅ 10 Performance indexes 
-- ✅ 2 Functions + 2 Triggers for automation
-- ✅ Error-free deployment with conflict resolution
-- 
-- Last updated: July 23, 2025

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
    tags TEXT[] DEFAULT '{}'
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

-- Phase 3: Batch Processing and Advanced Features Tables

-- Batch jobs table
CREATE TABLE IF NOT EXISTS batch_jobs (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    companies JSONB NOT NULL, -- Array of companies to analyze
    status VARCHAR(20) DEFAULT 'queued' CHECK (status IN ('queued', 'processing', 'completed', 'failed', 'cancelled')),
    total_companies INTEGER NOT NULL DEFAULT 0,
    processed_companies INTEGER DEFAULT 0,
    success_count INTEGER DEFAULT 0,
    error_count INTEGER DEFAULT 0,
    options JSONB DEFAULT '{}', -- Processing options like include_pdf, send_email, etc.
    results JSONB DEFAULT '[]', -- Array of analysis results
    errors JSONB DEFAULT '[]', -- Array of error messages
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    started_at TIMESTAMP WITH TIME ZONE,
    completed_at TIMESTAMP WITH TIME ZONE,
    estimated_completion TIMESTAMP WITH TIME ZONE,
    priority INTEGER DEFAULT 0
);

-- PDF Reports table
CREATE TABLE IF NOT EXISTS pdf_reports (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    batch_id UUID REFERENCES batch_jobs(id) ON DELETE CASCADE,
    report_type VARCHAR(50) NOT NULL DEFAULT 'standard', -- standard, comparative, executive
    file_name VARCHAR(255) NOT NULL,
    file_path TEXT NOT NULL,
    file_size INTEGER DEFAULT 0,
    companies TEXT[] NOT NULL,
    generated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    expires_at TIMESTAMP WITH TIME ZONE DEFAULT (NOW() + INTERVAL '30 days'),
    download_count INTEGER DEFAULT 0,
    is_emailed BOOLEAN DEFAULT FALSE,
    metadata JSONB DEFAULT '{}'
);

-- Email notifications table
CREATE TABLE IF NOT EXISTS email_notifications (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    batch_id UUID REFERENCES batch_jobs(id) ON DELETE SET NULL,
    report_id UUID REFERENCES pdf_reports(id) ON DELETE SET NULL,
    email_type VARCHAR(50) NOT NULL, -- batch_complete, report_ready, system_update
    recipient_email VARCHAR(255) NOT NULL,
    subject VARCHAR(255) NOT NULL,
    status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'sent', 'failed', 'bounced')),
    sent_at TIMESTAMP WITH TIME ZONE,
    error_message TEXT,
    retry_count INTEGER DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- API keys table (for public API access)
CREATE TABLE IF NOT EXISTS api_keys (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    key_name VARCHAR(100) NOT NULL,
    key_hash VARCHAR(255) NOT NULL UNIQUE,
    key_prefix VARCHAR(20) NOT NULL, -- First few characters for identification
    permissions JSONB DEFAULT '{}', -- API permissions and limits
    rate_limit_per_hour INTEGER DEFAULT 100,
    rate_limit_per_day INTEGER DEFAULT 1000,
    is_active BOOLEAN DEFAULT TRUE,
    last_used_at TIMESTAMP WITH TIME ZONE,
    usage_count INTEGER DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    expires_at TIMESTAMP WITH TIME ZONE
);

-- API usage tracking
CREATE TABLE IF NOT EXISTS api_usage (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    api_key_id UUID REFERENCES api_keys(id) ON DELETE SET NULL,
    endpoint VARCHAR(100) NOT NULL,
    method VARCHAR(10) NOT NULL,
    status_code INTEGER NOT NULL,
    processing_time_ms INTEGER DEFAULT 0,
    tokens_used INTEGER DEFAULT 0,
    cost_usd DECIMAL(10,6) DEFAULT 0,
    ip_address INET,
    user_agent TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- System analytics table
CREATE TABLE IF NOT EXISTS system_analytics (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    metric_name VARCHAR(100) NOT NULL,
    metric_value DECIMAL(15,6) NOT NULL,
    dimensions JSONB DEFAULT '{}',
    recorded_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- User preferences table (for notifications, UI settings, etc.)
CREATE TABLE IF NOT EXISTS user_preferences (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID REFERENCES users(id) ON DELETE CASCADE UNIQUE,
    email_notifications JSONB DEFAULT '{
        "batch_complete": true,
        "report_ready": true,
        "system_updates": false,
        "marketing": false
    }',
    ui_preferences JSONB DEFAULT '{
        "theme": "light",
        "default_analysis_type": "comprehensive",
        "auto_generate_pdf": false
    }',
    api_preferences JSONB DEFAULT '{
        "rate_limit_alerts": true,
        "usage_reports": true
    }',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Webhooks table (for enterprise webhook notifications)
CREATE TABLE IF NOT EXISTS webhooks (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    url TEXT NOT NULL,
    events JSONB DEFAULT '[]', -- Array of event names to subscribe to
    signing_secret VARCHAR(255) NOT NULL,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Webhook deliveries table (for tracking webhook delivery status)
CREATE TABLE IF NOT EXISTS webhook_deliveries (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    webhook_id UUID REFERENCES webhooks(id) ON DELETE CASCADE,
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    event_type VARCHAR(100) NOT NULL,
    payload JSONB NOT NULL,
    status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'delivered', 'failed')),
    response_status INTEGER,
    response_headers JSONB,
    response_body TEXT,
    response_time_ms INTEGER,
    attempt_count INTEGER DEFAULT 0,
    error_message TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    completed_at TIMESTAMP WITH TIME ZONE
);

-- PostgreSQL-style indexes (created after tables)
-- Research queries indexes
CREATE INDEX IF NOT EXISTS idx_research_user_id ON research_queries (user_id);
CREATE INDEX IF NOT EXISTS idx_research_created_at ON research_queries (created_at);
CREATE INDEX IF NOT EXISTS idx_research_company ON research_queries (company);

-- Batch jobs indexes
CREATE INDEX IF NOT EXISTS idx_batch_user_id ON batch_jobs (user_id);
CREATE INDEX IF NOT EXISTS idx_batch_status ON batch_jobs (status);
CREATE INDEX IF NOT EXISTS idx_batch_created_at ON batch_jobs (created_at);

-- PDF Reports indexes
CREATE INDEX IF NOT EXISTS idx_reports_user_id ON pdf_reports (user_id);
CREATE INDEX IF NOT EXISTS idx_reports_batch_id ON pdf_reports (batch_id);
CREATE INDEX IF NOT EXISTS idx_reports_created_at ON pdf_reports (generated_at);

-- Email notifications indexes
CREATE INDEX IF NOT EXISTS idx_email_user_id ON email_notifications (user_id);
CREATE INDEX IF NOT EXISTS idx_email_status ON email_notifications (status);
CREATE INDEX IF NOT EXISTS idx_email_created_at ON email_notifications (created_at);

-- API keys indexes
CREATE INDEX IF NOT EXISTS idx_api_keys_user_id ON api_keys (user_id);
CREATE INDEX IF NOT EXISTS idx_api_keys_hash ON api_keys (key_hash);
CREATE INDEX IF NOT EXISTS idx_api_keys_active ON api_keys (is_active);

-- API usage indexes
CREATE INDEX IF NOT EXISTS idx_api_usage_user_id ON api_usage (user_id);
CREATE INDEX IF NOT EXISTS idx_api_usage_created_at ON api_usage (created_at);
CREATE INDEX IF NOT EXISTS idx_api_usage_endpoint ON api_usage (endpoint);

-- System analytics indexes
CREATE INDEX IF NOT EXISTS idx_analytics_name ON system_analytics (metric_name);
CREATE INDEX IF NOT EXISTS idx_analytics_recorded_at ON system_analytics (recorded_at);

-- Note: Row Level Security (RLS) policies are commented out since we're using JWT authentication
-- instead of Supabase Auth. Security is handled at the application level through our auth middleware.
-- 
-- If you want to enable RLS in the future with Supabase Auth, uncomment the following:

-- ALTER TABLE users ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE research_queries ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE user_sessions ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE user_usage ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE batch_jobs ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE pdf_reports ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE email_notifications ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE api_keys ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE api_usage ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE system_analytics ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE user_preferences ENABLE ROW LEVEL SECURITY;

-- Example RLS policies for Supabase Auth (currently disabled):
-- CREATE POLICY "Users can view own profile" ON users FOR ALL USING (auth.uid() = id);
-- CREATE POLICY "Users can view own research" ON research_queries FOR ALL USING (auth.uid() = user_id);

-- Functions for updating timestamps
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Trigger for users table (drop first if exists to avoid conflicts)
DROP TRIGGER IF EXISTS update_users_updated_at ON users;
CREATE TRIGGER update_users_updated_at
    BEFORE UPDATE ON users
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Trigger for user_preferences table
DROP TRIGGER IF EXISTS update_user_preferences_updated_at ON user_preferences;
CREATE TRIGGER update_user_preferences_updated_at
    BEFORE UPDATE ON user_preferences
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
