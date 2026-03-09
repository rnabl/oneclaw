/**
 * Scrape Reviews for Top 1,000 AEO Leads (Production)
 * 
 * Two-step process:
 * 1. Search for business on Google Maps to get Place ID
 * 2. Scrape reviews using dedicated reviews scraper
 */

import * as dotenv from 'dotenv';
import * as path from 'path';
import * as fs from 'fs/promises';
import { createClient } from '@supabase/supabase-js';
import { searchBusinesses } from '../packages/harness/src/providers/apify/google-places';
import { scrapeReviews } from '../packages/harness/src/providers/apify/review-scraper';

// Load environment variables
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

async function scrapeReviewsForAllLeads() {
  console.log('🚀 Starting review scraping for top 1,000 AEO leads...\n');

  // Load the top 1,000 leads
  const topLeadsRaw = await fs.readFile('data/top-1000-aeo-leads.json', 'utf-8');
  const allLeads: Lead[] = JSON.parse(topLeadsRaw);

  console.log(`📊 Total leads to process: ${allLeads.length}\n`);

  let processed = 0;
  let successful = 0;
  let failed = 0;
  let notFound = 0;

  for (const lead of allLeads) {
    processed++;
    
    console.log(`\n[${ processed}/${allLeads.length}] Processing: ${lead.company_name} (${lead.city}, ${lead.state})`);

    try {
      // STEP 1: Search for business
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
      console.log(`   ✅ Found: ${business.name} (Place ID: ${business.googlePlaceId})`);

      // STEP 2: Scrape reviews
      const reviews = await scrapeReviews({
        placeIds: [business.googlePlaceId],
        maxReviews: 5,
        reviewsSort: 'newest',
      });

      console.log(`   ✅ Scraped ${reviews.length} reviews`);

      // Prepare source_metadata
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

      // Update Supabase
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

      // Rate limiting: wait 1 second between requests
      await new Promise(resolve => setTimeout(resolve, 1000));

    } catch (error) {
      console.error(`   ❌ Error:`, error instanceof Error ? error.message : error);
      failed++;
      
      // On error, wait a bit longer before continuing
      await new Promise(resolve => setTimeout(resolve, 2000));
    }

    // Progress report every 50 leads
    if (processed % 50 === 0) {
      console.log(`\n📊 Progress Report:`);
      console.log(`   Processed: ${processed}/${allLeads.length}`);
      console.log(`   Successful: ${successful}`);
      console.log(`   Not Found: ${notFound}`);
      console.log(`   Failed: ${failed}`);
      console.log(`   Success Rate: ${((successful/processed)*100).toFixed(1)}%\n`);
    }
  }

  console.log(`\n✅ COMPLETE!\n`);
  console.log(`📊 Final Stats:`);
  console.log(`   Total Processed: ${processed}`);
  console.log(`   ✅ Successful: ${successful}`);
  console.log(`   🔍 Not Found: ${notFound}`);
  console.log(`   ❌ Failed: ${failed}`);
  console.log(`   Success Rate: ${((successful/processed)*100).toFixed(1)}%`);
}

scrapeReviewsForAllLeads().catch(console.error);
