/**
 * Step: Scan Website
 * 
 * Fetches and analyzes the target website.
 */

import * as cheerio from 'cheerio';
import { getTaxonomy } from '@oneclaw/taxonomy';
import type { WebsiteScanResult } from '../types';

export async function scanWebsite(
  url: string,
  industry: string
): Promise<WebsiteScanResult> {
  const taxonomy = getTaxonomy(industry);
  const startTime = Date.now();
  
  try {
    // Fetch the website
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; OneClawBot/1.0; +https://oneclaw.chat)',
        'Accept': 'text/html,application/xhtml+xml',
      },
      signal: AbortSignal.timeout(15000),
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const html = await response.text();
    const $ = cheerio.load(html);
    const loadTimeMs = Date.now() - startTime;

    // Extract basic info
    const title = $('title').text().trim() || '';
    const description = $('meta[name="description"]').attr('content') || '';
    
    // Extract headings
    const headings: string[] = [];
    $('h1, h2, h3').each((_, el) => {
      const text = $(el).text().trim();
      if (text && headings.length < 20) {
        headings.push(text);
      }
    });

    // Extract body text
    $('script, style, nav, footer, header').remove();
    const bodyText = $('body').text()
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 10000);

    // Check SSL
    const hasSSL = url.startsWith('https://');

    // Find services mentioned
    const servicesFound: string[] = [];
    const textLower = (bodyText + ' ' + title + ' ' + description).toLowerCase();
    
    for (const keyword of taxonomy.serviceScanKeywords) {
      if (textLower.includes(keyword.toLowerCase())) {
        servicesFound.push(keyword);
      }
    }

    // Find trust signals
    const trustSignals: string[] = [];
    for (const [keyword, display] of Object.entries(taxonomy.trustSignalKeywords as Record<string, string>)) {
      if (textLower.includes(keyword.toLowerCase())) {
        trustSignals.push(display);
      }
    }

    // Check for features
    const hasOnlineBooking = /book\s*(online|now|appointment)|schedule.*online|online.*scheduling/i.test(bodyText);
    const hasContactForm = $('form').length > 0 || /contact.*form/i.test(html);
    const hasLiveChat = /chat.*widget|live.*chat|intercom|drift|crisp|tawk|zendesk/i.test(html);
    const hasPricing = /pricing|price list|our rates|cost|starting at \$/i.test(bodyText);

    // Find social profiles
    const socialProfiles: string[] = [];
    const socialPatterns = [
      { name: 'Facebook', pattern: /facebook\.com\/[a-zA-Z0-9._-]+/i },
      { name: 'Instagram', pattern: /instagram\.com\/[a-zA-Z0-9._-]+/i },
      { name: 'LinkedIn', pattern: /linkedin\.com\/(?:company|in)\/[a-zA-Z0-9._-]+/i },
      { name: 'YouTube', pattern: /youtube\.com\/(?:channel|c|user)\/[a-zA-Z0-9._-]+/i },
      { name: 'Twitter', pattern: /(?:twitter|x)\.com\/[a-zA-Z0-9._-]+/i },
    ];
    
    for (const { name, pattern } of socialPatterns) {
      if (pattern.test(html)) {
        socialProfiles.push(name);
      }
    }

    // Detect tech stack
    const techStack: string[] = [];
    if (/wordpress/i.test(html)) techStack.push('WordPress');
    if (/wix\.com/i.test(html)) techStack.push('Wix');
    if (/squarespace/i.test(html)) techStack.push('Squarespace');
    if (/shopify/i.test(html)) techStack.push('Shopify');
    if (/webflow/i.test(html)) techStack.push('Webflow');
    if (/next/i.test(html) && /_next/i.test(html)) techStack.push('Next.js');
    if (/react/i.test(html)) techStack.push('React');
    if (/google.*tag.*manager|gtm\.js/i.test(html)) techStack.push('GTM');
    if (/google.*analytics|ga\.js|gtag/i.test(html)) techStack.push('Google Analytics');

    return {
      status: 'live',
      title,
      description,
      headings,
      bodyText,
      hasSSL,
      loadTimeMs,
      servicesFound: [...new Set(servicesFound)],
      trustSignals: [...new Set(trustSignals)],
      hasOnlineBooking,
      hasContactForm,
      hasLiveChat,
      hasPricing,
      socialProfiles,
      techStack,
    };
  } catch (error) {
    console.error(`[ScanWebsite] Error scanning ${url}:`, error);
    
    return {
      status: 'error',
      title: '',
      description: '',
      headings: [],
      bodyText: '',
      hasSSL: url.startsWith('https://'),
      loadTimeMs: Date.now() - startTime,
      servicesFound: [],
      trustSignals: [],
      hasOnlineBooking: false,
      hasContactForm: false,
      hasLiveChat: false,
      hasPricing: false,
      socialProfiles: [],
      techStack: [],
    };
  }
}
