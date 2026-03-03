import { config } from 'dotenv';
import { createClient } from '@supabase/supabase-js';

config();

const supabaseUrl = process.env.SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

const HARNESS_URL = process.env.HARNESS_URL || 'http://localhost:8787';
const TENANT_ID = 'default';

// Validate that a name looks like a real person's name
function isValidOwnerName(name: string): boolean {
  if (!name || name.length < 4) return false;
  
  // Reject common bad patterns from parsing errors
  const badPatterns = [
    /^(is|the|no|or|and|as|to|in|of|for|by)\s/i,
    /\s(is|the|no|or|and|as|to|in|of|for|by)$/i,
    /^No\s+(specific|owner|ownership|individual)/i,
    /^Business\s+Owner$/i,
    /explicitly|specifically|confirm|listed|mentioned/i,
    /different\s+owner/i,
    /owner\s+(or|and|is)/i,
  ];
  
  for (const pattern of badPatterns) {
    if (pattern.test(name)) return false;
  }
  
  // Must have at least 2 words (first and last name)
  const words = name.trim().split(/\s+/);
  if (words.length < 2) return false;
  
  // First word should be capitalized (looks like a first name)
  if (!/^[A-Z][a-z]/.test(words[0])) return false;
  
  return true;
}

async function enrichBusinessesWithoutEmails() {
  console.log('📧 Step 3: Enrich Businesses Without Emails\n');
  console.log('=' .repeat(80) + '\n');
  
  // Get all HVAC leads without emails
  const { data: leadsWithoutEmails, error } = await supabase
    .schema('crm')
    .from('leads')
    .select('id, company_name, website, phone, city, state, contact_data')
    .eq('industry', 'HVAC')
    .is('email', null)
    .order('company_name');
  
  if (error) {
    console.error('❌ Error fetching leads:', error);
    return;
  }
  
  console.log(`📊 Found ${leadsWithoutEmails?.length || 0} businesses without emails\n`);
  
  if (!leadsWithoutEmails || leadsWithoutEmails.length === 0) {
    console.log('✅ No businesses need enrichment!\n');
    return;
  }
  
  console.log('🚀 Starting batch enrichment...\n');
  console.log(`   Processing in batches of 10 with delays for rate limiting\n`);
  console.log('=' .repeat(80) + '\n');
  
  let enriched = 0;
  let nameOnly = 0;
  let failed = 0;
  let noContact = 0;
  
  // Process in smaller batches with delays to avoid rate limiting
  const batchSize = 5; // Reduced from 10 to avoid rate limits
  const delayBetweenBatches = 10000; // 10 seconds between batches
  const delayBetweenRequests = 1500; // 1.5 seconds between requests within a batch
  
  for (let i = 0; i < leadsWithoutEmails.length; i += batchSize) {
    const batch = leadsWithoutEmails.slice(i, i + batchSize);
    const batchNum = Math.floor(i / batchSize) + 1;
    const totalBatches = Math.ceil(leadsWithoutEmails.length / batchSize);
    
    console.log(`📦 Batch ${batchNum}/${totalBatches} (${batch.length} businesses):`);
    
    // Process batch SEQUENTIALLY to avoid rate limits
    const results: any[] = [];
    for (const lead of batch) {
      const result = await (async () => {
      try {
        // Call the enrich-contact workflow via Harness API
        const response = await fetch(`${HARNESS_URL}/tools/enrich-contact/execute`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            input: {
              url: lead.website,
              businessName: lead.company_name,
              city: lead.city,
              state: lead.state,
              method: 'perplexity',
            },
            tenantId: TENANT_ID,
          })
        });
        
        if (!response.ok) {
          const errorText = await response.text();
          console.log(`   ❌ ${lead.company_name.padEnd(50)} (API error: ${response.status})`);
          return { status: 'failed', lead };
        }
        
        const result = await response.json();
        
        // Check if result has data (can be in 'result' or 'output')
        const data = result.result || result.output || result;
        
        const email = data?.owner?.email || data?.email || null;
        const name = data?.owner?.name || data?.name || null;
        const title = data?.owner?.title || data?.title || null;
        const linkedin = data?.owner?.linkedin || data?.linkedin || null;
        const phone = data?.owner?.phone || data?.phone || null;
        const source = data?.source || 'enrich-contact';
        
        // We found something useful (owner name or email)
        if (email) {
          // Full success - found email
          const { error: updateError } = await supabase
            .schema('crm')
            .from('leads')
            .update({
              email: email,
              contact_data: {
                owner_name: name,
                owner_email: email,
                owner_title: title,
                owner_linkedin: linkedin,
                owner_phone: phone,
                enrichment_status: 'success',
                enrichment_date: new Date().toISOString(),
                enrichment_source: source,
              }
            })
            .eq('id', lead.id);
          
          if (updateError) {
            console.log(`   ⚠️  ${lead.company_name.padEnd(50)} (found email but failed to update)`);
            return { status: 'failed', lead };
          }
          
          console.log(`   ✅ ${lead.company_name.padEnd(50)} ${email}`);
          return { status: 'enriched', lead, email };
        } else if (name && isValidOwnerName(name)) {
          // Partial success - found owner name but no email
          const { error: updateError } = await supabase
            .schema('crm')
            .from('leads')
            .update({
              contact_data: {
                owner_name: name,
                owner_title: title,
                owner_linkedin: linkedin,
                owner_phone: phone,
                enrichment_status: 'name_only',
                enrichment_date: new Date().toISOString(),
                enrichment_source: source,
              }
            })
            .eq('id', lead.id);
          
          console.log(`   👤 ${lead.company_name.padEnd(50)} Owner: ${name} (no email)`);
          return { status: 'name_only', lead, name };
        } else {
          // No contact found
          const { error: updateError } = await supabase
            .schema('crm')
            .from('leads')
            .update({
              contact_data: {
                enrichment_status: 'no_contact_found',
                enrichment_date: new Date().toISOString(),
              }
            })
            .eq('id', lead.id);
          
          console.log(`   ⚠️  ${lead.company_name.padEnd(50)} (no contact found)`);
          return { status: 'no_contact', lead };
        }
      } catch (error) {
        console.log(`   ❌ ${lead.company_name.padEnd(50)} (error: ${error})`);
        return { status: 'failed', lead, error };
      }
      })();
      
      results.push(result);
      
      // Delay between requests within a batch
      await new Promise(resolve => setTimeout(resolve, delayBetweenRequests));
    }
    
    // Count results
    results.forEach(r => {
      if (r.status === 'enriched') enriched++;
      else if (r.status === 'name_only') nameOnly++;
      else if (r.status === 'no_contact') noContact++;
      else failed++;
    });
    
    console.log();
    
    // Delay between batches (except for last batch)
    if (i + batchSize < leadsWithoutEmails.length) {
      console.log(`   ⏳ Waiting ${delayBetweenBatches / 1000}s before next batch...\n`);
      await new Promise(resolve => setTimeout(resolve, delayBetweenBatches));
    }
  }
  
  console.log('=' .repeat(80));
  console.log('✅ Enrichment Complete!\n');
  console.log(`   Total processed:       ${leadsWithoutEmails.length}`);
  console.log(`   ✅ Email found:        ${enriched}`);
  console.log(`   👤 Name only:          ${nameOnly}`);
  console.log(`   ⚠️  No contact found:  ${noContact}`);
  console.log(`   ❌ Failed:             ${failed}`);
  console.log('=' .repeat(80) + '\n');
  
  // Final stats
  const { data: finalStats } = await supabase
    .schema('crm')
    .from('leads')
    .select('id')
    .eq('industry', 'HVAC')
    .not('email', 'is', null);
  
  console.log(`📊 Final Database Stats:`);
  console.log(`   Total HVAC leads: 743`);
  console.log(`   With emails: ${finalStats?.length || 0}`);
  console.log(`   Without emails: ${743 - (finalStats?.length || 0)}\n`);
  
  const successRate = ((enriched / leadsWithoutEmails.length) * 100).toFixed(1);
  console.log(`📈 Enrichment Success Rate: ${successRate}%\n`);
}

enrichBusinessesWithoutEmails().catch(console.error);
