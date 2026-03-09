/**
 * Deep Data Analysis - Website Signals & Apify Coverage
 * 
 * Analyzes JSONB fields and checks Apify data availability
 */

import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config({ path: path.resolve(__dirname, '../.env.production') });
dotenv.config({ path: path.resolve(__dirname, '../.env.local') });
dotenv.config({ path: path.resolve(__dirname, '../.env') });

const APIFY_API_TOKEN = process.env.APIFY_API_TOKEN || process.env.APIFY_TOKEN;
const APIFY_API_BASE = 'https://api.apify.com/v2';
const APIFY_ACTOR_ID = 'compass/crawler-google-places';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

async function deepAnalysis() {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
    console.error('❌ Missing Supabase credentials');
    process.exit(1);
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
    auth: { persistSession: false },
  });

  console.log('\n' + '='.repeat(70));
  console.log('🔍 DEEP DATA ANALYSIS - WEBSITE SIGNALS & APIFY COVERAGE');
  console.log('='.repeat(70) + '\n');

  // ============================================================================
  // PART 1: WEBSITE SIGNALS ANALYSIS
  // ============================================================================
  
  console.log('📊 PART 1: WEBSITE SIGNALS DATA\n');

  // Fetch ALL leads in batches
  let allLeads: any[] = [];
  let from = 0;
  const batchSize = 1000;
  
  console.log('⏳ Fetching all leads...');
  while (true) {
    const { data: batch, error } = await supabase
      .schema('crm')
      .from('leads')
      .select('company_name, city, state, website, website_signals, contact_data, google_reviews')
      .range(from, from + batchSize - 1);
    
    if (error || !batch || batch.length === 0) break;
    
    allLeads.push(...batch);
    from += batchSize;
    
    if (batch.length < batchSize) break;
  }

  if (!allLeads || allLeads.length === 0) {
    console.error('Failed to fetch leads');
    return;
  }

  console.log(`Total leads analyzed: ${allLeads.length}\n`);

  // Check website_signals structure
  const leadsWithSignals = allLeads.filter(l => 
    l.website_signals && 
    typeof l.website_signals === 'object' && 
    Object.keys(l.website_signals).length > 0
  );

  console.log(`Leads with website_signals data: ${leadsWithSignals.length} (${((leadsWithSignals.length/allLeads.length)*100).toFixed(1)}%)\n`);

  if (leadsWithSignals.length > 0) {
    // Sample the signals
    const sampleSignals = leadsWithSignals[0].website_signals as any;
    console.log('Sample website_signals structure:');
    console.log(JSON.stringify(sampleSignals, null, 2));
    console.log('\n');

    // Aggregate signal statistics
    const signalStats: Record<string, number> = {};
    
    leadsWithSignals.forEach(lead => {
      const signals = lead.website_signals as any;
      Object.keys(signals).forEach(key => {
        if (signals[key] === true || signals[key] === 'yes') {
          signalStats[key] = (signalStats[key] || 0) + 1;
        }
      });
    });

    console.log('Website Signal Coverage (among leads with signals):\n');
    Object.entries(signalStats)
      .sort((a, b) => b[1] - a[1])
      .forEach(([signal, count]) => {
        const pct = ((count / leadsWithSignals.length) * 100).toFixed(1);
        console.log(`  ${signal.padEnd(30)} ${count.toString().padStart(4)} (${pct}%)`);
      });
  } else {
    console.log('⚠️  No website_signals data found in any leads\n');
  }

  // ============================================================================
  // PART 2: CONTACT DATA ANALYSIS
  // ============================================================================
  
  console.log('\n' + '='.repeat(70));
  console.log('📧 PART 2: CONTACT DATA ANALYSIS\n');

  const leadsWithContactData = allLeads.filter(l => 
    l.contact_data && 
    typeof l.contact_data === 'object' && 
    Object.keys(l.contact_data).length > 0
  );

  console.log(`Leads with contact_data: ${leadsWithContactData.length} (${((leadsWithContactData.length/allLeads.length)*100).toFixed(1)}%)\n`);

  if (leadsWithContactData.length > 0) {
    const sampleContact = leadsWithContactData[0].contact_data as any;
    console.log('Sample contact_data structure:');
    console.log(JSON.stringify(sampleContact, null, 2));
    console.log('\n');

    // Check what contact fields exist
    const contactFields: Record<string, number> = {};
    
    leadsWithContactData.forEach(lead => {
      const contact = lead.contact_data as any;
      Object.keys(contact).forEach(key => {
        if (contact[key]) {
          contactFields[key] = (contactFields[key] || 0) + 1;
        }
      });
    });

    console.log('Contact Data Fields (among leads with contact_data):\n');
    Object.entries(contactFields)
      .sort((a, b) => b[1] - a[1])
      .forEach(([field, count]) => {
        const pct = ((count / leadsWithContactData.length) * 100).toFixed(1);
        console.log(`  ${field.padEnd(30)} ${count.toString().padStart(4)} (${pct}%)`);
      });
  } else {
    console.log('⚠️  No contact_data found in any leads\n');
  }

  // ============================================================================
  // PART 3: APIFY DATA COVERAGE ANALYSIS
  // ============================================================================
  
  console.log('\n' + '='.repeat(70));
  console.log('🗺️  PART 3: APIFY DATA AVAILABILITY\n');

  if (!APIFY_API_TOKEN) {
    console.log('⚠️  APIFY_API_TOKEN not configured, skipping Apify analysis\n');
    return;
  }

  // Get ALL runs (not just 20)
  console.log('Fetching ALL Apify runs...\n');
  
  const runsResponse = await fetch(
    `${APIFY_API_BASE}/acts/${encodeURIComponent(APIFY_ACTOR_ID)}/runs?limit=100&status=SUCCEEDED`,
    { headers: { 'Authorization': `Bearer ${APIFY_API_TOKEN}` } }
  );

  if (!runsResponse.ok) {
    console.error('Failed to fetch Apify runs');
    return;
  }

  const runsData = await runsResponse.json();
  const runs = runsData.data.items;

  console.log(`Found ${runs.length} successful Apify runs\n`);

  // Analyze first 3 runs in detail
  console.log('Analyzing sample runs for data structure...\n');

  let totalPlaces = 0;
  let placesWithReviews = 0;
  let placesWithUrl = 0;
  let placesWithRating = 0;
  let totalReviews = 0;
  const allCompanyNames = new Set<string>();

  for (let i = 0; i < Math.min(5, runs.length); i++) {
    const run = runs[i];
    const datasetId = run.defaultDatasetId;

    console.log(`Run ${i + 1}: ${new Date(run.startedAt).toLocaleDateString()}`);

    // Fetch dataset
    const datasetResponse = await fetch(
      `${APIFY_API_BASE}/datasets/${datasetId}/items?format=json&limit=10`,
      { headers: { 'Authorization': `Bearer ${APIFY_API_TOKEN}` } }
    );

    const places = await datasetResponse.json();
    
    console.log(`  Sample size: ${places.length} places`);

    if (places.length > 0) {
      // Analyze structure of first place
      const samplePlace = places[0];
      console.log(`  Sample place structure:`);
      console.log(`    - title: ${samplePlace.title || 'N/A'}`);
      console.log(`    - placeId: ${samplePlace.placeId || 'N/A'}`);
      console.log(`    - url: ${samplePlace.url ? 'YES' : 'NO'}`);
      console.log(`    - totalScore: ${samplePlace.totalScore || 'N/A'}`);
      console.log(`    - reviewsCount: ${samplePlace.reviewsCount || 'N/A'}`);
      console.log(`    - reviews: ${samplePlace.reviews ? samplePlace.reviews.length : 0} reviews`);
      console.log(`    - city: ${samplePlace.city || 'N/A'}`);
      console.log(`    - state: ${samplePlace.state || 'N/A'}`);
      console.log(`    - phone: ${samplePlace.phone || 'N/A'}`);
      console.log(`    - website: ${samplePlace.website || 'N/A'}`);

      if (samplePlace.reviews && samplePlace.reviews.length > 0) {
        const sampleReview = samplePlace.reviews[0];
        console.log(`    - sample review:`);
        console.log(`      * text: ${sampleReview.text ? sampleReview.text.substring(0, 100) : 'N/A'}...`);
        console.log(`      * stars: ${sampleReview.stars || 'N/A'}`);
        console.log(`      * publishedAtDate: ${sampleReview.publishedAtDate || 'N/A'}`);
        console.log(`      * reviewerName: ${sampleReview.reviewerName || 'N/A'}`);
      }

      // Aggregate stats
      places.forEach((p: any) => {
        totalPlaces++;
        allCompanyNames.add(p.title?.toLowerCase());
        if (p.reviews && p.reviews.length > 0) {
          placesWithReviews++;
          totalReviews += p.reviews.length;
        }
        if (p.url) placesWithUrl++;
        if (p.totalScore) placesWithRating++;
      });
    }

    console.log('');
  }

  console.log('='.repeat(70));
  console.log('📈 APIFY DATA SUMMARY (from sample)\n');
  console.log(`Total places sampled: ${totalPlaces}`);
  console.log(`Places with reviews: ${placesWithReviews} (${((placesWithReviews/totalPlaces)*100).toFixed(1)}%)`);
  console.log(`Places with Maps URL: ${placesWithUrl} (${((placesWithUrl/totalPlaces)*100).toFixed(1)}%)`);
  console.log(`Places with rating: ${placesWithRating} (${((placesWithRating/totalPlaces)*100).toFixed(1)}%)`);
  console.log(`Total reviews collected: ${totalReviews}`);
  console.log(`Avg reviews per place: ${(totalReviews/placesWithReviews).toFixed(1)}\n`);

  // ============================================================================
  // PART 4: MATCHING POTENTIAL
  // ============================================================================
  
  console.log('='.repeat(70));
  console.log('🎯 PART 4: MATCHING POTENTIAL\n');

  console.log(`Total Apify runs available: ${runs.length}`);
  console.log(`Estimated total places in Apify: ~${runs.length * 50} (assuming 50 per run)`);
  console.log(`\nYour leads: ${allLeads.length}`);
  
  // Estimate match rate based on sample
  const sampleLeads = allLeads.slice(0, 100);
  let potentialMatches = 0;
  
  sampleLeads.forEach(lead => {
    if (lead.company_name && allCompanyNames.has(lead.company_name.toLowerCase())) {
      potentialMatches++;
    }
  });

  const estimatedMatchRate = (potentialMatches / 100) * 100;
  const estimatedTotalMatches = Math.round((estimatedMatchRate / 100) * allLeads.length);

  console.log(`\nSample match rate: ${estimatedMatchRate.toFixed(1)}% (${potentialMatches}/100)`);
  console.log(`Estimated total matches: ~${estimatedTotalMatches} leads\n`);

  console.log('💡 RECOMMENDATION:');
  if (estimatedTotalMatches > 500) {
    console.log(`✅ HIGH MATCH POTENTIAL - ${estimatedTotalMatches} leads could get:`);
    console.log('   - Google Maps URL');
    console.log('   - Google Place ID');
    console.log('   - Review count & rating');
    console.log('   - Actual review text (for social proof)');
    console.log('   - Phone numbers (if available)');
    console.log('\n   RUN THE BACKFILL SCRIPT NOW!\n');
  } else if (estimatedTotalMatches > 100) {
    console.log(`⚠️  MODERATE MATCH - ${estimatedTotalMatches} leads could be enriched`);
    console.log('   Worth running the backfill script\n');
  } else {
    console.log(`⚠️  LOW MATCH - Only ~${estimatedTotalMatches} potential matches`);
    console.log('   Your leads may be from different sources than Apify data\n');
  }

  console.log('='.repeat(70) + '\n');
}

deepAnalysis().catch(console.error);
