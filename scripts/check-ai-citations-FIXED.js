#!/usr/bin/env node
/**
 * FIXED: AI Citation Checker - Google AI Overviews via DataForSEO
 * Now with load_async_ai_overview: true to get ALL AI Overviews
 */

const fs = require('fs');
const { parse } = require('csv-parse/sync');

require('dotenv').config({ path: '.env.production' });

const ANALYSES_DIR = 'c:/Users/Ryan Nguyen/OneDrive/Desktop/Projects/oneclaw/.data/website-analyses';
const OUTPUT_FILE = 'c:/Users/Ryan Nguyen/OneDrive/Desktop/Projects/oneclaw/.data/ai-citation-results-FIXED.json';
const CHECKPOINT_FILE = 'c:/Users/Ryan Nguyen/OneDrive/Desktop/Projects/oneclaw/.data/citation-checkpoint-FIXED.json';

const DATAFORSEO_LOGIN = process.env.DATAFORSEO_LOGIN;
const DATAFORSEO_PASSWORD = process.env.DATAFORSEO_PASSWORD;
const BATCH_SIZE = 3;
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

  const citations = {
    business_name: business.business_name,
    location: business.location,
    website: business.website,
    aeo_score: business.overall_aeo_score,
    gbp_rating: business.gbp_rating,
    gbp_reviews: business.gbp_review_count,
    queries_tested: queries.length,
    cited_count: 0,
    citations: []
  };

  for (const query of queries) {
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
            load_async_ai_overview: true // FIXED!
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
      
      let citedInAI = false;
      let aiSnippet = '';
      
      if (aiOverview) {
        // Extract text from markdown or text field
        const aiText = aiOverview.markdown || aiOverview.text || '';
        aiSnippet = aiText.substring(0, 300);
        
        const businessNameVariations = [
          business.business_name,
          business.business_name.toLowerCase(),
          business.business_name.replace(/[&,.-]/g, '').trim()
        ];

        citedInAI = businessNameVariations.some(name => 
          aiText.toLowerCase().includes(name.toLowerCase())
        );
      }
      
      const inOrganicTop20 = organicResults.some(result => {
        const url = result.url || result.domain || '';
        return url.includes(business.website.replace(/^https?:\/\/(www\.)?/, ''));
      });

      if (citedInAI) {
        citations.cited_count++;
      }
      
      citations.citations.push({
        query,
        has_ai_overview: !!aiOverview,
        cited_in_ai: citedInAI,
        in_organic_top20: inOrganicTop20,
        ai_snippet: aiSnippet || 'No AI Overview',
        organic_position: organicResults.findIndex(r => 
          (r.url || '').includes(business.website.replace(/^https?:\/\/(www\.)?/, ''))
        ) + 1 || null
      });

      await sleep(1000);

    } catch (error) {
      console.log(`    Query failed: ${error.message}`);
      citations.citations.push({
        query,
        error: error.message,
        cited_in_ai: false
      });
    }
  }

  citations.citation_rate = (citations.cited_count / citations.queries_tested * 100).toFixed(1);
  
  return {
    success: true,
    citations,
    cost: 0.024 // DOUBLED: $0.012 per query * 2 queries (async AI costs 2x)
  };
}

async function checkAllCitations() {
  console.log('🔍 AI Citation Checker (FIXED - with async AI Overviews)\n');
  console.log('💰 Cost: ~$0.012 per query (doubled for async AI)\n');
  
  const analysisFiles = fs.readdirSync(ANALYSES_DIR).filter(f => f.endsWith('.json'));
  const businesses = analysisFiles.map(f => {
    const data = JSON.parse(fs.readFileSync(`${ANALYSES_DIR}/${f}`, 'utf-8'));
    return data;
  });

  console.log(`📊 Found ${businesses.length} businesses to check\n`);

  let checkpoint = loadCheckpoint();
  let startIndex = checkpoint.lastProcessedIndex + 1;
  
  if (startIndex > 0) {
    console.log(`📍 Resuming from business #${startIndex}\n`);
  }

  const businessesToCheck = businesses.slice(startIndex);
  console.log(`🎯 ${businessesToCheck.length} businesses to check\n`);

  let results = checkpoint.results || [];
  let totalCost = checkpoint.totalCost || 0;

  for (let i = 0; i < businessesToCheck.length; i += BATCH_SIZE) {
    const batch = businessesToCheck.slice(i, Math.min(i + BATCH_SIZE, businessesToCheck.length));
    const batchNum = Math.floor(i / BATCH_SIZE) + 1;
    const totalBatches = Math.ceil(businessesToCheck.length / BATCH_SIZE);
    
    console.log(`\n📦 Batch ${batchNum}/${totalBatches} (${batch.length} businesses)`);
    console.log('─'.repeat(60));

    const batchResults = await Promise.allSettled(
      batch.map(business => checkAICitation(business))
    );

    batchResults.forEach((result, idx) => {
      const business = batch[idx];
      
      if (result.status === 'fulfilled' && result.value.success) {
        const { citations, cost } = result.value;
        results.push(citations);
        totalCost += cost;
        
        const citationIcon = citations.cited_count > 0 ? '✅' : '❌';
        const aiIcon = citations.citations.some(c => c.has_ai_overview) ? '🤖' : '⚪';
        console.log(`  ${citationIcon}${aiIcon} ${business.business_name}: ${citations.cited_count}/${citations.queries_tested} queries (${citations.citation_rate}%)`);
      } else {
        const error = result.status === 'rejected' ? result.reason : 'Unknown error';
        console.log(`  ❌ ${business.business_name}: Error - ${error}`);
      }
    });

    const currentIndex = startIndex + i + batch.length - 1;
    saveCheckpoint({
      lastProcessedIndex: currentIndex,
      results,
      totalCost,
      timestamp: new Date().toISOString()
    });

    if (i + BATCH_SIZE < businessesToCheck.length) {
      console.log(`\n⏳ Waiting ${DELAY_MS / 1000}s...`);
      await sleep(DELAY_MS);
    }
  }

  const cited = results.filter(r => r.cited_count > 0).length;
  const notCited = results.filter(r => r.cited_count === 0).length;
  const avgCitationRate = (results.reduce((sum, r) => sum + parseFloat(r.citation_rate), 0) / results.length).toFixed(1);
  const withAI = results.filter(r => r.citations.some(c => c.has_ai_overview)).length;

  console.log('\n' + '='.repeat(60));
  console.log('✅ CITATION CHECK COMPLETE');
  console.log('='.repeat(60));
  console.log(`📊 Results:`);
  console.log(`   Total checked: ${results.length}`);
  console.log(`   Queries with AI Overview: ${withAI}`);
  console.log(`   Cited (at least once): ${cited} (${(cited/results.length*100).toFixed(1)}%)`);
  console.log(`   Never cited: ${notCited} (${(notCited/results.length*100).toFixed(1)}%)`);
  console.log(`   Average citation rate: ${avgCitationRate}%`);
  console.log(`   Total cost: $${totalCost.toFixed(2)}`);

  fs.writeFileSync(OUTPUT_FILE, JSON.stringify({
    generated_at: new Date().toISOString(),
    total_checked: results.length,
    with_ai_overview: withAI,
    cited_count: cited,
    not_cited_count: notCited,
    average_citation_rate: avgCitationRate,
    total_cost: totalCost,
    results: results.sort((a, b) => b.cited_count - a.cited_count)
  }, null, 2));

  console.log(`\n📁 Detailed results saved to: ${OUTPUT_FILE}`);
  
  if (fs.existsSync(CHECKPOINT_FILE)) {
    fs.unlinkSync(CHECKPOINT_FILE);
  }

  console.log('\n🏆 Top 10 Most Cited Businesses:');
  results
    .sort((a, b) => b.cited_count - a.cited_count)
    .slice(0, 10)
    .forEach((r, i) => {
      console.log(`   ${i+1}. ${r.business_name} (${r.location}) - ${r.cited_count}/${r.queries_tested} queries`);
    });

  console.log('\n🎯 Best Prospects (High reviews, NOT cited):');
  results
    .filter(r => r.cited_count === 0 && r.gbp_reviews > 50)
    .sort((a, b) => b.gbp_reviews - a.gbp_reviews)
    .slice(0, 10)
    .forEach((r, i) => {
      console.log(`   ${i+1}. ${r.business_name} - ${r.gbp_rating}⭐ (${r.gbp_reviews} reviews) - NOT CITED!`);
    });
}

function loadCheckpoint() {
  if (fs.existsSync(CHECKPOINT_FILE)) {
    try {
      return JSON.parse(fs.readFileSync(CHECKPOINT_FILE, 'utf-8'));
    } catch (e) {}
  }
  return { lastProcessedIndex: -1, results: [], totalCost: 0 };
}

function saveCheckpoint(data) {
  fs.writeFileSync(CHECKPOINT_FILE, JSON.stringify(data, null, 2), 'utf-8');
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

checkAllCitations().catch(err => {
  console.error('\n❌ Fatal error:', err);
  process.exit(1);
});
