#!/usr/bin/env node
/**
 * DEBUG: Check raw DataForSEO response for ONE query
 */

const fs = require('fs');

require('dotenv').config({ path: '.env.production' });

const DATAFORSEO_LOGIN = process.env.DATAFORSEO_LOGIN;
const DATAFORSEO_PASSWORD = process.env.DATAFORSEO_PASSWORD;

if (!DATAFORSEO_LOGIN || !DATAFORSEO_PASSWORD) {
  console.error('❌ DATAFORSEO credentials not found');
  process.exit(1);
}

const DATAFORSEO_AUTH = Buffer.from(`${DATAFORSEO_LOGIN}:${DATAFORSEO_PASSWORD}`).toString('base64');

async function debugQuery() {
  const query = "Best HVAC company in Phoenix Arizona";
  
  console.log(`🔍 Testing query: "${query}"\n`);
  console.log('📤 Sending request with load_async_ai_overview: true\n');

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
        depth: 20,
        calculate_rectangles: false,
        load_async_ai_overview: true
      }])
    }
  );

  if (!response.ok) {
    console.error(`❌ HTTP ${response.status}: ${response.statusText}`);
    process.exit(1);
  }

  const result = await response.json();
  
  console.log('📦 Full Response Structure:');
  console.log(JSON.stringify(result, null, 2));
  
  console.log('\n\n🔍 Items found:');
  const items = result.tasks[0].result[0]?.items || [];
  items.forEach((item, i) => {
    console.log(`\n${i+1}. Type: ${item.type}`);
    if (item.type === 'ai_overview') {
      console.log('   🎯 AI OVERVIEW DETECTED!');
      console.log(`   Has markdown: ${!!item.markdown}`);
      console.log(`   Has text: ${!!item.text}`);
      console.log(`   Has expanded_element: ${!!item.expanded_element}`);
      if (item.markdown) {
        console.log(`   Markdown preview: ${item.markdown.substring(0, 300)}`);
      }
    }
  });
  
  const aiOverview = items.find(item => item.type === 'ai_overview');
  console.log(`\n\n✅ AI Overview present: ${!!aiOverview}`);
}

debugQuery().catch(err => {
  console.error('\n❌ Error:', err);
  process.exit(1);
});
