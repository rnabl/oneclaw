/**
 * Find Contact Information for Leads
 * 
 * Three-tier approach:
 * 1. Check existing email/phone from lead data
 * 2. Extract from website scan if available
 * 3. Use Perplexity AI to find owner/decision maker contact info
 * 
 * Stores: primary_email, secondary_email, primary_phone, secondary_phone
 */

import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';

dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

interface Lead {
  id: string;
  company_name: string;
  website: string;
  email?: string;
  phone?: string;
  city?: string;
  state?: string;
  source_metadata?: any;
}

interface ContactInfo {
  primary_email: string | null;
  secondary_email: string | null;
  primary_phone: string | null;
  secondary_phone: string | null;
  contact_source: string; // 'existing', 'website_scan', 'perplexity'
  contact_person?: string;
  contact_title?: string;
}

/**
 * Use Perplexity to find contact information
 */
async function findContactWithPerplexity(
  companyName: string,
  website: string,
  city?: string,
  state?: string
): Promise<{
  email: string | null;
  phone: string | null;
  person_name?: string;
  person_title?: string;
}> {
  
  const location = city && state ? `in ${city}, ${state}` : '';
  const prompt = `Find the owner or a good point of contact for ${companyName} ${location} (website: ${website}).

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
        messages: [
          {
            role: 'user',
            content: prompt
          }
        ],
        temperature: 0.2,
        max_tokens: 500
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Perplexity API error: ${response.status} - ${errorText}`);
    }

    const data = await response.json();
    const text = data.choices[0].message.content;

    // Parse response
    const nameMatch = text.match(/Name:\s*(.+)/i);
    const titleMatch = text.match(/Title:\s*(.+)/i);
    const emailMatch = text.match(/Email:\s*([^\s@]+@[^\s@]+\.[^\s@]+)/i);
    const phoneMatch = text.match(/Phone:\s*([\d\s\-\(\)\.]+)/i);

    // Clean citation markers from extracted text
    const cleanText = (str: string | undefined) => str?.replace(/\[\d+\]/g, '').trim();

    const email = emailMatch?.[1] && !emailMatch[1].includes('Not found') ? cleanText(emailMatch[1]) : null;
    const phone = phoneMatch?.[1] && !phoneMatch[1].includes('Not found') ? cleanText(phoneMatch[1]) : null;
    const personName = nameMatch?.[1] && !nameMatch[1].includes('Not found') ? cleanText(nameMatch[1]) : undefined;
    const personTitle = titleMatch?.[1] && !titleMatch[1].includes('Not found') ? cleanText(titleMatch[1]) : undefined;

    return {
      email,
      phone,
      person_name: personName,
      person_title: personTitle
    };

  } catch (error: any) {
    console.error(`   ⚠️  Perplexity lookup failed: ${error.message}`);
    return {
      email: null,
      phone: null
    };
  }
}

/**
 * Extract email from website content (if scanned)
 */
function extractEmailFromWebsiteScan(scanData: any): string | null {
  if (!scanData?.contact?.has_email) return null;
  
  // TODO: The scanner detects email presence but doesn't extract it
  // We'd need to enhance the scanner to actually extract the email address
  // For now, return null
  return null;
}

/**
 * Extract phone from website content (if scanned)
 */
function extractPhoneFromWebsiteScan(scanData: any): string | null {
  if (!scanData?.contact?.has_phone) return null;
  
  // TODO: The scanner detects phone presence but doesn't extract it
  // We'd need to enhance the scanner to actually extract the phone number
  // For now, return null
  return null;
}

/**
 * Validate email format
 */
function isValidEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  // Basic email validation
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  // Check if it's a valid email format AND not a file extension
  return emailRegex.test(email) && !email.endsWith('.png') && !email.endsWith('.jpg') && !email.endsWith('.gif');
}

/**
 * Find contact info for a single lead
 */
async function findContactInfo(lead: Lead): Promise<ContactInfo> {
  const result: ContactInfo = {
    primary_email: null,
    secondary_email: null,
    primary_phone: null,
    secondary_phone: null,
    contact_source: 'existing'
  };

  // Check existing data first - but validate email format
  if (lead.email && isValidEmail(lead.email)) {
    result.primary_email = lead.email;
    result.contact_source = 'existing';
  }
  
  if (lead.phone) {
    result.primary_phone = lead.phone;
  }

  // If we already have email and phone, we're good
  if (result.primary_email && result.primary_phone) {
    return result;
  }

  // Check website scan data
  const websiteScan = lead.source_metadata?.website_scan;
  if (websiteScan) {
    const websiteEmail = extractEmailFromWebsiteScan(websiteScan);
    const websitePhone = extractPhoneFromWebsiteScan(websiteScan);

    if (!result.primary_email && websiteEmail) {
      result.primary_email = websiteEmail;
      result.contact_source = 'website_scan';
    } else if (result.primary_email && websiteEmail && websiteEmail !== result.primary_email) {
      result.secondary_email = websiteEmail;
    }

    if (!result.primary_phone && websitePhone) {
      result.primary_phone = websitePhone;
    } else if (result.primary_phone && websitePhone && websitePhone !== result.primary_phone) {
      result.secondary_phone = websitePhone;
    }
  }

  // If still missing, use Perplexity
  if (!result.primary_email || !result.primary_phone) {
    const perplexityResult = await findContactWithPerplexity(
      lead.company_name,
      lead.website,
      lead.city,
      lead.state
    );

    if (!result.primary_email && perplexityResult.email) {
      result.primary_email = perplexityResult.email;
      result.contact_source = 'perplexity';
      if (perplexityResult.person_name) {
        (result as any).contact_person = perplexityResult.person_name;
        (result as any).contact_title = perplexityResult.person_title;
      }
    } else if (result.primary_email && perplexityResult.email && perplexityResult.email !== result.primary_email) {
      result.secondary_email = perplexityResult.email;
      if (perplexityResult.person_name) {
        (result as any).contact_person = perplexityResult.person_name;
        (result as any).contact_title = perplexityResult.person_title;
      }
    }

    if (!result.primary_phone && perplexityResult.phone) {
      result.primary_phone = perplexityResult.phone;
    } else if (result.primary_phone && perplexityResult.phone && perplexityResult.phone !== result.primary_phone) {
      result.secondary_phone = perplexityResult.phone;
    }
  }

  return result;
}

/**
 * Process leads with bounced emails or missing contact info
 */
async function main() {
  console.log('📧 Contact Information Enrichment\n');
  console.log('='.repeat(60));
  
  // Get leads that need contact enrichment
  // Priority 1: Leads with bounced emails
  // Priority 2: Leads without emails
  // Priority 3: All leads (to get secondary contacts)
  
  const { data: leads, error } = await supabase
    .schema('crm')
    .from('leads')
    .select('id, company_name, website, email, phone, city, state, source_metadata')
    .eq('company_name', 'Freedom Heating & Air Conditioning')
    .not('website', 'is', null)
    .limit(1); // Just test Freedom Heating
  
  if (error || !leads) {
    console.error('❌ Error fetching leads:', error);
    return;
  }

  console.log(`\n📊 Found ${leads.length} leads to enrich\n`);

  let enriched = 0;
  let failed = 0;

  for (const lead of leads) {
    console.log(`\n🔍 ${lead.company_name}`);
    console.log(`   Current: ${lead.email || 'No email'}`);

    try {
      const contactInfo = await findContactInfo(lead);

      console.log(`   Primary Email: ${contactInfo.primary_email || 'Not found'}`);
      console.log(`   Secondary Email: ${contactInfo.secondary_email || 'N/A'}`);
      console.log(`   Primary Phone: ${contactInfo.primary_phone || 'Not found'}`);
      console.log(`   Secondary Phone: ${contactInfo.secondary_phone || 'N/A'}`);
      console.log(`   Source: ${contactInfo.contact_source}`);
      if ((contactInfo as any).contact_person) {
        console.log(`   Contact Person: ${(contactInfo as any).contact_person}`);
        console.log(`   Contact Title: ${(contactInfo as any).contact_title || 'N/A'}`);
      }

      // Update lead with enriched contact info
      const updateData: any = {
        email: contactInfo.primary_email || lead.email,
        phone: contactInfo.primary_phone || lead.phone,
        source_metadata: {
          ...(lead.source_metadata || {}),
          contact_enrichment: {
            primary_email: contactInfo.primary_email,
            secondary_email: contactInfo.secondary_email,
            primary_phone: contactInfo.primary_phone,
            secondary_phone: contactInfo.secondary_phone,
            contact_source: contactInfo.contact_source,
            enriched_at: new Date().toISOString()
          }
        }
      };

      const { error: updateError } = await supabase
        .schema('crm')
        .from('leads')
        .update(updateData)
        .eq('id', lead.id);

      if (updateError) {
        console.error(`   ❌ Update failed: ${updateError.message}`);
        failed++;
      } else {
        console.log(`   ✅ Contact info enriched`);
        enriched++;
      }

      // Rate limit for Perplexity (if used)
      if (contactInfo.contact_source === 'perplexity') {
        await new Promise(resolve => setTimeout(resolve, 2000)); // 2 sec delay
      }

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
}

main().catch(console.error);
