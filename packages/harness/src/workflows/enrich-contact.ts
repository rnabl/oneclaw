/**
 * Contact Enrichment Workflow
 * 
 * Given a business URL or name, find owner/decision-maker contact information.
 * 
 * Multi-provider strategy (cheapest to most expensive):
 * 1. Perplexity AI - $0.005 (fast owner name extraction)
 * 2. DataForSEO SERP - $0.10 (rich SERP data)
 * 3. Apify LinkedIn - $0.15+ (full contact + company data)
 * 
 * Input:
 * - url: "https://abchvac.com" (required)
 * - businessName: "ABC HVAC" (optional, helps with context)
 * - method: "auto" | "perplexity" | "dataforseo" | "linkedin" (default: auto)
 * 
 * Output:
 * - owner: { name, title, email, phone, linkedin }
 * - contacts: Array of team members (if using LinkedIn)
 * - company: { size, industry, founded } (if using LinkedIn)
 * - source: "perplexity" | "dataforseo" | "linkedin" | "website_scrape"
 */

import type { StepContext } from '../execution/runner';
import { runner } from '../execution/runner';
import { z } from 'zod';
import { findContacts } from '../providers/apify/lead-finder';
import { searchBusinessOwner as perplexityOwnerSearch } from '../providers/perplexity/owner-search';

// =============================================================================
// SCHEMAS
// =============================================================================

const EnrichContactInput = z.object({
  url: z.string().url(),
  businessName: z.string().optional(),
  city: z.string().optional(),
  state: z.string().optional(),
  method: z.enum(['auto', 'perplexity', 'dataforseo', 'linkedin']).default('auto'),
});

type EnrichContactInput = z.infer<typeof EnrichContactInput>;

interface ContactPerson {
  name: string;
  title?: string;
  email?: string;
  phone?: string;
  linkedin?: string;
  seniorityLevel?: 'owner' | 'executive' | 'manager' | 'staff';
}

interface CompanyInfo {
  name?: string;
  website?: string;
  industry?: string;
  companySize?: string;
  foundedYear?: number;
  linkedinUrl?: string;
}

interface EnrichContactOutput extends Record<string, unknown> {
  url: string;
  businessName?: string;
  owner: ContactPerson | null;
  contacts: ContactPerson[];
  company: CompanyInfo | null;
  method: string;
  source: 'perplexity' | 'apify' | 'apify+perplexity' | 'website_scrape';
  timeMs: number;
  cost: number;
  fallbackUsed: boolean;
}

// =============================================================================
// ENRICHMENT METHODS (Cheapest to Most Expensive)
// =============================================================================

/**
 * Method 1: Perplexity AI - $0.005 per search
 * Fast owner name extraction from web research
 */
async function enrichViaPerplexity(
  ctx: StepContext,
  businessName: string,
  city?: string,
  state?: string
): Promise<{ owner: ContactPerson | null; sources: string[] } | null> {
  
  await ctx.log('info', `Searching Perplexity for ${businessName} owner`);
  
  try {
    const result = await perplexityOwnerSearch({ businessName, city, state });
    
    if (result.owners.length === 0) {
      return null;
    }
    
    const primary = result.owners[0];
    
    return {
      owner: {
        name: primary.name,
        title: primary.role || 'Owner',
        seniorityLevel: 'owner',
        linkedin: primary.linkedinUrl,
      },
      sources: result.sources,
    };
    
  } catch (error) {
    await ctx.log('warn', `Perplexity search failed: ${error}`);
    throw error;
  }
}

/**
 * Method 2: Apify LinkedIn (code_crafter/leads-finder) - $1.50 per 1000
 * Full LinkedIn profile enrichment with verified emails
 */
async function enrichViaApifyLeadFinder(
  ctx: StepContext,
  url: string,
  businessName?: string
): Promise<{ owner: ContactPerson | null; contacts: ContactPerson[]; company: CompanyInfo | null; cost: number } | null> {
  
  await ctx.log('info', `Enriching via Apify lead-finder (code_crafter/leads-finder) for ${url}`);
  
  try {
    const result = await findContacts({ url, businessName });
    
    if (!result) {
      return null;
    }
    
    return {
      owner: result.owner ? {
        name: result.owner.fullName || '',
        title: result.owner.jobTitle || 'Owner',
        email: result.owner.email || undefined,
        phone: result.owner.mobileNumber || undefined,
        linkedin: result.owner.linkedin || undefined,
        seniorityLevel: result.owner.seniorityLevel || 'owner',
      } : null,
      contacts: result.contacts.map(c => ({
        name: c.fullName || '',
        title: c.jobTitle || undefined,
        email: c.email || undefined,
        phone: c.mobileNumber || undefined,
        linkedin: c.linkedin || undefined,
        seniorityLevel: c.seniorityLevel || 'staff',
      })),
      company: result.company ? {
        name: result.company.name || undefined,
        website: result.company.website || undefined,
        industry: result.company.industry || undefined,
        companySize: result.company.companySize || undefined,
        foundedYear: result.company.foundedYear || undefined,
        linkedinUrl: result.company.linkedinUrl || undefined,
      } : null,
      cost: result.cost,
    };
    
  } catch (error) {
    await ctx.log('warn', `Apify lead-finder enrichment failed: ${error}`);
    throw error;
  }
}

/**
 * Method 3 alias: enrichViaLinkedIn points to Apify lead-finder
 * Keeping for backward compatibility in the waterfall
 */
async function enrichViaLinkedIn(
  ctx: StepContext,
  url: string,
  businessName?: string
): Promise<{ owner: ContactPerson | null; contacts: ContactPerson[]; company: CompanyInfo | null; cost: number } | null> {
  return enrichViaApifyLeadFinder(ctx, url, businessName);
}

/**
 * Fallback: Extract contact from website directly (Cheerio + LLM)
 */
async function enrichViaWebsiteScrape(
  ctx: StepContext,
  url: string
): Promise<{ owner: ContactPerson | null } | null> {
  
  await ctx.log('info', 'Fallback: Scraping website for contact info');
  
  try {
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      },
    });
    
    const html = await response.text();
    
    // Parse for contact info with regex patterns - find ALL emails
    const emailPattern = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
    const phonePattern = /\d{3}[-.]?\d{3}[-.]?\d{4}/;
    const namePattern = /(?:owner|founder|ceo|president)[:]\s*([A-Z][a-z]+ [A-Z][a-z]+)/i;
    
    const emailMatches = html.match(emailPattern);
    const phoneMatch = html.match(phonePattern);
    const nameMatch = html.match(namePattern);
    
    // If we found emails, prioritize owner-looking ones
    let bestEmail: string | undefined;
    if (emailMatches && emailMatches.length > 0) {
      // Priority: owner@, contact@, info@, admin@, office@, any other
      const priorityEmails = emailMatches.filter(email => 
        email.toLowerCase().includes('owner') || 
        email.toLowerCase().includes('contact') ||
        email.toLowerCase().includes('info') ||
        email.toLowerCase().includes('admin') ||
        email.toLowerCase().includes('office')
      );
      
      bestEmail = priorityEmails[0] || emailMatches[0];
      
      await ctx.log('info', `Found email via website scrape: ${bestEmail}`);
      
      return {
        owner: {
          name: nameMatch?.[1] || 'Business Owner', // Default to "Business Owner" for ATTN:
          email: bestEmail,
          phone: phoneMatch?.[0],
          title: 'Owner',
        },
      };
    }
    
    if (emailMatches || phoneMatch || nameMatch) {
      return {
        owner: {
          name: nameMatch?.[1] || 'Business Owner',
          email: emailMatches?.[0],
          phone: phoneMatch?.[0],
          title: 'Owner',
        },
      };
    }
    
    return null;
    
  } catch (error) {
    await ctx.log('warn', `Website scrape failed: ${error}`);
    return null;
  }
}

// =============================================================================
// MAIN WORKFLOW HANDLER
// =============================================================================

async function enrichContactHandler(
  ctx: StepContext,
  input: Record<string, unknown>
): Promise<EnrichContactOutput> {
  const params = EnrichContactInput.parse(input);
  const { url, businessName, city, state, method: preferredMethod } = params;
  
  const startTime = Date.now();
  
  await ctx.log('info', `Starting contact enrichment for ${url}`);
  
  let owner: ContactPerson | null = null;
  let contacts: ContactPerson[] = [];
  let company: CompanyInfo | null = null;
  let source: 'perplexity' | 'apify' | 'apify+perplexity' | 'website_scrape' = 'website_scrape';
  let cost = 0;
  let fallbackUsed = false;
  
  // ==========================================================================
  // STEP 1: Call Apify AND Perplexity in PARALLEL for speed
  // ==========================================================================
  const [apifyResult, perplexityResult] = await Promise.allSettled([
    // Apify call
    (async () => {
      try {
        await ctx.log('info', 'Attempting Apify lead-finder (code_crafter/leads-finder)');
        const result = await enrichViaApifyLeadFinder(ctx, url, businessName);
        
        if (result && (result.owner || result.contacts.length > 0)) {
          await ctx.log('info', 'Apify lead-finder found contact successfully');
          ctx.recordApiCall('apify', 'lead_finder', 1);
          return result;
        }
        return null;
      } catch (error) {
        await ctx.log('warn', `Apify lead-finder failed: ${error}`);
        return null;
      }
    })(),
    
    // Perplexity call
    businessName ? (async () => {
      try {
        await ctx.log('info', 'Trying Perplexity AI enrichment');
        const result = await enrichViaPerplexity(ctx, businessName, city, state);
        
        if (result && result.owner) {
          await ctx.log('info', 'Perplexity found owner contact');
          ctx.recordApiCall('perplexity', 'research', 1);
          return result;
        }
        return null;
      } catch (error) {
        await ctx.log('warn', `Perplexity failed: ${error}`);
        return null;
      }
    })() : Promise.resolve(null)
  ]);
  
  // Extract results
  const apifyData = apifyResult.status === 'fulfilled' ? apifyResult.value : null;
  const perplexityData = perplexityResult.status === 'fulfilled' ? perplexityResult.value : null;
  
  // Prioritize Apify data (most comprehensive)
  if (apifyData) {
    owner = apifyData.owner || null;
    contacts = apifyData.contacts || [];
    company = apifyData.company || null;
    
    // Determine source based on what actually returned data
    if (apifyData.owner || apifyData.contacts.length > 0) {
      source = perplexityData ? 'apify+perplexity' : 'apify';
      cost = apifyData.cost || 0.02;
      
      // Add Perplexity cost if we got it too
      if (perplexityData) {
        cost += 0.005;
      }
    } else {
      // Apify ran but returned nothing, fall back to Perplexity
      source = 'perplexity';
      cost = 0.005;
    }
  } else if (perplexityData && perplexityData.owner) {
    // Fallback to Perplexity if Apify didn't return anything
    owner = perplexityData.owner;
    source = 'perplexity';
    cost = 0.005;
  }
  
  // Return if we have data
  if (owner || contacts.length > 0) {
    const timeMs = Date.now() - startTime;
    return {
      url,
      businessName,
      owner,
      contacts,
      company,
      method: source,
      source,
      timeMs,
      cost,
      fallbackUsed: false,
    };
  }
  
  // Skip DataForSEO and direct LinkedIn search for this enrichment
  
  // ==========================================================================
  // STEP 3: Last resort - website scraping
  // ==========================================================================
  try {
    await ctx.log('info', 'Final fallback: website scraping');
    const scrapeResult = await enrichViaWebsiteScrape(ctx, url);
    
    if (scrapeResult && scrapeResult.owner) {
      owner = scrapeResult.owner;
      source = 'website_scrape';
      cost = 0.02;
    }
  } catch (error) {
    await ctx.log('warn', `Website scrape failed: ${error}`);
  }
  
  const timeMs = Date.now() - startTime;
  
  await ctx.log('info', owner ? 'Contact enrichment successful' : 'No contact info found', {
    source,
    timeMs,
    cost,
    fallbackUsed,
  });
  
  return {
    url,
    businessName,
    owner,
    contacts,
    company,
    method: owner ? source : 'none',
    source,
    timeMs,
    cost,
    fallbackUsed,
  };
}

// =============================================================================
// REGISTER WORKFLOW
// =============================================================================

runner.registerWorkflow('enrich-contact', enrichContactHandler);

export { enrichContactHandler };
