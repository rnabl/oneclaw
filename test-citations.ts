import { config } from 'dotenv';
import { createClient } from '@supabase/supabase-js';

config();

const supabaseUrl = process.env.SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const apifyToken = process.env.APIFY_API_TOKEN || process.env.APIFY_TOKEN;

if (!apifyToken) {
  console.error('❌ APIFY_API_TOKEN not found in .env');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

// State name to abbreviation mapping
const stateAbbreviations: Record<string, string> = {
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

function getStateAbbreviation(state: string): string {
  // Already abbreviated?
  if (state.length === 2) return state.toUpperCase();
  // Look up full name
  return stateAbbreviations[state] || state;
}

async function testCitationCheck() {
  console.log('🔍 Testing Citation God Mode integration...\n');
  
  // Get a sample HVAC business
  const { data: leads, error } = await supabase
    .schema('crm')
    .from('leads')
    .select('*')
    .eq('industry', 'HVAC')
    .not('city', 'is', null)
    .not('state', 'is', null)
    .limit(1);
  
  if (error || !leads || leads.length === 0) {
    console.error('❌ No HVAC leads found');
    return;
  }
  
  const lead = leads[0];
  const stateAbbr = getStateAbbreviation(lead.state);
  
  console.log(`📋 Testing with: ${lead.company_name}`);
  console.log(`   Location: ${lead.city}, ${stateAbbr} (${lead.state})`);
  console.log(`   Website: ${lead.website}\n`);
  
  // Run Apify Citation God Mode
  console.log('🚀 Starting Apify Citation God Mode actor...');
  
  const runUrl = 'https://api.apify.com/v2/acts/alizarin_refrigerator-owner~citation-god-mode/runs';
  
  const runInput = {
    businessName: lead.company_name,
    city: lead.city,
    state: stateAbbr,
    website: lead.website,
    // Options
    useMoz: true,
    directScrape: true,
    useAiExtraction: true,
    crossValidate: true,
  };
  
  try {
    const runResponse = await fetch(runUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apifyToken}`,
      },
      body: JSON.stringify(runInput),
    });
    
    if (!runResponse.ok) {
      const error = await runResponse.text();
      console.error('❌ Failed to start actor:', error);
      return;
    }
    
    const run = await runResponse.json();
    const runId = run.data.id;
    
    console.log(`✅ Started run: ${runId}`);
    console.log(`🔗 View at: https://console.apify.com/actors/runs/${runId}\n`);
    console.log('⏳ Waiting for completion (this may take 2-5 minutes)...\n');
    
    // Poll for completion
    let status = 'RUNNING';
    let attempts = 0;
    const maxAttempts = 120; // 10 minutes
    
    while (status === 'RUNNING' && attempts < maxAttempts) {
      await new Promise(resolve => setTimeout(resolve, 5000));
      
      const statusResponse = await fetch(
        `https://api.apify.com/v2/acts/alizarin_refrigerator-owner~citation-god-mode/runs/${runId}`,
        {
          headers: { 'Authorization': `Bearer ${apifyToken}` },
        }
      );
      
      const statusData = await statusResponse.json();
      status = statusData.data.status;
      attempts++;
      
      if (attempts % 6 === 0) { // Every 30 seconds
        console.log(`   Still running... (${Math.floor(attempts * 5 / 60)}m ${(attempts * 5) % 60}s)`);
      }
    }
    
    console.log(`\n✅ Run completed with status: ${status}\n`);
    
    if (status !== 'SUCCEEDED') {
      console.error('❌ Run did not succeed');
      return;
    }
    
    // Get results
    const datasetUrl = `https://api.apify.com/v2/acts/alizarin_refrigerator-owner~citation-god-mode/runs/${runId}/dataset/items`;
    
    const datasetResponse = await fetch(datasetUrl, {
      headers: { 'Authorization': `Bearer ${apifyToken}` },
    });
    
    const results = await datasetResponse.json();
    
    if (!results || results.length === 0) {
      console.log('⚠️  No results returned');
      return;
    }
    
    const citationData = results[0];
    
    console.log('📊 Citation Analysis Results:\n');
    console.log(`   Total Citations Found: ${citationData.totalCitationsFound || 0}`);
    console.log(`   Directories Checked: ${citationData.totalDirectoriesChecked || 0}`);
    console.log(`   Consistency Score: ${citationData.consistencyScore || 0}/100\n`);
    
    if (citationData.canonicalNap) {
      console.log('✅ Canonical NAP:');
      console.log(`   Name: ${citationData.canonicalNap.name}`);
      console.log(`   Address: ${citationData.canonicalNap.address}`);
      console.log(`   Phone: ${citationData.canonicalNap.phone}\n`);
    }
    
    if (citationData.inconsistencies && citationData.inconsistencies.length > 0) {
      console.log(`⚠️  Found ${citationData.inconsistencies.length} inconsistencies:\n`);
      citationData.inconsistencies.slice(0, 5).forEach((issue: any, i: number) => {
        console.log(`   ${i + 1}. ${issue.directory || issue.source}`);
        console.log(`      Issue: ${issue.description || issue.issue}`);
        if (issue.foundName) console.log(`      Found: ${issue.foundName}`);
      });
    }
    
    if (citationData.recommendations && citationData.recommendations.length > 0) {
      console.log(`\n💡 Recommendations:\n`);
      citationData.recommendations.slice(0, 5).forEach((rec: string, i: number) => {
        console.log(`   ${i + 1}. ${rec}`);
      });
    }
    
    console.log('\n✅ Test complete!');
    console.log('\nℹ️  Note: This actor may be in development. Check the console link for full results.');
    
  } catch (error) {
    console.error('❌ Error:', error);
  }
}

testCitationCheck().catch(console.error);
