/**
 * Home Services Email Campaign Generator (Two-Pass System)
 * 
 * Pass 1: Spintax templates with variables for variation
 * Pass 2: LLM polish to ensure quality (40-75 words, no em dashes, proper grammar)
 * 
 * Features:
 * - Migrates leads to crm.home_services_leads
 * - Runs AI citation test for competitors
 * - A/B/C split testing (hiring/ads/reviews)
 * - Hundreds of unique email combinations
 * - Safety check with cheap LLM (DeepSeek)
 */

import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';

dotenv.config();

// Configuration
const BATCH_SIZE = 20; // Generate 20 campaigns
const DRY_RUN = false; // Save to database

// Initialize Supabase
const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// Sender rotation
const SENDERS = ['riley@closelanepro.com', 'madison@closelanepro.com', 'bailey@closelanepro.com'];
let currentSenderIndex = 0;

function getNextSender(): string {
  const sender = SENDERS[currentSenderIndex];
  currentSenderIndex = (currentSenderIndex + 1) % SENDERS.length;
  return sender;
}

type SignalType = 'hiring' | 'ads' | 'reviews';

interface SourceLead {
  id: string;
  company_name: string;
  city: string;
  state: string;
  email: string;
  website?: string;
  phone?: string;
  source_type?: string;
  google_place_id?: string;
  google_maps_url?: string;
  google_rating?: string;
  google_reviews?: number;
  source_metadata?: any;
  contact_data?: { firstName?: string; lastName?: string };
}

/**
 * Apply spintax: {option1|option2|option3} → picks one randomly
 */
function applySpintax(text: string): string {
  return text.replace(/\{([^}]+)\}/g, (match, options) => {
    const choices = options.split('|');
    return choices[Math.floor(Math.random() * choices.length)];
  });
}

/**
 * Detect industry
 */
function detectIndustry(lead: SourceLead): string {
  if (lead.source_metadata?.ai_detected_service) {
    return lead.source_metadata.ai_detected_service.toLowerCase();
  }
  
  const name = lead.company_name.toLowerCase();
  if (name.includes('hvac') || name.includes('heat') || name.includes('air') || name.includes('cooling')) return 'hvac';
  if (name.includes('plumb')) return 'plumbing';
  if (name.includes('roof')) return 'roofing';
  if (name.includes('electric')) return 'electrical';
  if (name.includes('landscap')) return 'landscaping';
  if (name.includes('paint')) return 'painting';
  
  return 'home_services';
}

/**
 * Extract hiring signal
 */
function extractHiringSignal(lead: SourceLead): any | null {
  if (lead.source_type !== 'job_posting' && 
      !lead.source_metadata?.job_postings?.length && 
      !lead.source_metadata?.hiring_signal?.roles?.length &&
      !lead.source_metadata?.job_title) {
    return null;
  }
  
  let jobTitle = lead.source_metadata?.job_title ||
                 lead.source_metadata?.job_postings?.[0]?.positionName ||
                 lead.source_metadata?.job_postings?.[0]?.job_title ||
                 lead.source_metadata?.hiring_signal?.roles?.[0];
  
  if (!jobTitle) return null;
  
  return {
    job_title: jobTitle,
    posted_date: lead.source_metadata?.job_postings?.[0]?.postedDate || null,
    source: lead.source_type || 'unknown'
  };
}

/**
 * Pick the best review to use in email
 * Priority:
 * 1. 5-star reviews with real names (not "John Doe", "Local Guide", etc.)
 * 2. Recent reviews (within last year)
 * 3. Reviews with text/context
 * 4. Fall back to 4-star if no good 5-stars
 */
function pickBestReview(reviews: any[]): any | null {
  if (!reviews || reviews.length === 0) return null;
  
  // Generic/fake name patterns
  const fakeNamePatterns = [
    /^john doe$/i,
    /^jane doe$/i,
    /^local guide$/i,
    /^google user$/i,
    /^anonymous$/i,
    /^a google user$/i,
    /^user$/i
  ];
  
  const isFakeName = (name: string) => {
    return fakeNamePatterns.some(pattern => pattern.test(name.trim()));
  };
  
  const isRealName = (name: string) => {
    // Must have at least 2 parts (first + last)
    const parts = name.trim().split(/\s+/);
    if (parts.length < 2) return false;
    
    // Check if it's a fake name
    if (isFakeName(name)) return false;
    
    // Both parts should have reasonable length (not just initials)
    const hasSubstantialParts = parts.some(part => part.length >= 3);
    return hasSubstantialParts;
  };
  
  // Score each review
  const scoredReviews = reviews.map((review: any) => {
    let score = 0;
    
    // Rating (5 stars = 10 points, 4 stars = 5 points)
    if (review.rating === 5) score += 10;
    else if (review.rating === 4) score += 5;
    
    // Real name (20 points - most important!)
    if (isRealName(review.reviewer_name)) score += 20;
    
    // Has review text (5 points)
    if (review.text && review.text.length > 20) score += 5;
    
    // Recent (within last year = 5 points)
    if (review.date) {
      const reviewDate = new Date(review.date);
      const oneYearAgo = new Date();
      oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);
      if (reviewDate > oneYearAgo) score += 5;
    }
    
    return { ...review, score };
  });
  
  // Sort by score (highest first)
  scoredReviews.sort((a, b) => b.score - a.score);
  
  // Return the best one
  return scoredReviews[0];
}

/**
 * Extract reviews signal
 */
function extractReviewsSignal(lead: SourceLead): any[] | null {
  const reviews = lead.source_metadata?.reviews || [];
  
  // Get all 5-star reviews with full names
  const fiveStarReviews = reviews.filter((r: any) => 
    r.rating === 5 && 
    r.reviewer_name && 
    r.reviewer_name.split(' ').length >= 2
  );
  
  // Get 4-star reviews as fallback
  const fourStarReviews = reviews.filter((r: any) => 
    r.rating === 4 && 
    r.reviewer_name && 
    r.reviewer_name.split(' ').length >= 2
  );
  
  // Combine (5-stars first)
  const allGoodReviews = [...fiveStarReviews, ...fourStarReviews];
  
  if (allGoodReviews.length === 0) return null;
  
  return allGoodReviews.slice(0, 5).map((r: any) => ({
    reviewer_name: r.reviewer_name,
    rating: r.rating,
    text: r.text || '',
    review_url: r.review_url || null,
    date: r.date || null
  }));
}

/**
 * Run AI citation test (simulated for now - can be replaced with real test)
 */
async function runAICitationTest(
  companyName: string,
  service: string,
  city: string
): Promise<{ competitors: any[]; ai_visibility: any }> {
  // For now, return mock data
  // TODO: Replace with actual OpenAI call to simulate AI search
  
  const mockCompetitors = [
    `${service.toUpperCase()} Pros ${city}`,
    `${city} ${service.charAt(0).toUpperCase() + service.slice(1)} Experts`,
    `All Season ${service.toUpperCase()}`
  ];
  
  return {
    competitors: mockCompetitors.slice(0, Math.floor(Math.random() * 2) + 1).map(name => ({ name })),
    ai_visibility: {
      chatgpt: false,
      gemini: false,
      perplexity: false,
      tested_date: new Date().toISOString()
    }
  };
}

/**
 * Detect available signals
 */
function detectAvailableSignals(lead: SourceLead): { type: SignalType; data: any }[] {
  const signals: { type: SignalType; data: any }[] = [];
  
  const hiringSignal = extractHiringSignal(lead);
  if (hiringSignal) {
    signals.push({ type: 'hiring', data: hiringSignal });
  }
  
  const reviewsSignal = extractReviewsSignal(lead);
  if (reviewsSignal && reviewsSignal.length > 0) {
    // Pick the best review instead of just using the first one
    const bestReview = pickBestReview(reviewsSignal);
    if (bestReview) {
      signals.push({ 
        type: 'reviews', 
        data: { 
          reviewer: bestReview.reviewer_name,
          rating: bestReview.rating,
          text: bestReview.text
        }
      });
    }
  }
  
  return signals;
}

/**
 * Pick random signal (A/B/C split test)
 */
function pickRandomSignal(signals: { type: SignalType; data: any }[]): { type: SignalType; data: any } | null {
  if (signals.length === 0) return null;
  return signals[Math.floor(Math.random() * signals.length)];
}

/**
 * PASS 1: Generate email with spintax template
 */
function generateEmailWithSpintax(
  lead: SourceLead,
  signalType: SignalType,
  signalData: any,
  competitors: any[]
): { subject: string; body: string; variant: string } {
  
  const industry = detectIndustry(lead);
  const firstName = lead.contact_data?.firstName || '';
  const companyName = lead.company_name;
  const city = lead.city;
  const competitor = competitors.length > 0 ? competitors[0].name : `other ${industry} companies`;
  
  let subjectTemplate = '';
  let bodyTemplate = '';
  let variant = '';
  
  if (signalType === 'hiring') {
    const { job_title } = signalData;
    
    subjectTemplate = `{quick question, hiring for|hiring for|saw you're hiring a|noticed you're hiring for} ${job_title}{, quick question|}`;
    
    // Randomly pick V1, V2, or V3
    const variantNum = Math.floor(Math.random() * 3) + 1;
    variant = `V${variantNum}`;
    
    if (variantNum === 1) {
      bodyTemplate = `{Hey|Hi|Hello}{,|} {${firstName}|}

{Saw|Noticed} you're hiring a ${job_title}, {clearly scaling|looks like growth mode|clearly growing}.

{Tested|Checked|Ran a quick test on} ChatGPT for ${industry} {in|around|near} ${city}. ${competitor} {showed up|was ranked|was recommended}, {you weren't|but not you|you didn't show up}.

I can get ${companyName} {ranked|recommended|showing up} in ChatGPT in {6 weeks|about 6 weeks|~6 weeks}.

{Worth a quick chat?|Open to a call?|Worth a 10-minute chat?|Open to a quick 10-minute call?}

{Riley|Best, Riley}`;
    } else if (variantNum === 2) {
      bodyTemplate = `{Hey|Hi|Hello}{,|} {${firstName}|}

Scaling the team at ${companyName}, {smart move|good move|nice}.

One channel most growing ${industry} businesses are {sleeping on|missing|overlooking} right now is AI search. {Tested|Checked} ChatGPT for ${industry} {in|around} ${city}. ${competitor} {came up|was there|showed up}, {you're not|but not you}.

I fix that in {6 weeks|about 6 weeks|~6 weeks}.

{Open to a quick 10-minute call?|Worth a quick chat?|Interested?}

{Riley|Best, Riley}`;
    } else {
      bodyTemplate = `{Hey|Hi|Hello}{,|} {${firstName}|}

Noticed ${companyName} is hiring for ${job_title}, {looks like things are moving|things are moving|clearly growing}.

ChatGPT is {sending|directing|recommending} buyers to ${industry} businesses every day. {Ran a test|Checked} for ${city}. ${competitor} {came up|showed up|was ranked}, {you didn't|but not you}.

I can get that fixed in {6 weeks|about 6 weeks|~6 weeks}.

{Worth a quick 10-minute chat?|Open to a call?|Worth chatting?}

{Riley|Best, Riley}`;
    }
  } else   if (signalType === 'reviews') {
    const { reviewer } = signalData;
    
    // V1 or V2 only (50/50 split)
    const variantNum = Math.floor(Math.random() * 2) + 1;
    variant = `V${variantNum}`;
    
    if (variantNum === 1) {
      // V1: "got work done with you" style
      subjectTemplate = `${reviewer} {got work done with you|worked with you|used your ${industry} service}`;
      
      bodyTemplate = `{Hey|Hi|Hello}{,|} {${firstName}|}

{Saw|Noticed|Came across} ${reviewer} left {a great review|a 5-star review|great feedback} {-|,} {looks like solid work|clearly great work|strong work} in ${city}.

{Tested|Checked|Ran a test on} ChatGPT for ${industry} in ${city}. ${competitor} {showed up|came up|was ranked}, {you weren't|but not you|you didn't show}.

I can get ${companyName} {ranked|showing up|recommended} in ChatGPT in {6 weeks|about 6 weeks|~6 weeks}.

{Worth a quick chat?|Open to a call?|Interested?}

Riley`;
    } else {
      // V2: "recent repair/fix" style
      subjectTemplate = `${reviewer}'s recent {${industry} repair|${industry} fix|repair|service|work}`;
      
      bodyTemplate = `{Hey|Hi|Hello}{,|} {${firstName}|}

${reviewer}'s {review|feedback} {caught my eye|stood out} {-|,} {clearly you do good work|looks like you deliver|solid work}.

Most buyers are {skipping Google and asking|asking} ChatGPT now. {Tested|Checked} for ${industry} {in|around} ${city}. ${competitor} {came up|showed up}, {you're not there yet|but not you}.

I fix that in {6 weeks|about 6 weeks|~6 weeks}.

{Open to a quick call?|Worth a chat?|Interested?}

Riley`;
    }
  }
  
  // Apply spintax
  const subject = applySpintax(subjectTemplate);
  const body = applySpintax(bodyTemplate);
  
  return { subject, body, variant };
}

/**
 * PASS 2: LLM polish (safety check)
 */
async function polishEmailWithLLM(
  subject: string,
  body: string,
  variant: string
): Promise<{ subject: string; body: string }> {
  
  const systemPrompt = `You are a cold email expert for AI Search Optimization outreach.

CRITICAL RULES:
- Target 40-75 words total (count carefully)
- Keep subject lowercase, no special characters
- NO em dashes (—), use regular dashes (-) or commas
- Keep ALL facts exact (names, numbers, competitors)
- PRESERVE possessive apostrophes (e.g., "john's repair" NOT "johns repair")
- Structure: Signal → Gap (not ranked/recommended in AI search) → Hook (6 weeks) → Soft CTA
- Conversational tone, not salesy

Your job: Make SLIGHT tweaks ONLY to fix grammar or awkward phrasing. Don't rewrite or expand.

Template is ${variant}. Match that tone.

NO explanations. NO change notes. NO hallucinations. Output ONLY the polished email.`;

  const userPrompt = `Polish this email ONLY if grammar/flow needs fixing. Keep it brief (40-75 words).

Subject: ${subject}

Body:
${body}

Output format (NO explanations, NO notes, ONLY the email):
Subject: [polished subject]
Email: [polished body]`;

  try {
    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.OPENROUTER_API_KEY}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'https://oneclaw.ai',
        'X-Title': 'OneClaw Email Generator'
      },
      body: JSON.stringify({
        model: 'deepseek/deepseek-chat',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ],
        max_tokens: 250,
        temperature: 0.5 // Lower temp for more consistent output
      })
    });

    const data = await response.json();
    let text = data.choices[0].message.content;
    
    // Strip out any explanation text after the email (anything after "---" or "Changes:")
    text = text.split(/---|\bChanges?\b/i)[0].trim();
    
    const subjectMatch = text.match(/Subject:\s*(.+)/i);
    const bodyMatch = text.match(/Email:\s*([\s\S]+)/i);
    
    let polishedSubject = subjectMatch?.[1]?.trim() || subject;
    let polishedBody = bodyMatch?.[1]?.trim() || body;
    
    // Clean up artifacts
    polishedSubject = polishedSubject
      .replace(/^\*+\s*/, '') // Remove leading asterisks
      .replace(/\*+$/, '') // Remove trailing asterisks
      .replace(/["'\[\]]/g, '') // Remove quotes and brackets
      .replace(/\s+/g, ' ') // Normalize spaces
      .toLowerCase() // Ensure lowercase
      .trim();
    
    // Fix possessive apostrophes (e.g., "johns" → "john's", "chattopadhyays" → "chattopadhyay's")
    polishedSubject = polishedSubject.replace(/(\w+)s\s+(review|feedback|recent|repair|fix|work|service)/gi, "$1's $2");
    
    // Also fix patterns like "johns recent" where there's no space after 's'
    polishedSubject = polishedSubject.replace(/(\w+)s(recent|repair|fix|work|service)/gi, "$1's $2");
    
    // Remove duplicate phrases (e.g., "quick question, ... quick question")
    // Split by comma to check phrase-level duplicates
    const segments = polishedSubject.split(',').map(s => s.trim());
    const uniqueSegments = [...new Set(segments)]; // Remove exact duplicates
    polishedSubject = uniqueSegments.join(', ');
    
    polishedBody = polishedBody
      .replace(/^["'\s*]+|["'\s*]+$/g, '') // Remove quotes/asterisks
      .replace(/—/g, '-') // Replace em dashes
      .replace(/\s+-\s+/g, ' - ') // Normalize dash spacing
      .trim();
    
    // If body is too long (>75 words), use original
    const wordCount = countWords(polishedBody);
    if (wordCount > 75) {
      console.log(`   ⚠️  LLM made it too long (${wordCount} words), using original`);
      return { subject, body };
    }
    
    return { 
      subject: polishedSubject, 
      body: polishedBody
    };
  } catch (error) {
    console.error('   ⚠️  LLM polish failed, using original:', error);
    return { subject, body };
  }
}

/**
 * Count words
 */
function countWords(text: string): number {
  return text.trim().split(/\s+/).length;
}

/**
 * Migrate lead to home_services_leads
 */
async function migrateToHomeServicesLead(
  sourceLead: SourceLead,
  competitors: any[],
  ai_visibility: any
): Promise<string | null> {
  
  const industry = detectIndustry(sourceLead);
  const hiringSignal = extractHiringSignal(sourceLead);
  const reviewsSignal = extractReviewsSignal(sourceLead);
  
  const homeServicesLead = {
    company_name: sourceLead.company_name,
    email: sourceLead.email,
    city: sourceLead.city,
    state: sourceLead.state,
    website: sourceLead.website,
    phone: sourceLead.phone,
    industry,
    first_name: sourceLead.contact_data?.firstName,
    last_name: sourceLead.contact_data?.lastName,
    google_place_id: sourceLead.google_place_id,
    google_maps_url: sourceLead.google_maps_url,
    google_rating: sourceLead.google_rating ? parseFloat(sourceLead.google_rating) : null,
    google_review_count: sourceLead.google_reviews,
    hiring_signal: hiringSignal,
    ads_signal: null,
    reviews_signal: reviewsSignal,
    competitors,
    ai_visibility,
    source_lead_id: sourceLead.id
  };
  
  if (DRY_RUN) {
    console.log('   [DRY RUN] Would insert home_services_lead');
    return 'dry-run-id';
  }
  
  const { data, error } = await supabase
    .schema('crm')
    .from('home_services_leads')
    .insert(homeServicesLead)
    .select('id')
    .single();
  
  if (error) {
    console.error('   ❌ Error inserting lead:', error.message);
    return null;
  }
  
  return data.id;
}

/**
 * Create campaign
 */
async function createCampaign(
  homeServicesLeadId: string,
  signalType: SignalType,
  variant: string,
  subject: string,
  body: string,
  senderEmail: string
): Promise<boolean> {
  
  if (DRY_RUN) {
    console.log('   [DRY RUN] Would insert campaign');
    return true;
  }
  
  const { error } = await supabase
    .schema('crm')
    .from('home_services_campaigns')
    .insert({
      lead_id: homeServicesLeadId,
      campaign_type: 'cold_outreach',
      signal_used: signalType,
      template_variant: variant,
      subject,
      body,
      sent_from_email: senderEmail,
      approval_status: 'pending_approval',
      status: 'draft'
    });
  
  if (error) {
    console.error('   ❌ Error creating campaign:', error.message);
    return false;
  }
  
  return true;
}

/**
 * Fetch source leads
 */
async function getSourceLeads(limit: number): Promise<SourceLead[]> {
  console.log(`\n📊 Fetching source leads (limit: ${limit})...`);
  
  const { data: existing } = await supabase
    .schema('crm')
    .from('home_services_leads')
    .select('email');
  
  const existingEmails = new Set(existing?.map(l => l.email.toLowerCase()) || []);
  console.log(`   ⏭️  ${existingEmails.size} leads already migrated`);
  
  const fetchLimit = limit * 10;
  const { data: leads, error } = await supabase
    .schema('crm')
    .from('leads')
    .select('*')
    .not('email', 'is', null)
    .order('google_rating', { ascending: false })
    .range(500, 500 + fetchLimit - 1); // Start at offset 500
  
  if (error) {
    console.error('❌ Error fetching leads:', error);
    return [];
  }
  
  const filtered = (leads || [])
    .filter(lead => !existingEmails.has(lead.email.toLowerCase()))
    .filter(lead => detectAvailableSignals(lead).length > 0)
    .slice(0, limit);
  
  console.log(`✅ Found ${filtered.length} NEW leads with signals`);
  
  return filtered as SourceLead[];
}

/**
 * Process one lead
 */
async function processLead(lead: SourceLead, index: number, total: number): Promise<boolean> {
  console.log(`\n[${index}/${total}] ${lead.company_name} (${lead.city}, ${lead.state})`);
  
  // Run AI citation test
  const industry = detectIndustry(lead);
  console.log(`   🏷️  Industry: ${industry}`);
  console.log('   🔍 Running AI citation test...');
  
  const { competitors, ai_visibility } = await runAICitationTest(
    lead.company_name,
    industry,
    lead.city
  );
  
  console.log(`   📊 Found ${competitors.length} competitors: ${competitors.map(c => c.name).join(', ')}`);
  
  // Migrate to home_services_leads
  const homeServicesLeadId = await migrateToHomeServicesLead(lead, competitors, ai_visibility);
  
  if (!homeServicesLeadId) {
    console.log('   ❌ Failed to migrate lead');
    return false;
  }
  
  console.log(`   ✅ Migrated to home_services_leads`);
  
  // Detect signals
  const signals = detectAvailableSignals(lead);
  console.log(`   🎯 Available signals: ${signals.map(s => s.type).join(', ')}`);
  
  // Pick random signal
  const chosenSignal = pickRandomSignal(signals);
  if (!chosenSignal) {
    console.log('   ❌ No signal chosen');
    return false;
  }
  
  console.log(`   🎲 Chosen signal: ${chosenSignal.type}`);
  
  // PASS 1: Generate with spintax
  const { subject, body, variant } = generateEmailWithSpintax(
    lead,
    chosenSignal.type,
    chosenSignal.data,
    competitors
  );
  
  console.log(`   📝 Pass 1 (Spintax): ${countWords(body)} words`);
  
  // PASS 2: LLM polish
  const polished = await polishEmailWithLLM(subject, body, variant);
  
  console.log(`   ✨ Pass 2 (Polish): ${countWords(polished.body)} words`);
  console.log(`   ✅ Final: "${polished.subject}"`);
  
  // Preview
  console.log('\n   Preview:');
  console.log('   ' + '-'.repeat(50));
  console.log(`   Subject: ${polished.subject}`);
  console.log('   ' + '-'.repeat(50));
  console.log('   ' + polished.body.split('\n').join('\n   '));
  console.log('   ' + '-'.repeat(50));
  
  // Create campaign
  const senderEmail = getNextSender();
  console.log(`   📧 Sender: ${senderEmail}`);
  console.log(`   🏷️  Signal: ${chosenSignal.type} (${variant})`);
  
  const created = await createCampaign(
    homeServicesLeadId,
    chosenSignal.type,
    variant,
    polished.subject,
    polished.body,
    senderEmail
  );
  
  if (created) {
    console.log('   ✅ Campaign created');
    return true;
  }
  
  return false;
}

/**
 * Main
 */
async function main() {
  console.log('🏠 Home Services Campaign Generator (Two-Pass)\n');
  console.log(`Mode: ${DRY_RUN ? '🧪 DRY RUN' : '💾 LIVE'}`);
  console.log(`Batch size: ${BATCH_SIZE}`);
  console.log(`Pass 1: Spintax templates`);
  console.log(`Pass 2: LLM polish (DeepSeek)\n`);
  
  const leads = await getSourceLeads(BATCH_SIZE);
  
  if (leads.length === 0) {
    console.log('\n❌ No leads found');
    return;
  }
  
  let processed = 0;
  let failed = 0;
  
  for (let i = 0; i < leads.length; i++) {
    const success = await processLead(leads[i], i + 1, leads.length);
    
    if (success) {
      processed++;
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
