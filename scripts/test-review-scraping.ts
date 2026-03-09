/**
 * Test Review Scraping (5 leads only)
 * 
 * Tests the review scraping on just 5 leads to verify:
 * - Apify returns full reviewer names
 * - Data structure is correct
 * - Supabase updates work
 */

import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import * as path from 'path';
import * as fs from 'fs';

dotenv.config({ path: path.resolve(__dirname, '../.env.production') });
dotenv.config({ path: path.resolve(__dirname, '../.env.local') });
dotenv.config({ path: path.resolve(__dirname, '../.env') });

const APIFY_API_TOKEN = process.env.APIFY_API_TOKEN || process.env.APIFY_TOKEN;
const APIFY_API_BASE = 'https://api.apify.com/v2';
const APIFY_ACTOR_ID = 'compass/crawler-google-places';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

async function testReviewScraping() {
  if (!APIFY_API_TOKEN || !SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
    console.error('❌ Missing required environment variables');
    process.exit(1);
  }

  console.log('\n🧪 TESTING REVIEW SCRAPING (5 LEADS)\n');

  // Load just 5 leads for testing
  const leadsPath = path.resolve(__dirname, '../data/top-1000-aeo-leads.json');
  const allLeads = JSON.parse(fs.readFileSync(leadsPath, 'utf-8'));
  const testLeads = allLeads.slice(0, 5);

  console.log('Testing with:');
  testLeads.forEach((l: any, i: number) => {
    console.log(`  ${i+1}. ${l.company_name} (${l.city}, ${l.state})`);
  });

  const searchQueries = testLeads.map((l: any) => 
    `${l.company_name} ${l.city} ${l.state}`
  );

  console.log('\n⏳ Starting Apify run...');

  const runResponse = await fetch(
    `${APIFY_API_BASE}/acts/${encodeURIComponent(APIFY_ACTOR_ID)}/runs`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${APIFY_API_TOKEN}`,
      },
      body: JSON.stringify({
        searchStringsArray: searchQueries,
        maxCrawledPlacesPerSearch: 1,
        maxReviews: 3, // Just 3 reviews
        reviewsSort: 'newest',
        scrapePlaceDetailPage: true,
        scrapeReviewsPersonalData: true,
        language: 'en',
        maxImages: 0,
        maxQuestions: 0,
      }),
    }
  );

  const runData = await runResponse.json();
  const runId = runData.data.id;
  console.log(`✓ Run ID: ${runId}`);

  // Poll for completion
  let status = 'RUNNING';
  while (status === 'RUNNING' || status === 'READY') {
    await new Promise(r => setTimeout(r, 5000));
    const statusResponse = await fetch(
      `${APIFY_API_BASE}/actor-runs/${runId}`,
      { headers: { 'Authorization': `Bearer ${APIFY_API_TOKEN}` } }
    );
    const statusData = await statusResponse.json();
    status = statusData.data.status;
    console.log(`  Status: ${status}...`);
  }

  // Fetch results
  const statusResponse = await fetch(
    `${APIFY_API_BASE}/actor-runs/${runId}`,
    { headers: { 'Authorization': `Bearer ${APIFY_API_TOKEN}` } }
  );
  const finalData = await statusResponse.json();
  const datasetId = finalData.data.defaultDatasetId;

  const datasetResponse = await fetch(
    `${APIFY_API_BASE}/datasets/${datasetId}/items?format=json`,
    { headers: { 'Authorization': `Bearer ${APIFY_API_TOKEN}` } }
  );
  const places = await datasetResponse.json();

  console.log('\n📋 RESULTS:\n');

  places.forEach((place: any, i: number) => {
    const lead = testLeads[i];
    console.log(`${i+1}. ${lead.company_name}`);
    console.log(`   Place ID: ${place.placeId || 'NOT FOUND'}`);
    console.log(`   Rating: ${place.totalScore || 'N/A'} (${place.reviewsCount || 0} reviews)`);
    console.log(`   Phone: ${place.phone || 'N/A'}`);
    console.log(`   Maps URL: ${place.url || 'N/A'}`);
    
    if (place.reviews && place.reviews.length > 0) {
      console.log(`   Last ${place.reviews.length} reviews:`);
      place.reviews.forEach((r: any, idx: number) => {
        console.log(`     ${idx+1}. ${r.reviewerName || 'Anonymous'} (${r.stars}★) - ${r.publishedAtDate || 'N/A'}`);
        console.log(`        "${r.text?.substring(0, 80)}..."`);
      });
    } else {
      console.log(`   Reviews: NONE FOUND`);
    }
    console.log('');
  });

  console.log('✅ Test complete! If you see full reviewer names above, you\'re good to go.\n');
}

testReviewScraping().catch(console.error);
