#!/usr/bin/env node
/**
 * Test DataForSEO AI Overview extraction
 */

require('dotenv').config({ path: '.env.production' });

const DATAFORSEO_LOGIN = process.env.DATAFORSEO_LOGIN;
const DATAFORSEO_PASSWORD = process.env.DATAFORSEO_PASSWORD;
const DATAFORSEO_AUTH = Buffer.from(`${DATAFORSEO_LOGIN}:${DATAFORSEO_PASSWORD}`).toString('base64');

async function testAIOverview() {
  console.log('🔍 Testing DataForSEO AI Overview extraction\n');
  
  const query = 'Best HVAC company in Denver Colorado';
  
  const response = await fetch(
    'https://api.dataforseo.com/v3/serp/google/organic/live/advanced',
    {
      method: 'POST',
      headers: { 
        'Authorization': `Basic ${DATAFORSEO_AUTH}`,
        'Content-Type': 'application/json' 
      },
      body: JSON.stringify([{
        keyword: query,
        location_code: 2840,
        language_code: 'en',
        device: 'desktop',
        os: 'windows',
        depth: 20
      }])
    }
  );

  const result = await response.json();
  
  console.log('Full response:');
  console.log(JSON.stringify(result, null, 2));
  
  if (result.tasks && result.tasks[0] && result.tasks[0].result) {
    const items = result.tasks[0].result[0]?.items || [];
    
    console.log(`\n\n📊 Found ${items.length} items\n`);
    
    items.forEach((item, i) => {
      console.log(`${i+1}. Type: ${item.type}`);
      if (item.type === 'ai_overview') {
        console.log(`   AI OVERVIEW FOUND!`);
        console.log(`   Keys: ${Object.keys(item).join(', ')}`);
        console.log(`   Content: ${JSON.stringify(item, null, 2).substring(0, 500)}`);
      }
    });
  }
}

testAIOverview().catch(console.error);
