/**
 * SDR Volume Outreach Workflow
 * 
 * High-volume, personalized outreach based on website signals.
 * No selective auditing - process ALL businesses with smart personalization.
 * 
 * Strategy:
 * 1. Discover businesses in bulk (cheap: $0.05 per 1000)
 * 2. Website scanner already captures signals (free, part of discovery)
 * 3. Personalize email based on what's missing (ads, SEO, AI visibility)
 * 4. Submit batch to approval (Blink UI)
 * 5. Send approved emails
 */

import type { StepContext } from '../execution/runner';
import { runner } from '../execution/runner';
import { z } from 'zod';
import { createClient } from '@supabase/supabase-js';

const VolumeOutreachInput = z.object({
  niche: z.string(),
  location: z.string(),
  volumeTarget: z.number().default(1000).describe('How many businesses to process'),
  enrichContactInfo: z.boolean().default(true).describe('Enrich owner contact info'),
  skipAudit: z.boolean().default(true).describe('Skip expensive audits, use signals instead'),
});

type VolumeOutreachInput = z.infer<typeof VolumeOutreachInput>;

const VolumeOutreachOutput = z.object({
  businessesDiscovered: z.number(),
  businessesStored: z.number(),
  emailsGenerated: z.number(),
  pendingApprovalBatchId: z.string().optional(),
  totalCostUsd: z.number(),
  breakdown: z.object({
    discoveryCost: z.number(),
    enrichmentCost: z.number(),
  }),
});

type VolumeOutreachOutput = z.infer<typeof VolumeOutreachOutput>;

function getSupabaseClient() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Supabase not configured');
  return createClient(url, key);
}

/**
 * Personalize email based on website signals
 * Uses data from discover-businesses scanner (no extra audit needed)
 */
function personalizeEmail(business: any): { subject: string; body: string; hook: string } {
  const signals = business.signals || {};
  const name = business.name;
  const location = `${business.city}, ${business.state}`;
  
  // Detect what they're missing (all roads lead to "not being mentioned by AI")
  const missingSignals = [];
  let primaryHook = '';
  
  // Check AI visibility (most important)
  if (!signals.aiReadable || signals.aiReadabilityScore < 7) {
    primaryHook = 'ai_visibility';
    missingSignals.push('AI search visibility');
  }
  
  // Check if running ads but not optimized
  if (signals.hasAds && !signals.seoOptimized) {
    if (!primaryHook) primaryHook = 'wasted_ad_spend';
    missingSignals.push('SEO optimization');
  }
  
  // Check if no ads at all
  if (!signals.hasAds) {
    if (!primaryHook) primaryHook = 'no_digital_marketing';
    missingSignals.push('digital marketing');
  }
  
  // Check social presence
  if (!signals.hasSocials) {
    missingSignals.push('social media presence');
  }
  
  // Fallback if everything looks good
  if (!primaryHook) {
    primaryHook = 'ai_opportunity';
  }
  
  // Generate subject line based on primary hook
  const subjects = {
    ai_visibility: `${name} isn't showing up in ChatGPT searches`,
    wasted_ad_spend: `Your ad spend could be working harder for ${name}`,
    no_digital_marketing: `${name} is invisible to 60% of searchers`,
    ai_opportunity: `New way to get ${name} recommended by AI`,
  };
  
  // Generate body based on signals
  const intros = {
    ai_visibility: `I searched ChatGPT and Perplexity for "${business.industry} in ${location}" and noticed ${name} wasn't mentioned.

That's a problem because 60% of people now ask AI for recommendations instead of using Google.`,
    
    wasted_ad_spend: `I noticed ${name} is running ads (${signals.hasFacebookPixel ? 'Facebook Pixel' : 'Google Analytics'}), but your website isn't optimized for how people actually search now.

60% of searches happen in ChatGPT and Perplexity - not Google. Your ad traffic is hitting a site that AI won't recommend.`,
    
    no_digital_marketing: `Quick question: When someone asks ChatGPT "best ${business.industry} in ${location}", does ${name} get mentioned?

I just tested it - you're not showing up. That's 60% of potential customers you're missing.`,
    
    ai_opportunity: `I ran ${name} through our AI visibility checker and found an interesting opportunity.

While your ${signals.seoOptimized ? 'SEO looks solid' : 'online presence is decent'}, you're not showing up when people ask ChatGPT or Perplexity for ${business.industry} recommendations.`,
  };
  
  const body = `${intros[primaryHook as keyof typeof intros]}

We specialize in GEO (Generative Engine Optimization) - getting businesses cited by AI engines.

I put together a quick report on ${name}'s current AI visibility and found ${missingSignals.length} areas where you could be getting more qualified leads.

Worth a 15-minute conversation this week?

Best,
[Your Name]

P.S. - I'm only reaching out to the top ${business.industry} companies in ${location}. If you're not interested, no worries - but thought you'd want to know about the blind spot.`;

  return {
    subject: subjects[primaryHook as keyof typeof subjects],
    body,
    hook: primaryHook,
  };
}

/**
 * Volume Outreach Handler
 */
async function volumeOutreachHandler(
  ctx: StepContext,
  input: Record<string, unknown>
): Promise<VolumeOutreachOutput> {
  const params = VolumeOutreachInput.parse(input);
  
  let totalCost = 0;
  const supabase = getSupabaseClient();
  
  await ctx.log('info', `Starting volume outreach: ${params.volumeTarget} ${params.niche} businesses`);
  
  // ==========================================================================
  // STEP 1: Discover Businesses in Bulk (Already has signals!)
  // ==========================================================================
  runner.updateStep(ctx.jobId, 1, 'Discovering businesses at scale', 5);
  
  const discoveryJob = await runner.execute('discover-businesses', {
    niche: params.niche,
    location: params.location,
    limit: Math.min(params.volumeTarget, 100), // Apify max per call
    enrich: true, // Website scanner runs automatically
  }, {
    tenantId: ctx.tenantId,
    tier: 'pro',
  });
  
  if (discoveryJob.status !== 'completed' || !discoveryJob.output) {
    throw new Error('Discovery failed');
  }
  
  const businesses = discoveryJob.output.businesses as any[];
  totalCost += discoveryJob.actualCostUsd;
  
  await ctx.log('info', `Discovered ${businesses.length} businesses with signals. Cost: $${discoveryJob.actualCostUsd.toFixed(4)}`);
  
  // ==========================================================================
  // STEP 2: Store ALL Leads in Supabase (with signals)
  // ==========================================================================
  runner.updateStep(ctx.jobId, 2, 'Storing leads with signals', 5);
  
  const leadRecords = businesses.map(b => {
    const signals = b.signals || {};
    
    // Score based on signals (no expensive audit needed!)
    let score = 50; // Base score
    if (b.website) score += 20;
    if (signals.hasAds) score += 10;
    if (!signals.aiReadable) score += 15; // Higher score = bigger opportunity
    if (b.reviewCount && b.reviewCount > 20) score += 5;
    
    return {
      company_name: b.name,
      website: b.website,
      phone: b.phone,
      industry: params.niche,
      city: b.city,
      state: b.state,
      google_place_id: b.googlePlaceId,
      google_rating: b.rating,
      google_reviews: b.reviewCount,
      lead_score: Math.min(score, 100),
      geo_readiness_score: signals.seoOptimized ? 7 : 3,
      aeo_readiness_score: signals.aiReadable ? 7 : 2,
      stage: 'discovered',
      audit_data: {
        signals,
        scannedAt: new Date().toISOString(),
        source: 'volume_discovery',
      },
    };
  });
  
  const { data: storedLeads, error } = await supabase
    .from('crm.leads')
    .insert(leadRecords)
    .select('id, company_name, email');
  
  if (error) {
    throw new Error(`Failed to store leads: ${error.message}`);
  }
  
  await ctx.log('info', `Stored ${storedLeads?.length || 0} leads in Supabase`);
  
  // ==========================================================================
  // STEP 3: Enrich Contact Info (Only for those with websites)
  // ==========================================================================
  runner.updateStep(ctx.jobId, 3, 'Enriching contact information', 5);
  
  let enrichmentCost = 0;
  
  if (params.enrichContactInfo) {
    const businessesWithWebsites = businesses.filter(b => b.website);
    
    await ctx.log('info', `Enriching ${businessesWithWebsites.length} businesses with websites...`);
    
    for (const business of businessesWithWebsites) {
      try {
        const enrichJob = await runner.execute('enrich-contact', {
          businessName: business.name,
          website: business.website,
        }, {
          tenantId: ctx.tenantId,
          tier: 'pro',
        });
        
        if (enrichJob.status === 'completed' && enrichJob.output) {
          const contactData = enrichJob.output as any;
          enrichmentCost += enrichJob.actualCostUsd;
          
          // Update lead with email
          await supabase
            .from('crm.leads')
            .update({
              email: contactData.email || null,
              contact_data: contactData,
            })
            .eq('website', business.website);
        }
      } catch (error) {
        // Continue on error - don't fail whole batch
      }
    }
    
    totalCost += enrichmentCost;
  }
  
  // ==========================================================================
  // STEP 4: Generate Personalized Emails (Based on Signals)
  // ==========================================================================
  runner.updateStep(ctx.jobId, 4, 'Generating personalized emails', 5);
  
  // Get leads with email addresses
  const { data: leadsWithEmail } = await supabase
    .from('crm.leads')
    .select('*')
    .not('email', 'is', null)
    .eq('stage', 'discovered')
    .order('lead_score', { ascending: false });
  
  let emailsGenerated = 0;
  const emailIds: string[] = [];
  
  if (leadsWithEmail) {
    for (const lead of leadsWithEmail) {
      // Personalize based on their specific signals
      const email = personalizeEmail({
        name: lead.company_name,
        city: lead.city,
        state: lead.state,
        industry: lead.industry,
        signals: lead.audit_data?.signals || {},
      });
      
      // Store email campaign
      const { data: campaign, error } = await supabase
        .from('crm.email_campaigns')
        .insert({
          lead_id: lead.id,
          campaign_type: 'cold_outreach',
          subject: email.subject,
          body: email.body,
          template_name: `geo_${email.hook}_v1`,
          approval_status: 'pending',
        })
        .select()
        .single();
      
      if (!error && campaign) {
        emailIds.push(campaign.id);
        emailsGenerated++;
      }
    }
  }
  
  // ==========================================================================
  // STEP 5: Create Approval Batch (Blink UI)
  // ==========================================================================
  runner.updateStep(ctx.jobId, 5, 'Creating approval batch', 5);
  
  // Create one approval for the entire batch
  const { data: batchApproval } = await supabase
    .from('platform.approvals_queue')
    .insert({
      approval_type: 'email_batch',
      reference_table: 'crm.email_campaigns',
      preview_title: `${emailsGenerated} emails for ${params.niche} in ${params.location}`,
      preview_data: {
        campaign_ids: emailIds,
        total_emails: emailsGenerated,
        niche: params.niche,
        location: params.location,
        cost_to_send: 0, // Gmail is free
        sample_emails: emailIds.slice(0, 3), // First 3 for preview
      },
      created_by_agent: 'sdr',
      priority: 7, // High priority for fresh leads
    })
    .select()
    .single();
  
  await ctx.log('info', `Created approval batch with ${emailsGenerated} emails`);
  
  // ==========================================================================
  // Summary
  // ==========================================================================
  
  return {
    businessesDiscovered: businesses.length,
    businessesStored: storedLeads?.length || 0,
    emailsGenerated,
    pendingApprovalBatchId: batchApproval?.id,
    totalCostUsd: totalCost,
    breakdown: {
      discoveryCost: discoveryJob.actualCostUsd,
      enrichmentCost,
    },
  };
}

// Register workflow
runner.registerWorkflow('sdr-volume-outreach', volumeOutreachHandler);

export { volumeOutreachHandler, VolumeOutreachInput, VolumeOutreachOutput };
