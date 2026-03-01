#!/usr/bin/env node
/**
 * AI Citation Checker - Using Perplexity (Real-time AI search)
 * Tests first 5 businesses
 */

const fs = require('fs');

require('dotenv').config({ path: '.env.production' });

const ANALYSES_DIR = 'c:/Users/Ryan Nguyen/OneDrive/Desktop/Projects/oneclaw/.data/website-analyses';

const PERPLEXITY_API_KEY = process.env.PERPLEXITY_API_KEY;
const BATCH_SIZE = 2;
const DELAY_MS = 5000;

if (!PERPLEXITY_API_KEY) {
  console.error('❌ PERPLEXITY_API_KEY not found');
  process.exit(1);
}

async function checkAICitation(business) {
  const queries = [
    `Best HVAC companies in ${business.location}`,
    `Top rated heating and cooling services ${business.location}`
  ];

  console.log(`\n🔍 Checking: ${business.business_name} (${business.location})`);
  console.log(`   Website: ${business.website}`);

  let totalCited = 0;
  const allMentionedBusinesses = new Set();

  for (const query of queries) {
    console.log(`\n   Query: "${query}"`);
    
    try {
      const response = await fetch('https://api.perplexity.ai/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${PERPLEXITY_API_KEY}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model: 'sonar',
          messages: [{
            role: 'user',
            content: `${query}

Extract EVERY HVAC/heating/cooling company name mentioned in the search results above.

Return in this exact format:
CITED: [list all company names mentioned, separated by semicolons]
IS_TARGET_CITED: YES or NO (is "${business.business_name}" mentioned?)

Be thorough - include ALL business names found.`
          }]
        })
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const result = await response.json();
      const answer = result.choices[0]?.message?.content || '';
      
      // Extract all cited companies
      const citedMatch = answer.match(/CITED:\s*(.+?)(?:\n|$)/i);
      if (citedMatch) {
        const companies = citedMatch[1].split(';').map(c => c.trim()).filter(Boolean);
        companies.forEach(c => allMentionedBusinesses.add(c));
        console.log(`   📋 Found ${companies.length} companies: ${companies.join(', ')}`);
      }
      
      // Check if target is cited
      const isCited = answer.match(/IS_TARGET_CITED:\s*YES/i);
      
      if (isCited) {
        console.log(`   ✅ TARGET CITED!`);
        totalCited++;
      } else {
        console.log(`   ❌ Target NOT cited`);
      }

      await sleep(2000);

    } catch (error) {
      console.log(`   ❌ Query failed: ${error.message}`);
    }
  }

  console.log(`\n   📊 Result: ${totalCited}/${queries.length} queries cited (${(totalCited/queries.length*100).toFixed(0)}%)`);
  console.log(`   🏢 Total unique companies mentioned: ${allMentionedBusinesses.size}`);
  
  return Array.from(allMentionedBusinesses);
}

async function testCitations() {
  console.log('🧪 TESTING AI Citation Checker - Perplexity Method\n');
  console.log('💰 Test cost: ~$0.10 (5 businesses × 2 queries × $0.01)\n');
  console.log('─'.repeat(60));
  
  const analysisFiles = fs.readdirSync(ANALYSES_DIR)
    .filter(f => f.endsWith('.json'))
    .slice(0, 5);
  
  const businesses = analysisFiles.map(f => {
    const data = JSON.parse(fs.readFileSync(`${ANALYSES_DIR}/${f}`, 'utf-8'));
    return data;
  });

  console.log(`📊 Testing ${businesses.length} businesses\n`);

  const allCompetitors = new Set();

  for (let i = 0; i < businesses.length; i++) {
    const competitors = await checkAICitation(businesses[i]);
    competitors.forEach(c => allCompetitors.add(c));
    
    if (i < businesses.length - 1) {
      console.log(`\n⏳ Waiting ${DELAY_MS / 1000}s before next business...`);
      await sleep(DELAY_MS);
    }
  }

  console.log('\n' + '='.repeat(60));
  console.log('✅ TEST COMPLETE');
  console.log('='.repeat(60));
  console.log(`\n🏢 Total unique businesses mentioned across all queries: ${allCompetitors.size}`);
  console.log('\n📋 All mentioned companies:');
  Array.from(allCompetitors).sort().forEach((c, i) => {
    console.log(`   ${i+1}. ${c}`);
  });
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

testCitations().catch(err => {
  console.error('\n❌ Fatal error:', err);
  process.exit(1);
});
