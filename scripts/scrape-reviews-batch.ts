/**
 * Batch Review Scraper
 * 
 * Processes leads in batches of 100 for easier management
 * Can resume from where it left off
 */

import * as dotenv from 'dotenv';
import * as path from 'path';
import * as fs from 'fs/promises';
import { createClient } from '@supabase/supabase-js';
import { searchBusinesses } from '../packages/harness/src/providers/apify/google-places';
import { scrapeReviews } from '../packages/harness/src/providers/apify/review-scraper';

dotenv.config({ path: path.resolve(process.cwd(), '.env.production') });
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });
dotenv.config({ path: path.resolve(process.cwd(), '.env') });

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

interface Lead {
  id: string;
  company_name: string;
  city: string;
  state: string;
}

const BATCH_SIZE = 100;

async function scrapeReviewsBatch(startIndex: number = 0, batchSize: number = BATCH_SIZE) {
  console.log(`🚀 Starting batch review scraping...\n`);

  // Load filtered leads
  let leadsFile = 'data/all-filtered-leads.json';
  try {
    await fs.access(leadsFile);
  } catch {
    console.log('⚠️  all-filtered-leads.json not found, trying filtered-aeo-leads.json');
    leadsFile = 'data/filtered-aeo-leads.json';
    try {
      await fs.access(leadsFile);
    } catch {
      console.log('⚠️  filtered-aeo-leads.json not found, using top-1000-aeo-leads.json');
      leadsFile = 'data/top-1000-aeo-leads.json';
    }
  }

  const leadsRaw = await fs.readFile(leadsFile, 'utf-8');
  const allLeads: Lead[] = JSON.parse(leadsRaw);

  const endIndex = Math.min(startIndex + batchSize, allLeads.length);
  const batchLeads = allLeads.slice(startIndex, endIndex);

  console.log(`📊 Batch Info:`);
  console.log(`   Total leads: ${allLeads.length}`);
  console.log(`   Processing: ${startIndex + 1} to ${endIndex}`);
  console.log(`   Batch size: ${batchLeads.length}\n`);

  let successful = 0;
  let failed = 0;
  let notFound = 0;

  for (let i = 0; i < batchLeads.length; i++) {
    const lead = batchLeads[i];
    const globalIndex = startIndex + i + 1;
    
    console.log(`\n[${globalIndex}/${allLeads.length}] Processing: ${lead.company_name} (${lead.city}, ${lead.state})`);

    try {
      // STEP 1: Search
      const searchResults = await searchBusinesses({
        query: lead.company_name,
        city: lead.city,
        state: lead.state,
        maxResults: 1,
      });

      if (!searchResults || searchResults.length === 0) {
        console.log(`   ❌ Not found on Google Maps`);
        notFound++;
        continue;
      }

      const business = searchResults[0];
      console.log(`   ✅ Found: ${business.name}`);

      // STEP 2: Scrape reviews
      const reviews = await scrapeReviews({
        placeIds: [business.googlePlaceId],
        maxReviews: 5,
        reviewsSort: 'newest',
      });

      console.log(`   ✅ Scraped ${reviews.length} reviews`);

      // Update Supabase
      const sourceMetadata = {
        google_place_id: business.googlePlaceId,
        google_maps_url: business.googleMapsUrl,
        reviews: reviews.slice(0, 5).map(r => ({
          reviewer_name: r.name,
          rating: r.stars,
          text: r.text || '',
          review_url: r.reviewUrl,
        })),
        scraped_at: new Date().toISOString(),
      };

      const { error: updateError } = await supabase
        .schema('crm')
        .from('leads')
        .update({
          google_place_id: business.googlePlaceId,
          google_maps_url: business.googleMapsUrl,
          google_rating: business.rating,
          google_reviews: business.reviewCount,
          source_metadata: sourceMetadata,
        })
        .eq('id', lead.id);

      if (updateError) {
        console.error(`   ❌ DB Error: ${updateError.message}`);
        failed++;
      } else {
        console.log(`   ✅ Updated in Supabase`);
        successful++;
      }

      await new Promise(resolve => setTimeout(resolve, 1000));

    } catch (error) {
      console.error(`   ❌ Error:`, error instanceof Error ? error.message : error);
      failed++;
      await new Promise(resolve => setTimeout(resolve, 2000));
    }
  }

  console.log(`\n✅ BATCH COMPLETE!\n`);
  console.log(`📊 Batch Stats:`);
  console.log(`   Processed: ${batchLeads.length}`);
  console.log(`   ✅ Successful: ${successful}`);
  console.log(`   🔍 Not Found: ${notFound}`);
  console.log(`   ❌ Failed: ${failed}`);
  console.log(`   Success Rate: ${((successful/batchLeads.length)*100).toFixed(1)}%`);
  
  if (endIndex < allLeads.length) {
    console.log(`\n📌 To continue with next batch, run:`);
    console.log(`   npx tsx scripts/scrape-reviews-batch.ts ${endIndex}`);
  } else {
    console.log(`\n🎉 All leads processed!`);
  }
}

// Get start index from command line args
const startIndex = parseInt(process.argv[2] || '0', 10);
const batchSize = parseInt(process.argv[3] || BATCH_SIZE.toString(), 10);

scrapeReviewsBatch(startIndex, batchSize).catch(console.error);
