/**
 * Debug script to understand Apify cost structure
 */

import dotenv from 'dotenv';

dotenv.config();

const APIFY_TOKEN = process.env.APIFY_API_TOKEN;
const ACTOR = 'code_crafter/leads-finder';

async function debugApifyCost() {
  console.log('Starting Apify run to debug cost...\n');
  
  // Start a run
  const runResponse = await fetch(
    `https://api.apify.com/v2/acts/${encodeURIComponent(ACTOR)}/runs?token=${APIFY_TOKEN}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        company_domain: ['acutehvac.com'],
        contact_location: ['united states'],
        fetch_count: 2,
        seniority_level: ['owner', 'founder', 'c_suite'],
        file_name: 'debug_cost_test'
      }),
    }
  );
  
  const runData = await runResponse.json();
  const runId = runData.data.id;
  
  console.log(`Run started: ${runId}`);
  console.log('Waiting for completion...\n');
  
  // Poll for completion
  let status = 'RUNNING';
  let attempts = 0;
  
  while (status === 'RUNNING' || status === 'READY') {
    if (attempts >= 60) break;
    
    await new Promise(resolve => setTimeout(resolve, 5000));
    
    const statusResponse = await fetch(
      `https://api.apify.com/v2/actor-runs/${runId}?token=${APIFY_TOKEN}`
    );
    
    const statusData = await statusResponse.json();
    status = statusData.data.status;
    attempts++;
    
    if (attempts % 6 === 0) {
      console.log(`Still running... (${attempts * 5}s)`);
    }
  }
  
  console.log(`\nRun ${status}\n`);
  
  // Get final data
  const finalResponse = await fetch(
    `https://api.apify.com/v2/actor-runs/${runId}?token=${APIFY_TOKEN}`
  );
  
  const finalData = await finalResponse.json();
  
  console.log('=== FULL RUN DATA ===');
  console.log(JSON.stringify(finalData.data, null, 2));
  
  console.log('\n=== COST ANALYSIS ===');
  console.log('usage:', finalData.data.usage);
  console.log('stats.computeUnits:', finalData.data.stats?.computeUnits);
  console.log('pricingInfo:', finalData.data.pricingInfo);
  
  // Check for usage-based pricing
  if (finalData.data.usage) {
    console.log('\nUsage details:');
    console.log(JSON.stringify(finalData.data.usage, null, 2));
  }
}

debugApifyCost().catch(console.error);
