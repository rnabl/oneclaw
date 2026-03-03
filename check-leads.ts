import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL || 'https://kaqatynbnaqdsfvfjlkt.supabase.co';
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImthcWF0eW5ibmFxZHNmdmZqbGt0Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MDkyOTk1NiwiZXhwIjoyMDg2NTA1OTU2fQ.LP3iRu3ue-dzmZV_6Dl736s0pSxgiHLL5vtL9PcFBXo';

const supabase = createClient(supabaseUrl, supabaseKey);

async function checkLeads() {
  // Count total leads
  const { count: totalCount, error: countError } = await supabase
    .schema('crm')
    .from('leads')
    .select('*', { count: 'exact', head: true })
    .eq('industry', 'HVAC');

  if (countError) {
    console.error('Error counting leads:', countError);
    return;
  }

  console.log(`\n📊 Total HVAC leads in database: ${totalCount || 0}`);

  // Get sample leads with analysis data
  const { data: sampleLeads, error: sampleError } = await supabase
    .schema('crm')
    .from('leads')
    .select('company_name, website, email, city, state, audit_data')
    .eq('industry', 'HVAC')
    .limit(5);

  if (sampleError) {
    console.error('Error fetching sample leads:', sampleError);
    return;
  }

  console.log(`\n🔍 Sample leads with analysis:`);
  sampleLeads?.forEach((lead, i) => {
    console.log(`\n${i + 1}. ${lead.company_name}`);
    console.log(`   Website: ${lead.website || 'N/A'}`);
    console.log(`   Email: ${lead.email || 'N/A'}`);
    console.log(`   Location: ${lead.city}, ${lead.state}`);
    console.log(`   Has audit data: ${!!lead.audit_data}`);
  });

  // Count leads by stage
  const { data: stageData, error: stageError } = await supabase
    .schema('crm')
    .from('leads')
    .select('stage')
    .eq('industry', 'HVAC');

  if (!stageError && stageData) {
    const stages = stageData.reduce((acc: any, lead: any) => {
      acc[lead.stage || 'unknown'] = (acc[lead.stage || 'unknown'] || 0) + 1;
      return acc;
    }, {});

    console.log(`\n📈 Leads by stage:`);
    Object.entries(stages).forEach(([stage, count]) => {
      console.log(`   ${stage}: ${count}`);
    });
  }

  // Count leads with emails
  const { count: emailCount, error: emailError } = await supabase
    .schema('crm')
    .from('leads')
    .select('*', { count: 'exact', head: true })
    .eq('industry', 'HVAC')
    .not('email', 'is', null);

  console.log(`\n📧 Leads with email addresses: ${emailCount || 0}`);

  // Count leads with analysis
  const { count: analysisCount, error: analysisError } = await supabase
    .schema('crm')
    .from('leads')
    .select('*', { count: 'exact', head: true })
    .eq('industry', 'HVAC')
    .not('audit_data', 'is', null);

  console.log(`\n🔬 Leads with website analysis: ${analysisCount || 0}`);
}

checkLeads().catch(console.error);
