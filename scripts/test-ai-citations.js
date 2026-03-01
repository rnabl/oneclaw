#!/usr/bin/env node
/**
 * TEST: AI Citation Checker - First 5 businesses only
 * Testing load_async_ai_overview: true parameter
 */

const fs = require('fs');

require('dotenv').config({ path: '.env.production' });

const ANALYSES_DIR = 'c:/Users/Ryan Nguyen/OneDrive/Desktop/Projects/oneclaw/.data/website-analyses';

const DATAFORSEO_LOGIN = process.env.DATAFORSEO_LOGIN;
const DATAFORSEO_PASSWORD = process.env.DATAFORSEO_PASSWORD;
const DELAY_MS = 3000;

if (!DATAFORSEO_LOGIN || !DATAFORSEO_PASSWORD) {
  console.error('❌ DATAFORSEO credentials not found');
  process.exit(1);
}

const DATAFORSEO_AUTH = Buffer.from(`${DATAFORSEO_LOGIN}:${DATAFORSEO_PASSWORD}`).toString('base64');

async function checkAICitation(business) {
  const queries = [
    `Best HVAC company in ${business.location}`,
    `Top rated heating and cooling services ${business.location}`
  ];

  console.log(`\n🔍 Checking: ${business.business_name} (${business.location})`);
  console.log(`   Website: ${business.website}`);
  console.log(`   AEO Score: ${business.overall_aeo_score}/100`);

  for (const query of queries) {
    console.log(`\n   Query: "${query}"`);
    
    try {
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
            load_async_ai_overview: true // TESTING THIS FIX!
          }])
        }
      );

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const result = await response.json();
      
      if (!result.tasks || !result.tasks[0] || !result.tasks[0].result) {
        throw new Error('No results from DataForSEO');
      }

      const items = result.tasks[0].result[0]?.items || [];
      const aiOverview = items.find(item => item.type === 'ai_overview');
      const organicResults = items.filter(item => item.type === 'organic');
      
      if (aiOverview) {
        console.log(`   ✅ AI Overview FOUND!`);
        const aiText = aiOverview.markdown || aiOverview.text || '';
        console.log(`   📝 Snippet: ${aiText.substring(0, 200)}...`);
        
        const businessNameVariations = [
          business.business_name,
          business.business_name.toLowerCase(),
          business.business_name.replace(/[&,.-]/g, '').trim()
        ];

        const citedInAI = businessNameVariations.some(name => 
          aiText.toLowerCase().includes(name.toLowerCase())
        );
        
        if (citedInAI) {
          console.log(`   🎯 CITED in AI Overview!`);
        } else {
          console.log(`   ❌ NOT cited in AI Overview`);
        }
      } else {
        console.log(`   ⚪ No AI Overview for this query`);
      }
      
      const inOrganicTop20 = organicResults.some(result => {
        const url = result.url || result.domain || '';
        return url.includes(business.website.replace(/^https?:\/\/(www\.)?/, ''));
      });
      
      console.log(`   ${inOrganicTop20 ? '✅' : '❌'} In organic top 20: ${inOrganicTop20}`);

      await sleep(1000);

    } catch (error) {
      console.log(`   ❌ Query failed: ${error.message}`);
    }
  }
}

async function testCitations() {
  console.log('🧪 TESTING AI Citation Checker (First 5 businesses)\n');
  console.log('💰 Test cost: ~$0.12 (5 businesses × 2 queries × $0.012)\n');
  console.log('─'.repeat(60));
  
  const analysisFiles = fs.readdirSync(ANALYSES_DIR)
    .filter(f => f.endsWith('.json'))
    .slice(0, 5); // TEST: Only first 5!
  
  const businesses = analysisFiles.map(f => {
    const data = JSON.parse(fs.readFileSync(`${ANALYSES_DIR}/${f}`, 'utf-8'));
    return data;
  });

  console.log(`📊 Testing ${businesses.length} businesses\n`);

  for (let i = 0; i < businesses.length; i++) {
    await checkAICitation(businesses[i]);
    
    if (i < businesses.length - 1) {
      console.log(`\n⏳ Waiting ${DELAY_MS / 1000}s before next business...`);
      await sleep(DELAY_MS);
    }
  }

  console.log('\n' + '='.repeat(60));
  console.log('✅ TEST COMPLETE');
  console.log('='.repeat(60));
  console.log('\nIf results look good, run the full check:');
  console.log('node scripts/check-ai-citations-FIXED.js');
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

testCitations().catch(err => {
  console.error('\n❌ Fatal error:', err);
  process.exit(1);
});
