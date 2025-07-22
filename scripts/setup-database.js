#!/usr/bin/env node

/**
 * Database Setup Script
 * Run this to set up the Supabase database schema
 */

const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

async function setupDatabase() {
    console.log('🔧 Setting up Supabase database schema...');

    if (!process.env.SUPABASE_URL || !process.env.SUPABASE_ANON_KEY) {
        console.error('❌ Supabase credentials not found in .env file');
        process.exit(1);
    }

    const supabase = createClient(
        process.env.SUPABASE_URL,
        process.env.SUPABASE_ANON_KEY
    );

    console.log('✅ Connected to Supabase');
    console.log('📋 Please run the SQL schema from database/schema.sql in your Supabase SQL editor');
    console.log('🌐 Supabase URL:', process.env.SUPABASE_URL);

    // Test connection
    try {
        const { data, error } = await supabase
            .from('users')
            .select('count')
            .limit(1);

        if (!error) {
            console.log('✅ Database schema appears to be set up correctly');
        } else {
            console.log('⚠️  Database schema needs to be set up');
            console.log('📝 Please run the SQL from database/schema.sql in your Supabase dashboard');
        }
    } catch (error) {
        console.log('⚠️  Please run the SQL schema from database/schema.sql');
    }

    console.log('\n🎯 Next steps:');
    console.log('1. Go to your Supabase dashboard');
    console.log('2. Navigate to SQL Editor');
    console.log('3. Run the contents of database/schema.sql');
    console.log('4. Test the authentication endpoints');
}

if (require.main === module) {
    setupDatabase().catch(console.error);
}

module.exports = { setupDatabase };
