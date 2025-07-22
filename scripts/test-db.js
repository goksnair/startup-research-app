#!/usr/bin/env node

/**
 * Database Test and Setup Script
 */

const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

async function testDatabase() {
    console.log('🔧 Testing Supabase database connection...\n');

    if (!process.env.SUPABASE_URL || !process.env.SUPABASE_ANON_KEY) {
        console.error('❌ Supabase credentials not found in .env file');
        process.exit(1);
    }

    const supabase = createClient(
        process.env.SUPABASE_URL,
        process.env.SUPABASE_ANON_KEY
    );

    console.log('✅ Connected to Supabase');
    console.log('🌐 Project URL:', process.env.SUPABASE_URL);

    try {
        // Test if tables exist by trying to query them
        console.log('\n📋 Testing database tables...');

        const { data: users, error: usersError } = await supabase
            .from('users')
            .select('count')
            .limit(1);

        const { data: research, error: researchError } = await supabase
            .from('research_queries')
            .select('count')
            .limit(1);

        if (!usersError && !researchError) {
            console.log('✅ All database tables exist and are accessible!');
            console.log('🎉 Database setup is complete!');

            // Test creating a sample user (if needed)
            console.log('\n🧪 Testing user creation...');
            const { data: testUser, error: createError } = await supabase
                .from('users')
                .select('id')
                .eq('email', 'test@startup-research.com')
                .limit(1);

            if (createError) {
                console.log('⚠️  User creation test failed:', createError.message);
            } else {
                console.log('✅ User operations working correctly');
            }

            return true;

        } else {
            throw new Error('Tables do not exist');
        }

    } catch (error) {
        console.log('❌ Database tables are not set up yet\n');

        console.log('🎯 **MANUAL SETUP REQUIRED:**\n');

        console.log('**Step 1:** Open Supabase Dashboard');
        console.log('   → Go to: https://supabase.com/dashboard/project/jfpbstytlvxxbfqebqot\n');

        console.log('**Step 2:** Navigate to SQL Editor');
        console.log('   → Click "SQL Editor" in the left sidebar');
        console.log('   → Click "New Query"\n');

        console.log('**Step 3:** Copy and paste this SQL:');
        console.log('```sql');
        console.log(`-- Users table
CREATE TABLE IF NOT EXISTS public.users (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    name VARCHAR(100) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    last_login TIMESTAMP WITH TIME ZONE,
    is_active BOOLEAN DEFAULT TRUE,
    subscription_tier VARCHAR(20) DEFAULT 'free'
);

-- Research queries table
CREATE TABLE IF NOT EXISTS public.research_queries (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID REFERENCES public.users(id) ON DELETE CASCADE,
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

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_research_user_id ON public.research_queries(user_id);
CREATE INDEX IF NOT EXISTS idx_research_created_at ON public.research_queries(created_at);
CREATE INDEX IF NOT EXISTS idx_research_company ON public.research_queries(company);

-- User usage statistics table
CREATE TABLE IF NOT EXISTS public.user_usage (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID REFERENCES public.users(id) ON DELETE CASCADE,
    date DATE NOT NULL,
    queries_count INTEGER DEFAULT 0,
    tokens_used INTEGER DEFAULT 0,
    cost_usd DECIMAL(10,4) DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(user_id, date)
);

-- Function to increment usage statistics
CREATE OR REPLACE FUNCTION increment_user_usage(
    p_user_id UUID,
    p_tokens INTEGER,
    p_cost DECIMAL
) RETURNS VOID AS $$
BEGIN
    INSERT INTO public.user_usage (user_id, date, queries_count, tokens_used, cost_usd)
    VALUES (p_user_id, CURRENT_DATE, 1, p_tokens, p_cost)
    ON CONFLICT (user_id, date)
    DO UPDATE SET
        queries_count = public.user_usage.queries_count + 1,
        tokens_used = public.user_usage.tokens_used + p_tokens,
        cost_usd = public.user_usage.cost_usd + p_cost;
END;
$$ LANGUAGE plpgsql;`);
        console.log('```\n');

        console.log('**Step 4:** Execute the SQL');
        console.log('   → Click "Run" button to execute\n');

        console.log('**Step 5:** Test the setup');
        console.log('   → Run: npm run test-db\n');

        console.log('📞 **Need Help?**');
        console.log('   If you need assistance, the SQL is also available in:');
        console.log('   → database/schema.sql');

        return false;
    }
}

if (require.main === module) {
    testDatabase().then(success => {
        if (success) {
            console.log('\n🚀 Ready to test authentication!');
            console.log('   → Try: curl -X POST http://localhost:3001/api/auth/register \\');
            console.log('           -H "Content-Type: application/json" \\');
            console.log('           -d \'{"name": "Test User", "email": "test@example.com", "password": "testpass123"}\'');
        }
    }).catch(console.error);
}

module.exports = { testDatabase };
