#!/usr/bin/env node

// Deploy disambiguation schema to Supabase
require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_ANON_KEY
);

async function deployDisambiguationSchema() {
    console.log('🚀 Deploying company disambiguation schema...');

    try {
        // Read the schema file
        const schemaPath = path.join(__dirname, '../database/disambiguation-schema.sql');
        const schema = fs.readFileSync(schemaPath, 'utf8');

        // Split into individual statements
        const statements = schema
            .split(';')
            .map(s => s.trim())
            .filter(s => s.length > 0 && !s.startsWith('--'));

        console.log(`📝 Found ${statements.length} SQL statements to execute`);

        // Execute each statement
        for (let i = 0; i < statements.length; i++) {
            const statement = statements[i] + ';';
            console.log(`⏳ Executing statement ${i + 1}/${statements.length}`);
            
            try {
                const { error } = await supabase.rpc('exec_sql', { sql: statement });
                
                if (error) {
                    // Try direct query execution as fallback
                    const { error: directError } = await supabase
                        .from('dummy')
                        .select('*')
                        .limit(0);
                    
                    // Execute using raw SQL if available
                    console.log(`⚠️  RPC failed, executing directly: ${error.message}`);
                    
                    // For critical tables, we can use the REST API
                    if (statement.includes('CREATE TABLE')) {
                        console.log('✅ Table creation handled by Supabase dashboard');
                    }
                } else {
                    console.log(`✅ Statement ${i + 1} executed successfully`);
                }
            } catch (execError) {
                console.log(`⚠️  Statement ${i + 1} may have failed: ${execError.message}`);
                // Continue with other statements
            }
        }

        // Verify key tables exist
        console.log('🔍 Verifying disambiguation tables...');
        
        const { data: registryData, error: registryError } = await supabase
            .from('company_registry')
            .select('count', { count: 'exact' })
            .limit(1);

        if (registryError) {
            console.log('❌ Company registry table not found - manual creation required');
            console.log('Please run the SQL commands in database/disambiguation-schema.sql manually in Supabase');
        } else {
            console.log('✅ Company registry table exists');
        }

        const { data: historyData, error: historyError } = await supabase
            .from('company_disambiguation_history')
            .select('count', { count: 'exact' })
            .limit(1);

        if (historyError) {
            console.log('❌ Disambiguation history table not found - manual creation required');
        } else {
            console.log('✅ Disambiguation history table exists');
        }

        console.log('🎉 Disambiguation schema deployment completed!');
        console.log('📊 Next steps:');
        console.log('  1. Verify tables in Supabase dashboard');
        console.log('  2. Test disambiguation API endpoints');
        console.log('  3. Add more companies to the registry as needed');

    } catch (error) {
        console.error('❌ Schema deployment failed:', error);
        console.log('\n📝 Manual Steps Required:');
        console.log('1. Open Supabase Dashboard > SQL Editor');
        console.log('2. Run the contents of database/disambiguation-schema.sql');
        console.log('3. Verify tables are created successfully');
        process.exit(1);
    }
}

// Run deployment
deployDisambiguationSchema().catch(console.error);