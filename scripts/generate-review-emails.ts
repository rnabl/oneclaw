/**
 * Generate Review-Based Email Campaign
 * 
 * Creates personalized cold emails for leads that have:
 * - Recent Google reviews (5-star preferred)
 * - Full reviewer names
 * - Owner/contact information
 * 
 * Features:
 * - High variation to avoid duplicate emails
 * - References specific 5-star reviews with full names
 * - Mentions owner name when available
 * - Temperature: 1.0 for maximum uniqueness
 */

import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';
import OpenAI from 'openai';

dotenv.config();

// Configuration
const BATCH_SIZE = 5; // Process 5 at a time for testing variety
const START_INDEX = 0; // Where to start (for resumable processing)
const DRY_RUN = true; // Set to false to actually insert into DB
const MIN_REVIEWS = 1; // Minimum number of reviews needed

// Initialize clients
const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY!,
});

// Sender rotation (round-robin)
const SENDERS = [
  'riley@closelanepro.com',
  'madison@closelanepro.com',
  'bailey@closelanepro.com',
];

let currentSenderIndex = 0;

function getNextSender(): string {
  const sender = SENDERS[currentSenderIndex];
  currentSenderIndex = (currentSenderIndex + 1) % SENDERS.length;
  return sender;
}

interface ReviewData {
  reviewer_name: string;
  rating: number;
  text: string;
}

interface JobPosting {
  positionName?: string;
  job_title?: string;
}

interface Lead {
  id: string;
  company_name: string;
  city: string;
  state: string;
  email: string;
  source_type?: string;
  google_rating?: string;
  google_reviews?: number;
  source_metadata?: {
    reviews?: ReviewData[];
    ai_detected_service?: string;
    job_postings?: JobPosting[];
    job_title?: string;
    hiring_signal?: {
      roles?: string[];
    };
  };
  contact_data?: {
    firstName?: string;
    lastName?: string;
  };
}

type SignalType = 'hiring' | 'ads' | 'reviews';

interface DetectedSignal {
  type: SignalType;
  data: any;
}

/**
 * Detect all available signals for a lead
 */
function detectAllSignals(lead: Lead): SignalType[] {
  const signals: SignalType[] = [];
  
  // Check for hiring signal
  if (lead.source_type === 'job_posting' || 
      lead.source_metadata?.job_postings?.length || 
      lead.source_metadata?.hiring_signal?.roles?.length ||
      lead.source_metadata?.job_title) {
    signals.push('hiring');
  }
  
  // Check for ads signal
  // TODO: Add ad detection logic when ad data is available
  // if (lead.source_metadata?.ads || lead.source_metadata?.running_ads) {
  //   signals.push('ads');
  // }
  
  // Check for reviews signal (5-star with full names)
  const reviews = lead.source_metadata?.reviews || [];
  const fiveStarReviews = reviews.filter(r => 
    r.rating === 5 && 
    r.reviewer_name && 
    r.reviewer_name.split(' ').length >= 2
  );
  if (fiveStarReviews.length > 0) {
    signals.push('reviews');
  }
  
  return signals;
}

/**
 * Randomly pick one signal from available signals (A/B/C split test)
 */
function pickRandomSignal(signals: SignalType[]): SignalType | null {
  if (signals.length === 0) return null;
  const randomIndex = Math.floor(Math.random() * signals.length);
  return signals[randomIndex];
}

/**
 * Get hiring signal data
 */
function getHiringData(lead: Lead): { jobTitle: string } | null {
  // Try multiple locations for job title
  let jobTitle = lead.source_metadata?.job_title;
  
  if (!jobTitle && lead.source_metadata?.job_postings?.length) {
    jobTitle = lead.source_metadata.job_postings[0].positionName || 
               lead.source_metadata.job_postings[0].job_title;
  }
  
  if (!jobTitle && lead.source_metadata?.hiring_signal?.roles?.length) {
    jobTitle = lead.source_metadata.hiring_signal.roles[0];
  }
  
  return jobTitle ? { jobTitle } : null;
}

/**
 * Detect service type from company name or metadata
 */
function detectService(lead: Lead): string {
  if (lead.source_metadata?.ai_detected_service) {
    return lead.source_metadata.ai_detected_service;
  }
  
  const name = lead.company_name.toLowerCase();
  
  if (name.includes('hvac')) return 'HVAC';
  if (name.includes('heat') || name.includes('air') || name.includes('cooling')) return 'HVAC';
  if (name.includes('plumb')) return 'plumbing';
  if (name.includes('roof')) return 'roofing';
  if (name.includes('electric')) return 'electrical';
  if (name.includes('landscap')) return 'landscaping';
  if (name.includes('paint')) return 'painting';
  
  return 'home services';
}

/**
 * Get the best 5-star review to reference
 */
function getBestReview(lead: Lead): { reviewer: string; snippet: string } | null {
  const reviews = lead.source_metadata?.reviews || [];
  
  // Filter for 5-star reviews with full names
  const fiveStarReviews = reviews.filter(r => 
    r.rating === 5 && 
    r.reviewer_name && 
    r.reviewer_name.split(' ').length >= 2 // Full name (first + last)
  );
  
  if (fiveStarReviews.length === 0) {
    return null;
  }
  
  // Pick the first 5-star review (they're already sorted by most recent)
  const review = fiveStarReviews[0];
  
  // Get a short snippet (first 50 chars)
  const snippet = review.text 
    ? review.text.substring(0, 50).trim() + '...'
    : 'great service';
  
  return {
    reviewer: review.reviewer_name,
    snippet
  };
}

/**
 * Generate a highly varied email using GPT-4o
 */
async function generateEmail(lead: Lead, review: { reviewer: string; snippet: string }): Promise<{ subject: string; body: string }> {
  const service = detectService(lead);
  const firstName = lead.contact_data?.firstName || '';
  const companyName = lead.company_name;
  const city = lead.city;
  const reviewCount = lead.google_reviews || 0;
  const rating = lead.google_rating || '0';
  
  const prompt = `You are writing cold outreach emails for an AI Search Optimization agency (AEO / GEO).

The service helps companies get recommended in AI tools like ChatGPT, Gemini, and Perplexity when buyers ask for companies or services.

Offer: We get you recommended by ChatGPT and AI tools in 6 weeks or less.

Goal: Get a reply and book a 10-minute call.

--------------------------------------------------

INPUT VARIABLES

First Name: ${firstName || '(none)'}
Company Name: ${companyName}
City: ${city}
Service: ${service}
Google Rating: ${rating}⭐ (${reviewCount} reviews)
Reviewer Full Name: ${review.reviewer}

--------------------------------------------------

SIGNAL TYPE: 🟢 QUALIFIED — Review Signal

--------------------------------------------------

SUBJECT LINE (choose ONE pattern):

Option 1: ${review.reviewer} got work done with you, quick question
Option 2: ${review.reviewer}'s review, quick question
Option 3: saw ${review.reviewer}'s review, quick question

Use the FULL reviewer name. Keep it lowercase (better open rates).

--------------------------------------------------

GREETING RULE

If First Name exists:
Use: Hi [First Name] or Hey [First Name]

If First Name is missing:
Use: Hi or Hey or Hello

Never output an empty name greeting.

--------------------------------------------------

EMAIL BODY STRUCTURE (Pick ONE variation style):

V1 — Punchy and Direct:
[Reviewer observation - mention they left a review, acknowledge good work]

Thing is, when buyers skip Google and ask ChatGPT for ${service} in ${city}, you're not showing up. Most ${service} businesses aren't yet.

I can get ${companyName} recommended by ChatGPT in 6 weeks or less.

Worth a quick chat?

---

V2 — Observational and Softer:
[Reviewer observation - their review caught your eye, clearly they do good work]

Most new buyers won't find that though. They're skipping Google and asking ChatGPT directly now, and you're not showing up there yet.

I fix that in 6 weeks or less.

Open to a quick call?

---

V3 — Edge and Gap Focus:
[Reviewer observation - came across their review, strong feedback]

Noticed a gap. Buyers are going straight to ChatGPT for ${service} recommendations in ${city} and noticed you didn't show up.

I can fix that in about 6 weeks or so.

Worth a 10-minute chat?

--------------------------------------------------

VARIATION RULES

• Pick V1, V2, or V3 randomly for variety
• Reviewer observation variations:
  - "Saw [Reviewer]'s review, looks like you deliver."
  - "[Reviewer]'s review of [Company] caught my eye, clearly you do good work."
  - "Came across [Reviewer]'s review of [Company], strong feedback."
  - "Noticed [Reviewer] left you a review, clearly you're doing good work."
  - "[Reviewer]'s review stood out, looks like you deliver."

• Keep it under 60 words
• Use line breaks between paragraphs
• No emojis
• No links
• Simple, direct language
• One question at the end

--------------------------------------------------

FORMATTING: 

Greeting

[Review observation]

[Problem statement]

[Solution with 6 weeks timeframe]

[CTA]

Riley

OUTPUT FORMAT

Subject: [subject line - lowercase, full reviewer name]
Email: [email body with line breaks as shown above]`;

  const response = await openai.chat.completions.create({
    model: 'gpt-4o',
    messages: [{ role: 'user', content: prompt }],
    max_tokens: 400,
    temperature: 1.0, // Maximum variation
  });

  const text = response.choices[0].message.content || '';
  const subjectMatch = text.match(/Subject:\s*(.+)/i);
  const bodyMatch = text.match(/Email:\s*([\s\S]+)/i);

  let subject = subjectMatch?.[1]?.trim() || `${companyName} question`;
  let body = bodyMatch?.[1]?.trim() || text;

  // Clean up quotes but KEEP line breaks
  body = body.replace(/^["'\s]+|["'\s]+$/g, '').trim();
  
  // Ensure signature is on its own line
  body = body.replace(/\s*-?\s*(Riley|Madison|Bailey|Ryan|Alex|Jordan)\s*$/i, (match, name) => `\n\n${name}`);
  
  // If no signature, add one (will be replaced by sender later)
  if (!body.match(/(Riley|Madison|Bailey|Ryan|Alex|Jordan)\s*$/i)) {
    body = `${body}\n\nRiley`;
  }

  return { subject, body };
}

/**
 * Fetch leads with reviews from Supabase (that don't have campaigns yet)
 */
async function getLeadsWithReviews(offset: number, limit: number): Promise<Lead[]> {
  console.log(`\n📊 Fetching leads ${offset}-${offset + limit}...`);
  
  // First, get all lead IDs that already have campaigns
  const { data: existingCampaigns } = await supabase
    .schema('crm')
    .from('email_campaigns')
    .select('lead_id');
  
  const existingLeadIds = new Set(existingCampaigns?.map(c => c.lead_id) || []);
  console.log(`   ⏭️  ${existingLeadIds.size} leads already have campaigns`);
  
  // Fetch MORE leads to account for filtering
  const fetchLimit = limit * 5; // Fetch 5x to ensure we get enough after filtering
  
  const { data: leads, error } = await supabase
    .schema('crm')
    .from('leads')
    .select('*')
    .not('google_reviews', 'is', null)
    .gte('google_reviews', MIN_REVIEWS)
    .not('email', 'is', null)
    .order('google_rating', { ascending: false })
    .range(offset, offset + fetchLimit - 1);
  
  if (error) {
    console.error('❌ Error fetching leads:', error);
    return [];
  }
  
  // Filter for leads:
  // 1. No existing campaign
  // 2. Have actual review data in source_metadata with 5-star reviews
  const filtered = (leads || [])
    .filter(lead => !existingLeadIds.has(lead.id))
    .filter(lead => {
      const reviews = lead.source_metadata?.reviews || [];
      const fiveStarReviews = reviews.filter((r: any) => 
        r.rating === 5 && 
        r.reviewer_name && 
        r.reviewer_name.split(' ').length >= 2
      );
      return fiveStarReviews.length > 0;
    })
    .slice(0, limit); // Only return requested number
  
  console.log(`✅ Found ${filtered.length} NEW leads with 5-star reviews and full names`);
  
  return filtered as Lead[];
}

/**
 * Check if campaign already exists for this lead
 */
async function campaignExists(leadId: string): Promise<boolean> {
  const { data } = await supabase
    .schema('crm')
    .from('email_campaigns')
    .select('id')
    .eq('lead_id', leadId)
    .single();
  
  return !!data;
}

/**
 * Store campaign in database
 */
async function storeCampaign(
  leadId: string,
  subject: string,
  body: string,
  senderEmail: string
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
      template_name: 'review-based',
      approval_status: 'pending_approval', // Require manual approval
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
  
  // Get best review
  const review = getBestReview(lead);
  if (!review) {
    console.log('   ❌ No suitable 5-star reviews found');
    return false;
  }
  
  console.log(`   📝 Review by: ${review.reviewer}`);
  
  // Generate email
  try {
    const { subject, body } = await generateEmail(lead, review);
    console.log(`   ✅ Generated: "${subject}"`);
    
    // Show preview
    console.log('\n   Preview:');
    console.log('   ' + '-'.repeat(50));
    console.log('   ' + body.split('\n').join('\n   '));
    console.log('   ' + '-'.repeat(50));
    
    // Get sender
    const senderEmail = getNextSender();
    console.log(`   📧 Sender: ${senderEmail}`);
    
    // Store campaign
    const stored = await storeCampaign(lead.id, subject, body, senderEmail);
    
    if (stored) {
      console.log('   ✅ Stored in database');
      return true;
    }
    
    return false;
  } catch (error: any) {
    console.error(`   ❌ Error generating email: ${error.message}`);
    return false;
  }
}

/**
 * Main function
 */
async function main() {
  console.log('🚀 Review-Based Email Generator\n');
  console.log(`Mode: ${DRY_RUN ? '🧪 DRY RUN (preview only)' : '💾 LIVE (will save to DB)'}`);
  console.log(`Batch size: ${BATCH_SIZE}`);
  console.log(`Start index: ${START_INDEX}`);
  console.log(`Min reviews: ${MIN_REVIEWS}`);
  console.log(`Senders: ${SENDERS.join(', ')}`);
  
  // Fetch leads
  const leads = await getLeadsWithReviews(START_INDEX, BATCH_SIZE);
  
  if (leads.length === 0) {
    console.log('\n❌ No leads found with suitable reviews');
    return;
  }
  
  // Process each lead
  let processed = 0;
  let failed = 0;
  
  for (let i = 0; i < leads.length; i++) {
    const success = await processLead(leads[i], i + 1, leads.length);
    
    if (success) {
      processed++;
    } else {
      failed++;
    }
    
    // Rate limit: wait 2 seconds between API calls
    if (i < leads.length - 1) {
      await new Promise(resolve => setTimeout(resolve, 2000));
    }
  }
  
  // Summary
  console.log('\n' + '='.repeat(60));
  console.log('📊 Summary:');
  console.log(`   ✅ Processed: ${processed}`);
  console.log(`   ❌ Failed: ${failed}`);
  console.log('='.repeat(60));
  
  if (DRY_RUN) {
    console.log('\n💡 This was a DRY RUN. Set DRY_RUN=false to save to database.');
  }
}

main().catch(console.error);
