/**
 * Discovery Workflow
 * 
 * Business discovery via Apify Google Maps scraper.
 * Uses the Apify client for clean separation of concerns.
 * 
 * The Harness adds:
 * - Rate limiting per tenant
 * - Cost metering ($0.004/result via Apify)
 * - Artifact capture
 * - Optional: tenant's own Apify key
 * 
 * Output includes comprehensive business data:
 * - Core: name, category, address, phone, website
 * - Location: city, state, zipCode, latitude, longitude
 * - Google: placeId, googleMapsUrl, rating, reviewCount
 * - Enrichment: imageUrl
 */

import type { StepContext } from '../execution/runner';
import { runner } from '../execution/runner';
import { artifactStore } from '../artifacts';
import { DiscoveryToolInput, DiscoveryToolOutput } from '../registry/schemas';
import { searchBusinesses } from '../apify/client';
import { scanWebsitesBatch } from '../scanners/website-scanner';

// =============================================================================
// CONFIGURATION
// =============================================================================

// Cost per result from Apify Google Maps scraper
const APIFY_COST_PER_RESULT = 0.004;

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
  runner.updateStep(ctx.jobId, 1, 'Preparing search', 4);
  
  // Parse location into city and state
  const locationParts = location.split(',').map(s => s.trim());
  const city = locationParts[0] || location;
  const state = locationParts[1] || 'TX'; // Default to TX if not specified
  
  // Use tenant's Apify key if provided, otherwise platform key
  const apifyToken = ctx.secrets['apify'] || process.env.APIFY_API_TOKEN;
  
  if (!apifyToken) {
    await ctx.log('warn', 'Apify API token not configured, using mock data');
    const searchTimeMs = Date.now() - startTime;
    
    return {
      businesses: generateMockBusinesses(niche, location, limit),
      totalFound: Math.min(limit, 10),
      searchTimeMs,
    };
  }
  
  await ctx.log('info', 'Calling Apify Google Maps scraper', { niche, city, state, limit });
  
  // ==========================================================================
  // STEP 2: Call Apify via client
  // ==========================================================================
  runner.updateStep(ctx.jobId, 2, 'Searching businesses', 4);
  
  let businesses: DiscoveryToolOutput['businesses'] = [];
  
  try {
    // Call Apify client
    const results = await searchBusinesses({
      query: niche,
      city,
      state,
      maxResults: limit,
    });
    
    await ctx.log('info', `Got ${results.length} results from Apify`);
    
    // Transform to our output format
    businesses = results.map(r => ({
      name: r.name,
      website: r.website || undefined,
      phone: r.phone || undefined,
      address: r.address || undefined,
      city: r.city || undefined,
      state: r.state || undefined,
      zipCode: r.zipCode || undefined,
      rating: r.rating || undefined,
      reviewCount: r.reviewCount || undefined,
      placeId: r.googlePlaceId,
      category: r.category,
      googleMapsUrl: r.googleMapsUrl || undefined,
      latitude: r.latitude || undefined,
      longitude: r.longitude || undefined,
      imageUrl: r.imageUrl || undefined,
    }));
    
    // Record cost
    ctx.recordApiCall('apify', 'google_maps_scraper', results.length);
    
    // ==========================================================================
    // STEP 3: Comprehensive website scanning for enrichment signals
    // ==========================================================================
    runner.updateStep(ctx.jobId, 3, 'Scanning websites', 4);
    
    await ctx.log('info', 'Scanning websites for enrichment signals');
    
    const businessesWithWebsites = businesses.filter(b => b.website);
    await ctx.log('info', `Found ${businessesWithWebsites.length} businesses with websites`);
    
    if (businessesWithWebsites.length > 0) {
      // Use comprehensive scanner (limit to first 10 for performance in discovery phase)
      const websitesToScan = businessesWithWebsites.slice(0, 10).map(b => b.website!);
      
      await ctx.log('info', `Performing comprehensive scan on ${websitesToScan.length} websites`);
      
      // Scan in batches of 5 with 8-second timeout per site
      const scanResults = await scanWebsitesBatch(websitesToScan, 5, 8000);
      
      await ctx.log('info', `Scan complete: ${scanResults.filter(r => r.accessible).length}/${scanResults.length} accessible`);
      
      // Update businesses with enrichment data
      for (let i = 0; i < scanResults.length; i++) {
        const scanResult = scanResults[i];
        const business = businessesWithWebsites[i];
        
        // Find business in main array by placeId
        const businessIdx = businesses.findIndex(b => b.placeId === business.placeId);
        if (businessIdx === -1) continue;
        
        // Update enrichment fields
        businesses[businessIdx].seoOptimized = scanResult.accessible && (
          scanResult.hasMetaDescription && 
          scanResult.hasH1 && 
          scanResult.aiReadabilityScore >= 50
        );
        
        businesses[businessIdx].hasAds = scanResult.accessible && (
          scanResult.pixels.hasFacebookPixel ||
          scanResult.pixels.hasGoogleAnalytics ||
          scanResult.pixels.hasGoogleTagManager
        );
        
        businesses[businessIdx].hasSocials = scanResult.hasSocialLinks;
        
        businesses[businessIdx].hasBooking = scanResult.booking.hasBookingSystem;
        
        businesses[businessIdx].hasChatbot = scanResult.chatbot.hasChatbot;
        
        businesses[businessIdx].aiReadable = scanResult.aiReadable;
        
        // Log interesting findings
        if (scanResult.accessible) {
          const signals = [];
          if (scanResult.hasStructuredData) signals.push('structured-data');
          if (scanResult.booking.hasBookingSystem) signals.push(`booking:${scanResult.booking.bookingPlatforms.join(',')}`);
          if (scanResult.chatbot.hasChatbot) signals.push(`chat:${scanResult.chatbot.chatbotPlatforms.join(',')}`);
          if (scanResult.tech.cms) signals.push(`cms:${scanResult.tech.cms}`);
          
          if (signals.length > 0) {
            await ctx.log('debug', `${business.name}: ${signals.join(', ')}`);
          }
        }
      }
      
      await ctx.log('info', 'Website enrichment complete');
    }
    
  } catch (error) {
    await ctx.log('error', 'Apify call failed', { error: String(error) });
    
    // For development: return mock data if Apify fails
    if (!apifyToken) {
      await ctx.log('warn', 'Using mock discovery results');
      businesses = generateMockBusinesses(niche, location, limit);
    } else {
      throw error;
    }
  }
  
  // ==========================================================================
  // STEP 4: Store artifacts and finalize
  // ==========================================================================
  runner.updateStep(ctx.jobId, 4, 'Finalizing', 4);
  
  const searchTimeMs = Date.now() - startTime;
  
  // Store search results as artifact
  await artifactStore.storeLog(
    ctx.jobId,
    4,
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
  
  // Parse location to extract city/state
  const locationParts = location.split(',').map(s => s.trim());
  const city = locationParts[0] || location;
  const state = locationParts[1] || 'TX';
  
  for (let i = 0; i < count; i++) {
    businesses.push({
      name: `${niche.charAt(0).toUpperCase() + niche.slice(1)} Business ${i + 1}`,
      website: i % 3 === 0 ? undefined : `https://example${i + 1}.com`, // 1/3 have no website
      phone: `(555) 000-${String(i + 1).padStart(4, '0')}`,
      address: `${100 + i} Main St, ${city}, ${state}`,
      city: city,
      state: state,
      zipCode: `7610${i}`,
      rating: Math.round((3.5 + Math.random() * 1.5) * 10) / 10,
      reviewCount: Math.floor(Math.random() * 200) + 10,
      placeId: `ChIJmock${i}`,
      category: niche,
      googleMapsUrl: `https://www.google.com/maps/place/?q=place_id:ChIJmock${i}`,
      latitude: 30.2672 + (Math.random() * 0.1 - 0.05),
      longitude: -97.7431 + (Math.random() * 0.1 - 0.05),
      imageUrl: `https://picsum.photos/seed/${i}/400/300`,
    });
  }
  
  return businesses;
}

// =============================================================================
// REGISTER WORKFLOW
// =============================================================================

runner.registerWorkflow('discover-businesses', discoveryWorkflowHandler);

export { discoveryWorkflowHandler };
