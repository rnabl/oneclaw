/**
 * Full SDR Pipeline - Geographic Discovery (Google Maps)
 * 
 * Long-form durable workflow that orchestrates:
 * 1. Discover businesses via Google Maps
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

const FullSDRPipelineGeoInput = z.object({
  niche: z.string().describe('Business niche (e.g., "HVAC companies")'),
  city: z.string(),
  state: z.string(),
  service: z.string().optional().describe('Service for AI ranking (e.g., "AC repair")'),
  limit: z.number().default(100),
  checkAIRankings: z.boolean().default(true),
  storeInSupabase: z.boolean().default(true),
});

type FullSDRPipelineGeoInput = z.infer<typeof FullSDRPipelineGeoInput>;

const FullSDRPipelineGeoOutput = z.object({
  summary: z.object({
    businesses_discovered: z.number(),
    businesses_with_websites: z.number(),
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

type FullSDRPipelineGeoOutput = z.infer<typeof FullSDRPipelineGeoOutput>;

async function fullSDRPipelineGeoHandler(
  ctx: StepContext,
  input: Record<string, unknown>
): Promise<FullSDRPipelineGeoOutput> {
  const params = FullSDRPipelineGeoInput.parse(input);
  
  const costs = { discovery: 0, ai_rankings: 0, total: 0 };
  const location = `${params.city}, ${params.state}`;
  
  await ctx.log('info', `🚀 Starting Full SDR Pipeline (Geographic): ${params.niche} in ${location}`);
  
  // ==========================================================================
  // STEP 1: Discover Businesses via Google Maps
  // ==========================================================================
  runner.updateStep(ctx.jobId, 1, 'Discovering businesses via Google Maps', 4);
  
  const discoveryJob = await runner.execute('discover-businesses', {
    niche: params.niche,
    location,
    limit: params.limit,
    enrich: true,
  }, {
    tenantId: ctx.tenantId,
    tier: 'pro',
  });
  
  if (discoveryJob.status !== 'completed' || !discoveryJob.output) {
    throw new Error('Discovery workflow failed');
  }
  
  const businesses = discoveryJob.output.businesses as any[];
  costs.discovery = discoveryJob.actualCostUsd;
  
  await ctx.log('info', `✅ Step 1 complete: ${businesses.length} businesses discovered`);
  await ctx.saveArtifact('businesses_discovered', businesses, 'business_list');
  
  // ==========================================================================
  // STEP 2: Check AI Rankings (Optional)
  // ==========================================================================
  let aiRankingsResult: any = null;
  let visibilityResult: any = null;
  
  if (params.checkAIRankings) {
    runner.updateStep(ctx.jobId, 2, 'Checking AI search rankings', 4);
    
    const rankingsJob = await runner.execute('check-ai-rankings', {
      niche: params.niche,
      city: params.city,
      state: params.state,
      service: params.service,
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
    runner.updateStep(ctx.jobId, 4, 'Storing leads in Supabase', 4);
    
    const supabase = createClient(
      process.env.SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );
    
    const leadRecords = businesses.map(b => {
      const signals = b.signals || {};
      let score = 50;
      
      if (b.website) score += 20;
      if (signals.hasAds) score += 10;
      if (b.aiVisibility?.visible) score += 15;
      else score += 10; // Invisible = opportunity
      
      return {
        company_name: b.name,
        website: b.website,
        phone: b.phone,
        industry: params.niche,
        address: b.address,
        city: b.city,
        state: b.state,
        zip_code: b.zipCode,
        google_place_id: b.googlePlaceId,
        google_rating: b.rating,
        google_reviews: b.reviewCount,
        website_signals: signals,
        lead_score: Math.min(score, 100),
        geo_readiness_score: signals.seoOptimized ? 7.0 : 3.0,
        aeo_readiness_score: b.aiVisibility?.aeoScore || 3.0,
        stage: 'discovered',
        source_job_id: ctx.jobId,
        source_type: 'google_maps' as const,
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
      await ctx.log('info', `✅ Step 4 complete: ${stored.length} leads stored`);
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
      ai_visible: visibilityResult?.summary.visible,
      ai_invisible: visibilityResult?.summary.invisible,
      stored_in_db: leadIds.length || undefined,
    },
    costs,
    lead_ids: leadIds.length > 0 ? leadIds : undefined,
  };
}

runner.registerWorkflow('full-sdr-pipeline-geo', fullSDRPipelineGeoHandler);

export { fullSDRPipelineGeoHandler, FullSDRPipelineGeoInput, FullSDRPipelineGeoOutput };
