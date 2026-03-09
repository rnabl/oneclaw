/**
 * Review Scraping Workflow
 * 
 * Enriches leads with Google Maps reviews for personalized outreach.
 * 
 * Process:
 * 1. Fetch filtered leads from Supabase
 * 2. Search Google Maps for business (if no Place ID)
 * 3. Scrape 5 most recent reviews
 * 4. Update lead in Supabase with reviews
 * 
 * Input:
 * - leadIds: Array of lead UUIDs to process (optional, processes all if empty)
 * - batchSize: Number of leads to process (default: all)
 * - skipExisting: Skip leads that already have reviews (default: true)
 * 
 * Output:
 * - processed: Number of leads processed
 * - successful: Number with reviews added
 * - failed: Number that failed
 * - skipped: Number skipped (already had reviews)
 */

import type { StepContext } from '../execution/runner';
import { runner } from '../execution/runner';
import { z } from 'zod';
import { searchBusinesses } from '../providers/apify/google-places';
import { scrapeReviews } from '../providers/apify/review-scraper';
import { supabase } from '../lib/supabase';

// =============================================================================
// SCHEMAS
// =============================================================================

const ScrapeReviewsInput = z.object({
  leadIds: z.array(z.string().uuid()).optional(),
  batchSize: z.number().optional(),
  skipExisting: z.boolean().default(true),
});

type ScrapeReviewsInput = z.infer<typeof ScrapeReviewsInput>;

interface Lead {
  id: string;
  company_name: string;
  city: string;
  state: string;
  google_place_id?: string;
  google_maps_url?: string;
  source_metadata?: any;
}

interface ScrapeReviewsOutput extends Record<string, unknown> {
  processed: number;
  successful: number;
  failed: number;
  skipped: number;
  errors: Array<{ leadId: string; error: string }>;
}

// =============================================================================
// WORKFLOW STEPS
// =============================================================================

/**
 * Step 1: Fetch leads to process
 */
async function fetchLeads(
  ctx: StepContext,
  input: ScrapeReviewsInput
): Promise<Lead[]> {
  await ctx.log('info', 'Fetching leads to process...');

  let query = supabase
    .schema('crm')
    .from('leads')
    .select('id, company_name, city, state, google_place_id, google_maps_url, source_metadata');

  // Filter by specific lead IDs if provided
  if (input.leadIds && input.leadIds.length > 0) {
    query = query.in('id', input.leadIds);
  }

  // Skip leads that already have reviews if requested
  if (input.skipExisting) {
    query = query.or('source_metadata->reviews.is.null,source_metadata.is.null');
  }

  // Apply batch size limit
  if (input.batchSize) {
    query = query.limit(input.batchSize);
  }

  const { data, error } = await query;

  if (error) {
    throw new Error(`Failed to fetch leads: ${error.message}`);
  }

  await ctx.log('info', `Fetched ${data?.length || 0} leads to process`);
  return (data as Lead[]) || [];
}

/**
 * Step 2: Search for business on Google Maps (if needed)
 */
async function searchBusiness(
  ctx: StepContext,
  lead: Lead
): Promise<{ placeId: string; mapsUrl: string; rating: number; reviewCount: number } | null> {
  
  // Skip search if we already have Place ID
  if (lead.google_place_id) {
    await ctx.log('debug', `Lead ${lead.id} already has Place ID, skipping search`);
    return {
      placeId: lead.google_place_id,
      mapsUrl: lead.google_maps_url || '',
      rating: 0,
      reviewCount: 0,
    };
  }

  await ctx.log('info', `Searching Google Maps for: ${lead.company_name} (${lead.city}, ${lead.state})`);

  try {
    const results = await searchBusinesses({
      query: lead.company_name,
      city: lead.city,
      state: lead.state,
      maxResults: 1,
    });

    if (!results || results.length === 0) {
      await ctx.log('warn', `No business found for: ${lead.company_name}`);
      return null;
    }

    const business = results[0];
    await ctx.log('info', `Found: ${business.name} (Place ID: ${business.googlePlaceId})`);

    return {
      placeId: business.googlePlaceId,
      mapsUrl: business.googleMapsUrl || '',
      rating: business.rating || 0,
      reviewCount: business.reviewCount || 0,
    };

  } catch (error) {
    await ctx.log('error', `Search failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    return null;
  }
}

/**
 * Step 3: Scrape reviews
 */
async function getReviews(
  ctx: StepContext,
  placeId: string
): Promise<Array<{ reviewer_name: string; rating: number; text: string; review_url: string }>> {
  
  await ctx.log('info', `Scraping reviews for Place ID: ${placeId}`);

  try {
    const reviews = await scrapeReviews({
      placeIds: [placeId],
      maxReviews: 5,
      reviewsSort: 'newest',
    });

    await ctx.log('info', `Scraped ${reviews.length} reviews`);

    return reviews.slice(0, 5).map(r => ({
      reviewer_name: r.name,
      rating: r.stars,
      text: r.text || '',
      review_url: r.reviewUrl,
    }));

  } catch (error) {
    await ctx.log('error', `Review scraping failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    return [];
  }
}

/**
 * Step 4: Update lead in Supabase
 */
async function updateLead(
  ctx: StepContext,
  leadId: string,
  businessData: { placeId: string; mapsUrl: string; rating: number; reviewCount: number },
  reviews: Array<{ reviewer_name: string; rating: number; text: string; review_url: string }>
): Promise<boolean> {
  
  await ctx.log('info', `Updating lead ${leadId} in Supabase`);

  const sourceMetadata = {
    google_place_id: businessData.placeId,
    google_maps_url: businessData.mapsUrl,
    reviews,
    scraped_at: new Date().toISOString(),
  };

  try {
    const { error } = await supabase
      .schema('crm')
      .from('leads')
      .update({
        google_place_id: businessData.placeId,
        google_maps_url: businessData.mapsUrl,
        google_rating: businessData.rating || undefined,
        google_reviews: businessData.reviewCount || undefined,
        source_metadata: sourceMetadata,
      })
      .eq('id', leadId);

    if (error) {
      await ctx.log('error', `Supabase update failed: ${error.message}`);
      return false;
    }

    await ctx.log('info', `Successfully updated lead ${leadId}`);
    return true;

  } catch (error) {
    await ctx.log('error', `Update failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    return false;
  }
}

/**
 * Main workflow: Process all leads
 */
async function scrapeReviewsWorkflow(
  ctx: StepContext,
  input: ScrapeReviewsInput
): Promise<ScrapeReviewsOutput> {
  
  const startTime = Date.now();
  const output: ScrapeReviewsOutput = {
    processed: 0,
    successful: 0,
    failed: 0,
    skipped: 0,
    errors: [],
  };

  // Step 1: Fetch leads
  const leads = await fetchLeads(ctx, input);
  
  if (leads.length === 0) {
    await ctx.log('info', 'No leads to process');
    return output;
  }

  // Process each lead
  for (const lead of leads) {
    output.processed++;

    await ctx.log('info', `\n[${output.processed}/${leads.length}] Processing: ${lead.company_name} (${lead.city}, ${lead.state})`);

    try {
      // Step 2: Search for business (if needed)
      const businessData = await searchBusiness(ctx, lead);
      
      if (!businessData) {
        output.failed++;
        output.errors.push({ leadId: lead.id, error: 'Business not found on Google Maps' });
        continue;
      }

      // Step 3: Scrape reviews
      const reviews = await getReviews(ctx, businessData.placeId);
      
      if (reviews.length === 0) {
        await ctx.log('warn', 'No reviews found, but will still update lead with Place ID');
      }

      // Step 4: Update lead
      const success = await updateLead(ctx, lead.id, businessData, reviews);
      
      if (success) {
        output.successful++;
      } else {
        output.failed++;
        output.errors.push({ leadId: lead.id, error: 'Failed to update Supabase' });
      }

      // Rate limiting
      await new Promise(resolve => setTimeout(resolve, 1000));

    } catch (error) {
      output.failed++;
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      output.errors.push({ leadId: lead.id, error: errorMessage });
      await ctx.log('error', `Failed to process lead: ${errorMessage}`);
      
      // Wait longer on error
      await new Promise(resolve => setTimeout(resolve, 2000));
    }

    // Progress report every 50 leads
    if (output.processed % 50 === 0) {
      await ctx.log('info', `\n📊 Progress: ${output.processed}/${leads.length} | ✅ ${output.successful} | ❌ ${output.failed}`);
    }
  }

  const duration = Date.now() - startTime;
  await ctx.log('info', `\n✅ Workflow complete in ${Math.round(duration / 1000)}s`);
  await ctx.log('info', `📊 Final: ${output.successful} successful, ${output.failed} failed, ${output.skipped} skipped`);

  return output;
}

// =============================================================================
// REGISTER WORKFLOW
// =============================================================================

export async function scrapeReviewsHandler(ctx: StepContext, input: ScrapeReviewsInput) {
  return await scrapeReviewsWorkflow(ctx, input);
}

runner.registerWorkflow('scrape-reviews', scrapeReviewsHandler);
