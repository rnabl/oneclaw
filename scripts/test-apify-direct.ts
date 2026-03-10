/**
 * Test Apify integration directly - ONE website only
 */

import dotenv from 'dotenv';

dotenv.config();

const APIFY_TOKEN = process.env.APIFY_API_TOKEN || process.env.APIFY_TOKEN;
const APIFY_ACTOR = 'code_crafter/leads-finder';

async function testApify() {
  console.log('🧪 Testing Apify directly with ONE website\n');
  
  const testUrl = 'https://www.acutehvac.com';
  const businessName = 'Acute Heating & Cooling';
  
  console.log(`URL: ${testUrl}`);
  console.log(`Business: ${businessName}`);
  console.log(`Actor: ${APIFY_ACTOR}`);
  console.log(`Token: ${APIFY_TOKEN ? '✅ Present' : '❌ Missing'}\n`);
  
  if (!APIFY_TOKEN) {
    console.error('❌ APIFY_TOKEN not found in environment');
    process.exit(1);
  }
  
  // Extract domain
  const domain = testUrl.replace(/^https?:\/\//, '').replace(/^www\./, '').split('/')[0];
  
  // Generate file_name
  const fileName = businessName
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
  
  console.log(`Domain: ${domain}`);
  console.log(`File name: ${fileName}\n`);
  
  const actorInput = {
    company_domain: [domain],
    contact_location: ['united states'],
    fetch_count: 5,
    seniority_level: [
      'manager',
      'founder',
      'owner',
      'c_suite',
      'director',
      'partner',
      'vp',
      'head'
    ],
    file_name: fileName
  };
  
  console.log('📤 Starting Apify actor...');
  console.log('Input:', JSON.stringify(actorInput, null, 2), '\n');
  
  // Start the actor
  const runResponse = await fetch(
    `https://api.apify.com/v2/acts/${encodeURIComponent(APIFY_ACTOR)}/runs?token=${APIFY_TOKEN}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(actorInput),
    }
  );
  
  if (!runResponse.ok) {
    const error = await runResponse.text();
    console.error('❌ Failed to start actor:', error);
    process.exit(1);
  }
  
  const runData = await runResponse.json();
  const runId = runData.data.id;
  
  console.log(`✅ Run started: ${runId}`);
  console.log(`View at: https://console.apify.com/actors/runs/${runId}\n`);
  console.log('⏳ Polling for completion (this takes 2-5 minutes)...\n');
  
  // Poll for completion
  let status = 'RUNNING';
  let attempts = 0;
  const maxAttempts = 120; // 10 minutes
  
  while (status === 'RUNNING' || status === 'READY') {
    if (attempts >= maxAttempts) {
      console.error('❌ Timed out after 10 minutes');
      process.exit(1);
    }
    
    await new Promise(resolve => setTimeout(resolve, 5000));
    
    const statusResponse = await fetch(
      `https://api.apify.com/v2/actor-runs/${runId}?token=${APIFY_TOKEN}`
    );
    
    const statusData = await statusResponse.json();
    status = statusData.data.status;
    attempts++;
    
    if (attempts % 6 === 0) {
      console.log(`   Status: ${status} (${attempts * 5}s elapsed)`);
    }
  }
  
  console.log(`\n✅ Final status: ${status}\n`);
  
  if (status !== 'SUCCEEDED') {
    console.error(`❌ Actor failed: ${status}`);
    process.exit(1);
  }
  
  // Fetch results
  const datasetId = runData.data.defaultDatasetId;
  
  const datasetResponse = await fetch(
    `https://api.apify.com/v2/datasets/${datasetId}/items?token=${APIFY_TOKEN}&format=json`
  );
  
  const results = await datasetResponse.json();
  
  console.log(`📊 Got ${results.length} contacts:\n`);
  
  results.forEach((contact: any, i: number) => {
    console.log(`${i + 1}. ${contact.name || contact.fullName || 'Unknown'}`);
    console.log(`   Title: ${contact.title || contact.jobTitle || 'N/A'}`);
    console.log(`   Email: ${contact.email || contact.workEmail || 'N/A'}`);
    console.log(`   Phone: ${contact.phone || contact.mobileNumber || 'N/A'}`);
    console.log(`   LinkedIn: ${contact.linkedinUrl || contact.linkedin || 'N/A'}`);
    console.log('');
  });
  
  console.log('✅ Test complete!');
}

testApify().catch(console.error);
