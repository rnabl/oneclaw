/**
 * Generate Hiring Campaign Workflow
 * 
 * Creates personalized AI search visibility emails for businesses that are hiring.
 * Uses business description, AI rankings check, and hiring signal to craft targeted outreach.
 * 
 * Input:
 * - leadId: Lead ID from crm.leads
 * OR
 * - businessName, city, state, service, email, firstName (manual mode)
 * 
 * Output:
 * - subject: Email subject line
 * - body: Email body (plain text)
 * - campaignId: Stored campaign ID in crm.email_campaigns
 */

import { z } from 'zod';
import type { StepContext } from '../execution/runner';
import { runner } from '../execution/runner';
import { registry } from '../registry';
import { createClient } from '@supabase/supabase-js';
import OpenAI from 'openai';

// =============================================================================
// SCHEMAS
// =============================================================================

const GenerateHiringCampaignInput = z.object({
  leadId: z.string().optional().describe('Lead ID from crm.leads'),
  // Manual mode (if leadId not provided)
  businessName: z.string().optional(),
  city: z.string().optional(),
  state: z.string().optional(),
  service: z.string().optional(),
  email: z.string().email().optional(),
  firstName: z.string().optional(),
  checkRankings: z.boolean().default(true).describe('Whether to run AI rankings check'),
});

type GenerateHiringCampaignInput = z.infer<typeof GenerateHiringCampaignInput>;

const GenerateHiringCampaignOutput = z.object({
  success: z.boolean(),
  campaignId: z.string().optional(),
  subject: z.string(),
  body: z.string(),
  toEmail: z.string(),
  businessName: z.string(),
  service: z.string(),
  competitors: z.array(z.string()).optional(),
  error: z.string().optional(),
});

type GenerateHiringCampaignOutput = z.infer<typeof GenerateHiringCampaignOutput>;

// =============================================================================
// REGISTER TOOL
// =============================================================================

registry.register({
  id: 'generate-hiring-campaign',
  name: 'Generate Hiring Campaign',
  description: 'Generate personalized AI search visibility email for a hiring business. Uses business description from website scan and AI rankings to create targeted outreach.',
  version: '1.0.0',
  inputSchema: GenerateHiringCampaignInput,
  outputSchema: GenerateHiringCampaignOutput,
  requiredSecrets: ['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY'],
  networkPolicy: {
    allowedDomains: ['*.supabase.co'],
    blockedDomains: [],
    allowLocalhost: true,
  },
  costClass: 'low',
  estimatedCostUsd: 0.01,
  retryPolicy: {
    maxAttempts: 2,
    backoffMs: 1000,
    backoffMultiplier: 2,
    retryableErrors: ['TIMEOUT', 'DATABASE_ERROR'],
  },
  timeoutMs: 30000,
  idempotent: false,
  isPublic: false,
  tags: ['email', 'campaign', 'outreach', 'hiring'],
  createdAt: new Date(),
  updatedAt: new Date(),
});

// =============================================================================
// LLM EMAIL GENERATION
// =============================================================================

async function generatePersonalizedEmail(
  ctx: StepContext,
  context: {
    companyName: string;
    jobRole: string;
    businessDescription: string;
    service: string;
    category: 'b2b' | 'b2c';
    city: string;
    firstName?: string | null;
  }
): Promise<{ subject: string; body: string }> {
  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  
  const prompt = `You're Ryan. You help businesses show up in AI search. You found them because they're hiring.

COMPANY:
${context.companyName} in ${context.city}
Hiring: ${context.jobRole}
Service: ${context.service}
Customers: ${context.category === 'b2c' ? 'consumers' : 'businesses'}

PROBLEM:
Searched ChatGPT + Perplexity for "${context.service}" in ${context.city}.
${context.companyName} doesn't show up. Competitors do.

STRUCTURE (follow exactly):
1. Hook: "Saw you're hiring for [role]." or "Noticed the [role] posting."
2. Bridge: Connect hiring to needing customers/leads (one sentence)
3. Problem: "Ran a search in ChatGPT for [service] in [city]. You're not showing up."
4. Urgency: "Competitors are." or "Your competitors show up instead."
5. CTA: Choose from options below

CTA OPTIONS (pick one):
- "Curious if you'd want to fix this?"
- "Worth a quick call to fix this?"
- "10-minute call is probably all it takes to fix this."
- "Want to talk about fixing this?"
- "Should we fix this?"
- "Interested in fixing this?"

FORMATTING:
- Use line breaks for readability (separate hook, bridge, problem, CTA)
- Max 50 words
- Direct, conversational

Write:
SUBJECT: [short, direct - reference job title]

${context.firstName || 'Hey'},

[your email with line breaks and bridge]

Ryan`;

  try {
    const response = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [{ role: 'user', content: prompt }],
      max_tokens: 200,
      temperature: 0.9,
    });

    const text = response.choices[0].message.content || '';
    const subjectMatch = text.match(/SUBJECT:\s*(.+)/i);
    const bodyMatch = text.match(/BODY:\s*([\s\S]+)/i);
    
    const subject = subjectMatch ? subjectMatch[1].trim() : `${context.companyName} - AI visibility`;
    const body = bodyMatch ? bodyMatch[1].trim() : text;
    
    await ctx.log('info', `Generated email with subject: ${subject}`);
    
    return { subject, body };
  } catch (error: any) {
    await ctx.log('error', `LLM email generation failed: ${error.message}`);
    throw error;
  }
}

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

function inferServiceFromDescription(description?: string): string | null {
  if (!description) return null;
  
  const desc = description.toLowerCase();
  
  if (desc.includes('water damage') || desc.includes('restoration')) {
    return 'water damage restoration';
  }
  if (desc.includes('hvac') || desc.includes('heating') || desc.includes('cooling') || desc.includes('air condition')) {
    return 'HVAC';
  }
  if (desc.includes('plumb')) return 'plumbing';
  if (desc.includes('roof')) return 'roofing';
  if (desc.includes('electric')) return 'electrical services';
  if (desc.includes('landscap') || desc.includes('lawn')) return 'landscaping';
  if (desc.includes('pest') || desc.includes('exterminator')) return 'pest control';
  if (desc.includes('general contractor') || desc.includes('remodel')) return 'general contracting';
  
  return null;
}

function inferServiceFromRoles(roles: string[]): string {
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

// =============================================================================
// EMAIL VARIATIONS
// =============================================================================

const EMAIL_HOOKS = [
  { opening: "{{firstName}},\n\nNoticed {{companyName}} is hiring. Congrats on the growth.", weight: 0.3 },
  { opening: "{{firstName}},\n\nQuick question about {{companyName}}.", weight: 0.25 },
  { opening: "{{firstName}},\n\nSaw you're hiring for {{topJobRole}}. Nice.", weight: 0.2 },
  { opening: "{{firstName}},\n\nRan some research on {{companyName}}.", weight: 0.15 },
  { opening: "{{firstName}},\n\nThought you'd want to know about this.", weight: 0.1 },
];

const EMAIL_BODIES = [
  {
    template: "I checked how {{companyName}} shows up when {{searchContext}} search for {{service}} in {{city}}. You're not showing up. Your competitors are.\n\n{{stat}}",
    stats: [
      "73% of local searches now start with AI tools, not Google.",
      "ChatGPT gets 200M+ searches daily. Most businesses aren't showing up.",
      "60% of your next {{customerType}} will use AI search before calling.",
    ],
    weight: 0.4,
  },
  {
    template: "Searched \"{{service}} {{city}}\" in ChatGPT. {{companyName}} didn't come up. Your competitors did.\n\nThat's a problem.",
    stats: [],
    weight: 0.25,
  },
  {
    template: "{{companyName}} isn't showing up in AI search for {{service}}. {{stat}}",
    stats: [
      "Most of your next {{customerType}} are searching in ChatGPT and Claude, not Google.",
      "60% of {{searchContext}} are now starting with AI tools.",
    ],
    weight: 0.2,
  },
  {
    template: "Have you checked where {{companyName}} shows up when people ask AI for {{service}} in {{city}}?\n\nYou're not listed. {{stat}}",
    stats: [
      "That's costing you customers.",
      "Most businesses don't even know this is happening.",
    ],
    weight: 0.1,
  },
  {
    template: "{{companyName}} isn't in ChatGPT or Claude's recommendations for {{service}}. Your competitors are.\n\n{{customerType}} are searching there first now.",
    stats: [],
    weight: 0.05,
  },
];

const EMAIL_CTAS = [
  { template: "Would you be curious on how you can get recommended by AI?", weight: 0.35 },
  { template: "Want me to show you what it takes to get listed?", weight: 0.25 },
  { template: "I can show you exactly how to fix this. Interested?", weight: 0.2 },
  { template: "Worth a 10-minute call?", weight: 0.1 },
  { template: "Want to see where you stand?", weight: 0.1 },
];

const EMAIL_SIGNATURES = ["Ryan", "Best,\nRyan", "Thanks,\nRyan"];

function weightedRandom<T extends { weight: number }>(items: T[]): T {
  const total = items.reduce((sum, item) => sum + item.weight, 0);
  let random = Math.random() * total;
  
  for (const item of items) {
    random -= item.weight;
    if (random <= 0) return item;
  }
  
  return items[0];
}

function fillTemplate(template: string, vars: Record<string, string>): string {
  let result = template;
  for (const [key, value] of Object.entries(vars)) {
    result = result.replace(new RegExp(`{{${key}}}`, 'g'), value);
  }
  return result;
}

function selectStat(stats: string[], vars: Record<string, string>): string {
  if (stats.length === 0) return '';
  const stat = stats[Math.floor(Math.random() * stats.length)];
  return fillTemplate(stat, vars);
}

function generateEmailBody(
  businessName: string,
  firstName: string | null,
  service: string,
  city: string,
  category: 'b2b' | 'b2c',
  topJobRole?: string
): { subject: string; body: string } {
  // Prepare template variables
  const templateVars: Record<string, string> = {
    firstName: firstName || 'Hey',
    companyName: businessName,
    service,
    city,
    searchContext: category === 'b2c' ? `people in ${city}` : 'businesses',
    customerType: category === 'b2c' ? 'customers' : 'clients',
    topJobRole: topJobRole || 'Sales Representatives',
  };
  
  // Select random components
  const hook = weightedRandom(EMAIL_HOOKS);
  const body = weightedRandom(EMAIL_BODIES);
  const cta = weightedRandom(EMAIL_CTAS);
  const signature = EMAIL_SIGNATURES[Math.floor(Math.random() * EMAIL_SIGNATURES.length)];
  
  // Select stat if needed
  const stat = body.stats.length > 0 ? selectStat(body.stats, templateVars) : '';
  templateVars.stat = stat;
  
  // Build email
  const opening = fillTemplate(hook.opening, templateVars);
  const bodyText = fillTemplate(body.template, templateVars);
  const ctaText = fillTemplate(cta.template, templateVars);
  
  const emailBody = `${opening}

${bodyText}

${ctaText}

${signature}`;
  
  // Subject line variations
  const subjects = [
    `${businessName} - AI search`,
    `Quick question about ${businessName}`,
    `${businessName} + AI visibility`,
    `${firstName || 'Hey'} - checked your AI presence`,
  ];
  
  const subject = subjects[Math.floor(Math.random() * subjects.length)];
  
  return { subject, body: emailBody };
}

// =============================================================================
// MAIN WORKFLOW HANDLER
// =============================================================================

async function generateHiringCampaignHandler(
  ctx: StepContext,
  input: Record<string, unknown>
): Promise<GenerateHiringCampaignOutput> {
  const params = GenerateHiringCampaignInput.parse(input);
  
  await ctx.log('info', 'Starting hiring campaign generation');
  
  const supabase = createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
  
  let businessName: string;
  let city: string;
  let state: string;
  let service: string;
  let email: string;
  let firstName: string | null;
  let leadId: string | undefined;
  let category: 'b2b' | 'b2c' = 'b2c'; // Default to b2c
  let topJobRole: string | undefined;
  let competitors: string[] = [];
  
  // ==========================================================================
  // STEP 1: Get lead data (from DB or manual input)
  // ==========================================================================
  
  if (params.leadId) {
    runner.updateStep(ctx.jobId, 1, 'Fetching lead from database', 3);
    
    const { data: lead, error } = await supabase
      .schema('crm')
      .from('leads')
      .select('*')
      .eq('id', params.leadId)
      .single();
    
    if (error || !lead) {
      return {
        success: false,
        subject: '',
        body: '',
        toEmail: '',
        businessName: '',
        service: '',
        error: `Lead not found: ${params.leadId}`,
      };
    }
    
    businessName = lead.company_name;
    city = lead.city;
    state = lead.state;
    email = lead.contact_data?.email;
    firstName = lead.contact_data?.owner_name?.split(' ')[0] || lead.contact_data?.name?.split(' ')[0] || null;
    leadId = params.leadId;
    
    if (!email) {
      return {
        success: false,
        subject: '',
        body: '',
        toEmail: '',
        businessName,
        service: '',
        error: 'No email found for lead',
      };
    }
    
    // Extract service from business description or job roles
    const businessDescription = lead.source_metadata?.business_description;
    const aiDetectedService = lead.source_metadata?.ai_detected_service;
    const aiDetectedCategory = lead.source_metadata?.ai_detected_category;
    
    service = aiDetectedService ||
              inferServiceFromDescription(businessDescription) || 
              inferServiceFromRoles(lead.source_metadata?.hiring_signal?.roles || []);
    
    category = (aiDetectedCategory === 'b2b' ? 'b2b' : 'b2c');
    topJobRole = lead.source_metadata?.hiring_signal?.roles?.[0];
    
    await ctx.log('info', `Lead: ${businessName} | Service: ${service} | Category: ${category} | Email: ${email}`);
    
  } else {
    // Manual mode
    if (!params.businessName || !params.city || !params.state || !params.service || !params.email) {
      return {
        success: false,
        subject: '',
        body: '',
        toEmail: '',
        businessName: '',
        service: '',
        error: 'Missing required fields for manual mode',
      };
    }
    
    businessName = params.businessName;
    city = params.city;
    state = params.state;
    service = params.service;
    email = params.email;
    firstName = params.firstName || null;
  }
  
  // ==========================================================================
  // STEP 2: Check AI Rankings (optional)
  // ==========================================================================
  
  if (params.checkRankings) {
    runner.updateStep(ctx.jobId, 2, 'Checking AI rankings', 3);
    
    try {
      // Call check-ai-rankings workflow
      const rankingsJob = await runner.executeWorkflow('check-ai-rankings', ctx.userId, {
        niche: service,
        city,
        state,
        checkBusiness: businessName,
      });
      
      if (rankingsJob.output?.top_businesses) {
        competitors = rankingsJob.output.top_businesses.map((b: any) => b.name);
        await ctx.log('info', `Found ${competitors.length} competitors in AI search`);
      }
    } catch (error) {
      await ctx.log('warn', `AI rankings check failed: ${error}. Continuing without competitors.`);
    }
  }
  
  // ==========================================================================
  // STEP 3: Generate email using LLM
  // ==========================================================================
  
  runner.updateStep(ctx.jobId, 3, 'Generating personalized email with LLM', 3);
  
  const businessDescription = lead.source_metadata?.business_description || '';
  
  const emailContent = await generatePersonalizedEmail(ctx, {
    companyName: businessName,
    jobRole: topJobRole || 'Sales Representative',
    businessDescription,
    service,
    category,
    city,
    firstName,
  });
  
  const subject = emailContent.subject;
  const body = emailContent.body;
  
  await ctx.log('info', 'Email generated successfully');
  
  // ==========================================================================
  // STEP 4: Store in email_campaigns table (optional, if leadId provided)
  // ==========================================================================
  
  let campaignId: string | undefined;
  
  if (leadId) {
    try {
      const { data: campaign, error: insertError } = await supabase
        .schema('crm')
        .from('email_campaigns')
        .insert({
          lead_id: leadId,
          to_email: email,
          subject,
          body,
          status: 'queued',
          campaign_type: 'job_posting_ai_visibility',
        })
        .select('id')
        .single();
      
      if (insertError) {
        await ctx.log('warn', `Failed to store campaign: ${insertError.message}`);
      } else {
        campaignId = campaign.id;
        await ctx.log('info', `Campaign stored with ID: ${campaignId}`);
      }
    } catch (error) {
      await ctx.log('warn', `Campaign storage error: ${error}`);
    }
  }
  
  return {
    success: true,
    campaignId,
    subject,
    body,
    toEmail: email,
    businessName,
    service,
    competitors,
  };
}

// =============================================================================
// REGISTER WORKFLOW
// =============================================================================

runner.registerWorkflow('generate-hiring-campaign', generateHiringCampaignHandler);

export { generateHiringCampaignHandler };
