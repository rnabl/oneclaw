/**
 * Job Posting Discovery Workflow
 * 
 * Discovers businesses by finding active job postings (high-intent signal).
 * Calls Notte API (job scraper) + website scanner enrichment.
 * Returns complete business data with hiring signals.
 */

import type { StepContext } from '../execution/runner';
import { runner } from '../execution/runner';
import { z } from 'zod';
import { scanWebsite, type WebsiteScanResult } from '../scanners/website-scanner';

const JobDiscoveryInput = z.object({
  keyword: z.string(), // "HVAC companies hiring" or just "HVAC"
  location: z.string().default('United States'),
  days: z.coerce.number().default(7), // Job posting recency
  maxResults: z.coerce.number().default(50),
  enrich: z.coerce.boolean().default(true),
});

type JobDiscoveryInput = z.infer<typeof JobDiscoveryInput>;

interface BusinessSignals {
  // Existing website signals (from website-scanner)
  hasWebsite: boolean;
  websiteAccessible: boolean;
  seoOptimized: boolean;
  hasSSL: boolean;
  hasMetaDescription: boolean;
  hasStructuredData: boolean;
  hasAds: boolean;
  hasFacebookPixel: boolean;
  hasGoogleAnalytics: boolean;
  hasGoogleTagManager: boolean;
  hasSocials: boolean;
  socialPlatforms: string[];
  hasBooking: boolean;
  bookingPlatforms: string[];
  hasChatbot: boolean;
  chatbotPlatforms: string[];
  aiReadable: boolean;
  aiReadabilityScore: number;
  techStack: {
    cms?: string;
    hasWordPress: boolean;
    hasShopify: boolean;
    hasWix: boolean;
  };
  
  // NEW: Job/Hiring signals
  isHiring: boolean;
  hiringRoles: string[]; // Array of position names
  hiringIntensity: 'low' | 'medium' | 'high'; // Based on # of open positions
  mostRecentJobDays: number; // Days since most recent posting
  totalJobPostings: number;
  
  // Google review signals (for credibility)
  reviewCount: number | null;
  averageRating: number | null;
  reviewCountBand: 'none' | 'few' | 'some' | 'many';
  reviewRatingBand: 'none' | 'low' | 'medium' | 'high' | null;
}

interface EnrichedHiringBusiness {
  // Core business info
  name: string;
  website: string | null;
  phone: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
  zipCode: string | null;
  
  // Job posting data
  jobPostings: Array<{
    positionName: string;
    salary: string | null;
    jobType: string[];
    postedDaysAgo: number;
    url: string;
    source?: string;
    contact?: {
      name: string | null;
      title: string | null;
      linkedinUrl: string | null;
      note: string | null;
    } | null;
  }>;
  
  // Trust signals
  rating: number | null;
  reviewCount: number | null;
  
  // Enrichment
  signals: BusinessSignals;
  enriched: boolean;
  
  // Business type inference (NEW - from LLM analysis)
  businessType?: 'residential' | 'commercial' | 'both' | 'unknown';
  businessTypeConfidence?: number; // 0-1
  
  // Business description (from website scan)
  businessDescription?: string;
  businessServices?: string[];
  
  // LinkedIn contact search URL
  linkedinSearchUrl?: string | null;
  
  // Outreach priority (NEW)
  priorityScore?: number; // 1-100, higher = contact first
  priorityTier?: 'hot' | 'warm' | 'cold'; // Quick visual indicator
}

interface JobDiscoveryOutput extends Record<string, unknown> {
  businesses: EnrichedHiringBusiness[];
  totalFound: number;
  searchTimeMs: number;
  enrichmentTimeMs: number;
  source: string;
  keyword: string;
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
    avgJobPostings: number;
    businessTypeResidential: number;
    businessTypeCommercial: number;
    businessTypeBoth: number;
  };
}

/**
 * Call Notte API to get job postings
 */
async function fetchJobPostings(ctx: StepContext, params: {
  keyword: string;
  location: string;
  days: number;
  maxResults: number;
}): Promise<any[]> {
  const notteApiKey = process.env.NOTTE_API_KEY;
  const notteEndpoint = 'https://us-prod.notte.cc/functions/0f5af6eb-55d0-4b1b-86e6-394f06a6f680/runs/start';
  
  if (!notteApiKey) {
    throw new Error('NOTTE_API_KEY not configured in environment variables');
  }
  
  if (notteApiKey === 'YOUR_NOTTE_API_KEY_HERE') {
    throw new Error('NOTTE_API_KEY is still set to placeholder value. Please update .env.production');
  }
  
  await ctx.log('info', `Calling Notte API for jobs: "${params.keyword}" in ${params.location}`);
  
  const response = await fetch(notteEndpoint, {
    method: 'POST',
    headers: {
      'x-notte-api-key': notteApiKey,
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${notteApiKey}`,
    },
    body: JSON.stringify({
      function_id: '0f5af6eb-55d0-4b1b-86e6-394f06a6f680',
      variables: {
        keyword: params.keyword,
        days: params.days,
        location: params.location,
        max_results: params.maxResults,
      },
    }),
  });
  
  if (!response.ok) {
    const errorText = await response.text();
    await ctx.log('error', `Notte API failed: ${response.status} ${response.statusText}`, { body: errorText });
    throw new Error(`Notte API failed: ${response.status} ${response.statusText}. Body: ${errorText}`);
  }
  
  const data = await response.json();
  
  await ctx.log('debug', 'Notte API response structure', { 
    status: data.status,
    hasResult: !!data.result,
    linkedinCount: data.result?.summary?.linkedin_count,
    indeedCount: data.result?.summary?.indeed_count,
  });
  
  // Parse Notte response structure
  // Response format: { result: { linkedin: [...], indeed: [...] } }
  let jobs: any[] = [];
  
  if (data.result) {
    // Combine LinkedIn and Indeed results
    const linkedinJobs = data.result.linkedin || [];
    const indeedJobs = data.result.indeed || [];
    
    // Filter out the Indeed placeholder message
    const validIndeedJobs = indeedJobs.filter((job: any) => 
      job.company !== 'Indeed' && job.title !== 'Indeed requires browser access — click the job_url to search directly on Indeed'
    );
    
    jobs = [...linkedinJobs, ...validIndeedJobs];
    
    await ctx.log('info', `✅ Notte returned ${jobs.length} job postings (${linkedinJobs.length} LinkedIn, ${validIndeedJobs.length} Indeed)`);
  } else {
    await ctx.log('warn', 'Unexpected Notte response structure', { data });
    throw new Error('Unexpected Notte API response structure: missing result field');
  }
  
  return jobs;
}

/**
 * Group job postings by company
 */
function groupJobsByCompany(jobs: any[]): Map<string, any[]> {
  const companyMap = new Map<string, any[]>();
  
  for (const job of jobs) {
    const companyName = job.company || job.companyName || 'Unknown';
    
    if (!companyMap.has(companyName)) {
      companyMap.set(companyName, []);
    }
    
    companyMap.get(companyName)!.push(job);
  }
  
  return companyMap;
}

/**
 * Transform website scan to signals (same as discover-businesses)
 */
function transformScanToSignals(
  scan: WebsiteScanResult,
  business: { rating: number | null; reviewCount: number | null },
  jobData: { totalPostings: number; roles: string[]; mostRecentDays: number }
): BusinessSignals {
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
  
  // Determine hiring intensity
  let hiringIntensity: 'low' | 'medium' | 'high' = 'low';
  if (jobData.totalPostings >= 5) hiringIntensity = 'high';
  else if (jobData.totalPostings >= 2) hiringIntensity = 'medium';
  
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
    
    // Hiring signals
    isHiring: true,
    hiringRoles: jobData.roles,
    hiringIntensity,
    mostRecentJobDays: jobData.mostRecentDays,
    totalJobPostings: jobData.totalPostings,
    
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

function getDefaultSignals(
  business: { rating: number | null; reviewCount: number | null; website: string | null },
  jobData: { totalPostings: number; roles: string[]; mostRecentDays: number }
): BusinessSignals {
  let hiringIntensity: 'low' | 'medium' | 'high' = 'low';
  if (jobData.totalPostings >= 5) hiringIntensity = 'high';
  else if (jobData.totalPostings >= 2) hiringIntensity = 'medium';
  
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
    
    isHiring: true,
    hiringRoles: jobData.roles,
    hiringIntensity,
    mostRecentJobDays: jobData.mostRecentDays,
    totalJobPostings: jobData.totalPostings,
    
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

/**
 * Infer business type (residential/commercial/both) using LLM
 */
async function inferBusinessType(
  ctx: StepContext,
  business: { name: string; jobPostings: Array<{ positionName: string }> }
): Promise<{ type: 'residential' | 'commercial' | 'both' | 'unknown'; confidence: number }> {
  const anthropicKey = process.env.ANTHROPIC_API_KEY;
  
  if (!anthropicKey) {
    return { type: 'unknown', confidence: 0 };
  }
  
  const jobTitles = business.jobPostings.map(j => j.positionName).join(', ');
  
  const prompt = `Given this company name and their job postings, determine if they primarily serve RESIDENTIAL clients, COMMERCIAL clients, or BOTH.

Company: ${business.name}
Job Postings: ${jobTitles}

Respond in JSON:
{
  "type": "residential" | "commercial" | "both" | "unknown",
  "confidence": 0.0 to 1.0,
  "reasoning": "brief explanation"
}`;

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': anthropicKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-20250514',
        max_tokens: 200,
        messages: [{
          role: 'user',
          content: prompt,
        }],
      }),
    });
    
    if (!response.ok) {
      throw new Error(`Anthropic API failed: ${response.status}`);
    }
    
    const data = await response.json();
    const text = data.content[0].text;
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    
    if (jsonMatch) {
      const result = JSON.parse(jsonMatch[0]);
      return { type: result.type, confidence: result.confidence };
    }
  } catch (error) {
    await ctx.log('warn', `Business type inference failed: ${error}`);
  }
  
  return { type: 'unknown', confidence: 0 };
}

async function jobDiscoveryHandler(
  ctx: StepContext,
  input: Record<string, unknown>
): Promise<JobDiscoveryOutput> {
  const params = JobDiscoveryInput.parse(input);
  const { keyword, location, days, maxResults, enrich } = params;
  
  const startTime = Date.now();
  
  await ctx.log('info', `Starting job discovery: "${keyword}" in ${location}`, { days, maxResults, enrich });
  
  // ==========================================================================
  // STEP 1: Call Notte API (Job Scraper)
  // ==========================================================================
  runner.updateStep(ctx.jobId, 1, 'Discovering job postings via Notte', 5);
  
  const jobs = await fetchJobPostings(ctx, { keyword, location, days, maxResults });
  
  // Record cost (adjust based on your Notte pricing)
  const notteCost = jobs.length * 0.001; // Example: $0.001 per job
  ctx.recordApiCall('notte', 'job_scraper', jobs.length);
  await ctx.log('info', `💰 Job discovery cost: $${notteCost.toFixed(4)} (${jobs.length} jobs)`);
  
  // ==========================================================================
  // STEP 2: Group by Company & Extract Metadata
  // ==========================================================================
  runner.updateStep(ctx.jobId, 2, 'Grouping jobs by company', 5);
  
  const companyMap = groupJobsByCompany(jobs);
  await ctx.log('info', `Grouped ${jobs.length} jobs into ${companyMap.size} companies`);
  
  // Convert to business records
  const rawBusinesses = Array.from(companyMap.entries()).map(([companyName, companyJobs]) => {
    // Extract company data from first job posting
    const firstJob = companyJobs[0];
    
    // Parse location (format: "City, ST" or "State" or "United States")
    const locationStr = firstJob.location || '';
    let city = null;
    let state = null;
    
    // Try to parse "City, ST" format
    const locationMatch = locationStr.match(/^([^,]+),\s*([A-Z]{2}(?:\s+\d{5})?)/);
    if (locationMatch) {
      city = locationMatch[1].trim();
      state = locationMatch[2].replace(/\s+\d{5}$/, '').trim(); // Remove zip if present
    } else if (locationStr.match(/^[A-Z]{2}$/)) {
      // Just a state code
      state = locationStr;
    } else if (locationStr && locationStr !== 'United States') {
      // Use as city if it's not too generic
      city = locationStr;
    }
    
    // Build job posting metadata
    const jobPostings = companyJobs.map(job => ({
      positionName: job.title || 'Unknown Position',
      salary: job.salary || null,
      jobType: [], // Notte doesn't provide this
      postedDaysAgo: calculateDaysAgo(job.date_posted),
      url: job.job_url || '',
      source: job.source || 'unknown',
      // NEW: Contact info from job posting
      contact: job.contact ? {
        name: job.contact.name || null,
        title: job.contact.title || null,
        linkedinUrl: job.contact.linkedin_url || null,
        note: job.contact.note || null,
      } : null,
    }));
    
    // Extract contact info from first job if available
    const firstContact = companyJobs[0]?.contact;
    const linkedinSearchUrl = firstContact?.linkedin_url || null;
    
    const mostRecentDays = Math.min(...jobPostings.map(j => j.postedDaysAgo));
    const roles = jobPostings.map(j => j.positionName);
    
    // Note: Notte doesn't provide website/phone/rating directly
    // We'll need to look these up or leave null
    return {
      name: companyName,
      website: null, // TODO: Could scrape company website from LinkedIn
      phone: null,
      email: null,
      address: locationStr,
      city,
      state,
      zipCode: null,
      rating: null,
      reviewCount: null,
      jobPostings,
      jobData: {
        totalPostings: companyJobs.length,
        roles,
        mostRecentDays,
      },
      // NEW: LinkedIn contact search URL
      linkedinSearchUrl,
    };
  });
  
  await ctx.saveArtifact('raw_hiring_businesses', rawBusinesses, 'business_list');
  await ctx.log('info', `💾 Checkpointed ${rawBusinesses.length} hiring businesses`);
  
  // ==========================================================================
  // STEP 2.5: Extract Company Websites from Job Postings
  // ==========================================================================
  runner.updateStep(ctx.jobId, 2.5, 'Extracting company websites', 5);
  
  await ctx.log('info', 'Extracting company websites from job postings...');
  
  const { extractCompanyWebsitesBatch } = await import('../scrapers/website-extractor');
  
  // Build extraction requests
  const extractionRequests = rawBusinesses.map(b => ({
    name: b.name,
    jobUrl: b.jobPostings[0]?.url || '',
    location: b.city && b.state ? `${b.city}, ${b.state}` : b.state || undefined,
  })).filter(r => r.jobUrl); // Only extract if we have a job URL
  
  if (extractionRequests.length > 0) {
    await ctx.log('info', `Extracting websites for ${extractionRequests.length} companies...`);
    
    const websiteResults = await extractCompanyWebsitesBatch(extractionRequests, {
      maxConcurrent: 3,
      delayMs: 1000, // 1s between batches
    });
    
    // Update businesses with extracted websites
    for (const business of rawBusinesses) {
      const result = websiteResults.get(business.name);
      if (result?.website) {
        business.website = result.website;
        await ctx.log('debug', `✅ Found website for ${business.name}: ${result.website} (${result.source})`);
      }
    }
    
    const foundCount = Array.from(websiteResults.values()).filter(r => r.website).length;
    await ctx.log('info', `✅ Found ${foundCount}/${extractionRequests.length} company websites`);
  }
  
  // Update businessesWithWebsites list after extraction
  const businessesWithWebsites = rawBusinesses.filter(b => b.website);
  
  if (businessesWithWebsites.length === 0) {
    await ctx.log('warn', 'No businesses have websites. Skipping enrichment.');
  } else {
    await ctx.log('info', `${businessesWithWebsites.length} businesses have websites, proceeding with enrichment`);
  }
  
  // ==========================================================================
  // STEP 3: Website Scanner Enrichment (Same as discover-businesses)
  // ==========================================================================
  runner.updateStep(ctx.jobId, 3, 'Scanning websites for signals', 5);
  
  const enrichStartTime = Date.now();
  // businessesWithWebsites already defined above
  
  let scanResults: Map<string, WebsiteScanResult> = new Map();
  
  if (enrich && businessesWithWebsites.length > 0) {
    await ctx.log('info', `Enriching ${businessesWithWebsites.length} businesses with website scanner...`);
    
    const SCAN_TIMEOUT = 10000;
    const MAX_CONCURRENT = 5;
    const DELAY_BETWEEN_BATCHES = 2000;
    const DELAY_BETWEEN_SCANS = 500;
    
    const batches: typeof businessesWithWebsites[] = [];
    for (let i = 0; i < businessesWithWebsites.length; i += MAX_CONCURRENT) {
      batches.push(businessesWithWebsites.slice(i, i + MAX_CONCURRENT));
    }
    
    for (let batchIndex = 0; batchIndex < batches.length; batchIndex++) {
      const batch = batches[batchIndex];
      
      await ctx.log('debug', `Scanning batch ${batchIndex + 1}/${batches.length} (${batch.length} websites)`);
      
      for (const business of batch) {
        try {
          const scan = await scanWebsite(business.website!, SCAN_TIMEOUT);
          scanResults.set(business.website!, scan);
          
          if (batch.indexOf(business) < batch.length - 1) {
            const delay = DELAY_BETWEEN_SCANS + (Math.random() * 400 - 200);
            await new Promise(resolve => setTimeout(resolve, delay));
          }
        } catch (error) {
          await ctx.log('debug', `Scan failed for ${business.website}: ${error}`);
        }
      }
      
      if (batchIndex < batches.length - 1) {
        const batchDelay = DELAY_BETWEEN_BATCHES + (Math.random() * 1000 - 500);
        await ctx.log('debug', `Waiting ${(batchDelay / 1000).toFixed(1)}s before next batch...`);
        await new Promise(resolve => setTimeout(resolve, batchDelay));
      }
    }
    
    await ctx.log('info', `Scanned ${scanResults.size}/${businessesWithWebsites.length} websites`);
  }
  
  const enrichmentTimeMs = Date.now() - enrichStartTime;
  
  await ctx.saveArtifact('scan_results', Array.from(scanResults.entries()), 'scan_results');
  await ctx.log('info', `💾 Checkpointed ${scanResults.size} scan results`);
  
  // ==========================================================================
  // STEP 4: Infer Business Type (Residential/Commercial)
  // ==========================================================================
  runner.updateStep(ctx.jobId, 4, 'Analyzing business types', 5);
  
  await ctx.log('info', 'Inferring residential vs commercial for each business...');
  
      // Build enriched output
  const businesses: EnrichedHiringBusiness[] = await Promise.all(
    rawBusinesses.map(async (r) => {
      const scan = r.website ? scanResults.get(r.website) : undefined;
      const signals = scan 
        ? transformScanToSignals(scan, { rating: r.rating, reviewCount: r.reviewCount }, r.jobData)
        : getDefaultSignals({ rating: r.rating, reviewCount: r.reviewCount, website: r.website }, r.jobData);
      
      // Infer business type
      const businessTypeResult = await inferBusinessType(ctx, r);
      
      // Build business object
      const business: EnrichedHiringBusiness = {
        name: r.name,
        phone: r.phone,
        website: r.website,
        address: r.address,
        city: r.city,
        state: r.state,
        zipCode: r.zipCode,
        rating: r.rating,
        reviewCount: r.reviewCount,
        jobPostings: r.jobPostings,
        signals,
        enriched: !!scan,
        businessType: businessTypeResult.type,
        businessTypeConfidence: businessTypeResult.confidence,
        linkedinSearchUrl: r.linkedinSearchUrl,
        // NEW: Store business description from website scan
        businessDescription: scan?.businessDescription,
        businessServices: scan?.businessServices,
      };
      
      // Calculate priority score
      business.priorityScore = calculatePriorityScore(business);
      business.priorityTier = 
        business.priorityScore >= 85 ? 'hot' :
        business.priorityScore >= 70 ? 'warm' : 'cold';
      
      return business;
    })
  );
  
  // Sort by priority score (highest first)
  businesses.sort((a, b) => (b.priorityScore || 0) - (a.priorityScore || 0));
  
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
    avgJobPostings: businesses.reduce((sum, b) => sum + b.signals.totalJobPostings, 0) / businesses.length,
    businessTypeResidential: businesses.filter(b => b.businessType === 'residential').length,
    businessTypeCommercial: businesses.filter(b => b.businessType === 'commercial').length,
    businessTypeBoth: businesses.filter(b => b.businessType === 'both').length,
  };
  
  await ctx.saveArtifact('enriched_hiring_businesses', businesses, 'business_list');
  await ctx.log('info', `💾 Final checkpoint: ${businesses.length} enriched hiring businesses saved`);
  
  const searchTimeMs = Date.now() - startTime;
  
  await ctx.log('info', `Job discovery complete: ${businesses.length} businesses, ${stats.enriched} enriched in ${searchTimeMs}ms`);
  await ctx.log('info', `Business types: ${stats.businessTypeResidential} residential, ${stats.businessTypeCommercial} commercial, ${stats.businessTypeBoth} both`);
  
  // ==========================================================================
  // STEP 5: Store in Production Database (Same as discover-businesses)
  // ==========================================================================
  
  if (process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY) {
    await ctx.log('info', 'Storing businesses in production database...');
    
    try {
      const { createStorageAdapter } = await import('../storage/business-adapter');
      const storage = createStorageAdapter();
      
      const businessRecords = businesses.map(b => ({
        name: b.name,
        website: b.website,
        phone: b.phone,
        address: b.address,
        city: b.city,
        state: b.state,
        zipCode: b.zipCode,
        rating: b.rating,
        reviewCount: b.reviewCount,
        signals: b.signals,
        industry: keyword,
        leadScore: calculateLeadScore(b),
        geoReadinessScore: b.signals?.seoOptimized ? 7.0 : 3.0,
        aeoReadinessScore: b.signals?.aiReadable ? 7.0 : 2.0,
        sourceJobId: ctx.jobId,
        sourceType: 'job_posting' as const,
        // Job-specific metadata
        sourceMetadata: {
          hiring_signal: {
            is_hiring: true,
            total_postings: b.signals.totalJobPostings,
            roles: b.signals.hiringRoles,
            intensity: b.signals.hiringIntensity,
            most_recent_days: b.signals.mostRecentJobDays,
          },
          business_type: b.businessType,
          business_type_confidence: b.businessTypeConfidence,
          business_description: b.businessDescription, // NEW
          business_services: b.businessServices, // NEW
          job_postings: b.jobPostings,
          linkedin_search_url: b.linkedinSearchUrl, // NEW: Contact finder URL
        },
        // Backward compat
        hiringSignal: {
          isHiring: true,
          totalPostings: b.signals.totalJobPostings,
          roles: b.signals.hiringRoles,
          intensity: b.signals.hiringIntensity,
          mostRecentDays: b.signals.mostRecentJobDays,
        },
        businessType: b.businessType,
        businessTypeConfidence: b.businessTypeConfidence,
      }));
      
      const result = await storage.store(businessRecords);
      
      if (result.success) {
        await ctx.log('info', `✅ Stored ${result.count} hiring businesses in production database`);
      } else {
        await ctx.log('warn', `Storage failed: ${result.error}`);
      }
    } catch (error) {
      await ctx.log('warn', `Storage error: ${error}. Continuing without database storage.`);
    }
  }
  
  return {
    businesses,
    totalFound: businesses.length,
    searchTimeMs,
    enrichmentTimeMs,
    source: 'harness-notte-jobs',
    keyword,
    location,
    stats,
  };
}

// Helper to calculate days ago from posting date
function calculateDaysAgo(dateString: string | undefined): number {
  if (!dateString) return 999; // Unknown, treat as old
  
  try {
    // Notte format: "2026-03-04" (ISO date)
    const postDate = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - postDate.getTime();
    const days = Math.floor(diffMs / (1000 * 60 * 60 * 24));
    return Math.max(0, days); // Don't return negative numbers
  } catch {
    return 999; // Parse error, treat as old
  }
}

// Helper to calculate lead score (enhanced for hiring signal)
function calculateLeadScore(business: EnrichedHiringBusiness): number {
  const signals = business.signals;
  let score = 60; // Base score higher for hiring businesses
  
  if (!signals) return score;
  
  // Hiring signals
  if (signals.hiringIntensity === 'high') score += 15;
  else if (signals.hiringIntensity === 'medium') score += 10;
  else score += 5;
  
  // Website signals
  if (business.website) score += 10;
  if (signals.hasAds) score += 5;
  if (!signals.aiReadable) score += 10; // Opportunity
  
  // Trust signals
  if (business.reviewCount && business.reviewCount > 20) score += 5;
  
  return Math.min(score, 100);
}

/**
 * Calculate outreach priority score (1-100)
 * Higher = contact first
 */
function calculatePriorityScore(business: EnrichedHiringBusiness): number {
  let priority = 50; // Base priority
  
  const signals = business.signals;
  const postings = business.jobPostings || [];
  const totalPostings = postings.length;
  const mostRecentDays = signals?.mostRecentJobDays || 999;
  
  // 1. Job volume (max +30)
  if (totalPostings >= 10) priority += 30;
  else if (totalPostings >= 5) priority += 20;
  else if (totalPostings >= 3) priority += 15;
  else if (totalPostings >= 2) priority += 10;
  else priority += 5;
  
  // 2. Recency (max +25)
  if (mostRecentDays <= 3) priority += 25; // Posted this week = HOT
  else if (mostRecentDays <= 7) priority += 20;
  else if (mostRecentDays <= 14) priority += 15;
  else if (mostRecentDays <= 30) priority += 10;
  else priority += 5;
  
  // 3. Sales roles = high budget signal (max +20)
  const roles = signals?.hiringRoles || [];
  const salesRoleCount = roles.filter(r => 
    r.toLowerCase().includes('sales') || 
    r.toLowerCase().includes('business development') ||
    r.toLowerCase().includes('account')
  ).length;
  
  if (salesRoleCount >= 3) priority += 20;
  else if (salesRoleCount >= 2) priority += 15;
  else if (salesRoleCount >= 1) priority += 10;
  
  // 4. Digital maturity gaps = opportunity (max +15)
  if (signals) {
    if (!signals.aiReadable) priority += 5; // No AI optimization
    if (!signals.hasAds) priority += 5; // Not running ads
    if (!signals.hasBooking) priority += 5; // No booking system
  }
  
  // 5. Growth stage signals (max +10)
  if (business.businessType === 'both') priority += 10; // Residential + Commercial = bigger
  else if (business.businessType === 'commercial') priority += 5; // Higher contract values
  
  return Math.min(priority, 100);
}

runner.registerWorkflow('discover-hiring-businesses', jobDiscoveryHandler);

export { jobDiscoveryHandler };
