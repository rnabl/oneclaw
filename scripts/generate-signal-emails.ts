/**
 * Generate Signal-Based Email Campaigns (A/B/C Split Test)
 * 
 * Detects all available signals (hiring, ads, reviews) for each lead,
 * then randomly picks ONE signal to use for the email.
 * 
 * This enables proper A/B/C split testing across all 3 templates
 * while only using signals that actually exist for each lead.
 */

import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';
import OpenAI from 'openai';

dotenv.config();

// Configuration
const BATCH_SIZE = 10; // Test with 10 for now
const START_INDEX = 500; // Start further down the list
const DRY_RUN = true;

// Initialize clients
const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY!,
});

// Sender rotation
const SENDERS = ['riley@closelanepro.com', 'madison@closelanepro.com', 'bailey@closelanepro.com'];
let currentSenderIndex = 0;

function getNextSender(): string {
  const sender = SENDERS[currentSenderIndex];
  currentSenderIndex = (currentSenderIndex + 1) % SENDERS.length;
  return sender;
}

type SignalType = 'hiring' | 'ads' | 'reviews';

interface Lead {
  id: string;
  company_name: string;
  city: string;
  state: string;
  email: string;
  source_type?: string;
  google_rating?: string;
  google_reviews?: number;
  source_metadata?: any;
  contact_data?: { firstName?: string; lastName?: string };
}

/**
 * Detect service type
 */
function detectService(lead: Lead): string {
  if (lead.source_metadata?.ai_detected_service) {
    return lead.source_metadata.ai_detected_service;
  }
  
  const name = lead.company_name.toLowerCase();
  if (name.includes('hvac') || name.includes('heat') || name.includes('air') || name.includes('cooling')) return 'HVAC';
  if (name.includes('plumb')) return 'plumbing';
  if (name.includes('roof')) return 'roofing';
  if (name.includes('electric')) return 'electrical';
  
  return 'home services';
}

/**
 * Detect ALL available signals for a lead
 */
function detectAllSignals(lead: Lead): { type: SignalType; data: any }[] {
  const signals: { type: SignalType; data: any }[] = [];
  
  // 1. Check for HIRING signal
  if (lead.source_type === 'job_posting' || 
      lead.source_metadata?.job_postings?.length || 
      lead.source_metadata?.hiring_signal?.roles?.length ||
      lead.source_metadata?.job_title) {
    
    let jobTitle = lead.source_metadata?.job_title ||
                   lead.source_metadata?.job_postings?.[0]?.positionName ||
                   lead.source_metadata?.job_postings?.[0]?.job_title ||
                   lead.source_metadata?.hiring_signal?.roles?.[0];
    
    if (jobTitle) {
      signals.push({ type: 'hiring', data: { jobTitle } });
    }
  }
  
  // 2. Check for ADS signal (TODO: add when ad data available)
  // if (lead.source_metadata?.ads || lead.source_metadata?.running_ads) {
  //   signals.push({ type: 'ads', data: {} });
  // }
  
  // 3. Check for REVIEWS signal (5-star with full names)
  const reviews = lead.source_metadata?.reviews || [];
  const fiveStarReviews = reviews.filter((r: any) => 
    r.rating === 5 && 
    r.reviewer_name && 
    r.reviewer_name.split(' ').length >= 2
  );
  
  if (fiveStarReviews.length > 0) {
    const review = fiveStarReviews[0]; // Use first (most recent)
    const snippet = review.text ? review.text.substring(0, 50).trim() + '...' : 'great service';
    signals.push({ 
      type: 'reviews', 
      data: { reviewer: review.reviewer_name, snippet } 
    });
  }
  
  return signals;
}

/**
 * Randomly pick ONE signal (A/B/C split test)
 */
function pickRandomSignal(signals: { type: SignalType; data: any }[]): { type: SignalType; data: any } | null {
  if (signals.length === 0) return null;
  const randomIndex = Math.floor(Math.random() * signals.length);
  return signals[randomIndex];
}

/**
 * Generate email based on chosen signal
 */
async function generateEmail(
  lead: Lead,
  signalType: SignalType,
  signalData: any
): Promise<{ subject: string; body: string; templateName: string }> {
  
  const service = detectService(lead);
  const firstName = lead.contact_data?.firstName || '';
  const companyName = lead.company_name;
  const city = lead.city;
  
  let prompt = '';
  let templateName = '';
  
  if (signalType === 'hiring') {
    const { jobTitle } = signalData;
    templateName = 'signal-hiring';
    prompt = `You are writing cold outreach for an AI Search Optimization agency.

Offer: We get you recommended by ChatGPT in 6 weeks or less.
Goal: Book a 10-minute call.

INPUTS:
First Name: ${firstName || '(none)'}
Company: ${companyName}
City: ${city}
Service: ${service}
Job Title: ${jobTitle}

SUBJECT (pick one, lowercase):
- hiring for ${jobTitle}, quick question
- saw you're hiring a ${jobTitle}, quick question

BODY (pick V1, V2, or V3):

V1:
Saw you're hiring a ${jobTitle}, clearly scaling.

Thing is, when buyers skip Google and ask ChatGPT for ${service} in ${city}, you're not showing up. Most ${service} businesses aren't yet.

I can get ${companyName} recommended by ChatGPT in 6 weeks or less.

Worth a quick 10-minute chat?

---

V2:
Scaling the team at ${companyName}, smart move.

One channel most growing ${service} businesses are sleeping on right now is AI search. When buyers ask ChatGPT for ${service} in ${city}, you're not coming up yet.

I fix that in 6 weeks or less.

Open to a quick 10-minute call?

---

V3:
Noticed ${companyName} is hiring for ${jobTitle}, looks like things are moving.

ChatGPT is sending buyers to ${service} businesses every day now and you're not showing up yet.

I can get that fixed in 6 weeks or less.

Worth a quick 10-minute chat?

RULES: Under 60 words. Line breaks between paragraphs. No emojis/links. Greeting: Hi/Hey [Name] or Hi/Hey.

OUTPUT:
Subject: [lowercase]
Email: [body with Riley signature]`;

  } else if (signalType === 'reviews') {
    const { reviewer } = signalData;
    const reviewCount = lead.google_reviews || 0;
    const rating = lead.google_rating || '0';
    templateName = 'signal-reviews';
    
    prompt = `You are writing cold outreach for an AI Search Optimization agency.

Offer: We get you recommended by ChatGPT in 6 weeks or less.
Goal: Book a 10-minute call.

INPUTS:
First Name: ${firstName || '(none)'}
Company: ${companyName}
City: ${city}
Service: ${service}
Reviewer: ${reviewer}
Rating: ${rating}⭐ (${reviewCount} reviews)

SUBJECT (pick one, lowercase, use FULL reviewer name):
- ${reviewer} got work done with you, quick question
- ${reviewer}'s review, quick question
- saw ${reviewer}'s review, quick question

BODY (pick V1, V2, or V3):

V1:
Saw ${reviewer}'s review, looks like you deliver.

Thing is, when buyers skip Google and ask ChatGPT for ${service} in ${city}, you're not showing up. Most ${service} businesses aren't yet.

I can get ${companyName} recommended by ChatGPT in 6 weeks or less.

Worth a quick chat?

---

V2:
${reviewer}'s review of ${companyName} caught my eye, clearly you do good work.

Most new buyers won't find that though. They're skipping Google and asking ChatGPT directly now, and you're not showing up there yet.

I fix that in 6 weeks or less.

Open to a quick call?

---

V3:
Came across ${reviewer}'s review of ${companyName}, strong feedback.

Noticed a gap. Buyers are going straight to ChatGPT for ${service} recommendations in ${city} and noticed you didn't show up.

I can fix that in about 6 weeks or so.

Worth a 10-minute chat?

RULES: Under 60 words. Line breaks between paragraphs. No emojis/links. Greeting: Hi/Hey [Name] or Hi/Hey.

OUTPUT:
Subject: [lowercase, full reviewer name]
Email: [body with Riley signature]`;
  }

  const response = await openai.chat.completions.create({
    model: 'gpt-4o',
    messages: [{ role: 'user', content: prompt }],
    max_tokens: 400,
    temperature: 1.0,
  });

  const text = response.choices[0].message.content || '';
  const subjectMatch = text.match(/Subject:\s*(.+)/i);
  const bodyMatch = text.match(/Email:\s*([\s\S]+)/i);

  let subject = subjectMatch?.[1]?.trim() || 'quick question';
  let body = bodyMatch?.[1]?.trim() || text;

  body = body.replace(/^["'\s]+|["'\s]+$/g, '').trim();
  body = body.replace(/\s*-?\s*(Riley|Madison|Bailey)\s*$/i, (_, name) => `\n\n${name}`);
  
  if (!body.match(/(Riley|Madison|Bailey)\s*$/i)) {
    body = `${body}\n\nRiley`;
  }

  return { subject, body, templateName };
}

/**
 * Fetch leads with ANY signals (no campaigns yet)
 */
async function getLeadsWithSignals(offset: number, limit: number): Promise<Lead[]> {
  console.log(`\n📊 Fetching leads ${offset}-${offset + limit}...`);
  
  // Get existing campaign lead IDs
  const { data: existingCampaigns } = await supabase
    .schema('crm')
    .from('email_campaigns')
    .select('lead_id');
  
  const existingLeadIds = new Set(existingCampaigns?.map(c => c.lead_id) || []);
  console.log(`   ⏭️  ${existingLeadIds.size} leads already have campaigns`);
  
  // Fetch more leads to account for filtering
  const fetchLimit = limit * 10;
  
  const { data: leads, error } = await supabase
    .schema('crm')
    .from('leads')
    .select('*')
    .not('email', 'is', null)
    .order('google_rating', { ascending: false })
    .range(offset, offset + fetchLimit - 1);
  
  if (error) {
    console.error('❌ Error fetching leads:', error);
    return [];
  }
  
  // Filter for leads:
  // 1. No existing campaign
  // 2. Have at least ONE signal (hiring, ads, or reviews)
  const filtered = (leads || [])
    .filter(lead => !existingLeadIds.has(lead.id))
    .filter(lead => {
      const signals = detectAllSignals(lead);
      return signals.length > 0;
    })
    .slice(0, limit);
  
  console.log(`✅ Found ${filtered.length} NEW leads with signals`);
  
  return filtered as Lead[];
}

/**
 * Store campaign
 */
async function storeCampaign(
  leadId: string,
  subject: string,
  body: string,
  senderEmail: string,
  templateName: string
): Promise<boolean> {
  if (DRY_RUN) {
    console.log('   [DRY RUN] Would insert campaign into DB');
    return true;
  }
  
  const { error } = await supabase
    .schema('crm')
    .from('email_campaigns')
    .insert({
      lead_id: leadId,
      campaign_type: 'cold_outreach',
      subject,
      body,
      template_name: templateName,
      approval_status: 'pending_approval',
      sent_from_email: senderEmail,
    });
  
  if (error) {
    console.error('   ❌ Error storing campaign:', error.message);
    return false;
  }
  
  return true;
}

/**
 * Process a single lead
 */
async function processLead(lead: Lead, index: number, total: number): Promise<boolean> {
  console.log(`\n[${index}/${total}] ${lead.company_name} (${lead.city}, ${lead.state})`);
  
  // Detect ALL signals
  const signals = detectAllSignals(lead);
  
  if (signals.length === 0) {
    console.log('   ❌ No signals found');
    return false;
  }
  
  console.log(`   🎯 Available signals: ${signals.map(s => s.type).join(', ')}`);
  
  // Randomly pick ONE signal (A/B/C split test)
  const chosenSignal = pickRandomSignal(signals);
  
  if (!chosenSignal) {
    console.log('   ❌ No signal chosen');
    return false;
  }
  
  console.log(`   🎲 Chosen signal: ${chosenSignal.type}`);
  
  if (chosenSignal.type === 'hiring') {
    console.log(`   💼 Job Title: ${chosenSignal.data.jobTitle}`);
  } else if (chosenSignal.type === 'reviews') {
    console.log(`   📝 Reviewer: ${chosenSignal.data.reviewer}`);
  }
  
  // Generate email
  try {
    const { subject, body, templateName } = await generateEmail(lead, chosenSignal.type, chosenSignal.data);
    console.log(`   ✅ Generated: "${subject}"`);
    
    // Preview
    console.log('\n   Preview:');
    console.log('   ' + '-'.repeat(50));
    console.log('   ' + body.split('\n').join('\n   '));
    console.log('   ' + '-'.repeat(50));
    
    // Sender
    const senderEmail = getNextSender();
    console.log(`   📧 Sender: ${senderEmail}`);
    console.log(`   🏷️  Template: ${templateName}`);
    
    // Store
    const stored = await storeCampaign(lead.id, subject, body, senderEmail, templateName);
    
    if (stored) {
      console.log('   ✅ Stored in database');
      return true;
    }
    
    return false;
  } catch (error: any) {
    console.error(`   ❌ Error: ${error.message}`);
    return false;
  }
}

/**
 * Main
 */
async function main() {
  console.log('🚀 Signal-Based Email Generator (A/B/C Split Test)\n');
  console.log(`Mode: ${DRY_RUN ? '🧪 DRY RUN' : '💾 LIVE'}`);
  console.log(`Batch size: ${BATCH_SIZE}`);
  console.log(`Start index: ${START_INDEX}`);
  console.log(`Senders: ${SENDERS.join(', ')}\n`);
  
  const leads = await getLeadsWithSignals(START_INDEX, BATCH_SIZE);
  
  if (leads.length === 0) {
    console.log('\n❌ No leads found with signals');
    return;
  }
  
  let processed = 0;
  let failed = 0;
  const signalCounts = { hiring: 0, ads: 0, reviews: 0 };
  
  for (let i = 0; i < leads.length; i++) {
    const success = await processLead(leads[i], i + 1, leads.length);
    
    if (success) {
      processed++;
      // Track which signal was used (would need to return from processLead)
    } else {
      failed++;
    }
    
    // Rate limit
    if (i < leads.length - 1) {
      await new Promise(resolve => setTimeout(resolve, 2000));
    }
  }
  
  console.log('\n' + '='.repeat(60));
  console.log('📊 Summary:');
  console.log(`   ✅ Processed: ${processed}`);
  console.log(`   ❌ Failed: ${failed}`);
  console.log('='.repeat(60));
  
  if (DRY_RUN) {
    console.log('\n💡 Set DRY_RUN=false to save to database.');
  }
}

main().catch(console.error);
