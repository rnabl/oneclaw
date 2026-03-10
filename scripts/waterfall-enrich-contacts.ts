/**
 * Waterfall Contact Enrichment for Home Services Leads
 * 
 * Three-tier waterfall approach:
 * 1. Perplexity AI - Fast owner/contact lookup ($0.005)
 * 2. Apify leads-finder - Deep LinkedIn scrape ($0.15-1.50)
 * 3. Website scraping - Fallback extraction (free)
 * 
 * Saves all contacts to crm.lead_contacts table with proper priority/seniority
 */

import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';

dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const BATCH_SIZE = 50; // Process 50 leads at a time
const USE_APIFY = true; // Set to true to use Apify as tier 2 (expensive)

interface Lead {
  id: string;
  company_name: string;
  website: string;
  city?: string;
  state?: string;
}

interface Contact {
  full_name: string;
  first_name?: string;
  last_name?: string;
  title?: string;
  seniority_level?: string;
  email?: string;
  phone?: string;
  linkedin_url?: string;
  source: 'perplexity' | 'apify' | 'apify+perplexity' | 'website_scrape';
  is_primary: boolean;
  outreach_priority: number;
  confidence_score?: number;
  verified?: boolean; // TRUE when multiple sources agree on identity
}

/**
 * Determine seniority level from title
 */
function getSeniorityLevel(title: string | undefined): string {
  if (!title) return 'staff';
  
  const lower = title.toLowerCase();
  
  if (lower.includes('owner') || lower.includes('founder')) return 'owner';
  if (lower.includes('ceo') || lower.includes('cfo') || lower.includes('cto') || lower.includes('chief')) return 'c_suite';
  if (lower.includes('president') || lower.includes('vp') || lower.includes('vice president')) return 'vp';
  if (lower.includes('director')) return 'director';
  if (lower.includes('head of')) return 'head';
  if (lower.includes('partner')) return 'partner';
  if (lower.includes('manager')) return 'manager';
  
  return 'staff';
}

/**
 * Determine outreach priority from seniority
 */
function getOutreachPriority(seniority: string): number {
  const priorities: Record<string, number> = {
    'owner': 1,
    'c_suite': 2,
    'partner': 2,
    'vp': 3,
    'director': 4,
    'head': 4,
    'manager': 5,
    'staff': 10
  };
  
  return priorities[seniority] || 5;
}

/**
 * Tier 1: Perplexity AI - Fast owner lookup
 */
async function enrichViaPerplexity(lead: Lead): Promise<Contact[]> {
  const location = lead.city && lead.state ? `in ${lead.city}, ${lead.state}` : '';
  const prompt = `Find the owner or a good point of contact for ${lead.company_name} ${location} (website: ${lead.website}).

Please provide:
1. Contact person's name and title/role
2. Email address
3. Phone number

Format your response as:
Name: [name]
Title: [title]
Email: [email]
Phone: [phone]

Only provide verified, publicly available contact information. If you cannot find specific information, say "Not found" for that field.`;

  try {
    const response = await fetch('https://api.perplexity.ai/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.PERPLEXITY_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: 'sonar',
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.2,
        max_tokens: 500
      })
    });

    if (!response.ok) {
      throw new Error(`Perplexity API error: ${response.status}`);
    }

    const data = await response.json();
    const text = data.choices[0].message.content;

    // Parse response
    const nameMatch = text.match(/Name:\s*(.+)/i);
    const titleMatch = text.match(/Title:\s*(.+)/i);
    const emailMatch = text.match(/Email:\s*([^\s@]+@[^\s@]+\.[^\s@]+)/i);
    const phoneMatch = text.match(/Phone:\s*([\d\s\-\(\)\.]+)/i);

    // Clean citation markers
    const cleanText = (str: string | undefined) => str?.replace(/\[\d+\]/g, '').trim();

    const fullName = nameMatch?.[1] && !nameMatch[1].includes('Not found') ? cleanText(nameMatch[1]) : null;
    const title = titleMatch?.[1] && !titleMatch[1].includes('Not found') ? cleanText(titleMatch[1]) : null;
    const email = emailMatch?.[1] && !emailMatch[1].includes('Not found') ? cleanText(emailMatch[1]) : null;
    const phone = phoneMatch?.[1] && !phoneMatch[1].includes('Not found') ? cleanText(phoneMatch[1]) : null;

    if (!fullName || (!email && !phone)) {
      return [];
    }

    // Split name into first/last
    const nameParts = fullName.split(' ');
    const firstName = nameParts[0];
    const lastName = nameParts.slice(1).join(' ');

    const seniority = getSeniorityLevel(title || undefined);
    
    return [{
      full_name: fullName,
      first_name: firstName,
      last_name: lastName,
      title: title || undefined,
      seniority_level: seniority,
      email: email || undefined,
      phone: phone || undefined,
      source: 'perplexity',
      is_primary: true, // Perplexity contact is primary
      outreach_priority: getOutreachPriority(seniority),
      confidence_score: 0.75 // Medium confidence
    }];

  } catch (error: any) {
    console.error(`   ⚠️  Perplexity failed: ${error.message}`);
    return [];
  }
}

/**
 * Tier 2: Apify leads-finder - Deep LinkedIn scrape
 */
async function enrichViaApify(lead: Lead): Promise<Contact[]> {
  if (!USE_APIFY) {
    return [];
  }

  try {
    // Call harness API
    const response = await fetch('http://localhost:9000/execute', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        workflowId: 'enrich-contact',
        tenantId: 'waterfall-enrichment',
        tier: 'enterprise',
        input: {
          url: lead.website,
          businessName: lead.company_name,
          city: lead.city,
          state: lead.state,
          method: 'linkedin'
        }
      })
    });

    if (!response.ok) {
      throw new Error(`Harness API error: ${response.status}`);
    }

    const result = await response.json();
    
    // Poll for completion
    let jobStatus = result.status;
    let attempts = 0;
    const maxAttempts = 120; // 10 minutes

    while (jobStatus === 'running' && attempts < maxAttempts) {
      await new Promise(resolve => setTimeout(resolve, 5000));
      
      const statusResponse = await fetch(`http://localhost:9000/jobs/${result.jobId}/status`);
      const statusData = await statusResponse.json();
      jobStatus = statusData.status;
      attempts++;
    }

    if (jobStatus !== 'completed') {
      throw new Error('Apify job timed out or failed');
    }

    // Get final result
    const jobResponse = await fetch(`http://localhost:9000/jobs/${result.jobId}`);
    const jobData = await jobResponse.json();
    const output = jobData.job.output;

    const contacts: Contact[] = [];

    // Add owner if found
    if (output.owner) {
      const owner = output.owner;
      contacts.push({
        full_name: owner.name,
        title: owner.title,
        seniority_level: owner.seniorityLevel || 'owner',
        email: owner.email,
        phone: owner.phone,
        linkedin_url: owner.linkedin,
        source: 'apify',
        is_primary: contacts.length === 0, // First contact is primary
        outreach_priority: 1,
        confidence_score: 0.9 // High confidence from LinkedIn
      });
    }

    // Add other contacts
    if (output.contacts && Array.isArray(output.contacts)) {
      for (const contact of output.contacts) {
        const seniority = getSeniorityLevel(contact.title);
        contacts.push({
          full_name: contact.name,
          title: contact.title,
          seniority_level: seniority,
          email: contact.email,
          phone: contact.phone,
          linkedin_url: contact.linkedin,
          source: 'apify',
          is_primary: false,
          outreach_priority: getOutreachPriority(seniority),
          confidence_score: 0.9
        });
      }
    }

    return contacts;

  } catch (error: any) {
    console.error(`   ⚠️  Apify failed: ${error.message}`);
    return [];
  }
}

/**
 * Tier 3: Website scraping - Fallback
 */
async function enrichViaWebsiteScrape(lead: Lead): Promise<Contact[]> {
  try {
    const response = await fetch(lead.website, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      }
    });

    const html = await response.text();

    // Parse for contact info
    const emailPattern = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
    const phonePattern = /\d{3}[-.]?\d{3}[-.]?\d{4}/;

    const emailMatches = html.match(emailPattern);
    const phoneMatch = html.match(phonePattern);

    if (!emailMatches && !phoneMatch) {
      return [];
    }

    // Prioritize contact/info/owner emails
    let bestEmail: string | undefined;
    if (emailMatches && emailMatches.length > 0) {
      const priorityEmails = emailMatches.filter(email =>
        email.toLowerCase().includes('owner') ||
        email.toLowerCase().includes('contact') ||
        email.toLowerCase().includes('info')
      );
      bestEmail = priorityEmails[0] || emailMatches[0];
    }

    if (!bestEmail && !phoneMatch) {
      return [];
    }

    return [{
      full_name: 'Business Owner', // Generic name for website scrape
      title: 'Owner',
      seniority_level: 'owner',
      email: bestEmail,
      phone: phoneMatch?.[0],
      source: 'website_scrape',
      is_primary: true,
      outreach_priority: 1,
      confidence_score: 0.5 // Low confidence
    }];

  } catch (error: any) {
    console.error(`   ⚠️  Website scrape failed: ${error.message}`);
    return [];
  }
}

/**
 * Save contacts to database
 */
async function saveContacts(leadId: string, contacts: Contact[], tier: string) {
  if (contacts.length === 0) {
    // Mark as failed
    await supabase
      .schema('crm')
      .from('leads')
      .update({
        enrichment_status: 'failed',
        enrichment_tier: tier
      })
      .eq('id', leadId);
    return;
  }

  // Delete existing contacts first to avoid duplicates
  await supabase
    .schema('crm')
    .from('lead_contacts')
    .delete()
    .eq('lead_id', leadId);

  // Mark lead as enriching
  await supabase
    .schema('crm')
    .from('leads')
    .update({
      enrichment_status: 'enriching',
      enrichment_tier: tier
    })
    .eq('id', leadId);

  // Insert contacts
  const contactsToInsert = contacts.map(c => ({
    lead_id: leadId,
    ...c
  }));

  const { error } = await supabase
    .schema('crm')
    .from('lead_contacts')
    .insert(contactsToInsert);

  if (error) {
    console.error(`   ❌ Failed to save contacts: ${error.message}`);
    await supabase
      .schema('crm')
      .from('leads')
      .update({ enrichment_status: 'failed' })
      .eq('id', leadId);
  } else {
    console.log(`   ✅ Saved ${contacts.length} contact(s)`);
    // Trigger will auto-update enrichment_status to 'completed'
  }
}

/**
 * Waterfall enrichment for a single lead
 */
async function enrichLead(lead: Lead): Promise<void> {
  console.log(`\n🔍 ${lead.company_name}`);

  try {
    // Call harness API - it will handle Apify + Perplexity internally
    console.log(`   📡 Enriching via harness (Apify + Perplexity)...`);
    const response = await fetch('http://localhost:9000/execute', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        workflowId: 'enrich-contact',
        tenantId: 'waterfall-enrichment',
        tier: 'enterprise',
        input: {
          url: lead.website,
          businessName: lead.company_name,
          city: lead.city,
          state: lead.state,
          method: 'auto'
        }
      })
    });

    if (!response.ok) {
      throw new Error(`Harness API error: ${response.status}`);
    }

    const result = await response.json();
    
    // Poll for completion
    let jobStatus = result.status;
    let attempts = 0;
    const maxAttempts = 120; // 10 minutes

    while (jobStatus === 'running' && attempts < maxAttempts) {
      await new Promise(resolve => setTimeout(resolve, 5000));
      
      const statusResponse = await fetch(`http://localhost:9000/jobs/${result.jobId}/status`);
      const statusData = await statusResponse.json();
      jobStatus = statusData.status;
      attempts++;
      
      if (attempts % 12 === 0) {
        console.log(`   ⏳ Still running... (${attempts * 5}s)`);
      }
    }

    if (jobStatus !== 'completed') {
      throw new Error('Enrichment job timed out or failed');
    }

    // Get final result
    const jobResponse = await fetch(`http://localhost:9000/jobs/${result.jobId}`);
    const jobData = await jobResponse.json();
    const output = jobData.job.output;

    const allContacts: Contact[] = [];

    // Add owner if found
    if (output.owner) {
      const owner = output.owner;
      allContacts.push({
        full_name: owner.name,
        first_name: owner.name?.split(' ')[0],
        last_name: owner.name?.split(' ').slice(1).join(' '),
        title: owner.title,
        seniority_level: owner.seniorityLevel || 'owner',
        email: owner.email,
        phone: owner.phone,
        linkedin_url: owner.linkedin,
        source: output.source || 'apify',
        is_primary: true,
        outreach_priority: 1,
        confidence_score: 0.9,
        verified: false
      });
    }

    // Add other contacts
    if (output.contacts && Array.isArray(output.contacts)) {
      for (const contact of output.contacts) {
        const seniority = getSeniorityLevel(contact.title);
        allContacts.push({
          full_name: contact.name,
          first_name: contact.name?.split(' ')[0],
          last_name: contact.name?.split(' ').slice(1).join(' '),
          title: contact.title,
          seniority_level: seniority,
          email: contact.email,
          phone: contact.phone,
          linkedin_url: contact.linkedin,
          source: 'apify',
          is_primary: false,
          outreach_priority: getOutreachPriority(seniority),
          confidence_score: 0.9,
          verified: false
        });
      }
    }

    if (allContacts.length > 0) {
      console.log(`   ✅ Found ${allContacts.length} contact(s) via ${output.source}`);
      await saveContacts(lead.id, allContacts, output.source);
    } else {
      console.log(`   ❌ No contacts found`);
      await saveContacts(lead.id, [], 'none');
    }
    
  } catch (error: any) {
    console.error(`   ❌ Error: ${error.message}`);
    await saveContacts(lead.id, [], 'failed');
  }
}

/**
 * Main execution
 */
async function main() {
  console.log('🌊 Waterfall Contact Enrichment\n');
  console.log('='.repeat(60));
  console.log(`Batch size: ${BATCH_SIZE}`);
  console.log(`Use Apify: ${USE_APIFY ? 'Yes' : 'No (Perplexity + Website only)'}`);
  console.log(`Industries: HVAC, Plumbing, Electrical, Home Services (NO Roofing)`);
  console.log('='.repeat(60));

  // Get leads needing enrichment (filtered by industry in SQL function)
  const { data: leads, error } = await supabase
    .schema('crm')
    .rpc('get_leads_needing_enrichment', { p_limit: BATCH_SIZE });

  if (error) {
    console.error('❌ Error fetching leads:', error);
    return;
  }

  if (!leads || leads.length === 0) {
    console.log('\n✅ No leads need enrichment!');
    return;
  }

  console.log(`\n📊 Found ${leads.length} home services leads to enrich\n`);

  let enriched = 0;
  let failed = 0;

  for (const lead of leads) {
    // The function returns lead_id, not id - map it
    const mappedLead: Lead = {
      id: lead.lead_id,
      company_name: lead.company_name,
      website: lead.website,
      city: lead.city,
      state: lead.state
    };

    try {
      await enrichLead(mappedLead);
      enriched++;
      
      // Rate limit: 2 second delay between leads
      await new Promise(resolve => setTimeout(resolve, 2000));
      
    } catch (error: any) {
      console.error(`   ❌ Error: ${error.message}`);
      failed++;
    }
  }

  console.log('\n' + '='.repeat(60));
  console.log('📊 Summary');
  console.log('='.repeat(60));
  console.log(`Total processed: ${leads.length}`);
  console.log(`✅ Enriched: ${enriched}`);
  console.log(`❌ Failed: ${failed}`);
  console.log('='.repeat(60));
  
  // Show stats
  const { data: stats } = await supabase
    .schema('crm')
    .from('leads')
    .select('enrichment_status, enrichment_tier')
    .not('enrichment_status', 'is', null);

  if (stats) {
    console.log('\n📈 Overall Enrichment Stats:');
    const statusCounts = stats.reduce((acc: any, row: any) => {
      acc[row.enrichment_status] = (acc[row.enrichment_status] || 0) + 1;
      return acc;
    }, {});
    
    const tierCounts = stats.reduce((acc: any, row: any) => {
      if (row.enrichment_tier) {
        acc[row.enrichment_tier] = (acc[row.enrichment_tier] || 0) + 1;
      }
      return acc;
    }, {});

    console.log('\nBy Status:');
    Object.entries(statusCounts).forEach(([status, count]) => {
      console.log(`  ${status}: ${count}`);
    });

    console.log('\nBy Tier:');
    Object.entries(tierCounts).forEach(([tier, count]) => {
      console.log(`  ${tier}: ${count}`);
    });
  }
}

main().catch(console.error);
