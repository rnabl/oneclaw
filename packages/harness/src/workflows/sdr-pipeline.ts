/**
 * SDR Pipeline Workflow
 * 
 * Complete sales pipeline that:
 * 1. Discovers businesses (existing workflow)
 * 2. Stores in Supabase crm.leads
 * 3. Audits websites (existing workflow)
 * 4. Updates lead scores in Supabase
 * 5. Generates personalized emails
 * 6. Submits to CSM approval queue
 * 7. Sends approved emails
 * 
 * This orchestrates existing tools + new Supabase storage.
 */

import type { StepContext } from '../execution/runner';
import { runner } from '../execution/runner';
import { z } from 'zod';
import { createClient } from '@supabase/supabase-js';

// Input schema
const SDRPipelineInput = z.object({
  niche: z.string().describe('Business niche (e.g., "hvac", "plumbing")'),
  location: z.string().describe('Location (e.g., "Austin, TX")'),
  leadLimit: z.number().default(50).describe('How many leads to find'),
  auditTop: z.number().default(10).describe('Audit top N leads'),
  generateEmails: z.boolean().default(true).describe('Generate outreach emails'),
});

type SDRPipelineInput = z.infer<typeof SDRPipelineInput>;

// Output schema
const SDRPipelineOutput = z.object({
  leadsDiscovered: z.number(),
  leadsStored: z.number(),
  leadsAudited: z.number(),
  emailsGenerated: z.number(),
  emailsPendingApproval: z.number(),
  totalCostUsd: z.number(),
  leadsInSupabase: z.array(z.string()), // Array of lead UUIDs
});

type SDRPipelineOutput = z.infer<typeof SDRPipelineOutput>;

// Get Supabase client
function getSupabaseClient() {
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !supabaseKey) {
    throw new Error('Supabase credentials not configured');
  }

  return createClient(supabaseUrl, supabaseKey);
}

/**
 * SDR Pipeline Handler
 */
async function sdrPipelineHandler(
  ctx: StepContext,
  input: Record<string, unknown>
): Promise<SDRPipelineOutput> {
  const params = SDRPipelineInput.parse(input);
  
  let totalCost = 0;
  const leadUUIDs: string[] = [];
  
  await ctx.log('info', `Starting SDR pipeline: ${params.niche} in ${params.location}`);
  
  // ==========================================================================
  // STEP 1: Discover Businesses (Existing Workflow)
  // ==========================================================================
  runner.updateStep(ctx.jobId, 1, 'Discovering businesses', 6);
  
  await ctx.log('info', `Discovering ${params.leadLimit} ${params.niche} businesses...`);
  
  // Call existing discover-businesses workflow
  const discoveryJob = await runner.execute('discover-businesses', {
    niche: params.niche,
    location: params.location,
    limit: params.leadLimit,
  }, {
    tenantId: ctx.tenantId,
    tier: 'pro',
  });
  
  if (discoveryJob.status !== 'completed' || !discoveryJob.output) {
    throw new Error('Discovery failed');
  }
  
  const businesses = discoveryJob.output.businesses as any[];
  totalCost += discoveryJob.actualCostUsd;
  
  await ctx.log('info', `Found ${businesses.length} businesses. Cost: $${discoveryJob.actualCostUsd.toFixed(4)}`);
  
  // ==========================================================================
  // STEP 2: Store Leads in Supabase
  // ==========================================================================
  runner.updateStep(ctx.jobId, 2, 'Storing leads in Supabase', 6);
  
  const supabase = getSupabaseClient();
  
  for (const business of businesses) {
    // Calculate initial scores
    const hasWebsite = !!business.website;
    const hasReviews = (business.reviewCount || 0) > 0;
    const initialScore = (hasWebsite ? 30 : 0) + (hasReviews ? 20 : 0);
    
    const { data, error } = await supabase
      .from('crm.leads')
      .insert({
        company_name: business.name,
        website: business.website,
        phone: business.phone,
        email: null, // Will enrich later
        industry: params.niche,
        city: business.city,
        state: business.state,
        google_place_id: business.googlePlaceId,
        google_rating: business.rating,
        google_reviews: business.reviewCount,
        lead_score: initialScore,
        stage: 'discovered',
        audit_data: business.signals || null,
      })
      .select()
      .single();
    
    if (error) {
      await ctx.log('warn', `Failed to store lead ${business.name}: ${error.message}`);
    } else {
      leadUUIDs.push(data.id);
    }
  }
  
  await ctx.log('info', `Stored ${leadUUIDs.length} leads in Supabase`);
  
  // ==========================================================================
  // STEP 3: Audit Top Leads (Existing Workflow)
  // ==========================================================================
  runner.updateStep(ctx.jobId, 3, `Auditing top ${params.auditTop} leads`, 6);
  
  const businessesToAudit = businesses
    .filter(b => b.website)
    .slice(0, params.auditTop);
  
  let auditsCompleted = 0;
  
  for (let i = 0; i < businessesToAudit.length; i++) {
    const business = businessesToAudit[i];
    
    await ctx.log('info', `Auditing ${business.name} (${i + 1}/${businessesToAudit.length})`);
    
    try {
      // Call existing audit workflow
      const auditJob = await runner.execute('audit-website', {
        url: business.website,
        businessName: business.name,
        locations: [{
          city: business.city || '',
          state: business.state || '',
          serviceArea: `${business.city}, ${business.state}`,
        }],
      }, {
        tenantId: ctx.tenantId,
        tier: 'pro',
      });
      
      if (auditJob.status === 'completed' && auditJob.output) {
        totalCost += auditJob.actualCostUsd;
        auditsCompleted++;
        
        // Calculate GEO/AEO scores from audit
        const auditOutput = auditJob.output as any;
        const geoScore = auditOutput.scores?.seo || 0;
        const aeoScore = auditOutput.scores?.aiVisibility || 0;
        const overallScore = Math.round((geoScore + aeoScore) / 2 * 10); // Convert to 0-100
        
        // Update lead in Supabase
        await supabase
          .from('crm.leads')
          .update({
            lead_score: Math.max(overallScore, 50), // Minimum 50 if has website
            geo_readiness_score: geoScore,
            aeo_readiness_score: aeoScore,
            audit_data: auditOutput,
            stage: 'qualified',
          })
          .eq('website', business.website);
        
        await ctx.log('info', `Audit complete. Score: ${overallScore}/100. Cost: $${auditJob.actualCostUsd.toFixed(4)}`);
      }
    } catch (error) {
      await ctx.log('warn', `Audit failed for ${business.name}: ${error}`);
    }
  }
  
  // ==========================================================================
  // STEP 4: Enrich Contact Info (Existing Workflow)
  // ==========================================================================
  runner.updateStep(ctx.jobId, 4, 'Enriching contact data', 6);
  
  // Get top scored leads
  const { data: topLeads } = await supabase
    .from('crm.leads')
    .select('id, company_name, website')
    .order('lead_score', { ascending: false })
    .limit(params.auditTop);
  
  if (topLeads) {
    for (const lead of topLeads) {
      if (!lead.website) continue;
      
      try {
        const enrichJob = await runner.execute('enrich-contact', {
          businessName: lead.company_name,
          website: lead.website,
        }, {
          tenantId: ctx.tenantId,
          tier: 'pro',
        });
        
        if (enrichJob.status === 'completed' && enrichJob.output) {
          totalCost += enrichJob.actualCostUsd;
          
          const contactData = enrichJob.output as any;
          
          // Update lead with contact info
          await supabase
            .from('crm.leads')
            .update({
              email: contactData.email || null,
              contact_data: contactData,
            })
            .eq('id', lead.id);
        }
      } catch (error) {
        await ctx.log('warn', `Enrichment failed for ${lead.company_name}`);
      }
    }
  }
  
  // ==========================================================================
  // STEP 5: Generate Outreach Emails (if enabled)
  // ==========================================================================
  runner.updateStep(ctx.jobId, 5, 'Generating outreach emails', 6);
  
  let emailsGenerated = 0;
  
  if (params.generateEmails) {
    // Get qualified leads with email
    const { data: qualifiedLeads } = await supabase
      .from('crm.leads')
      .select('*')
      .eq('stage', 'qualified')
      .not('email', 'is', null)
      .order('lead_score', { ascending: false })
      .limit(params.auditTop);
    
    if (qualifiedLeads) {
      for (const lead of qualifiedLeads) {
        // Generate personalized email based on audit
        const auditData = lead.audit_data || {};
        const geoScore = lead.geo_readiness_score || 0;
        
        const subject = geoScore < 5 
          ? `Quick question about ${lead.company_name}'s online visibility`
          : `Opportunity to improve ${lead.company_name}'s AI search rankings`;
        
        const body = `Hi there,

I noticed ${lead.company_name} while researching ${params.niche} businesses in ${params.location}.

${geoScore < 5 
  ? `I ran a quick analysis and found your website could be ranking much better in AI-powered search engines like ChatGPT and Perplexity.`
  : `Your online presence looks solid, but I found some opportunities to get your business featured more prominently in AI search results.`}

We specialize in GEO (Generative Engine Optimization) - helping businesses like yours show up when potential customers ask ChatGPT or Perplexity for recommendations.

Would you be open to a quick 15-minute call this week to review what I found?

Best regards`;

        // Store email in campaigns table
        const { data: emailRecord, error } = await supabase
          .from('crm.email_campaigns')
          .insert({
            lead_id: lead.id,
            campaign_type: 'cold_outreach',
            subject,
            body,
            template_name: 'geo_cold_outreach_v1',
            approval_status: 'pending',
          })
          .select()
          .single();
        
        if (!error && emailRecord) {
          // Add to approval queue
          await supabase
            .from('platform.approvals_queue')
            .insert({
              approval_type: 'email',
              reference_table: 'crm.email_campaigns',
              reference_id: emailRecord.id,
              client_id: null, // Still a lead
              preview_title: `Email to ${lead.company_name}`,
              preview_data: {
                to: lead.email,
                subject,
                body: body.substring(0, 200) + '...',
                lead_score: lead.lead_score,
              },
              created_by_agent: 'sdr',
              priority: Math.round((lead.lead_score || 0) / 10), // Higher score = higher priority
            });
          
          emailsGenerated++;
        }
      }
    }
  }
  
  // ==========================================================================
  // STEP 6: Summary
  // ==========================================================================
  runner.updateStep(ctx.jobId, 6, 'Pipeline complete', 6);
  
  await ctx.log('info', `Pipeline complete. Total cost: $${totalCost.toFixed(4)}`);
  
  return {
    leadsDiscovered: businesses.length,
    leadsStored: leadUUIDs.length,
    leadsAudited: auditsCompleted,
    emailsGenerated,
    emailsPendingApproval: emailsGenerated,
    totalCostUsd: totalCost,
    leadsInSupabase: leadUUIDs,
  };
}

// Register the workflow
runner.registerWorkflow('sdr-pipeline', sdrPipelineHandler);

export { sdrPipelineHandler, SDRPipelineInput, SDRPipelineOutput };
