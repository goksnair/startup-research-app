#!/usr/bin/env node

/**
 * Automatic Database Setup Script
 * This will create all necessary tables in Supabase
 */

const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

async function setupDatabaseTables() {
    console.log('🔧 Setting up Supabase database tables automatically...');

    if (!process.env.SUPABASE_URL || !process.env.SUPABASE_ANON_KEY) {
        console.error('❌ Supabase credentials not found in .env file');
        process.exit(1);
    }

    const supabase = createClient(
        process.env.SUPABASE_URL,
        process.env.SUPABASE_ANON_KEY
    );

    try {
        console.log('✅ Connected to Supabase');

        // Create users table
        console.log('📋 Creating users table...');
        const { error: usersError } = await supabase.rpc('exec_sql', {
            sql: `
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
            `
        });

        if (usersError) {
            console.log('⚠️  Note: Users table creation via RPC not supported. Using alternative method...');
        } else {
            console.log('✅ Users table created');
        }

        // Create research_queries table with simpler approach
        console.log('📋 Creating research_queries table...');

        // Try to create tables using INSERT method (workaround for RLS)
        const { error: testError } = await supabase
            .from('users')
            .select('count')
            .limit(1);

        if (testError) {
            console.log('⚠️  Tables don\'t exist yet. Please use manual setup method.');
            console.log('');
            console.log('🎯 **MANUAL SETUP INSTRUCTIONS:**');
            console.log('');
            console.log('1. Go to: https://supabase.com/dashboard');
            console.log('2. Select your project: jfpbstytlvxxbfqebqot');
            console.log('3. Go to "SQL Editor" in the left sidebar');
            console.log('4. Click "New Query"');
            console.log('5. Copy the SQL below and paste it:');
            console.log('');
            console.log('----------------------------------------');

            // Read and display the schema
            const schemaPath = path.join(__dirname, '..', 'database', 'schema.sql');
            if (fs.existsSync(schemaPath)) {
                const schema = fs.readFileSync(schemaPath, 'utf8');
                console.log(schema);
            }

            console.log('----------------------------------------');
            console.log('');
            console.log('6. Click "Run" to execute the SQL');
            console.log('7. Then run: npm run test-db');

        } else {
            console.log('✅ Database tables already exist!');
            console.log('🎉 Database setup is complete!');
        }

    } catch (error) {
        console.error('❌ Database setup failed:', error.message);
        console.log('');
        console.log('🔄 **FALLBACK: Manual Setup Required**');
        console.log('');
        console.log('Please follow these steps:');
        console.log('1. Open your Supabase dashboard');
        console.log('2. Go to SQL Editor');
        console.log('3. Run the SQL from database/schema.sql');

    }
}

if (require.main === module) {
    setupDatabaseTables().catch(console.error);
}

module.exports = { setupDatabaseTables };
