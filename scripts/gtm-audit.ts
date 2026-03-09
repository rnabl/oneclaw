/**
 * GTM Data Audit - Comprehensive Leads Analysis
 * 
 * This script analyzes the leads table as unstructured data
 * and provides actionable insights for GTM strategy.
 */

import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import * as path from 'path';

// Load environment variables
dotenv.config({ path: path.resolve(__dirname, '../.env.production') });
dotenv.config({ path: path.resolve(__dirname, '../.env.local') });
dotenv.config({ path: path.resolve(__dirname, '../.env') });

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

async function gtmAudit() {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
    console.error('❌ Missing Supabase credentials');
    process.exit(1);
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
    auth: { persistSession: false },
  });

  console.log('\n' + '='.repeat(70));
  console.log('🎯 GTM DATA AUDIT - LEADS TABLE ANALYSIS');
  console.log('='.repeat(70) + '\n');

  // ============================================================================
  // SECTION 1: OVERVIEW
  // ============================================================================
  
  console.log('📊 SECTION 1: DATABASE OVERVIEW\n');

  const { count: totalLeads } = await supabase
    .schema('crm')
    .from('leads')
    .select('*', { count: 'exact', head: true });

  console.log(`Total Leads in Database: ${totalLeads?.toLocaleString()}\n`);

  // Get ALL data to analyze (in batches)
  console.log('⏳ Fetching all leads data...');
  let allLeads: any[] = [];
  let from = 0;
  const batchSize = 1000;
  
  while (true) {
    const { data: batch, error } = await supabase
      .schema('crm')
      .from('leads')
      .select('*')
      .range(from, from + batchSize - 1);
    
    if (error) {
      console.error('Error fetching data:', error);
      break;
    }
    
    if (!batch || batch.length === 0) break;
    
    allLeads.push(...batch);
    from += batchSize;
    
    if (batch.length < batchSize) break;
  }
  
  console.log(`✓ Loaded ${allLeads.length} leads\n`);

  // ============================================================================
  // SECTION 2: DATA COMPLETENESS
  // ============================================================================
  
  console.log('=' .repeat(70));
  console.log('📋 SECTION 2: DATA COMPLETENESS\n');

  const fields = {
    'Company Name': (l: any) => l.company_name,
    'Website': (l: any) => l.website,
    'Phone': (l: any) => l.phone,
    'Email': (l: any) => l.email,
    'City': (l: any) => l.city,
    'State': (l: any) => l.state,
    'Industry': (l: any) => l.industry,
    'Owner Name': (l: any) => l.owner_name,
    'Owner Title': (l: any) => l.owner_title,
    'Owner LinkedIn': (l: any) => l.owner_linkedin,
    'Google Place ID': (l: any) => l.google_place_id,
    'Google Maps URL': (l: any) => l.google_maps_url,
    'Google Rating': (l: any) => l.google_rating,
    'Google Reviews': (l: any) => l.google_reviews,
    'Lead Score': (l: any) => l.lead_score,
  };

  console.log('Field Coverage:\n');
  Object.entries(fields).forEach(([fieldName, getter]) => {
    const count = allLeads.filter(l => getter(l)).length;
    const pct = ((count / allLeads.length) * 100).toFixed(1);
    const bar = '█'.repeat(Math.floor(Number(pct) / 5));
    console.log(`  ${fieldName.padEnd(20)} ${count.toString().padStart(5)} / ${allLeads.length}  (${pct.padStart(5)}%)  ${bar}`);
  });

  // ============================================================================
  // SECTION 3: ACTIONABILITY TIERS
  // ============================================================================
  
  console.log('\n' + '='.repeat(70));
  console.log('🎯 SECTION 3: GTM ACTIONABILITY TIERS\n');

  // Tier 1: Ready for outreach (has owner name + email)
  const tier1 = allLeads.filter(l => l.owner_name && l.email);
  
  // Tier 2: Has owner name, missing email (needs email enrichment)
  const tier2 = allLeads.filter(l => l.owner_name && !l.email);
  
  // Tier 3: Has website, no owner (needs Perplexity enrichment)
  const tier3 = allLeads.filter(l => l.website && !l.owner_name);
  
  // Tier 4: Has company name + location, no owner, no website (needs research)
  const tier4 = allLeads.filter(l => !l.website && !l.owner_name && (l.city || l.state));
  
  // Tier 5: Incomplete data (not actionable)
  const tier5 = allLeads.filter(l => !l.owner_name && !l.website && !l.city && !l.state);

  console.log('Tier 1: READY FOR OUTREACH ✅');
  console.log(`  ${tier1.length.toLocaleString()} leads (${((tier1.length/allLeads.length)*100).toFixed(1)}%)`);
  console.log('  Has: Owner name + Email');
  console.log('  Action: Can start outreach immediately\n');

  console.log('Tier 2: NEEDS EMAIL ENRICHMENT 📧');
  console.log(`  ${tier2.length.toLocaleString()} leads (${((tier2.length/allLeads.length)*100).toFixed(1)}%)`);
  console.log('  Has: Owner name');
  console.log('  Missing: Email');
  console.log('  Action: Email enrichment via Apollo/Hunter ($0.05-0.10 per lead)\n');

  console.log('Tier 3: NEEDS OWNER ENRICHMENT 👤');
  console.log(`  ${tier3.length.toLocaleString()} leads (${((tier3.length/allLeads.length)*100).toFixed(1)}%)`);
  console.log('  Has: Website');
  console.log('  Missing: Owner name');
  console.log(`  Action: Perplexity enrichment ($${(tier3.length * 0.005).toFixed(2)} for all)\n`);

  console.log('Tier 4: NEEDS DEEP RESEARCH 🔍');
  console.log(`  ${tier4.length.toLocaleString()} leads (${((tier4.length/allLeads.length)*100).toFixed(1)}%)`);
  console.log('  Has: Company name + Location');
  console.log('  Missing: Website + Owner');
  console.log('  Action: Manual research or skip\n');

  console.log('Tier 5: INCOMPLETE DATA ⚠️');
  console.log(`  ${tier5.length.toLocaleString()} leads (${((tier5.length/allLeads.length)*100).toFixed(1)}%)`);
  console.log('  Missing: Critical fields');
  console.log('  Action: Clean or discard\n');

  // ============================================================================
  // SECTION 4: GEOGRAPHIC DISTRIBUTION
  // ============================================================================
  
  console.log('='.repeat(70));
  console.log('📍 SECTION 4: GEOGRAPHIC DISTRIBUTION\n');

  const stateGroups: Record<string, any[]> = {};
  allLeads.forEach(l => {
    if (l.state) {
      if (!stateGroups[l.state]) stateGroups[l.state] = [];
      stateGroups[l.state].push(l);
    }
  });

  const topStates = Object.entries(stateGroups)
    .map(([state, leads]) => ({ state, count: leads.length }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 10);

  console.log('Top 10 States:\n');
  topStates.forEach(({ state, count }, idx) => {
    const pct = ((count / allLeads.length) * 100).toFixed(1);
    console.log(`  ${(idx + 1).toString().padStart(2)}. ${state.padEnd(20)} ${count.toString().padStart(5)} leads (${pct}%)`);
  });

  // ============================================================================
  // SECTION 5: INDUSTRY BREAKDOWN
  // ============================================================================
  
  console.log('\n' + '='.repeat(70));
  console.log('🏢 SECTION 5: INDUSTRY BREAKDOWN\n');

  const industryGroups: Record<string, number> = {};
  allLeads.forEach(l => {
    const industry = l.industry || 'Unknown';
    industryGroups[industry] = (industryGroups[industry] || 0) + 1;
  });

  const industries = Object.entries(industryGroups)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10);

  industries.forEach(([industry, count]) => {
    const pct = ((count / allLeads.length) * 100).toFixed(1);
    console.log(`  ${industry.padEnd(20)} ${count.toString().padStart(5)} (${pct}%)`);
  });

  // ============================================================================
  // SECTION 6: GOOGLE DATA COVERAGE
  // ============================================================================
  
  console.log('\n' + '='.repeat(70));
  console.log('🗺️  SECTION 6: GOOGLE MAPS DATA STATUS\n');

  const withPlaceId = allLeads.filter(l => l.google_place_id).length;
  const withMapsUrl = allLeads.filter(l => l.google_maps_url).length;
  const withRating = allLeads.filter(l => l.google_rating).length;
  const withReviews = allLeads.filter(l => l.google_reviews).length;

  console.log(`  Google Place ID:  ${withPlaceId.toString().padStart(5)} / ${allLeads.length} (${((withPlaceId/allLeads.length)*100).toFixed(1)}%)`);
  console.log(`  Google Maps URL:  ${withMapsUrl.toString().padStart(5)} / ${allLeads.length} (${((withMapsUrl/allLeads.length)*100).toFixed(1)}%)`);
  console.log(`  Google Rating:    ${withRating.toString().padStart(5)} / ${allLeads.length} (${((withRating/allLeads.length)*100).toFixed(1)}%)`);
  console.log(`  Google Reviews:   ${withReviews.toString().padStart(5)} / ${allLeads.length} (${((withReviews/allLeads.length)*100).toFixed(1)}%)`);

  const needsGoogleData = allLeads.filter(l => !l.google_place_id && (l.company_name && (l.city || l.state))).length;
  console.log(`\n  ⚠️  ${needsGoogleData} leads could be matched to Google Maps via Apify backfill\n`);

  // ============================================================================
  // SECTION 7: LEAD QUALITY SCORES
  // ============================================================================
  
  console.log('='.repeat(70));
  console.log('⭐ SECTION 7: LEAD QUALITY DISTRIBUTION\n');

  const withScores = allLeads.filter(l => l.lead_score !== null && l.lead_score !== undefined);
  
  if (withScores.length > 0) {
    const avgScore = withScores.reduce((sum, l) => sum + l.lead_score, 0) / withScores.length;
    const highQuality = withScores.filter(l => l.lead_score >= 70).length;
    const medQuality = withScores.filter(l => l.lead_score >= 40 && l.lead_score < 70).length;
    const lowQuality = withScores.filter(l => l.lead_score < 40).length;

    console.log(`  Average Score: ${avgScore.toFixed(1)}`);
    console.log(`  High (70-100): ${highQuality} leads`);
    console.log(`  Med (40-69):   ${medQuality} leads`);
    console.log(`  Low (0-39):    ${lowQuality} leads`);
  } else {
    console.log('  No lead scores found - consider scoring leads based on data completeness\n');
  }

  // ============================================================================
  // SECTION 8: GTM RECOMMENDATIONS
  // ============================================================================
  
  console.log('\n' + '='.repeat(70));
  console.log('💡 SECTION 8: GTM RECOMMENDATIONS\n');

  console.log('IMMEDIATE ACTIONS:\n');
  
  if (tier1.length > 0) {
    console.log(`1. START OUTREACH: ${tier1.length} leads ready (have owner + email)`);
    console.log(`   - No enrichment needed`);
    console.log(`   - Cost: $0`);
    console.log(`   - Time: Ready now\n`);
  }

  if (tier3.length > 0) {
    console.log(`2. ENRICH OWNERS: ${tier3.length} leads need owner names`);
    console.log(`   - Method: Perplexity AI`);
    console.log(`   - Cost: $${(tier3.length * 0.005).toFixed(2)} (${tier3.length} × $0.005)`);
    console.log(`   - Time: ~${Math.ceil(tier3.length / 60)} minutes`);
    console.log(`   - Result: Move to Tier 2 (need email enrichment)\n`);
  }

  if (tier2.length > 0) {
    console.log(`3. ENRICH EMAILS: ${tier2.length} leads have owner, need email`);
    console.log(`   - Method: Apollo/Hunter/Clearbit`);
    console.log(`   - Cost: $${(tier2.length * 0.08).toFixed(2)} (${tier2.length} × ~$0.08)`);
    console.log(`   - Time: ~${Math.ceil(tier2.length / 60)} minutes`);
    console.log(`   - Result: Move to Tier 1 (ready for outreach)\n`);
  }

  if (needsGoogleData > 0) {
    console.log(`4. BACKFILL GOOGLE DATA: ${needsGoogleData} leads missing Maps URL`);
    console.log(`   - Method: Match with existing Apify runs`);
    console.log(`   - Cost: $0 (already have the data)`);
    console.log(`   - Time: ~5 minutes`);
    console.log(`   - Benefit: Better targeting, review data for social proof\n`);
  }

  console.log('\nTOTAL ENRICHMENT COST ESTIMATE:');
  const perplexityCost = tier3.length * 0.005;
  const emailCost = (tier2.length + tier3.length) * 0.08;
  const totalCost = perplexityCost + emailCost;
  
  console.log(`  Perplexity (owner names): $${perplexityCost.toFixed(2)}`);
  console.log(`  Email enrichment:         $${emailCost.toFixed(2)}`);
  console.log(`  Google Maps backfill:     $0.00`);
  console.log(`  ${'─'.repeat(40)}`);
  console.log(`  TOTAL:                    $${totalCost.toFixed(2)}`);
  
  console.log(`\n  After enrichment: ${tier1.length + tier2.length + tier3.length} leads ready for outreach\n`);

  // ============================================================================
  // SECTION 9: SAMPLE LEADS
  // ============================================================================
  
  console.log('='.repeat(70));
  console.log('📋 SECTION 9: SAMPLE LEADS BY TIER\n');

  console.log('Tier 1 Sample (Ready for Outreach):');
  tier1.slice(0, 3).forEach(l => {
    console.log(`  ✅ ${l.company_name} (${l.city}, ${l.state})`);
    console.log(`     Owner: ${l.owner_name} | Email: ${l.email}`);
  });

  console.log('\nTier 3 Sample (Needs Owner):');
  tier3.slice(0, 3).forEach(l => {
    console.log(`  👤 ${l.company_name} (${l.city || 'N/A'}, ${l.state || 'N/A'})`);
    console.log(`     Website: ${l.website} | Owner: MISSING`);
  });

  console.log('\n' + '='.repeat(70));
  console.log('✅ AUDIT COMPLETE\n');
}

gtmAudit().catch(console.error);
