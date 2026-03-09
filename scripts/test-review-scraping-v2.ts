/**
 * Test Review Scraping (Two-Step Process)
 * 
 * Step 1: Search for businesses to get Place IDs
 * Step 2: Scrape reviews using the dedicated reviews scraper
 */

import * as dotenv from 'dotenv';
import * as path from 'path';
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

async function testReviewScraping() {
  console.log('Starting two-step review scraping test...\n');

  // Fetch 5 test leads from our top-1000 file
  const fs = await import('fs/promises');
  const topLeadsRaw = await fs.readFile('data/top-1000-aeo-leads.json', 'utf-8');
  const topLeads = JSON.parse(topLeadsRaw);
  
  const testLeads = topLeads.slice(0, 5);
  
  console.log(`Testing with ${testLeads.length} leads:\n`);

  for (const lead of testLeads) {
    console.log(`\n${'='.repeat(80)}`);
    console.log(`Company: ${lead.company_name}`);
    console.log(`Location: ${lead.city}, ${lead.state}`);
    console.log(`${'='.repeat(80)}\n`);

    try {
      // STEP 1: Search for the business to get Place ID
      console.log('Step 1: Searching for business...');
      
      const searchResults = await searchBusinesses({
        query: lead.company_name,
        city: lead.city,
        state: lead.state,
        maxResults: 1,
      });

      if (!searchResults || searchResults.length === 0) {
        console.log('❌ No business found in search\n');
        continue;
      }

      const business = searchResults[0];
      console.log(`✅ Found: ${business.name}`);
      console.log(`   Place ID: ${business.googlePlaceId}`);
      console.log(`   URL: ${business.googleMapsUrl}\n`);

      // STEP 2: Scrape reviews using the dedicated scraper
      console.log('Step 2: Scraping reviews...');
      
      // STEP 2: Scrape reviews using Place ID
      console.log('Step 2: Scraping reviews...');
      console.log(`   Using Place ID: ${business.googlePlaceId}`);
      
      const reviews = await scrapeReviews({
        placeIds: [business.googlePlaceId],
        maxReviews: 5,
        reviewsSort: 'newest',
      });

      console.log(`✅ Scraped ${reviews.length} reviews:\n`);

      // Display reviews
      reviews.forEach((review, idx) => {
        console.log(`Review ${idx + 1}:`);
        console.log(`  Reviewer: ${review.name}`);
        console.log(`  Rating: ${review.stars} stars`);
        const reviewText = review.text || '(No text)';
        console.log(`  Text: ${reviewText.substring(0, 150)}${reviewText.length > 150 ? '...' : ''}`);
        console.log();
      });

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
      console.log('Updating Supabase...');
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
        console.error('❌ Error updating lead:', updateError.message);
      } else {
        console.log('✅ Lead updated successfully');
      }

    } catch (error) {
      console.error('❌ Error processing lead:', error);
    }
  }

  console.log('\n✅ Test complete!');
}

testReviewScraping().catch(console.error);
