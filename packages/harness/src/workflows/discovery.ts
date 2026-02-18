/**
 * Discovery Workflow
 * 
 * Business discovery via Apify Google Maps scraper.
 * This mirrors your nabl/src/app/api/discovery/search/route.ts
 * 
 * The Harness adds:
 * - Rate limiting per tenant
 * - Cost metering ($0.004/result via Apify)
 * - Artifact capture
 * - Optional: tenant's own Apify key
 */

import type { StepContext } from '../execution/runner';
import { runner } from '../execution/runner';
import { artifactStore } from '../artifacts';
import { DiscoveryToolInput, DiscoveryToolOutput } from '../registry/schemas';

// =============================================================================
// CONFIGURATION
// =============================================================================

const APIFY_API_TOKEN = process.env.APIFY_API_TOKEN || '';
const APIFY_ACTOR_ID = process.env.APIFY_ACTOR_ID || 'compass~crawler-google-places';

// Cost per result from Apify Google Maps scraper
const APIFY_COST_PER_RESULT = 0.004;

// =============================================================================
// TYPES (matching your provider types)
// =============================================================================

interface ApifyGoogleMapsResult {
  placeId: string;
  title: string;
  address: string;
  city?: string;
  state?: string;
  postalCode?: string;
  phone?: string;
  website?: string;
  totalScore?: number;
  reviewsCount?: number;
  categoryName?: string;
  location?: {
    lat: number;
    lng: number;
  };
}

// =============================================================================
// DISCOVERY WORKFLOW HANDLER
// =============================================================================

async function discoveryWorkflowHandler(
  ctx: StepContext,
  input: Record<string, unknown>
): Promise<DiscoveryToolOutput> {
  const params = input as DiscoveryToolInput;
  const { niche, location, limit = 50 } = params;
  
  await ctx.log('info', `Starting discovery: ${niche} in ${location}`, { limit });
  
  const startTime = Date.now();
  
  // ==========================================================================
  // STEP 1: Prepare Apify request
  // ==========================================================================
  runner.updateStep(ctx.jobId, 1, 'Preparing search', 3);
  
  // Use tenant's Apify key if provided, otherwise platform key
  const apifyToken = ctx.secrets['apify'] || APIFY_API_TOKEN;
  
  if (!apifyToken) {
    await ctx.log('warn', 'Apify API token not configured, using mock data');
    const searchTimeMs = Date.now() - startTime;
    
    return {
      businesses: generateMockBusinesses(niche, location, limit),
      totalFound: Math.min(limit, 10),
      searchTimeMs,
    };
  }
  
  // Build search query
  const searchQuery = `${niche} in ${location}`;
  
  const apifyInput = {
    searchStringsArray: [searchQuery],
    maxCrawledPlacesPerSearch: limit,
    language: 'en',
    // Only get essential fields to reduce cost
    includeWebResults: false,
    includeHistogram: false,
    includePeopleAlsoSearch: false,
  };
  
  await ctx.log('info', 'Calling Apify Google Maps scraper', { query: searchQuery, limit });
  
  // ==========================================================================
  // STEP 2: Call Apify actor
  // ==========================================================================
  runner.updateStep(ctx.jobId, 2, 'Searching businesses', 3);
  
  let businesses: DiscoveryToolOutput['businesses'] = [];
  
  try {
    // Start the actor run
    const runResponse = await fetch(
      `https://api.apify.com/v2/acts/${APIFY_ACTOR_ID}/runs?token=${apifyToken}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(apifyInput),
      }
    );
    
    if (!runResponse.ok) {
      const error = await runResponse.text();
      throw new Error(`Apify start failed: ${runResponse.status} - ${error}`);
    }
    
    const runData = await runResponse.json();
    const runId = runData.data?.id;
    
    if (!runId) {
      throw new Error('Apify did not return a run ID');
    }
    
    await ctx.log('info', `Apify run started: ${runId}`);
    
    // Poll for completion (with timeout)
    const maxWaitMs = 90000;  // 90 seconds
    const pollIntervalMs = 2000;
    let elapsed = 0;
    let status = 'RUNNING';
    
    while (status === 'RUNNING' && elapsed < maxWaitMs) {
      await new Promise(resolve => setTimeout(resolve, pollIntervalMs));
      elapsed += pollIntervalMs;
      
      const statusResponse = await fetch(
        `https://api.apify.com/v2/actor-runs/${runId}?token=${apifyToken}`
      );
      const statusData = await statusResponse.json();
      status = statusData.data?.status || 'FAILED';
      
      await ctx.log('debug', `Apify status: ${status} (${elapsed}ms)`);
    }
    
    if (status !== 'SUCCEEDED') {
      throw new Error(`Apify run failed or timed out: ${status}`);
    }
    
    // Get results from dataset
    const datasetResponse = await fetch(
      `https://api.apify.com/v2/actor-runs/${runId}/dataset/items?token=${apifyToken}`
    );
    
    if (!datasetResponse.ok) {
      throw new Error(`Failed to get Apify results: ${datasetResponse.status}`);
    }
    
    const results: ApifyGoogleMapsResult[] = await datasetResponse.json();
    
    await ctx.log('info', `Got ${results.length} results from Apify`);
    
    // Transform to our format
    businesses = results.map(r => ({
      name: r.title,
      website: r.website,
      phone: r.phone,
      address: r.address,
      rating: r.totalScore,
      reviewCount: r.reviewsCount,
    }));
    
    // Record cost
    ctx.recordApiCall('apify', 'google_maps_scraper', results.length);
    
  } catch (error) {
    await ctx.log('error', 'Apify call failed', { error: String(error) });
    
    // For development: return mock data if Apify fails
    if (!APIFY_API_TOKEN) {
      await ctx.log('warn', 'Using mock discovery results');
      businesses = generateMockBusinesses(niche, location, limit);
    } else {
      throw error;
    }
  }
  
  // ==========================================================================
  // STEP 3: Store artifacts and finalize
  // ==========================================================================
  runner.updateStep(ctx.jobId, 3, 'Finalizing', 3);
  
  const searchTimeMs = Date.now() - startTime;
  
  // Store search results as artifact
  await artifactStore.storeLog(
    ctx.jobId,
    3,
    'Discovery results',
    'info',
    `Found ${businesses.length} businesses`,
    { 
      niche, 
      location, 
      count: businesses.length,
      searchTimeMs,
    }
  );
  
  await ctx.log('info', `Discovery complete: ${businesses.length} businesses in ${searchTimeMs}ms`);
  
  return {
    businesses,
    totalFound: businesses.length,
    searchTimeMs,
  };
}

// =============================================================================
// HELPERS
// =============================================================================

function generateMockBusinesses(niche: string, location: string, limit: number) {
  const count = Math.min(limit, 10);
  const businesses = [];
  
  for (let i = 0; i < count; i++) {
    businesses.push({
      name: `${niche.charAt(0).toUpperCase() + niche.slice(1)} Business ${i + 1}`,
      website: `https://example${i + 1}.com`,
      phone: `(555) 000-${String(i + 1).padStart(4, '0')}`,
      address: `${100 + i} Main St, ${location}`,
      rating: Math.round((3.5 + Math.random() * 1.5) * 10) / 10,
      reviewCount: Math.floor(Math.random() * 200) + 10,
    });
  }
  
  return businesses;
}

// =============================================================================
// REGISTER WORKFLOW
// =============================================================================

runner.registerWorkflow('discover-businesses', discoveryWorkflowHandler);

export { discoveryWorkflowHandler };
