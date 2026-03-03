import { config } from 'dotenv';
import { createClient } from '@supabase/supabase-js';
import { checkCitationsHandler } from './packages/harness/src/tools/check-citations-free';

config();

const supabaseUrl = process.env.SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

// State abbreviation mapping
const STATE_ABBR: Record<string, string> = {
  'Alabama': 'AL', 'Alaska': 'AK', 'Arizona': 'AZ', 'Arkansas': 'AR',
  'California': 'CA', 'Colorado': 'CO', 'Connecticut': 'CT', 'Delaware': 'DE',
  'Florida': 'FL', 'Georgia': 'GA', 'Hawaii': 'HI', 'Idaho': 'ID',
  'Illinois': 'IL', 'Indiana': 'IN', 'Iowa': 'IA', 'Kansas': 'KS',
  'Kentucky': 'KY', 'Louisiana': 'LA', 'Maine': 'ME', 'Maryland': 'MD',
  'Massachusetts': 'MA', 'Michigan': 'MI', 'Minnesota': 'MN', 'Mississippi': 'MS',
  'Missouri': 'MO', 'Montana': 'MT', 'Nebraska': 'NE', 'Nevada': 'NV',
  'New Hampshire': 'NH', 'New Jersey': 'NJ', 'New Mexico': 'NM', 'New York': 'NY',
  'North Carolina': 'NC', 'North Dakota': 'ND', 'Ohio': 'OH', 'Oklahoma': 'OK',
  'Oregon': 'OR', 'Pennsylvania': 'PA', 'Rhode Island': 'RI', 'South Carolina': 'SC',
  'South Dakota': 'SD', 'Tennessee': 'TN', 'Texas': 'TX', 'Utah': 'UT',
  'Vermont': 'VT', 'Virginia': 'VA', 'Washington': 'WA', 'West Virginia': 'WV',
  'Wisconsin': 'WI', 'Wyoming': 'WY', 'District of Columbia': 'DC'
};

function getStateAbbr(state: string): string {
  if (!state) return '';
  if (state.length === 2) return state.toUpperCase();
  return STATE_ABBR[state] || state;
}

async function batchCheckCitations() {
  console.log('🚀 Starting batch citation check for all 615 HVAC businesses...\n');
  
  // Fetch all HVAC leads that don't already have citation data
  const { data: leads, error: fetchError } = await supabase
    .schema('crm')
    .from('leads')
    .select('id, company_name, city, state, phone, audit_data')
    .eq('industry', 'HVAC')
    .not('city', 'is', null)
    .not('state', 'is', null)
    .order('id');
  
  if (fetchError) {
    console.error('❌ Error fetching leads:', fetchError);
    return;
  }
  
  if (!leads || leads.length === 0) {
    console.log('⚠️  No HVAC leads found');
    return;
  }
  
  console.log(`📊 Found ${leads.length} HVAC businesses to check\n`);
  
  let processed = 0;
  let succeeded = 0;
  let failed = 0;
  let skipped = 0;
  
  const startTime = Date.now();
  
  // Process in batches of 10 to avoid overwhelming the system
  const batchSize = 10;
  
  for (let i = 0; i < leads.length; i += batchSize) {
    const batch = leads.slice(i, i + batchSize);
    
    console.log(`\n📦 Processing batch ${Math.floor(i / batchSize) + 1}/${Math.ceil(leads.length / batchSize)} (${i + 1}-${Math.min(i + batchSize, leads.length)} of ${leads.length})`);
    
    // Process batch in parallel
    const results = await Promise.allSettled(
      batch.map(async (lead) => {
        try {
          const stateAbbr = getStateAbbr(lead.state);
          
          if (!stateAbbr) {
            console.log(`  ⏭️  Skipping ${lead.company_name} (invalid state: ${lead.state})`);
            skipped++;
            return;
          }
          
          // Run citation check
          const citationResult = await checkCitationsHandler({
            businessName: lead.company_name,
            city: lead.city,
            state: stateAbbr,
            phone: lead.phone || undefined,
          }, { tenantId: 'batch-check' });
          
          // Update the lead with citation data
          const updatedAuditData = {
            ...(lead.audit_data || {}),
            nap_citations: {
              score: citationResult.consistencyScore,
              citations_found: citationResult.citationsFound,
              citations_checked: citationResult.citationsChecked,
              summary: `Found on ${citationResult.citationsFound}/${citationResult.citationsChecked} directories with ${citationResult.consistencyScore}% consistency`,
              results: citationResult.results,
              checked_at: new Date().toISOString(),
            },
          };
          
          const { error: updateError } = await supabase
            .schema('crm')
            .from('leads')
            .update({
              audit_data: updatedAuditData,
            })
            .eq('id', lead.id);
          
          if (updateError) {
            throw updateError;
          }
          
          console.log(`  ✅ ${lead.company_name.padEnd(40)} ${citationResult.citationsFound}/${citationResult.citationsChecked} (${citationResult.consistencyScore}%)`);
          succeeded++;
          
        } catch (error) {
          console.error(`  ❌ ${lead.company_name.padEnd(40)} Error: ${error instanceof Error ? error.message : String(error)}`);
          failed++;
          throw error;
        }
      })
    );
    
    processed += batch.length;
    
    // Progress update
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(0);
    const rate = (succeeded / (Date.now() - startTime) * 1000).toFixed(1);
    const eta = ((leads.length - processed) / parseFloat(rate)).toFixed(0);
    
    console.log(`\n   Progress: ${processed}/${leads.length} | ✅ ${succeeded} | ❌ ${failed} | ⏭️  ${skipped}`);
    console.log(`   Time: ${elapsed}s elapsed | ${rate}/sec | ETA: ${eta}s\n`);
    
    // Small delay between batches to be respectful
    if (i + batchSize < leads.length) {
      await new Promise(resolve => setTimeout(resolve, 2000));
    }
  }
  
  const totalTime = ((Date.now() - startTime) / 1000 / 60).toFixed(1);
  
  console.log('\n' + '='.repeat(60));
  console.log('✅ Batch citation check complete!\n');
  console.log(`   Total: ${leads.length}`);
  console.log(`   ✅ Succeeded: ${succeeded}`);
  console.log(`   ❌ Failed: ${failed}`);
  console.log(`   ⏭️  Skipped: ${skipped}`);
  console.log(`   ⏱️  Time: ${totalTime} minutes`);
  console.log(`   💰 Cost: $0.00 (FREE!)`);
  console.log('='.repeat(60) + '\n');
  
  // Show some stats
  const { data: stats } = await supabase
    .schema('crm')
    .from('leads')
    .select('audit_data')
    .eq('industry', 'HVAC')
    .not('audit_data->nap_citations', 'is', null);
  
  if (stats) {
    const scores = stats
      .map(s => s.audit_data?.nap_citations?.score)
      .filter(s => typeof s === 'number');
    
    if (scores.length > 0) {
      const avgScore = (scores.reduce((a, b) => a + b, 0) / scores.length).toFixed(0);
      const minScore = Math.min(...scores);
      const maxScore = Math.max(...scores);
      
      console.log('📊 Citation Statistics:');
      console.log(`   Average Score: ${avgScore}%`);
      console.log(`   Range: ${minScore}% - ${maxScore}%`);
      console.log(`   Businesses with data: ${stats.length}`);
    }
  }
}

batchCheckCitations().catch(console.error);
