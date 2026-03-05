/**
 * Test: Full Pipeline via Harness API
 * 
 * Properly tests enrichment → AI rankings → campaign generation
 * by calling Harness API endpoints (which Daemon securely manages)
 * 
 * Flow:
 * 1. Fetch HOT job posting leads from DB
 * 2. Call Harness to enrich contacts (find emails)
 * 3. Call Harness to check AI rankings
 * 4. Generate campaigns based on results
 * 5. Store in email_campaigns table
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config({ path: '.env.production' });

const HARNESS_URL = process.env.HARNESS_URL || 'http://localhost:8787';

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

interface HarnessJob {
  job: {
    id: string;
    status: 'pending' | 'running' | 'completed' | 'failed';
    output?: any;
    error?: string;
  };
}

/**
 * Call Harness API to execute a tool/workflow
 */
async function callHarness(toolId: string, input: any): Promise<any> {
  console.log(`  → Calling Harness: ${toolId}`);
  
  const res = await fetch(`${HARNESS_URL}/tools/${toolId}/execute`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      input,
      tenantId: 'oneclaw',
    })
  });
  
  if (!res.ok) {
    const error = await res.text();
    throw new Error(`Harness error (${res.status}): ${error}`);
  }
  
  const data = await res.json();
  return data;
}

/**
 * Poll a job until completion
 */
async function pollJob(jobId: string, maxAttempts = 30): Promise<any> {
  for (let i = 0; i < maxAttempts; i++) {
    const res = await fetch(`${HARNESS_URL}/jobs/${jobId}`);
    
    if (!res.ok) {
      throw new Error(`Failed to fetch job ${jobId}`);
    }
    
    const data = await res.json();
    const job = data.job || data;
    
    if (job.status === 'completed') {
      return job.output;
    }
    
    if (job.status === 'failed') {
      throw new Error(`Job failed: ${job.error || 'Unknown error'}`);
    }
    
    // Still running, wait
    await sleep(2000);
  }
  
  throw new Error(`Job ${jobId} timeout - did not complete in time`);
}

function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function inferService(roles: string[]): string {
  const roleStr = roles.join(' ').toLowerCase();
  
  if (roleStr.includes('hvac') || roleStr.includes('heating') || roleStr.includes('cooling')) {
    return 'HVAC';
  }
  if (roleStr.includes('plumb')) return 'plumbing';
  if (roleStr.includes('roof')) return 'roofing';
  if (roleStr.includes('electric')) return 'electrical';
  if (roleStr.includes('landscap') || roleStr.includes('lawn')) return 'landscaping';
  
  return 'home services';
}

async function main() {
  console.log('='.repeat(80));
  console.log('🚀 Full Pipeline Test via Harness API');
  console.log('='.repeat(80));
  console.log();
  console.log(`Harness URL: ${HARNESS_URL}`);
  console.log();

  // Step 1: Fetch HOT job posting leads
  console.log('📊 Step 1: Fetching HOT job posting leads...\n');
  
  const { data: leads, error } = await supabase
    .schema('crm')
    .from('leads')
    .select('*')
    .eq('source_type', 'job_posting')
    .gte('lead_score', 85)
    .not('website', 'is', null)
    .limit(3);

  if (error) {
    console.error('❌ Database error:', error.message);
    return;
  }

  if (!leads || leads.length === 0) {
    console.log('⚠️  No HOT leads found in database.');
    console.log('Run discovery first: npx tsx run-all-cities-discovery.ts\n');
    return;
  }

  console.log(`✅ Found ${leads.length} leads:\n`);
  leads.forEach((lead, i) => {
    console.log(`${i + 1}. ${lead.business_name || 'Unknown'}`);
    console.log(`   Location: ${lead.city}, ${lead.state}`);
    console.log(`   Website: ${lead.website}`);
    console.log(`   Has Email: ${lead.contact_data?.email ? '✅' : '❌'}`);
    console.log();
  });

  // Process first lead
  const testLead = leads[0];
  console.log('\n' + '='.repeat(80));
  console.log(`🎯 Processing: ${testLead.business_name || 'Unknown'}`);
  console.log('='.repeat(80));
  console.log();

  // Step 2: Email Enrichment (if needed)
  let hasEmail = !!testLead.contact_data?.email;
  
  if (!hasEmail) {
    console.log('📧 Step 2: Email Enrichment\n');
    console.log(`Business: ${testLead.business_name || 'Unknown'}`);
    console.log(`Website: ${testLead.website}\n`);

    try {
      const enrichResult = await callHarness('enrich-contact', {
        url: testLead.website,
        businessName: testLead.business_name || 'Unknown',
        city: testLead.city,
        state: testLead.state,
        leadId: testLead.id,
      });

      console.log(`  ✅ Result:`, enrichResult.success ? 'Success' : 'Failed');

      if (enrichResult.success && enrichResult.result?.owner?.email) {
        console.log(`  ✅ Found email: ${enrichResult.result.owner.email}`);
        console.log(`  👤 Contact: ${enrichResult.result.owner.name || 'N/A'}\n`);
        hasEmail = true;
        
        // Update local copy
        testLead.contact_data = enrichResult.result.owner;
      } else {
        console.log(`  ⚠️  No email found\n`);
      }
    } catch (err: any) {
      console.error(`  ❌ Enrichment failed: ${err.message}\n`);
    }
  } else {
    console.log('✅ Step 2: Email already exists, skipping enrichment\n');
  }

  // Step 3: AI Rankings Check
  console.log('='.repeat(80));
  console.log('🎯 Step 3: AI Rankings Check');
  console.log('='.repeat(80));
  console.log();

  const businessName = testLead.business_name || 'Unknown Business';
  const city = testLead.city || 'Unknown';
  const state = testLead.state || 'TX';
  const roles = testLead.source_metadata?.hiringRoles || [];
  const service = inferService(roles);

  console.log(`Business: ${businessName}`);
  console.log(`Service: ${service}`);
  console.log(`Query: "Best ${service} in ${city}, ${state}"\n`);

  let competitors: string[] = [];
  let isMentioned = false;

  try {
    const rankingsResult = await callHarness('check-ai-rankings', {
      niche: service,
      city,
      state,
      checkBusiness: businessName,
    });

    console.log(`  ✅ Result:`, rankingsResult.success ? 'Success' : 'Failed');

    if (rankingsResult.success && rankingsResult.result) {
      const output = rankingsResult.result;
      isMentioned = output.target_business_mentioned || false;
      competitors = output.top_businesses?.map((b: any) => b.name) || [];

      console.log(`  Target mentioned: ${isMentioned ? '✅ YES' : '❌ NO'}`);
      console.log(`  Top ${competitors.length} competitors:`);
      competitors.slice(0, 3).forEach((name, i) => {
        console.log(`    ${i + 1}. ${name}`);
      });
      console.log();
    }
  } catch (err: any) {
    console.error(`  ❌ Rankings check failed: ${err.message}\n`);
  }

  // Step 4: Campaign Generation
  if (!isMentioned && hasEmail) {
    console.log('='.repeat(80));
    console.log('📧 Step 4: Campaign Generation');
    console.log('='.repeat(80));
    console.log();

    const firstName = testLead.contact_data?.owner_name?.split(' ')[0] || 
                      testLead.contact_data?.name?.split(' ')[0] || 
                      'there';
    const email = testLead.contact_data?.email;
    const competitorList = competitors.slice(0, 2).join(', ') || 'your competitors';

    const emailBody = generateEmail(businessName, firstName, service, city, competitorList);

    console.log(`To: ${email}`);
    console.log(`Subject: ${businessName} - AI search visibility\n`);
    console.log('--- EMAIL PREVIEW ---\n');
    console.log(emailBody);
    console.log('\n--- END ---\n');

    // Store in email_campaigns table
    try {
      const { error: insertError } = await supabase
        .schema('crm')
        .from('email_campaigns')
        .insert({
          lead_id: testLead.id,
          to_email: email,
          subject: `${businessName} - AI search visibility`,
          body: emailBody,
          status: 'queued',
          campaign_type: 'job_posting_ai_visibility',
          metadata: {
            service,
            competitors: competitors.slice(0, 3),
            city,
            state,
          }
        });

      if (insertError) {
        console.error(`  ❌ Failed to store campaign: ${insertError.message}`);
      } else {
        console.log(`  ✅ Campaign stored in database`);
        console.log(`  📬 Status: queued (scheduler will send)\n`);
      }
    } catch (err: any) {
      console.error(`  ❌ Database error: ${err.message}`);
    }
  } else if (isMentioned) {
    console.log('ℹ️  Business already visible in AI search - no campaign needed\n');
  } else if (!hasEmail) {
    console.log('⚠️  No email available - cannot generate campaign\n');
  }

  console.log('\n' + '='.repeat(80));
  console.log('✅ Pipeline Test Complete!');
  console.log('='.repeat(80));
  console.log();
  console.log('💡 Next Steps:');
  console.log('1. Check crm.email_campaigns table for queued emails');
  console.log('2. Ensure scheduler is running: curl http://localhost:8787/scheduler/status');
  console.log('3. Monitor sending: pm2 logs harness | grep "Sending email"');
  console.log();
}

function generateEmail(
  businessName: string,
  firstName: string,
  service: string,
  city: string,
  competitors: string
): string {
  return `Hi ${firstName},

I noticed ${businessName} is hiring – congrats on the growth!

I ran a quick check on how your company shows up in AI search (ChatGPT, Claude, Perplexity) when people ask for "${service} in ${city}."

**The results:**
❌ ${businessName} wasn't mentioned
✅ Your competitors were: ${competitors}

This matters because 60%+ of your next customers are starting with AI search.

**What we do:**
We get businesses like yours recommended by ChatGPT, Claude, and Perplexity when people search for ${service} in ${city}.

Most ${service} companies aren't showing up yet. Since you're hiring and growing, this is the perfect time to get ahead of the curve.

Worth a quick call?

Best,
Ryan Nguyen
OneClaw AI

---
P.S. We can have you visible in AI search before your new team members start bringing in leads.`;
}

main().catch(console.error);
