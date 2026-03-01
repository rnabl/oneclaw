#!/usr/bin/env node
/**
 * AI Citation Checker - Full Version with Entity Extraction
 * Uses Perplexity to check citations and extract all mentioned businesses
 */

const fs = require('fs');

require('dotenv').config({ path: '.env.production' });

const ANALYSES_DIR = 'c:/Users/Ryan Nguyen/OneDrive/Desktop/Projects/oneclaw/.data/website-analyses';
const OUTPUT_FILE = 'c:/Users/Ryan Nguyen/OneDrive/Desktop/Projects/oneclaw/.data/ai-citation-results.json';
const CHECKPOINT_FILE = 'c:/Users/Ryan Nguyen/OneDrive/Desktop/Projects/oneclaw/.data/citation-checkpoint.json';

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

  const citations = {
    business_name: business.business_name,
    location: business.location,
    website: business.website,
    aeo_score: business.overall_aeo_score,
    gbp_rating: business.gbp_rating,
    gbp_reviews: business.gbp_review_count,
    queries_tested: queries.length,
    cited_count: 0,
    citations: [],
    competitors_mentioned: []
  };

  for (const query of queries) {
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
      const mentionedCompanies = [];
      
      if (citedMatch) {
        const companies = citedMatch[1].split(';').map(c => c.trim()).filter(Boolean);
        mentionedCompanies.push(...companies);
        companies.forEach(c => citations.competitors_mentioned.push(c));
      }
      
      // Check if target is cited
      const isCited = answer.match(/IS_TARGET_CITED:\s*YES/i);
      
      citations.citations.push({
        query,
        cited_in_ai: !!isCited,
        companies_mentioned: mentionedCompanies,
        raw_response: answer.substring(0, 500)
      });

      if (isCited) {
        citations.cited_count++;
      }

      await sleep(2000);

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
    cost: 0.02 // ~$0.01 per query * 2 queries
  };
}

async function checkAllCitations() {
  console.log('🔍 AI Citation Checker with Entity Extraction\n');
  console.log('💰 Cost: ~$0.01 per query (Perplexity sonar)\n');
  
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
        const competitorCount = new Set(citations.competitors_mentioned).size;
        console.log(`  ${citationIcon} ${business.business_name}: ${citations.cited_count}/${citations.queries_tested} queries | ${competitorCount} competitors found`);
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
  
  // Extract all unique competitors
  const allCompetitors = new Set();
  results.forEach(r => {
    r.competitors_mentioned.forEach(c => allCompetitors.add(c));
  });

  console.log('\n' + '='.repeat(60));
  console.log('✅ CITATION CHECK COMPLETE');
  console.log('='.repeat(60));
  console.log(`📊 Results:`);
  console.log(`   Total checked: ${results.length}`);
  console.log(`   Cited (at least once): ${cited} (${(cited/results.length*100).toFixed(1)}%)`);
  console.log(`   Never cited: ${notCited} (${(notCited/results.length*100).toFixed(1)}%)`);
  console.log(`   Average citation rate: ${avgCitationRate}%`);
  console.log(`   Total unique competitors mentioned: ${allCompetitors.size}`);
  console.log(`   Total cost: $${totalCost.toFixed(2)}`);

  fs.writeFileSync(OUTPUT_FILE, JSON.stringify({
    generated_at: new Date().toISOString(),
    total_checked: results.length,
    cited_count: cited,
    not_cited_count: notCited,
    average_citation_rate: avgCitationRate,
    total_competitors_found: allCompetitors.size,
    all_competitors: Array.from(allCompetitors).sort(),
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

  console.log('\n📈 Most Frequently Mentioned Competitors:');
  const competitorCounts = {};
  results.forEach(r => {
    r.competitors_mentioned.forEach(c => {
      competitorCounts[c] = (competitorCounts[c] || 0) + 1;
    });
  });
  Object.entries(competitorCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 15)
    .forEach(([name, count], i) => {
      console.log(`   ${i+1}. ${name} - mentioned ${count} times`);
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
