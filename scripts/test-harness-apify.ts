/**
 * Test calling Apify through the harness - NOTHING ELSE
 */

import dotenv from 'dotenv';

dotenv.config();

async function testHarnessApify() {
  console.log('🧪 Testing Apify through harness\n');
  
  const testUrl = 'https://www.acutehvac.com';
  const businessName = 'Acute Heating & Cooling';
  
  console.log(`URL: ${testUrl}`);
  console.log(`Business: ${businessName}\n`);
  
  console.log('📤 Calling harness API...');
  
  const response = await fetch('http://localhost:9000/execute', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      workflowId: 'enrich-contact',
      tenantId: 'test-apify',
      tier: 'enterprise',
      input: {
        url: testUrl,
        businessName: businessName,
        method: 'auto'
      }
    })
  });
  
  if (!response.ok) {
    console.error('❌ Harness API error:', response.status);
    process.exit(1);
  }
  
  const result = await response.json();
  console.log(`✅ Job started: ${result.jobId}\n`);
  
  // Poll for completion
  console.log('⏳ Waiting for job to complete...\n');
  let jobStatus = result.status;
  let attempts = 0;
  
  while (jobStatus === 'running' && attempts < 120) {
    await new Promise(resolve => setTimeout(resolve, 5000));
    
    const statusResponse = await fetch(`http://localhost:9000/jobs/${result.jobId}/status`);
    const statusData = await statusResponse.json();
    jobStatus = statusData.status;
    attempts++;
    
    if (attempts % 6 === 0) {
      console.log(`   Still running... (${attempts * 5}s)`);
    }
  }
  
  console.log(`\n✅ Job ${jobStatus}\n`);
  
  // Get result
  const jobResponse = await fetch(`http://localhost:9000/jobs/${result.jobId}`);
  const jobData = await jobResponse.json();
  const output = jobData.job.output;
  
  console.log('📊 Result:');
  console.log(`   Source: ${output.source}`);
  console.log(`   Cost: $${output.cost}`);
  console.log(`   Owner: ${output.owner ? output.owner.name : 'None'}`);
  console.log(`   Contacts: ${output.contacts ? output.contacts.length : 0}`);
  console.log('');
  
  if (output.owner) {
    console.log('👤 Owner:');
    console.log(`   Name: ${output.owner.name}`);
    console.log(`   Title: ${output.owner.title || 'N/A'}`);
    console.log(`   Email: ${output.owner.email || 'N/A'}`);
    console.log(`   Phone: ${output.owner.phone || 'N/A'}`);
    console.log(`   LinkedIn: ${output.owner.linkedin || 'N/A'}`);
  }
  
  if (output.contacts && output.contacts.length > 0) {
    console.log(`\n👥 ${output.contacts.length} Contact(s):`);
    output.contacts.forEach((c: any, i: number) => {
      console.log(`\n${i + 1}. ${c.name}`);
      console.log(`   Title: ${c.title || 'N/A'}`);
      console.log(`   Email: ${c.email || 'N/A'}`);
      console.log(`   Phone: ${c.phone || 'N/A'}`);
    });
  }
  
  console.log('\n✅ Test complete!');
}

testHarnessApify().catch(console.error);
