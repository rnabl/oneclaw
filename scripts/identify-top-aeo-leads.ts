/**
 * Identify Top 1,000 Leads for AEO/GEO Services
 * 
 * Scoring criteria for AI Search visibility services:
 * - Actively hiring (signals growth + budget)
 * - Has website but poor SEO (needs help)
 * - High lead score (already vetted)
 * - Not AI-optimized yet (biggest opportunity)
 * - Has some online presence (reviews/ratings matter)
 */

import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config({ path: path.resolve(__dirname, '../.env.production') });
dotenv.config({ path: path.resolve(__dirname, '../.env.local') });
dotenv.config({ path: path.resolve(__dirname, '../.env') });

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

interface Lead {
  id: string;
  company_name: string;
  website: string;
  city: string;
  state: string;
  industry: string;
  lead_score: number;
  website_signals: any;
  contact_data: any;
  aeo_score?: number;
}

async function identifyTopLeads() {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
    console.error('❌ Missing Supabase credentials');
    process.exit(1);
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
    auth: { persistSession: false },
  });

  console.log('\n' + '='.repeat(70));
  console.log('🎯 IDENTIFYING TOP 1,000 LEADS FOR AEO/GEO SERVICES');
  console.log('='.repeat(70) + '\n');

  // Fetch ALL leads
  console.log('⏳ Fetching all leads...');
  let allLeads: Lead[] = [];
  let from = 0;
  const batchSize = 1000;
  
  while (true) {
    const { data: batch, error } = await supabase
      .schema('crm')
      .from('leads')
      .select('id, company_name, website, city, state, industry, lead_score, website_signals, contact_data')
      .range(from, from + batchSize - 1);
    
    if (error || !batch || batch.length === 0) break;
    
    allLeads.push(...batch);
    from += batchSize;
    
    if (batch.length < batchSize) break;
  }

  console.log(`✓ Loaded ${allLeads.length} leads\n`);

  // ============================================================================
  // AEO/GEO OPPORTUNITY SCORING
  // ============================================================================
  
  console.log('📊 Calculating AEO/GEO opportunity scores...\n');

  const scoredLeads = allLeads.map(lead => {
    let aeoScore = 0;
    const signals = lead.website_signals || {};
    const contact = lead.contact_data || {};

    // FACTOR 1: Has website (required)
    if (!lead.website) return { ...lead, aeo_score: 0 };
    aeoScore += 10;

    // FACTOR 2: Actively hiring (25 points - signals growth + budget)
    if (signals.isHiring === true) {
      aeoScore += 25;
      
      // Bonus: High hiring intensity
      if (signals.hiringIntensity === 'high') aeoScore += 10;
      else if (signals.hiringIntensity === 'medium') aeoScore += 5;
      
      // Bonus: Multiple job postings
      if (signals.totalJobPostings >= 3) aeoScore += 5;
    }

    // FACTOR 3: Poor AI readability (30 points - needs help!)
    if (signals.aiReadable === false || signals.aiReadabilityScore === 0) {
      aeoScore += 30;
    } else if (signals.aiReadabilityScore < 50) {
      aeoScore += 20;
    }

    // FACTOR 4: Has website but poor SEO (20 points - needs optimization)
    if (signals.hasWebsite === true && signals.seoOptimized === false) {
      aeoScore += 20;
    }

    // FACTOR 5: No structured data (10 points - easy win for AEO)
    if (signals.hasStructuredData === false) {
      aeoScore += 10;
    }

    // FACTOR 6: High existing lead score (10 points - already qualified)
    if (lead.lead_score >= 80) {
      aeoScore += 10;
    } else if (lead.lead_score >= 70) {
      aeoScore += 5;
    }

    // FACTOR 7: Has some marketing tech (5 points - understands digital marketing)
    if (signals.hasGoogleAnalytics || signals.hasFacebookPixel || signals.hasGoogleTagManager) {
      aeoScore += 5;
    }

    // FACTOR 8: No chatbot/booking (5 points - needs better conversion)
    if (signals.hasChatbot === false && signals.hasBooking === false) {
      aeoScore += 5;
    }

    // FACTOR 9: Recently hired (5 points - active right now)
    if (signals.mostRecentJobDays <= 7) {
      aeoScore += 5;
    }

    // FACTOR 10: Has contact info already (easier to reach)
    if (contact.email || contact.owner_email) {
      aeoScore += 5;
    }

    return {
      ...lead,
      aeo_score: aeoScore,
    };
  });

  // ============================================================================
  // FILTER: HVAC & PLUMBING ONLY, NO NATIONAL BRANDS
  // ============================================================================
  
  console.log('🔍 Filtering for local HVAC & Plumbing only...\n');

  const localServiceLeads = scoredLeads.filter(lead => {
    // Only HVAC or Plumbing
    const isHVAC = lead.industry.toLowerCase().includes('hvac');
    const isPlumbing = lead.industry.toLowerCase().includes('plumbing');
    
    if (!isHVAC && !isPlumbing) return false;

    // Filter out national brands (indicators)
    const name = lead.company_name.toLowerCase();
    const website = lead.website?.toLowerCase() || '';
    
    // National brand indicators - expanded list
    const nationalBrands = [
      // Major HVAC/Plumbing chains
      'rheem', 'carrier', 'trane', 'lennox', 'york', 'goodman', 'american standard',
      'ferguson', 'rollins', 'american residential services', 'ars.com',
      'service experts', 'aire serv', 'mr. rooter', 'one hour', 'benjamin franklin',
      
      // Generic corporate terms
      'long building', 'gpac', 'building technologies', 'millennium wireless',
      'nationwide', 'corporate', 'headquarters', 'holdings', 'group inc',
      'enterprises inc', 'national', 'systems inc', 'technologies inc',
      'engineered systems', 'pest control', 'services llc',
      
      // Multi-location indicators
      '/locations/', 'franchise', 'parent company', 'cbinsights.com'
    ];
    
    // Check if it's a national brand
    const isNational = nationalBrands.some(brand => 
      name.includes(brand) || website.includes(brand)
    );
    
    if (isNational) return false;

    // Must have valid local indicators
    const hasCity = lead.city && lead.city.length > 0;
    const hasState = lead.state && lead.state.length > 0;
    
    // Additional filter: hiring intensity suggests local vs enterprise
    // Very high job counts (10+) often mean multi-location enterprises
    const signals = lead.website_signals || {};
    const totalJobs = signals.totalJobPostings || 0;
    if (totalJobs > 10) return false; // Likely multi-location enterprise
    
    return hasCity && hasState;
  });

  console.log(`✓ Found ${localServiceLeads.length} local HVAC & Plumbing companies\n`);

  // Sort by AEO score and take top 1,000
  const topLeads = localServiceLeads
    .sort((a, b) => (b.aeo_score || 0) - (a.aeo_score || 0))
    .slice(0, 1000);
  console.log('='.repeat(70));
  console.log('🏆 TOP 1,000 LOCAL HVAC & PLUMBING COMPANIES\n');
  console.log(`Total qualified leads: ${topLeads.length}\n`);

  const avgScore = topLeads.reduce((sum, l) => sum + (l.aeo_score || 0), 0) / topLeads.length;
  const avgLeadScore = topLeads.reduce((sum, l) => sum + l.lead_score, 0) / topLeads.length;

  console.log(`Average AEO Opportunity Score: ${avgScore.toFixed(1)}/100`);
  console.log(`Average Lead Score: ${avgLeadScore.toFixed(1)}/100\n`);

  // Score distribution
  const tier1 = topLeads.filter(l => (l.aeo_score || 0) >= 80).length;
  const tier2 = topLeads.filter(l => (l.aeo_score || 0) >= 60 && (l.aeo_score || 0) < 80).length;
  const tier3 = topLeads.filter(l => (l.aeo_score || 0) < 60).length;

  console.log('AEO Opportunity Tiers:');
  console.log(`  Tier 1 (80-100): ${tier1} leads - HOT (actively hiring + poor AI presence)`);
  console.log(`  Tier 2 (60-79):  ${tier2} leads - WARM (some signals)`);
  console.log(`  Tier 3 (<60):    ${tier3} leads - COLD (fewer signals)\n`);

  // Hiring status
  const hiring = topLeads.filter(l => l.website_signals?.isHiring === true).length;
  console.log(`Actively Hiring: ${hiring} (${((hiring/1000)*100).toFixed(1)}%)\n`);

  // Industry breakdown
  const industries: Record<string, number> = {};
  topLeads.forEach(l => {
    industries[l.industry] = (industries[l.industry] || 0) + 1;
  });

  console.log('Industry Breakdown:');
  Object.entries(industries)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .forEach(([industry, count]) => {
      console.log(`  ${industry.padEnd(25)} ${count}`);
    });

  // Geographic distribution
  const states: Record<string, number> = {};
  topLeads.forEach(l => {
    states[l.state] = (states[l.state] || 0) + 1;
  });

  console.log('\nTop 5 States:');
  Object.entries(states)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .forEach(([state, count]) => {
      console.log(`  ${state.padEnd(25)} ${count}`);
    });

  // Contact data availability
  const withEmail = topLeads.filter(l => {
    const c = l.contact_data || {};
    return c.email || c.owner_email;
  }).length;

  const withOwner = topLeads.filter(l => {
    const c = l.contact_data || {};
    return c.owner_name;
  }).length;

  console.log('\nContact Data Availability:');
  console.log(`  Have email: ${withEmail} (${((withEmail/1000)*100).toFixed(1)}%)`);
  console.log(`  Have owner name: ${withOwner} (${((withOwner/1000)*100).toFixed(1)}%)`);
  console.log(`  Need enrichment: ${1000 - withEmail} leads\n`);

  // ============================================================================
  // WHY THESE ARE PERFECT FOR AEO/GEO
  // ============================================================================
  
  console.log('='.repeat(70));
  console.log('💡 WHY THESE 1,000 ARE PERFECT FOR YOUR OFFER\n');

  console.log('✅ ACTIVELY GROWING:');
  console.log(`   ${hiring} (${((hiring/1000)*100).toFixed(1)}%) are hiring right now`);
  console.log('   → Have budget for growth services\n');

  const poorAI = topLeads.filter(l => 
    l.website_signals?.aiReadable === false || 
    (l.website_signals?.aiReadabilityScore || 0) < 50
  ).length;

  console.log('✅ INVISIBLE TO AI SEARCH:');
  console.log(`   ${poorAI} (${((poorAI/1000)*100).toFixed(1)}%) have poor/no AI readability`);
  console.log('   → Your service solves their exact problem\n');

  const poorSEO = topLeads.filter(l => l.website_signals?.seoOptimized === false).length;

  console.log('✅ NEED OPTIMIZATION:');
  console.log(`   ${poorSEO} (${((poorSEO/1000)*100).toFixed(1)}%) have poor SEO`);
  console.log('   → Already behind in traditional search, now AI too\n');

  const noStructured = topLeads.filter(l => l.website_signals?.hasStructuredData === false).length;

  console.log('✅ EASY WINS AVAILABLE:');
  console.log(`   ${noStructured} (${((noStructured/1000)*100).toFixed(1)}%) lack structured data`);
  console.log('   → Quick improvements = fast results\n');

  console.log('✅ LOCAL SERVICE BUSINESSES:');
  console.log('   HVAC, Roofing, Plumbing, Home Services');
  console.log('   → Perfect for "near me" and local AI search optimization\n');

  // ============================================================================
  // SAMPLE LEADS
  // ============================================================================
  
  console.log('='.repeat(70));
  console.log('📋 SAMPLE TOP LEADS\n');

  topLeads.slice(0, 10).forEach((lead, idx) => {
    const signals = lead.website_signals || {};
    console.log(`${idx + 1}. ${lead.company_name} (${lead.city}, ${lead.state})`);
    console.log(`   AEO Score: ${lead.aeo_score}/100`);
    console.log(`   Industry: ${lead.industry}`);
    console.log(`   Hiring: ${signals.isHiring ? 'YES' : 'NO'}${signals.isHiring ? ` (${signals.totalJobPostings || 0} jobs)` : ''}`);
    console.log(`   AI Readable: ${signals.aiReadable ? 'YES' : 'NO'}`);
    console.log(`   SEO Optimized: ${signals.seoOptimized ? 'YES' : 'NO'}`);
    console.log(`   Website: ${lead.website}\n`);
  });

  // ============================================================================
  // EXPORT DATA
  // ============================================================================
  
  console.log('='.repeat(70));
  console.log('💾 EXPORTING TOP 1,000 LEADS\n');

  // Export to CSV-like format for next steps
  const exportData = topLeads.map(lead => ({
    id: lead.id,
    company_name: lead.company_name,
    website: lead.website,
    city: lead.city,
    state: lead.state,
    industry: lead.industry,
    aeo_score: lead.aeo_score,
    lead_score: lead.lead_score,
    is_hiring: lead.website_signals?.isHiring || false,
    has_email: !!(lead.contact_data?.email || lead.contact_data?.owner_email),
    has_owner: !!lead.contact_data?.owner_name,
  }));

  // Save to file
  const fs = require('fs');
  fs.writeFileSync(
    path.resolve(__dirname, '../data/top-1000-aeo-leads.json'),
    JSON.stringify(exportData, null, 2)
  );

  console.log('✓ Exported to: data/top-1000-aeo-leads.json\n');

  console.log('='.repeat(70));
  console.log('✅ ANALYSIS COMPLETE\n');

  console.log('NEXT STEPS:');
  console.log('1. Review the top 1,000 (exported to JSON)');
  console.log('2. Run Perplexity enrichment to get contacts ($5)');
  console.log('3. Scrape last 3 reviews for each ($0.20)');
  console.log('4. Generate personalized review-based emails\n');
}

identifyTopLeads().catch(console.error);
