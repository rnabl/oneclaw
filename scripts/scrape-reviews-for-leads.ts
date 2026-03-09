/**
 * Scrape Reviews for Top 1,000 AEO Leads
 * 
 * Takes the filtered leads and runs Apify to get:
 * - Last 3 reviews with FULL reviewer names
 * - Google Place ID, rating, review count
 * - Phone numbers
 * 
 * Updates Supabase with all data.
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

interface Lead {
  id: string;
  company_name: string;
  website: string;
  city: string;
  state: string;
  industry: string;
}

interface Review {
  text: string;
  rating: number;
  publishedAt: string;
  reviewerName: string;
  isLocalGuide?: boolean;
  reviewUrl?: string;
}

async function scrapeReviewsForLeads() {
  if (!APIFY_API_TOKEN || !SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
    console.error('❌ Missing required environment variables');
    process.exit(1);
  }

  console.log('\n' + '='.repeat(70));
  console.log('🔍 SCRAPING REVIEWS FOR TOP 1,000 AEO LEADS');
  console.log('='.repeat(70) + '\n');

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
    auth: { persistSession: false },
  });

  // Load the filtered leads
  const leadsPath = path.resolve(__dirname, '../data/top-1000-aeo-leads.json');
  const leads: Lead[] = JSON.parse(fs.readFileSync(leadsPath, 'utf-8'));

  console.log(`Loaded ${leads.length} leads to process\n`);

  // Process in batches of 100 (Apify recommended batch size)
  const BATCH_SIZE = 100;
  const batches = Math.ceil(leads.length / BATCH_SIZE);

  let totalProcessed = 0;
  let totalWithReviews = 0;
  let totalReviews = 0;
  let errors = 0;

  for (let batchNum = 0; batchNum < batches; batchNum++) {
    const start = batchNum * BATCH_SIZE;
    const end = Math.min(start + BATCH_SIZE, leads.length);
    const batch = leads.slice(start, end);

    console.log(`\n📦 Processing Batch ${batchNum + 1}/${batches} (${batch.length} leads)`);
    console.log('─'.repeat(70));

    // Build search queries for this batch
    const searchQueries = batch.map(lead => 
      `${lead.company_name} ${lead.city} ${lead.state}`
    );

    console.log(`Starting Apify run for ${batch.length} companies...`);

    try {
      // Start Apify run
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
            maxCrawledPlacesPerSearch: 1, // Only get the first match
            maxReviews: 3, // Just the last 3 reviews
            reviewsSort: 'newest',
            scrapePlaceDetailPage: true,
            scrapeReviewsPersonalData: true, // Get full reviewer names!
            language: 'en',
            
            // Minimal scraping to save credits
            maxImages: 0,
            maxQuestions: 0,
            includeWebResults: false,
          }),
        }
      );

      if (!runResponse.ok) {
        throw new Error(`Apify API error: ${runResponse.statusText}`);
      }

      const runData = await runResponse.json() as { data: { id: string } };
      const runId = runData.data.id;

      console.log(`✓ Apify run started: ${runId}`);
      console.log('⏳ Waiting for completion...');

      // Poll for completion
      let status = 'RUNNING';
      let attempts = 0;
      const maxAttempts = 180; // 15 minutes max

      while (status === 'RUNNING' || status === 'READY') {
        if (attempts >= maxAttempts) {
          throw new Error('Apify run timed out');
        }

        await new Promise(resolve => setTimeout(resolve, 5000));

        const statusResponse = await fetch(
          `${APIFY_API_BASE}/actor-runs/${runId}`,
          { headers: { 'Authorization': `Bearer ${APIFY_API_TOKEN}` } }
        );

        const statusData = await statusResponse.json() as {
          data: { status: string; defaultDatasetId?: string }
        };
        
        status = statusData.data.status;
        attempts++;

        if (attempts % 12 === 0) {
          console.log(`  Still running... (${attempts * 5}s elapsed)`);
        }
      }

      if (status !== 'SUCCEEDED') {
        throw new Error(`Apify run failed: ${status}`);
      }

      console.log(`✓ Scraping completed`);

      // Fetch results
      const statusResponse = await fetch(
        `${APIFY_API_BASE}/actor-runs/${runId}`,
        { headers: { 'Authorization': `Bearer ${APIFY_API_TOKEN}` } }
      );

      const finalData = await statusResponse.json() as {
        data: { defaultDatasetId?: string }
      };

      const datasetId = finalData.data.defaultDatasetId;
      if (!datasetId) {
        throw new Error('No dataset ID returned');
      }

      const datasetResponse = await fetch(
        `${APIFY_API_BASE}/datasets/${datasetId}/items?format=json`,
        { headers: { 'Authorization': `Bearer ${APIFY_API_TOKEN}` } }
      );

      const places = await datasetResponse.json() as any[];

      console.log(`✓ Retrieved ${places.length} results`);
      console.log('📝 Updating Supabase...\n');

      // Update each lead in Supabase
      for (let i = 0; i < batch.length; i++) {
        const lead = batch[i];
        const place = places[i]; // Apify returns results in same order

        totalProcessed++;

        if (!place || !place.placeId) {
          console.log(`  ⚠️  ${lead.company_name}: No match found`);
          continue;
        }

        // Extract reviews (last 3, any rating)
        const allReviews = (place.reviews || [])
          .filter((r: any) => r.text && r.text.trim().length > 0)
          .slice(0, 3) // Just take the 3 most recent
          .map((r: any) => ({
            text: r.text,
            rating: r.stars || 0,
            publishedAt: r.publishedAtDate || r.publishAt || '',
            reviewerName: r.reviewerName || 'Anonymous',
            isLocalGuide: r.isLocalGuide || false,
            reviewUrl: r.reviewUrl || null,
          }));

        const reviews: Review[] = allReviews;

        if (reviews.length > 0) {
          totalWithReviews++;
          totalReviews += reviews.length;
        }

        // Get existing source_metadata to merge
        const { data: existingLead } = await supabase
          .schema('crm')
          .from('leads')
          .select('source_metadata')
          .eq('id', lead.id)
          .single();

        const existingMetadata = existingLead?.source_metadata || {};

        // Update the lead
        const { error } = await supabase
          .schema('crm')
          .from('leads')
          .update({
            google_place_id: place.placeId,
            google_rating: place.totalScore || null,
            google_reviews: place.reviewsCount || reviews.length,
            google_maps_url: place.url || null,
            phone: place.phone || null,
            source_metadata: {
              ...existingMetadata,
              reviews: reviews,
              last_review_fetch: new Date().toISOString(),
              google_place_data: {
                placeId: place.placeId,
                address: place.address,
                category: place.categoryName,
              }
            },
          })
          .eq('id', lead.id);

        if (error) {
          console.log(`  ❌ ${lead.company_name}: Update failed - ${error.message}`);
          errors++;
        } else {
          const reviewInfo = reviews.length > 0 
            ? `${reviews.length} reviews (${reviews[0].reviewerName}${reviews.length > 1 ? ', ...' : ''})`
            : 'no reviews';
          console.log(`  ✓ ${lead.company_name}: ${reviewInfo}`);
        }
      }

      console.log(`\n✓ Batch ${batchNum + 1} complete`);

    } catch (error) {
      console.error(`\n❌ Batch ${batchNum + 1} failed:`, error);
      errors += batch.length;
    }

    // Brief pause between batches
    if (batchNum < batches - 1) {
      console.log('\n⏸️  Pausing 5 seconds before next batch...');
      await new Promise(resolve => setTimeout(resolve, 5000));
    }
  }

  // Final summary
  console.log('\n' + '='.repeat(70));
  console.log('✅ SCRAPING COMPLETE\n');
  console.log(`Total leads processed: ${totalProcessed}`);
  console.log(`Leads with reviews: ${totalWithReviews} (${((totalWithReviews/totalProcessed)*100).toFixed(1)}%)`);
  console.log(`Total reviews collected: ${totalReviews}`);
  console.log(`Average reviews per lead: ${(totalReviews/totalWithReviews).toFixed(1)}`);
  console.log(`Errors: ${errors}`);
  console.log('\n' + '='.repeat(70) + '\n');
}

scrapeReviewsForLeads().catch(console.error);
