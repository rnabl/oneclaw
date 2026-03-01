/**
 * Business Discovery Workflow
 * 
 * Calls APIFY Google Places scraper + website scanner enrichment.
 * Returns complete business data with signals (SEO, ads, chatbot, booking, etc.)
 */

import type { StepContext } from '../execution/runner';
import { runner } from '../execution/runner';
import { z } from 'zod';
import { scanWebsite, type WebsiteScanResult } from '../scanners/website-scanner';
import { createClient } from '@supabase/supabase-js';

const BusinessDiscoveryInput = z.object({
  niche: z.string(),
  location: z.string(),
  limit: z.coerce.number().default(100),
  enrich: z.coerce.boolean().default(true),
});

type BusinessDiscoveryInput = z.infer<typeof BusinessDiscoveryInput>;

interface BusinessSignals {
  // Website presence
  hasWebsite: boolean;
  websiteAccessible: boolean;
  
  // SEO signals
  seoOptimized: boolean;
  hasSSL: boolean;
  hasMetaDescription: boolean;
  hasStructuredData: boolean;
  
  // Advertising
  hasAds: boolean;
  hasFacebookPixel: boolean;
  hasGoogleAnalytics: boolean;
  hasGoogleTagManager: boolean;
  
  // Social presence
  hasSocials: boolean;
  socialPlatforms: string[];
  
  // Booking
  hasBooking: boolean;
  bookingPlatforms: string[];
  
  // Chatbot
  hasChatbot: boolean;
  chatbotPlatforms: string[];
  
  // AI Readability
  aiReadable: boolean;
  aiReadabilityScore: number;
  
  // Tech stack
  techStack: {
    cms?: string;
    hasWordPress: boolean;
    hasShopify: boolean;
    hasWix: boolean;
  };
  
  // Trust signals from Google
  reviewCount: number | null;
  averageRating: number | null;
  reviewCountBand: 'none' | 'few' | 'some' | 'many';
  reviewRatingBand: 'none' | 'low' | 'medium' | 'high' | null;
}

interface EnrichedBusiness {
  name: string;
  phone: string | null;
  website: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
  zipCode: string | null;
  rating: number | null;
  reviewCount: number | null;
  placeId: string | null;
  googlePlaceId: string | null;
  category: string | null;
  googleMapsUrl: string | null;
  latitude: number | null;
  longitude: number | null;
  imageUrl: string | null;
  // Enrichment
  signals: BusinessSignals;
  enriched: boolean;
}

interface BusinessDiscoveryOutput extends Record<string, unknown> {
  businesses: EnrichedBusiness[];
  totalFound: number;
  searchTimeMs: number;
  enrichmentTimeMs: number;
  source: string;
  niche: string;
  location: string;
  stats: {
    total: number;
    withWebsites: number;
    enriched: number;
    withAds: number;
    withBooking: number;
    withChatbot: number;
    seoOptimized: number;
    aiReadable: number;
  };
}

function transformScanToSignals(scan: WebsiteScanResult, business: { rating: number | null; reviewCount: number | null }): BusinessSignals {
  const socialPlatforms: string[] = [];
  if (scan.social.facebook) socialPlatforms.push('facebook');
  if (scan.social.instagram) socialPlatforms.push('instagram');
  if (scan.social.twitter) socialPlatforms.push('twitter');
  if (scan.social.linkedin) socialPlatforms.push('linkedin');
  if (scan.social.youtube) socialPlatforms.push('youtube');
  if (scan.social.tiktok) socialPlatforms.push('tiktok');
  
  const seoScore = [
    scan.hasSSL,
    scan.hasMetaDescription,
    scan.hasH1,
    scan.hasStructuredData,
    scan.hasOpenGraph,
  ].filter(Boolean).length;
  
  return {
    hasWebsite: true,
    websiteAccessible: scan.accessible,
    
    seoOptimized: seoScore >= 3,
    hasSSL: scan.hasSSL,
    hasMetaDescription: scan.hasMetaDescription,
    hasStructuredData: scan.hasStructuredData,
    
    hasAds: scan.pixels.hasFacebookPixel || scan.pixels.hasGoogleAnalytics,
    hasFacebookPixel: scan.pixels.hasFacebookPixel,
    hasGoogleAnalytics: scan.pixels.hasGoogleAnalytics,
    hasGoogleTagManager: scan.pixels.hasGoogleTagManager,
    
    hasSocials: scan.hasSocialLinks,
    socialPlatforms,
    
    hasBooking: scan.booking.hasBookingSystem,
    bookingPlatforms: scan.booking.bookingPlatforms,
    
    hasChatbot: scan.chatbot.hasChatbot,
    chatbotPlatforms: scan.chatbot.chatbotPlatforms,
    
    aiReadable: scan.aiReadable,
    aiReadabilityScore: scan.aiReadabilityScore,
    
    techStack: {
      cms: scan.tech.cms,
      hasWordPress: scan.tech.hasWordPress,
      hasShopify: scan.tech.hasShopify,
      hasWix: scan.tech.hasWix,
    },
    
    reviewCount: business.reviewCount,
    averageRating: business.rating,
    reviewCountBand: business.reviewCount 
      ? (business.reviewCount >= 100 ? 'many' : business.reviewCount >= 20 ? 'some' : business.reviewCount >= 1 ? 'few' : 'none')
      : 'none',
    reviewRatingBand: business.rating
      ? (business.rating >= 4.5 ? 'high' : business.rating >= 4.0 ? 'medium' : business.rating >= 3.0 ? 'low' : 'none')
      : null,
  };
}

function getDefaultSignals(business: { rating: number | null; reviewCount: number | null; website: string | null }): BusinessSignals {
  return {
    hasWebsite: !!business.website,
    websiteAccessible: false,
    seoOptimized: false,
    hasSSL: false,
    hasMetaDescription: false,
    hasStructuredData: false,
    hasAds: false,
    hasFacebookPixel: false,
    hasGoogleAnalytics: false,
    hasGoogleTagManager: false,
    hasSocials: false,
    socialPlatforms: [],
    hasBooking: false,
    bookingPlatforms: [],
    hasChatbot: false,
    chatbotPlatforms: [],
    aiReadable: false,
    aiReadabilityScore: 0,
    techStack: { hasWordPress: false, hasShopify: false, hasWix: false },
    reviewCount: business.reviewCount,
    averageRating: business.rating,
    reviewCountBand: business.reviewCount 
      ? (business.reviewCount >= 100 ? 'many' : business.reviewCount >= 20 ? 'some' : business.reviewCount >= 1 ? 'few' : 'none')
      : 'none',
    reviewRatingBand: business.rating
      ? (business.rating >= 4.5 ? 'high' : business.rating >= 4.0 ? 'medium' : business.rating >= 3.0 ? 'low' : 'none')
      : null,
  };
}

async function businessDiscoveryHandler(
  ctx: StepContext,
  input: Record<string, unknown>
): Promise<BusinessDiscoveryOutput> {
  const params = BusinessDiscoveryInput.parse(input);
  const { niche, location, limit, enrich } = params;
  
  const startTime = Date.now();
  
  await ctx.log('info', `Starting discovery: ${niche} in ${location}`, { limit, enrich });
  
  // STEP 1: Call APIFY
  const { searchBusinesses } = await import('../providers/apify/google-places');
  
  const locationParts = location.split(',').map(s => s.trim());
  const city = locationParts[0] || location;
  const state = locationParts[1] || '';
  
  await ctx.log('info', `Calling APIFY: city="${city}", state="${state}", query="${niche}"`);
  
  const results = await searchBusinesses({
    query: niche,
    city,
    state,
    maxResults: limit,
  });
  
  await ctx.log('info', `APIFY returned ${results.length} businesses`);
  
  // Record cost: Apify Leads Finder is $1.50 per 1000 leads
  const apifyCost = (results.length / 1000) * 1.50;
  ctx.recordApiCall('apify', 'leads_finder', results.length);
  await ctx.log('info', `Cost: $${apifyCost.toFixed(4)} for ${results.length} leads`);
  
  // Deduplicate
  const seen = new Set<string>();
  const uniqueResults = results.filter(r => {
    const id = r.googlePlaceId || r.name;
    if (seen.has(id)) return false;
    seen.add(id);
    return true;
  });
  
  const apifyTime = Date.now() - startTime;
  
  // STEP 2: Enrich with website scanner (FREE - just HTTP fetches)
  const enrichStartTime = Date.now();
  const businessesWithWebsites = uniqueResults.filter(b => b.website);
  
  let scanResults: Map<string, WebsiteScanResult> = new Map();
  
  if (enrich && businessesWithWebsites.length > 0) {
    await ctx.log('info', `Enriching ${businessesWithWebsites.length} businesses with website scanner...`);
    
    // Scan in batches with rate limiting and human-like delays
    const SCAN_TIMEOUT = 10000;
    const MAX_CONCURRENT = 5; // Reduced for more human-like behavior
    const DELAY_BETWEEN_BATCHES = 2000; // 2s between batches
    const DELAY_BETWEEN_SCANS = 500; // 500ms between individual scans
    
    const batches: typeof businessesWithWebsites[] = [];
    for (let i = 0; i < businessesWithWebsites.length; i += MAX_CONCURRENT) {
      batches.push(businessesWithWebsites.slice(i, i + MAX_CONCURRENT));
    }
    
    for (let batchIndex = 0; batchIndex < batches.length; batchIndex++) {
      const batch = batches[batchIndex];
      
      await ctx.log('debug', `Scanning batch ${batchIndex + 1}/${batches.length} (${batch.length} websites)`);
      
      // Process batch with delays
      for (const business of batch) {
        try {
          const scan = await scanWebsite(business.website!, SCAN_TIMEOUT);
          scanResults.set(business.website!, scan);
          
          // Human-like delay between scans (randomized 300-700ms)
          if (batch.indexOf(business) < batch.length - 1) {
            const delay = DELAY_BETWEEN_SCANS + (Math.random() * 400 - 200);
            await new Promise(resolve => setTimeout(resolve, delay));
          }
        } catch (error) {
          await ctx.log('debug', `Scan failed for ${business.website}: ${error}`);
          // Continue with next business
        }
      }
      
      // Delay between batches (randomized 1.5-2.5s)
      if (batchIndex < batches.length - 1) {
        const batchDelay = DELAY_BETWEEN_BATCHES + (Math.random() * 1000 - 500);
        await ctx.log('debug', `Waiting ${(batchDelay / 1000).toFixed(1)}s before next batch...`);
        await new Promise(resolve => setTimeout(resolve, batchDelay));
      }
    }
    
    await ctx.log('info', `Scanned ${scanResults.size}/${businessesWithWebsites.length} websites with rate limiting`);
  }
  
  const enrichmentTimeMs = Date.now() - enrichStartTime;
  
  // STEP 3: Build enriched output
  const businesses: EnrichedBusiness[] = uniqueResults.map(r => {
    const scan = r.website ? scanResults.get(r.website) : undefined;
    const signals = scan 
      ? transformScanToSignals(scan, { rating: r.rating, reviewCount: r.reviewCount })
      : getDefaultSignals({ rating: r.rating, reviewCount: r.reviewCount, website: r.website });
    
    return {
      name: r.name,
      phone: r.phone,
      website: r.website,
      address: r.address,
      city: r.city,
      state: r.state,
      zipCode: r.zipCode,
      rating: r.rating,
      reviewCount: r.reviewCount,
      placeId: r.googlePlaceId,
      googlePlaceId: r.googlePlaceId,
      category: r.category,
      googleMapsUrl: r.googleMapsUrl,
      latitude: r.latitude,
      longitude: r.longitude,
      imageUrl: r.imageUrl,
      signals,
      enriched: !!scan,
    };
  });
  
  // Calculate stats
  const stats = {
    total: businesses.length,
    withWebsites: businesses.filter(b => b.website).length,
    enriched: businesses.filter(b => b.enriched).length,
    withAds: businesses.filter(b => b.signals.hasAds).length,
    withBooking: businesses.filter(b => b.signals.hasBooking).length,
    withChatbot: businesses.filter(b => b.signals.hasChatbot).length,
    seoOptimized: businesses.filter(b => b.signals.seoOptimized).length,
    aiReadable: businesses.filter(b => b.signals.aiReadable).length,
  };
  
  const searchTimeMs = Date.now() - startTime;
  
  await ctx.log('info', `Discovery complete: ${businesses.length} businesses, ${stats.enriched} enriched in ${searchTimeMs}ms`);
  await ctx.log('info', `Stats: ${stats.withAds} with ads, ${stats.withBooking} with booking, ${stats.withChatbot} with chatbot`);
  
  // ==========================================================================
  // STEP 4: Store in Supabase (Production Database)
  // ==========================================================================
  
  if (process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY) {
    await ctx.log('info', 'Storing leads in Supabase production database...');
    
    try {
      const supabase = createClient(
        process.env.SUPABASE_URL,
        process.env.SUPABASE_SERVICE_ROLE_KEY
      );
      
      const leadRecords = businesses.map(b => {
        const signals = b.signals || {};
        
        // Auto-calculate scores from signals
        let score = 50;
        if (b.website) score += 20;
        if (signals.hasAds) score += 10;
        if (!signals.aiReadable) score += 15; // Low AI visibility = bigger opportunity
        if (b.reviewCount && b.reviewCount > 20) score += 5;
        
        return {
          company_name: b.name,
          website: b.website,
          phone: b.phone,
          industry: niche,
          address: b.address,
          city: b.city,
          state: b.state,
          zip_code: b.zipCode,
          google_place_id: b.googlePlaceId || b.placeId,
          google_rating: b.rating,
          google_reviews: b.reviewCount,
          google_maps_url: b.googleMapsUrl,
          image_url: b.imageUrl,
          website_signals: signals,
          lead_score: Math.min(score, 100),
          geo_readiness_score: signals.seoOptimized ? 7.0 : 3.0,
          aeo_readiness_score: signals.aiReadable ? 7.0 : 2.0,
          stage: 'discovered',
          source_job_id: ctx.jobId,
        };
      });
      
      const { data, error } = await supabase
        .from('crm.leads')
        .insert(leadRecords)
        .select('id');
      
      if (error) {
        await ctx.log('warn', `Supabase storage failed: ${error.message}`);
      } else {
        await ctx.log('info', `✅ Stored ${data?.length || 0} leads in Supabase crm.leads table`);
      }
    } catch (error) {
      await ctx.log('warn', `Supabase error: ${error}. Continuing without Supabase storage.`);
      // Don't fail workflow if Supabase unavailable
    }
  }
  
  // Build formatted response for chat display
  const formattedResponse = formatDiscoveryForChat(businesses, stats, niche, location, searchTimeMs);
  
  return {
    businesses,
    totalFound: businesses.length,
    searchTimeMs,
    enrichmentTimeMs,
    source: 'harness-apify',
    niche,
    location,
    stats,
    formattedResponse,
  };
}

function formatDiscoveryForChat(
  businesses: EnrichedBusiness[],
  stats: BusinessDiscoveryOutput['stats'],
  niche: string,
  location: string,
  searchTimeMs: number
): string {
  const ratings = businesses.filter(b => b.rating).map(b => b.rating!);
  const avgRating = ratings.length > 0 
    ? (ratings.reduce((a, b) => a + b, 0) / ratings.length).toFixed(1) 
    : 'N/A';
  const withPhone = businesses.filter(b => b.phone).length;
  
  let msg = `## 🔥 Found ${stats.total} ${niche} in ${location}\n\n`;
  msg += `| Metric | Value |\n|--------|-------|\n`;
  msg += `| ⏱️ Search Time | ${(searchTimeMs / 1000).toFixed(1)}s |\n`;
  msg += `| ⭐ Avg Rating | ${avgRating} |\n`;
  msg += `| 🌐 With Website | ${stats.withWebsites}/${stats.total} |\n`;
  msg += `| 📞 With Phone | ${withPhone}/${stats.total} |\n`;
  msg += `| 📊 Enriched | ${stats.enriched} |\n`;
  msg += `| 📈 Running Ads | ${stats.withAds} |\n`;
  msg += `| 📅 Has Booking | ${stats.withBooking} |\n`;
  msg += `| 🤖 Has Chatbot | ${stats.withChatbot} |\n\n`;
  
  msg += `### Results\n\n`;
  msg += `| # | Business | ⭐ | Phone | SEO | Ads | Book | Bot |\n`;
  msg += `|---|----------|-----|-------|-----|-----|------|-----|\n`;
  
  const displayCount = Math.min(15, businesses.length);
  for (let i = 0; i < displayCount; i++) {
    const b = businesses[i];
    const num = i + 1;
    const name = b.name.length > 28 ? b.name.substring(0, 25) + '...' : b.name;
    const rating = b.rating ? b.rating.toFixed(1) : 'N/A';
    const phone = b.phone ? b.phone.replace(/[^\d]/g, '').slice(-10) : '';
    const phoneFormatted = phone.length === 10 
      ? `(${phone.slice(0,3)}) ${phone.slice(3,6)}-${phone.slice(6,10)}`
      : '—';
    
    const seo = b.signals.seoOptimized ? '✅' : '❌';
    const ads = b.signals.hasAds ? '✅' : '❌';
    const cal = b.signals.hasBooking ? '✅' : '❌';
    const bot = b.signals.hasChatbot ? '✅' : '❌';
    
    msg += `| ${num} | ${name} | ${rating} | ${phoneFormatted} | ${seo} | ${ads} | ${cal} | ${bot} |\n`;
  }
  
  if (businesses.length > displayCount) {
    msg += `\n*+ ${businesses.length - displayCount} more businesses available*\n`;
  }
  
  msg += `\n### Legend\n`;
  msg += `- **SEO** = Website optimized (SSL, meta, structured data)\n`;
  msg += `- **Ads** = Running Facebook/Google pixels\n`;
  msg += `- **Book** = Has online booking system\n`;
  msg += `- **Bot** = Has chatbot installed\n`;
  
  msg += `\n### Actions\n`;
  msg += `- \`enrich <#>\` — Get owner info & deep signals\n`;
  msg += `- \`details <#>\` — Full business profile\n`;
  msg += `- \`export\` — Download as CSV\n`;
  
  return msg;
}

runner.registerWorkflow('discover-businesses', businessDiscoveryHandler);

export { businessDiscoveryHandler };
