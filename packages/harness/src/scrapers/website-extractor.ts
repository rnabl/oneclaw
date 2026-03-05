/**
 * Website Extractor for Job Postings
 * 
 * Extracts company website from job posting URLs using multiple strategies:
 * 1. Scrape the job posting page for company website links
 * 2. Use LinkedIn company page if available
 * 3. Google search as fallback
 */

import * as cheerio from 'cheerio';

export interface WebsiteExtractionResult {
  website: string | null;
  confidence: 'high' | 'medium' | 'low';
  source: 'job_posting' | 'linkedin_company' | 'google_search' | 'none';
  error?: string;
}

/**
 * Extract website from Indeed job posting
 */
async function extractFromIndeed(jobUrl: string): Promise<string | null> {
  try {
    const response = await fetch(jobUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      },
    });
    
    if (!response.ok) return null;
    
    const html = await response.text();
    const $ = cheerio.load(html);
    
    // Indeed typically has company website in various places
    const selectors = [
      'a[data-testid="companyWebsite"]',
      'a[href*="company-url"]',
      '.company-website a',
      'a:contains("Company website")',
    ];
    
    for (const selector of selectors) {
      const link = $(selector).attr('href');
      if (link && isValidWebsite(link)) {
        return cleanWebsiteUrl(link);
      }
    }
    
    return null;
  } catch (error) {
    console.error('[WebsiteExtractor] Indeed scrape failed:', error);
    return null;
  }
}

/**
 * Extract website from LinkedIn job posting
 */
async function extractFromLinkedIn(jobUrl: string): Promise<string | null> {
  try {
    // LinkedIn job URLs contain company slug
    // Example: https://www.linkedin.com/jobs/view/title-at-company-123
    const companyMatch = jobUrl.match(/at-([a-z0-9-]+)-\d+/);
    if (!companyMatch) return null;
    
    const companySlug = companyMatch[1];
    const companyPageUrl = `https://www.linkedin.com/company/${companySlug}`;
    
    const response = await fetch(companyPageUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      },
    });
    
    if (!response.ok) return null;
    
    const html = await response.text();
    const $ = cheerio.load(html);
    
    // LinkedIn company page structure
    const selectors = [
      'a.link-without-visited-state[href^="http"]',
      'a[data-test-id="about-us-cta"]',
      '.org-top-card-summary__info-item a[href^="http"]',
    ];
    
    for (const selector of selectors) {
      const link = $(selector).attr('href');
      if (link && isValidWebsite(link) && !link.includes('linkedin.com')) {
        return cleanWebsiteUrl(link);
      }
    }
    
    return null;
  } catch (error) {
    console.error('[WebsiteExtractor] LinkedIn scrape failed:', error);
    return null;
  }
}

/**
 * Use Google Custom Search to find company website
 */
async function searchGoogle(companyName: string, location?: string): Promise<string | null> {
  const googleApiKey = process.env.GOOGLE_API_KEY || process.env.GOOGLE_PLACES_API_KEY;
  const searchEngineId = process.env.GOOGLE_SEARCH_ENGINE_ID;
  
  if (!googleApiKey || !searchEngineId) {
    console.warn('[WebsiteExtractor] Google API not configured');
    return null;
  }
  
  try {
    const query = location 
      ? `${companyName} ${location} official website`
      : `${companyName} official website`;
    
    const url = new URL('https://www.googleapis.com/customsearch/v1');
    url.searchParams.set('key', googleApiKey);
    url.searchParams.set('cx', searchEngineId);
    url.searchParams.set('q', query);
    url.searchParams.set('num', '3');
    
    const response = await fetch(url.toString());
    if (!response.ok) return null;
    
    const data = await response.json();
    
    // Check first 3 results for company website
    for (const item of data.items || []) {
      const url = item.link;
      
      // Skip LinkedIn, Indeed, job boards
      if (url.includes('linkedin.com') || 
          url.includes('indeed.com') ||
          url.includes('glassdoor.com') ||
          url.includes('ziprecruiter.com')) {
        continue;
      }
      
      // Check if domain matches company name
      const domain = new URL(url).hostname.replace('www.', '');
      const companySlug = companyName.toLowerCase().replace(/[^a-z0-9]/g, '');
      
      if (domain.includes(companySlug) || companySlug.includes(domain.split('.')[0])) {
        return cleanWebsiteUrl(url);
      }
    }
    
    // If no exact match, return first non-job-board result
    const firstResult = data.items?.[0]?.link;
    if (firstResult && isValidWebsite(firstResult)) {
      return cleanWebsiteUrl(firstResult);
    }
    
    return null;
  } catch (error) {
    console.error('[WebsiteExtractor] Google search failed:', error);
    return null;
  }
}

/**
 * Use Brave Search API (alternative to Google)
 */
async function searchBrave(companyName: string, location?: string): Promise<string | null> {
  const braveApiKey = process.env.BRAVE_API_KEY;
  
  if (!braveApiKey) {
    return null;
  }
  
  try {
    const query = location 
      ? `${companyName} ${location} official website`
      : `${companyName} official website`;
    
    const response = await fetch(`https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(query)}&count=5`, {
      headers: {
        'X-Subscription-Token': braveApiKey,
        'Accept': 'application/json',
      },
    });
    
    if (!response.ok) return null;
    
    const data = await response.json();
    
    for (const result of data.web?.results || []) {
      const url = result.url;
      
      // Skip job boards
      if (url.includes('linkedin.com') || 
          url.includes('indeed.com') ||
          url.includes('glassdoor.com')) {
        continue;
      }
      
      if (isValidWebsite(url)) {
        return cleanWebsiteUrl(url);
      }
    }
    
    return null;
  } catch (error) {
    console.error('[WebsiteExtractor] Brave search failed:', error);
    return null;
  }
}

/**
 * Main extraction function - tries multiple strategies
 */
export async function extractCompanyWebsite(
  companyName: string,
  jobUrl: string,
  location?: string
): Promise<WebsiteExtractionResult> {
  // Strategy 1: Scrape the job posting
  if (jobUrl.includes('indeed.com')) {
    const website = await extractFromIndeed(jobUrl);
    if (website) {
      return {
        website,
        confidence: 'high',
        source: 'job_posting',
      };
    }
  } else if (jobUrl.includes('linkedin.com')) {
    const website = await extractFromLinkedIn(jobUrl);
    if (website) {
      return {
        website,
        confidence: 'high',
        source: 'linkedin_company',
      };
    }
  }
  
  // Strategy 2: Try Brave Search (fast, no quota limits)
  const braveResult = await searchBrave(companyName, location);
  if (braveResult) {
    return {
      website: braveResult,
      confidence: 'medium',
      source: 'google_search',
    };
  }
  
  // Strategy 3: Google Custom Search (more accurate, but has quota)
  const googleResult = await searchGoogle(companyName, location);
  if (googleResult) {
    return {
      website: googleResult,
      confidence: 'medium',
      source: 'google_search',
    };
  }
  
  return {
    website: null,
    confidence: 'low',
    source: 'none',
    error: 'Could not find company website',
  };
}

/**
 * Batch extract websites for multiple companies
 */
export async function extractCompanyWebsitesBatch(
  companies: Array<{
    name: string;
    jobUrl: string;
    location?: string;
  }>,
  options: {
    maxConcurrent?: number;
    delayMs?: number;
  } = {}
): Promise<Map<string, WebsiteExtractionResult>> {
  const { maxConcurrent = 3, delayMs = 500 } = options;
  const results = new Map<string, WebsiteExtractionResult>();
  
  // Process in batches
  for (let i = 0; i < companies.length; i += maxConcurrent) {
    const batch = companies.slice(i, i + maxConcurrent);
    
    const batchResults = await Promise.all(
      batch.map(async (company) => {
        const result = await extractCompanyWebsite(
          company.name,
          company.jobUrl,
          company.location
        );
        return { name: company.name, result };
      })
    );
    
    for (const { name, result } of batchResults) {
      results.set(name, result);
    }
    
    // Delay between batches to avoid rate limits
    if (i + maxConcurrent < companies.length) {
      await new Promise(resolve => setTimeout(resolve, delayMs));
    }
  }
  
  return results;
}

// Helper functions

function isValidWebsite(url: string): boolean {
  if (!url) return false;
  
  try {
    const parsed = new URL(url.startsWith('http') ? url : `https://${url}`);
    const hostname = parsed.hostname;
    
    // Must have a TLD
    if (!hostname.includes('.')) return false;
    
    // Skip known non-company domains
    const blockedDomains = [
      'linkedin.com',
      'indeed.com',
      'glassdoor.com',
      'ziprecruiter.com',
      'monster.com',
      'careerbuilder.com',
      'google.com',
      'facebook.com',
      'twitter.com',
      'youtube.com',
    ];
    
    return !blockedDomains.some(blocked => hostname.includes(blocked));
  } catch {
    return false;
  }
}

function cleanWebsiteUrl(url: string): string {
  try {
    // Parse URL
    const parsed = new URL(url.startsWith('http') ? url : `https://${url}`);
    
    // ALWAYS return just the domain (protocol + hostname)
    // This ensures we get "https://trane.com" instead of "https://trane.com/commercial/..."
    return `${parsed.protocol}//${parsed.hostname}`;
  } catch {
    return url;
  }
}
