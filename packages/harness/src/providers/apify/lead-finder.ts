/**
 * Apify Leads Finder Integration
 * 
 * Extracts company contacts, LinkedIn profiles, and team info from a business domain.
 * Based on your implementation using Apify's LinkedIn enrichment actor.
 * 
 * This provides:
 * - Owner/decision-maker names
 * - LinkedIn profiles
 * - Company size
 * - Team member list
 * - Email addresses (when available)
 */

// Read at runtime, not at module load time
function getApifyConfig() {
  return {
    token: process.env.APIFY_API_TOKEN || process.env.APIFY_TOKEN,
    actor: process.env.APIFY_LEADS_ACTOR || 'code_crafter/leads-finder',
    apiBase: 'https://api.apify.com/v2'
  };
}

export interface ContactPerson {
  fullName: string | null;
  firstName: string | null;
  lastName: string | null;
  jobTitle: string | null;
  email: string | null;
  personalEmail: string | null;
  mobileNumber: string | null;
  city: string | null;
  state: string | null;
  country: string | null;
  linkedin: string | null;
  seniorityLevel: 'owner' | 'executive' | 'manager' | 'staff' | null;
  functionalLevel: string | null;
  headline: string | null;
  dataSource: 'linkedin' | 'apify' | 'google';
}

export interface CompanyInfo {
  name: string | null;
  website: string | null;
  industry: string | null;
  companySize: string | null;
  foundedYear: number | null;
  linkedinUrl: string | null;
  description: string | null;
  specialties: string[] | null;
  dataSource: 'linkedin' | 'apify';
}

export interface LeadFinderResult {
  url: string;
  company: CompanyInfo | null;
  owner: ContactPerson | null;
  contacts: ContactPerson[];
  decisionMakers: ContactPerson[];
  totalContactsFound: number;
  contactsWithEmail: number;
  contactsWithPhone: number;
  cost: number;
}

/**
 * Find company contacts from business domain using Apify Leads actor
 */
export async function findContacts(params: {
  url: string;
  businessName?: string;
  maxContacts?: number;
}): Promise<LeadFinderResult | null> {
  
  const config = getApifyConfig();
  
  if (!config.token) {
    throw new Error('APIFY_API_TOKEN is not configured');
  }
  
  const { url, businessName, maxContacts = 10 } = params;
  
  // Extract domain from URL for the actor
  const domain = url.replace(/^https?:\/\//, '').replace(/^www\./, '').split('/')[0];
  
  // Generate file_name from businessName (preferred) or domain
  // Convert to lowercase, replace spaces/special chars with underscores
  let fileName = businessName || domain;
  fileName = fileName
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')  // Replace non-alphanumeric with underscore
    .replace(/^_+|_+$/g, '');      // Remove leading/trailing underscores
  
  console.log(`[Apify Leads] Enriching contacts for: ${url}`);
  console.log(`[Apify Leads] Domain: ${domain}`);
  console.log(`[Apify Leads] File name: ${fileName}`);
  console.log(`[Apify Leads] Using actor: ${config.actor}`);
  
  // Actor input format for code_crafter/leads-finder
  const actorInput = {
    company_domain: [domain],
    contact_location: ['united states'],
    fetch_count: maxContacts,
    seniority_level: [
      'manager',
      'founder',
      'owner',
      'c_suite',
      'director',
      'partner',
      'vp',
      'head'
    ],
    file_name: fileName
  };
  
  // Start the actor run
  const runResponse = await fetch(
    `${config.apiBase}/acts/${encodeURIComponent(config.actor)}/runs?token=${config.token}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(actorInput),
    }
  );
  
  if (!runResponse.ok) {
    const error = await runResponse.text();
    throw new Error(`Failed to start Apify leads actor: ${error}`);
  }
  
  const runData = await runResponse.json();
  const runId = runData.data.id;
  
  console.log(`[Apify Leads] Run started: ${runId}`);
  
  // Poll for completion (this can take 2-5 minutes for LinkedIn scraping)
  let status = 'RUNNING';
  let attempts = 0;
  const maxAttempts = 120; // 10 minutes (LinkedIn is slow)
  
  while (status === 'RUNNING' || status === 'READY') {
    if (attempts >= maxAttempts) {
      throw new Error('Apify leads actor timed out after 10 minutes');
    }
    
    await new Promise(resolve => setTimeout(resolve, 5000));
    
    const statusResponse = await fetch(
      `${config.apiBase}/actor-runs/${runId}?token=${config.token}`
    );
    
    const statusData = await statusResponse.json();
    status = statusData.data.status;
    attempts++;
    
    if (attempts % 6 === 0) {  // Log every 30 seconds
      console.log(`[Apify Leads] Status: ${status} (${attempts * 5}s elapsed)`);
    }
  }
  
  if (status !== 'SUCCEEDED') {
    throw new Error(`Apify leads actor failed: ${status}`);
  }
  
  // Get final run data to extract cost
  const finalRunResponse = await fetch(
    `${config.apiBase}/actor-runs/${runId}?token=${config.token}`
  );
  const finalRunData = await finalRunResponse.json();
  
  // Debug: log the full usage object
  console.log(`[Apify Leads] Full run data usage:`, JSON.stringify(finalRunData.data.usage, null, 2));
  console.log(`[Apify Leads] Full run data stats:`, JSON.stringify(finalRunData.data.stats, null, 2));
  
  // Extract cost from usage (computeUnits)
  const usage = finalRunData.data.usage;
  const computeUnits = usage?.computeUnits || 0;
  // Apify charges $1.00 per 1000 compute units
  const actualCost = (computeUnits / 1000);
  
  console.log(`[Apify Leads] Cost: $${actualCost.toFixed(3)} (${computeUnits} compute units)`);
  
  // Fetch results
  const datasetId = runData.data.defaultDatasetId || runData.data.datasetId;
  
  if (!datasetId) {
    throw new Error('No dataset ID returned from Apify');
  }
  
  const datasetResponse = await fetch(
    `${config.apiBase}/datasets/${datasetId}/items?token=${config.token}&format=json`
  );
  
  const results = await datasetResponse.json();
  
  console.log(`[Apify Leads] Got ${results.length} contacts`);
  
  if (!results || results.length === 0) {
    return null;
  }
  
  // Transform Apify results to our format
  const contacts: ContactPerson[] = results.map((r: any) => {
    // Use the raw seniority level from Apify first, fallback to mapping
    const seniorityLevel = r.seniorityLevel || r.seniority_level || mapSeniorityLevel(r.title || r.jobTitle);
    
    return {
      fullName: r.full_name || r.name || r.fullName,
      firstName: r.firstName || r.first_name,
      lastName: r.lastName || r.last_name,
      jobTitle: r.job_title || r.title || r.jobTitle,
      email: r.email || r.workEmail || r.work_email,
      personalEmail: r.personalEmail || r.personal_email,
      mobileNumber: r.mobile_number || r.phone || r.mobileNumber,
      city: r.city,
      state: r.state,
      country: r.country || 'US',
      linkedin: r.linkedin_url || r.linkedinUrl || r.linkedin,
      seniorityLevel,
      functionalLevel: r.functionalLevel || r.functional_level,
      headline: r.headline,
      dataSource: 'linkedin',
    };
  });
  
  // Find owner/CEO
  const owner = contacts.find(c => 
    c.seniorityLevel === 'owner' || 
    c.jobTitle?.toLowerCase().includes('owner') ||
    c.jobTitle?.toLowerCase().includes('ceo') ||
    c.jobTitle?.toLowerCase().includes('founder')
  ) || null;
  
  // Find decision-makers (executives/managers)
  const decisionMakers = contacts.filter(c => 
    c.seniorityLevel === 'executive' || 
    c.seniorityLevel === 'owner'
  );
  
  // Extract company info if available
  const firstResult = results[0];
  const company: CompanyInfo | null = firstResult.company ? {
    name: firstResult.company.name || businessName,
    website: url,
    industry: firstResult.company.industry,
    companySize: firstResult.company.size || `${contacts.length}+`,
    foundedYear: firstResult.company.foundedYear,
    linkedinUrl: firstResult.company.linkedinUrl,
    description: firstResult.company.description,
    specialties: firstResult.company.specialties,
    dataSource: 'linkedin',
  } : null;
  
  return {
    url,
    company,
    owner,
    contacts,
    decisionMakers,
    totalContactsFound: contacts.length,
    contactsWithEmail: contacts.filter(c => c.email).length,
    contactsWithPhone: contacts.filter(c => c.mobileNumber).length,
    cost: actualCost,
  };
}

/**
 * Map job title/seniority to standard levels
 */
function mapSeniorityLevel(title: string | null): 'owner' | 'executive' | 'manager' | 'staff' | null {
  if (!title) return null;
  
  const lower = title.toLowerCase();
  
  if (lower.includes('owner') || lower.includes('founder') || lower.includes('ceo')) {
    return 'owner';
  }
  
  if (lower.includes('president') || lower.includes('vp') || 
      lower.includes('chief') || lower.includes('director')) {
    return 'executive';
  }
  
  if (lower.includes('manager') || lower.includes('head of')) {
    return 'manager';
  }
  
  return 'staff';
}
