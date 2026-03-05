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

function generateEmailBody(
  businessName: string,
  firstName: string | null,
  service: string,
  city: string,
  competitors: string[]
): string {
  const greeting = firstName ? `${firstName},` : 'Hey,';
  const competitorList = competitors.slice(0, 2).join(', ') || 'your competitors';
  
  return `${greeting}

Noticed ${businessName} is hiring. Congrats on the growth.

Ran a check on how you show up in AI search when people ask for ${service} in ${city}. ${businessName} didn't come up. ${competitorList} did.

This matters because most of your next customers are starting their search in ChatGPT or Claude, not Google.

Want me to show you what it takes to get listed?

Ryan`;
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
    service = inferServiceFromDescription(businessDescription) || 
              inferServiceFromRoles(lead.source_metadata?.hiring_signal?.roles || []);
    
    await ctx.log('info', `Lead: ${businessName} | Service: ${service} | Email: ${email}`);
    
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
  // STEP 3: Generate email
  // ==========================================================================
  
  runner.updateStep(ctx.jobId, 3, 'Generating email', 3);
  
  const subject = `${businessName} - AI search visibility`;
  const body = generateEmailBody(businessName, firstName, service, city, competitors);
  
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
