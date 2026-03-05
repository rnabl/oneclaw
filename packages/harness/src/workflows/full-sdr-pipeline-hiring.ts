/**
 * Full SDR Pipeline - Hiring Signal Discovery (Job Postings)
 * 
 * Long-form durable workflow that orchestrates:
 * 1. Discover hiring businesses via job postings
 * 2. Check AI rankings (optional)
 * 3. Match visibility
 * 4. Store in Supabase
 * 
 * Durable: Each step is checkpointed, can resume from failure.
 * Modular: Composes small workflows instead of doing everything inline.
 */

import type { StepContext } from '../execution/runner';
import { runner } from '../execution/runner';
import { z } from 'zod';
import { createClient } from '@supabase/supabase-js';

const FullSDRPipelineHiringInput = z.object({
  keyword: z.string().describe('Job keyword (e.g., "HVAC technician")'),
  city: z.string(),
  state: z.string(),
  service: z.string().optional().describe('Service for AI ranking (e.g., "HVAC services")'),
  days: z.number().default(30).describe('Job posting recency in days'),
  maxResults: z.number().default(100),
  checkAIRankings: z.boolean().default(true),
  storeInSupabase: z.boolean().default(true),
});

type FullSDRPipelineHiringInput = z.infer<typeof FullSDRPipelineHiringInput>;

const FullSDRPipelineHiringOutput = z.object({
  summary: z.object({
    businesses_discovered: z.number(),
    businesses_with_websites: z.number(),
    total_job_postings: z.number(),
    ai_visible: z.number().optional(),
    ai_invisible: z.number().optional(),
    stored_in_db: z.number().optional(),
  }),
  costs: z.object({
    discovery: z.number(),
    ai_rankings: z.number(),
    total: z.number(),
  }),
  lead_ids: z.array(z.string()).optional(),
});

type FullSDRPipelineHiringOutput = z.infer<typeof FullSDRPipelineHiringOutput>;

async function fullSDRPipelineHiringHandler(
  ctx: StepContext,
  input: Record<string, unknown>
): Promise<FullSDRPipelineHiringOutput> {
  const params = FullSDRPipelineHiringInput.parse(input);
  
  const costs = { discovery: 0, ai_rankings: 0, total: 0 };
  const location = `${params.city}, ${params.state}`;
  
  await ctx.log('info', `🚀 Starting Full SDR Pipeline (Hiring Signal): ${params.keyword} in ${location}`);
  
  // ==========================================================================
  // STEP 1: Discover Hiring Businesses via Job Postings
  // ==========================================================================
  runner.updateStep(ctx.jobId, 1, 'Discovering hiring businesses', 4);
  
  const discoveryJob = await runner.execute('discover-hiring-businesses', {
    keyword: params.keyword,
    location,
    days: params.days,
    maxResults: params.maxResults,
    enrich: true,
  }, {
    tenantId: ctx.tenantId,
    tier: 'pro',
  });
  
  if (discoveryJob.status !== 'completed' || !discoveryJob.output) {
    throw new Error('Hiring discovery workflow failed');
  }
  
  const businesses = discoveryJob.output.businesses as any[];
  const totalJobPostings = businesses.reduce((sum, b) => sum + (b.signals?.totalJobPostings || 0), 0);
  costs.discovery = discoveryJob.actualCostUsd;
  
  await ctx.log('info', `✅ Step 1 complete: ${businesses.length} hiring businesses, ${totalJobPostings} job postings`);
  await ctx.saveArtifact('businesses_discovered', businesses, 'business_list');
  
  // ==========================================================================
  // STEP 2: Check AI Rankings (Optional)
  // ==========================================================================
  let aiRankingsResult: any = null;
  let visibilityResult: any = null;
  
  if (params.checkAIRankings) {
    runner.updateStep(ctx.jobId, 2, 'Checking AI search rankings', 4);
    
    // Infer service from keyword if not provided
    const servicePhrase = params.service || params.keyword.replace(/ technician| installer| contractor/i, '');
    
    const rankingsJob = await runner.execute('check-ai-rankings', {
      niche: servicePhrase,
      city: params.city,
      state: params.state,
      service: servicePhrase,
    }, {
      tenantId: ctx.tenantId,
      tier: 'pro',
    });
    
    if (rankingsJob.status === 'completed' && rankingsJob.output) {
      aiRankingsResult = rankingsJob.output;
      costs.ai_rankings = rankingsJob.actualCostUsd;
      
      await ctx.log('info', `✅ Step 2 complete: ${aiRankingsResult.total_businesses_mentioned} businesses in AI results`);
      await ctx.saveArtifact('ai_rankings', aiRankingsResult, 'ai_rankings');
      
      // ==========================================================================
      // STEP 3: Match AI Visibility
      // ==========================================================================
      runner.updateStep(ctx.jobId, 3, 'Matching businesses against AI results', 4);
      
      const matchJob = await runner.execute('match-ai-visibility', {
        businesses: businesses.map(b => ({ name: b.name, website: b.website })),
        aiRankings: aiRankingsResult,
      }, {
        tenantId: ctx.tenantId,
        tier: 'pro',
      });
      
      if (matchJob.status === 'completed' && matchJob.output) {
        visibilityResult = matchJob.output;
        
        // Merge visibility data back into businesses
        for (const business of businesses) {
          const match = visibilityResult.matched.find((m: any) => m.business_name === business.name);
          if (match) {
            business.aiVisibility = {
              visible: match.ai_visible,
              position: match.ai_position,
              aeoScore: match.aeo_score,
            };
          }
        }
        
        await ctx.log('info', `✅ Step 3 complete: ${visibilityResult.summary.visible} visible, ${visibilityResult.summary.invisible} invisible`);
        await ctx.saveArtifact('visibility_results', visibilityResult, 'visibility');
      }
    }
  }
  
  // ==========================================================================
  // STEP 4: Store in Supabase (Optional)
  // ==========================================================================
  let leadIds: string[] = [];
  
  if (params.storeInSupabase) {
    runner.updateStep(ctx.jobId, 4, 'Storing hiring leads in Supabase', 4);
    
    const supabase = createClient(
      process.env.SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );
    
    const leadRecords = businesses.map(b => {
      const signals = b.signals || {};
      let score = 60; // Base score higher for hiring businesses
      
      if (b.website) score += 20;
      if (signals.hiringIntensity === 'high') score += 15;
      else if (signals.hiringIntensity === 'medium') score += 10;
      if (b.aiVisibility?.visible) score += 10;
      
      return {
        company_name: b.name,
        website: b.website,
        phone: b.phone,
        industry: params.keyword,
        address: b.address,
        city: b.city,
        state: b.state,
        zip_code: b.zipCode,
        website_signals: signals,
        lead_score: Math.min(score, 100),
        geo_readiness_score: signals.seoOptimized ? 7.0 : 3.0,
        aeo_readiness_score: b.aiVisibility?.aeoScore || 3.0,
        stage: 'discovered',
        source_job_id: ctx.jobId,
        source_type: 'job_posting' as const,
        source_metadata: {
          hiring_signal: {
            is_hiring: true,
            total_postings: signals.totalJobPostings,
            roles: signals.hiringRoles,
            intensity: signals.hiringIntensity,
          },
          business_type: b.businessType,
          business_description: b.businessDescription,
          job_postings: b.jobPostings,
        },
        audit_data: {
          signals,
          aiVisibility: b.aiVisibility,
          discoveredAt: new Date().toISOString(),
        },
      };
    });
    
    const { data: stored, error } = await supabase
      .schema('crm')
      .from('leads')
      .insert(leadRecords)
      .select('id');
    
    if (error) {
      await ctx.log('warn', `Storage failed: ${error.message}`);
    } else if (stored) {
      leadIds = stored.map(l => l.id);
      await ctx.log('info', `✅ Step 4 complete: ${stored.length} hiring leads stored`);
    }
  }
  
  // ==========================================================================
  // Final Summary
  // ==========================================================================
  costs.total = costs.discovery + costs.ai_rankings;
  
  await ctx.log('info', `🎉 Pipeline complete! Total cost: $${costs.total.toFixed(4)}`);
  
  return {
    summary: {
      businesses_discovered: businesses.length,
      businesses_with_websites: businesses.filter(b => b.website).length,
      total_job_postings: totalJobPostings,
      ai_visible: visibilityResult?.summary.visible,
      ai_invisible: visibilityResult?.summary.invisible,
      stored_in_db: leadIds.length || undefined,
    },
    costs,
    lead_ids: leadIds.length > 0 ? leadIds : undefined,
  };
}

runner.registerWorkflow('full-sdr-pipeline-hiring', fullSDRPipelineHiringHandler);

export { fullSDRPipelineHiringHandler, FullSDRPipelineHiringInput, FullSDRPipelineHiringOutput };
