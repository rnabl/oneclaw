/**
 * Follow-up Email Generator
 * 
 * Generates Touch 2 or Touch 3 emails for leads who:
 * - Received the previous touch (sent_at is not null)
 * - Haven't replied (replied = false)
 * - Haven't received the next touch yet
 * 
 * Usage:
 *   npx tsx generate-followups.ts --touch 2
 *   npx tsx generate-followups.ts --touch 3
 */

import { config } from 'dotenv';
import { createClient } from '@supabase/supabase-js';

config();

const supabaseUrl = process.env.SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

// Parse command line args
const args = process.argv.slice(2);
const touchArg = args.find(a => a.startsWith('--touch'));
const touchNumber = touchArg ? parseInt(args[args.indexOf(touchArg) + 1] || args[args.indexOf(touchArg)].split('=')[1]) : 2;

if (touchNumber !== 2 && touchNumber !== 3) {
  console.error('Usage: npx tsx generate-followups.ts --touch 2  (or --touch 3)');
  process.exit(1);
}

// Senders (same rotation)
const SENDERS = [
  { email: 'riley@closelanepro.com', name: 'Riley' },
  { email: 'bailey@closelanepro.com', name: 'Bailey' },
  { email: 'madison@closelanepro.com', name: 'Madison' },
];

// Touch 2 templates
const TEMPLATES_TOUCH2 = {
  'follow-up-value': {
    getSubject: (vars: EmailVars, originalSubject: string) => `Re: ${originalSubject.replace(/^Re:\s*/i, '')}`,
    getBody: (vars: EmailVars, sender: string) => {
      const greeting = vars.firstName ? `${vars.firstName},` : 'Hi,';
      return `${greeting}

Following up on my last note about ${vars.businessName} not appearing in AI search results.

I ran a deeper check and found a few specific things that might be hurting your visibility:

- Your business info isn't consistent across directories
- Missing structured data that AI tools use to understand your services  
- No recent content signals for AI to reference

These are all fixable. Would a 10-minute breakdown be useful?

${sender}`;
    }
  },
  
  'follow-up-curiosity': {
    getSubject: (vars: EmailVars, originalSubject: string) => `Ran a check on ${vars.businessName}`,
    getBody: (vars: EmailVars, sender: string) => {
      const greeting = vars.firstName ? `Hey ${vars.firstName},` : 'Hey,';
      return `${greeting}

I actually went ahead and ran a full AI visibility check on ${vars.businessName}.

Found some interesting stuff. Nothing alarming, but there are a few gaps that explain why you're not showing up when people ask AI for HVAC recommendations in ${vars.city}.

Happy to share what I found if you're curious.

${sender}`;
    }
  },
};

// Touch 3 templates (breakup)
const TEMPLATES_TOUCH3 = {
  'breakup-soft': {
    getSubject: (vars: EmailVars, originalSubject: string) => `Last note`,
    getBody: (vars: EmailVars, sender: string) => {
      const greeting = vars.firstName ? `${vars.firstName},` : 'Hi,';
      return `${greeting}

I've reached out a couple times about ${vars.businessName} and AI search visibility.

Totally understand if it's not a priority right now. I'll leave it here.

If you ever want to see the report I put together, just reply and I'll send it over. No pressure either way.

${sender}`;
    }
  },
  
  'breakup-direct': {
    getSubject: (vars: EmailVars, originalSubject: string) => `Closing the loop`,
    getBody: (vars: EmailVars, sender: string) => {
      const greeting = vars.firstName ? `${vars.firstName},` : 'Hey,';
      return `${greeting}

Haven't heard back, so I'm guessing the timing isn't right.

No worries at all. If AI search visibility ever becomes a priority for ${vars.businessName}, feel free to reach out.

Best,
${sender}`;
    }
  },
};

interface EmailVars {
  firstName: string | null;
  businessName: string;
  city: string;
  state: string;
}

interface PreviousCampaign {
  id: string;
  lead_id: string;
  subject: string;
  sent_from_email: string;
  template_name: string;
  lead: {
    id: string;
    company_name: string;
    email: string;
    city: string;
    state: string;
    contact_data: any;
  };
}

function cleanBusinessName(name: string): string {
  return name
    .replace(/,?\s*(LLC|Inc\.?|Corp\.?|Corporation|Company|Co\.?|L\.L\.C\.?)$/i, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function getFirstName(ownerName: string | null): string | null {
  if (!ownerName) return null;
  if (ownerName.toLowerCase().includes('business owner')) return null;
  if (ownerName.length < 3) return null;
  
  const firstName = ownerName.split(' ')[0];
  if (firstName.length < 2 || !/^[A-Z][a-z]+$/.test(firstName)) return null;
  
  return firstName;
}

async function generateFollowups() {
  const templates = touchNumber === 2 ? TEMPLATES_TOUCH2 : TEMPLATES_TOUCH3;
  const templateKeys = Object.keys(templates) as (keyof typeof templates)[];
  const previousTouch = touchNumber - 1;
  
  console.log(`\n📧 Generating Touch ${touchNumber} Follow-ups\n`);
  console.log('='.repeat(80) + '\n');
  
  // Find all leads who:
  // 1. Received touch N-1 (has a sent campaign with that template prefix)
  // 2. Haven't replied
  // 3. Don't already have touch N queued
  
  // Step 1: Get all sent campaigns from previous touch
  console.log(`📊 Finding leads who received Touch ${previousTouch} but haven't replied...\n`);
  
  // Get touch 1 templates for filtering
  const touch1Templates = ['curiosity-hook', 'short-direct', 'social-proof', 'problem-agitate'];
  const touch2Templates = ['follow-up-value', 'follow-up-curiosity'];
  const touch3Templates = ['breakup-soft', 'breakup-direct'];
  
  const previousTemplates = previousTouch === 1 ? touch1Templates : touch2Templates;
  const currentTemplates = touchNumber === 2 ? touch2Templates : touch3Templates;
  
  // Get campaigns from previous touch that were sent and not replied
  const { data: previousCampaigns, error } = await supabase
    .schema('crm')
    .from('email_campaigns')
    .select(`
      id,
      lead_id,
      subject,
      sent_from_email,
      template_name
    `)
    .in('template_name', previousTemplates)
    .not('sent_at', 'is', null)
    .eq('replied', false);
  
  if (error || !previousCampaigns) {
    console.error('❌ Error fetching previous campaigns:', error);
    return;
  }
  
  console.log(`   Found ${previousCampaigns.length} sent Touch ${previousTouch} campaigns without replies\n`);
  
  if (previousCampaigns.length === 0) {
    console.log('No leads ready for follow-up. Either:\n');
    console.log(`  - Touch ${previousTouch} emails haven't been sent yet`);
    console.log('  - All leads have replied');
    console.log(`  - Touch ${touchNumber} has already been generated`);
    return;
  }
  
  // Get lead IDs that already have current touch queued
  const leadIds = previousCampaigns.map(c => c.lead_id);
  
  const { data: existingFollowups } = await supabase
    .schema('crm')
    .from('email_campaigns')
    .select('lead_id')
    .in('template_name', currentTemplates)
    .in('lead_id', leadIds);
  
  const alreadyHasFollowup = new Set((existingFollowups || []).map(e => e.lead_id));
  const needsFollowup = previousCampaigns.filter(c => !alreadyHasFollowup.has(c.lead_id));
  
  console.log(`   ${alreadyHasFollowup.size} already have Touch ${touchNumber} queued`);
  console.log(`   ${needsFollowup.length} need Touch ${touchNumber}\n`);
  
  if (needsFollowup.length === 0) {
    console.log('All eligible leads already have follow-ups queued.');
    return;
  }
  
  // Get lead details
  const { data: leads } = await supabase
    .schema('crm')
    .from('leads')
    .select('id, company_name, email, city, state, contact_data')
    .in('id', needsFollowup.map(c => c.lead_id));
  
  const leadsMap = Object.fromEntries((leads || []).map(l => [l.id, l]));
  
  // Generate follow-up campaigns
  console.log('✏️  Generating follow-up emails...\n');
  
  const campaigns: any[] = [];
  
  for (let i = 0; i < needsFollowup.length; i++) {
    const prev = needsFollowup[i];
    const lead = leadsMap[prev.lead_id];
    
    if (!lead) continue;
    
    // Use same sender as previous touch for continuity
    const sender = SENDERS.find(s => s.email === prev.sent_from_email) || SENDERS[i % SENDERS.length];
    const templateKey = templateKeys[i % templateKeys.length];
    const template = templates[templateKey];
    
    const ownerName = lead.contact_data?.owner_name || null;
    const firstName = getFirstName(ownerName);
    const businessName = cleanBusinessName(lead.company_name);
    
    const vars: EmailVars = {
      firstName,
      businessName,
      city: lead.city || 'your area',
      state: lead.state || '',
    };
    
    const subject = template.getSubject(vars, prev.subject);
    const body = template.getBody(vars, sender.name);
    
    campaigns.push({
      lead_id: lead.id,
      subject,
      body,
      template_name: templateKey,
      campaign_type: 'cold_outreach',
      sent_from_email: sender.email,
      approval_status: 'approved',
    });
  }
  
  console.log(`   Generated ${campaigns.length} follow-up emails\n`);
  
  // Insert
  console.log('📤 Inserting into crm.email_campaigns...\n');
  
  const batchSize = 50;
  let inserted = 0;
  
  for (let i = 0; i < campaigns.length; i += batchSize) {
    const batch = campaigns.slice(i, i + batchSize);
    
    const { error: insertError } = await supabase
      .schema('crm')
      .from('email_campaigns')
      .insert(batch);
    
    if (insertError) {
      console.error(`   ❌ Batch ${Math.floor(i / batchSize) + 1}:`, insertError.message);
    } else {
      inserted += batch.length;
      console.log(`   ✅ Batch ${Math.floor(i / batchSize) + 1} (${inserted}/${campaigns.length})`);
    }
  }
  
  // Stats
  const byTemplate = campaigns.reduce((acc, c) => {
    acc[c.template_name] = (acc[c.template_name] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);
  
  console.log(`\n✅ Inserted ${inserted} Touch ${touchNumber} campaigns\n`);
  console.log('📊 Template Distribution:');
  Object.entries(byTemplate).forEach(([t, count]) => {
    console.log(`   ${t}: ${count}`);
  });
  
  console.log('\n' + '='.repeat(80));
  if (touchNumber === 2) {
    console.log('✅ Touch 2 emails ready! Run with --touch 3 in 3-5 days for final touch.');
  } else {
    console.log('✅ Touch 3 (final) emails ready! Leads will be exhausted after this.');
  }
}

generateFollowups().catch(console.error);
