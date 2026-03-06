/**
 * Generate Signal-Based Campaign Workflow
 * 
 * Detects business signals (hiring, ads, reviews) and generates personalized emails
 * with proper prioritization and variation.
 * 
 * Signal Priority:
 * 1. Hiring (highest)
 * 2. Running Ads (high)
 * 3. Google Reviews (good)
 * 
 * Input:
 * - leadId: Lead ID from crm.leads
 * 
 * Output:
 * - subject: Email subject line
 * - body: Email body (plain text)
 * - signal: Which signal was used
 * - campaignId: Stored campaign ID in crm.email_campaigns
 */

import { z } from 'zod';
import type { StepContext } from '../execution/runner';
import { createClient } from '@supabase/supabase-js';
import OpenAI from 'openai';

// =============================================================================
// SCHEMAS
// =============================================================================

const GenerateSignalCampaignInput = z.object({
  leadId: z.string().describe('Lead ID from crm.leads'),
});

type GenerateSignalCampaignInput = z.infer<typeof GenerateSignalCampaignInput>;

const GenerateSignalCampaignOutput = z.object({
  success: z.boolean(),
  campaignId: z.string().optional(),
  subject: z.string(),
  body: z.string(),
  signal: z.enum(['hiring', 'ads', 'reviews', 'none']),
  signalData: z.any().optional(),
  error: z.string().optional(),
});

type GenerateSignalCampaignOutput = z.infer<typeof GenerateSignalCampaignOutput>;

// =============================================================================
// SIGNAL DETECTION
// =============================================================================

interface DetectedSignal {
  type: 'hiring' | 'ads' | 'reviews' | 'none';
  data: any;
  observation: string;
}

async function detectSignals(ctx: StepContext, lead: any): Promise<DetectedSignal> {
  await ctx.log('info', 'Detecting business signals...');
  
  // Check 1: Hiring (highest priority)
  if (lead.source_type === 'job_posting') {
    // Try multiple locations for job title
    let jobTitle = lead.source_metadata?.job_title;
    
    if (!jobTitle && lead.source_metadata?.job_postings?.length > 0) {
      jobTitle = lead.source_metadata.job_postings[0].positionName;
    }
    
    if (!jobTitle && lead.source_metadata?.hiring_signal?.roles?.length > 0) {
      jobTitle = lead.source_metadata.hiring_signal.roles[0];
    }
    
    if (jobTitle) {
      await ctx.log('info', `✅ HIRING signal detected: ${jobTitle}`);
      return {
        type: 'hiring',
        data: { jobTitle },
        observation: `Saw you're hiring a ${jobTitle}.`
      };
    }
  }
  
  // Check 2: Running Ads (high priority)
  // TODO: Integrate with ad detection when available
  // For now, we'll skip this until we have the data
  
  // Check 3: Google Reviews (good signal)
  if (lead.google_rating && lead.google_review_count) {
    const rating = parseFloat(lead.google_rating);
    const reviewCount = parseInt(lead.google_review_count);
    
    if (rating >= 4.7 && reviewCount >= 50) {
      await ctx.log('info', `✅ REVIEWS signal detected: ${rating}⭐ (${reviewCount} reviews)`);
      return {
        type: 'reviews',
        data: { rating, reviewCount },
        observation: `Noticed you have ${reviewCount} Google reviews.`
      };
    }
  }
  
  await ctx.log('warn', 'No strong signals detected');
  return {
    type: 'none',
    data: {},
    observation: ''
  };
}

// =============================================================================
// SERVICE DETECTION
// =============================================================================

function detectService(lead: any): string {
  // Check AI-detected service first
  if (lead.source_metadata?.ai_detected_service) {
    return lead.source_metadata.ai_detected_service;
  }
  
  const desc = (lead.business_description || '').toLowerCase();
  const jobTitle = (lead.source_metadata?.job_postings?.[0]?.positionName || '').toLowerCase();
  
  if (desc.includes('hvac') || jobTitle.includes('hvac')) return 'HVAC';
  if (desc.includes('plumb') || jobTitle.includes('plumb')) return 'plumbing';
  if (desc.includes('roof') || jobTitle.includes('roof')) return 'roofing';
  if (desc.includes('electric') || jobTitle.includes('electric')) return 'electrical';
  if (desc.includes('landscap') || jobTitle.includes('landscap')) return 'landscaping';
  if (desc.includes('paint') || jobTitle.includes('paint')) return 'painting';
  
  return 'home services';
}

// =============================================================================
// EMAIL GENERATION
// =============================================================================

async function generateVariedEmail(
  ctx: StepContext,
  lead: any,
  signal: DetectedSignal,
  firstName: string
): Promise<{ subject: string; body: string }> {
  
  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  const service = detectService(lead);
  const companyName = lead.company_name;
  const city = lead.city;
  
  await ctx.log('info', `Generating email using ${signal.type} signal...`);
  
  const prompt = `You are writing cold outreach emails for an AI Search Optimization agency (AEO / GEO).

The service helps companies get recommended in AI tools like ChatGPT, Gemini, and Perplexity when buyers ask for companies or services.

Goal: Get a reply, not sell.

Assume the company currently does NOT appear in AI answers when people ask for services like theirs.

--------------------------------------------------

INPUT VARIABLES

First Name: ${firstName}
Company Name: ${companyName}
City: ${city}
Service: ${service}

PRIMARY SIGNAL (use this observation):
${signal.observation}

--------------------------------------------------

GREETING RULE

If First Name exists:
Use greetings like:
Hi [First Name]
Hey [First Name]

If First Name is missing:
Use neutral greetings:
Hi
Hey
Hello

Never output an empty name greeting.

--------------------------------------------------

SUBJECT LINE RULES

3–4 words max.
Plain English.

Examples of acceptable styles:
${companyName} question
quick AI check
about ${companyName}
AI question
quick observation
${city} question
quick one

VARY THE SUBJECT - don't repeat the same pattern.

Avoid:
marketing language
clickbait
exclamation points

--------------------------------------------------

EMAIL STRUCTURE

1. Greeting

2. Signal Observation (use the one provided above)

3. AI Test Observation (VARY THIS - pick different phrasing)

Examples:
"Out of curiosity I tested ChatGPT for ${service} companies in ${city}."
"I checked ChatGPT for ${service} companies nearby."
"I asked ChatGPT for ${service} companies in ${city}."
"I ran a quick search on ChatGPT for ${service} in ${city}."
"I looked up ${service} companies in ${city} on ChatGPT."

4. AI Visibility Gap (VARY THIS - pick different phrasing)

Examples:
"${companyName} didn't show up."
"${companyName} wasn't mentioned."
"${companyName} didn't appear in the results."
"You weren't listed."
"${companyName} wasn't in the results."

5. Context (VARY THIS - pick different phrasing)

Examples:
"More people start their search there now instead of Google."
"A lot of buyers are using AI tools to find companies now."
"That's becoming a new discovery channel."
"AI search is replacing Google for a lot of people."
"Buyers are starting with AI now."

6. Value Statement

"We help companies start getting recommended in those answers."

7. CTA (VARY THIS - pick different phrasing)

Examples:
"Want me to send what I saw?"
"Curious if you've looked at this?"
"Should I send the results?"
"Open to a quick look?"
"Want me to show you?"
"Worth seeing?"

--------------------------------------------------

EMAIL RULES

• Under 70 words
• Very simple language
• Written like a quick message to a colleague
• No emojis
• No links
• No hype or marketing language
• No exclamation points
• Only one question at the end
• No em dashes
• VARY the phrasing - don't use the same template wording
• USE LINE BREAKS - separate each key point with a blank line for readability
• Each major section should be on its own line or group of lines
• Use proper paragraph breaks between: greeting, signal, problem, context, and CTA

The email must feel like a quick observation about the business, not a marketing message.

--------------------------------------------------

IMPORTANT: Generate a UNIQUE variation. Don't repeat the same phrasing patterns.

FORMATTING: Write the email body with PROPER LINE BREAKS. Each major section should be separated by a blank line:
- Greeting (with name if available)
- Signal observation
- AI test result
- Context/impact statement
- CTA

Example format:
Hi [Name],

[Signal observation.]

[AI test result.] [Gap statement.] [Context.]

[CTA?]

Riley

OUTPUT FORMAT

Subject: [subject line]
Email: [email body with line breaks as shown above]`;

  const response = await openai.chat.completions.create({
    model: 'gpt-4o',
    messages: [{ role: 'user', content: prompt }],
    max_tokens: 300,
    temperature: 0.9, // High temp for more variation
  });

  const text = response.choices[0].message.content || '';
  const subjectMatch = text.match(/Subject:\s*(.+)/i);
  const bodyMatch = text.match(/Email:\s*([\s\S]+)/i);

  let subject = subjectMatch?.[1]?.trim() || 'Quick question';
  let body = bodyMatch?.[1]?.trim() || text;

  // Clean up quotes but KEEP line breaks
  body = body
    .replace(/^["'\s]+|["'\s]+$/g, '') // Remove leading/trailing quotes/spaces (but not newlines in middle)
    .trim();
  
  // Ensure signature is on its own line (keep whatever name was used)
  body = body.replace(/\s*-?\s*(Riley|Ryan|Alex|Jordan)\s*$/i, (match, name) => `\n\n${name}`);
  
  // If no signature, add Riley (default sender)
  if (!body.match(/(Riley|Ryan|Alex|Jordan)\s*$/i)) {
    body = `${body}\n\nRiley`;
  }

  await ctx.log('info', `Generated email: "${subject}"`);
  
  return { subject, body };
}

// =============================================================================
// MAIN WORKFLOW
// =============================================================================

export async function generateSignalCampaign(
  ctx: StepContext,
  input: GenerateSignalCampaignInput
): Promise<GenerateSignalCampaignOutput> {
  
  try {
    // Initialize Supabase
    const supabase = createClient(
      process.env.SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );
    
    // Step 1: Fetch lead
    await ctx.log('info', `Fetching lead ${input.leadId}...`);
    
    const { data: lead, error: leadError } = await supabase
      .schema('crm')
      .from('leads')
      .select('*')
      .eq('id', input.leadId)
      .single();
    
    if (leadError || !lead) {
      throw new Error(`Lead not found: ${input.leadId}`);
    }
    
    await ctx.log('info', `Found lead: ${lead.company_name}`);
    
    // Step 2: Check if campaign already exists
    const { data: existingCampaign } = await supabase
      .schema('crm')
      .from('email_campaigns')
      .select('id')
      .eq('lead_id', input.leadId)
      .single();
    
    if (existingCampaign) {
      await ctx.log('warn', 'Campaign already exists, skipping...');
      return {
        success: false,
        subject: '',
        body: '',
        signal: 'none',
        error: 'Campaign already exists'
      };
    }
    
    // Step 3: Get contact email
    const contactEmail = lead.contact_data?.email;
    if (!contactEmail) {
      throw new Error('No contact email found for lead');
    }
    
    const firstName = lead.contact_data?.firstName || '';
    
    // Step 4: Detect signals
    const signal = await detectSignals(ctx, lead);
    
    if (signal.type === 'none') {
      await ctx.log('warn', 'No strong signals found, skipping campaign generation');
      return {
        success: false,
        subject: '',
        body: '',
        signal: 'none',
        error: 'No strong signals detected'
      };
    }
    
    // Step 5: Generate varied email
    const { subject, body } = await generateVariedEmail(ctx, lead, signal, firstName);
    
    // Step 6: Store campaign
    const { data: campaign, error: campaignError } = await supabase
      .schema('crm')
      .from('email_campaigns')
      .insert({
        lead_id: input.leadId,
        campaign_type: 'cold_outreach',
        subject,
        body,
        template_name: `signal-${signal.type}`,
        approval_status: 'approved',
      })
      .select()
      .single();
    
    if (campaignError) {
      throw new Error(`Failed to store campaign: ${campaignError.message}`);
    }
    
    await ctx.log('success', `Campaign created: ${campaign.id}`);
    
    return {
      success: true,
      campaignId: campaign.id,
      subject,
      body,
      signal: signal.type,
      signalData: signal.data,
    };
    
  } catch (error: any) {
    await ctx.log('error', `Workflow failed: ${error.message}`);
    return {
      success: false,
      subject: '',
      body: '',
      signal: 'none',
      error: error.message,
    };
  }
}

// Export workflow for registration
export const generateSignalCampaignWorkflow = {
  name: 'generate-signal-campaign',
  description: 'Generate signal-based personalized email campaigns',
  inputSchema: GenerateSignalCampaignInput,
  outputSchema: GenerateSignalCampaignOutput,
  handler: generateSignalCampaign,
};
