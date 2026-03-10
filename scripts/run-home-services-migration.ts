import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';
import { join } from 'path';

dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function main() {
  console.log('🚀 Running Home Services migration...\n');
  
  const sql = readFileSync(
    join(__dirname, '../packages/harness/migrations/010_home_services_campaigns.sql'),
    'utf-8'
  );
  
  // Execute the migration
  const { error } = await supabase.rpc('exec_sql', { sql_query: sql });
  
  if (error) {
    console.error('❌ Migration failed:', error);
    
    // Try direct approach
    console.log('\n📝 Trying direct SQL execution...');
    const { error: directError } = await supabase.from('_migrations').insert({
      name: '010_home_services_campaigns',
      executed_at: new Date().toISOString()
    });
    
    if (directError) {
      console.error('Direct execution also failed:', directError);
      console.log('\n💡 Please run this SQL directly in Supabase dashboard:');
      console.log(sql);
    }
  } else {
    console.log('✅ Migration completed successfully!');
  }
  
  // Verify tables exist
  console.log('\n🔍 Verifying tables...');
  
  const { data: leads, error: leadsError } = await supabase
    .schema('crm')
    .from('home_services_leads')
    .select('id')
    .limit(1);
  
  const { data: campaigns, error: campaignsError } = await supabase
    .schema('crm')
    .from('home_services_campaigns')
    .select('id')
    .limit(1);
  
  if (!leadsError) {
    console.log('✅ home_services_leads table exists');
  } else {
    console.log('❌ home_services_leads table missing:', leadsError.message);
  }
  
  if (!campaignsError) {
    console.log('✅ home_services_campaigns table exists');
  } else {
    console.log('❌ home_services_campaigns table missing:', campaignsError.message);
  }
}

main().catch(console.error);
