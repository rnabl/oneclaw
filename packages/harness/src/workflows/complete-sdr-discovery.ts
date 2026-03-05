/**
 * Complete SDR Discovery Workflow
 * 
 * Full pipeline with all steps:
 * 1. Discover businesses (Apify Leads Finder)
 * 2. Website scan (captures signals - FREE)
 * 3. CMO analysis (deep insights - $0.05 each)
 * 4. AI rankings check (one query per city)
 * 5. Match businesses against AI results
 * 6. Store in Supabase with all data
 * 7. Generate personalized emails based on AI visibility
 */

import type { StepContext } from '../execution/runner';
import { runner } from '../execution/runner';
import { z } from 'zod';
import { createClient } from '@supabase/supabase-js';
// import { suggestWorkflows, WORKFLOW_REGISTRY } from './registry'; // TODO: Re-enable when file exists

const CompleteSDRDiscoveryInput = z.object({
  // Discovery method selection
  method: z.enum(['discover-businesses', 'discover-hiring-businesses', 'auto']).default('auto')
    .describe('Which discovery workflow to use. "auto" = LLM selects based on intent'),
  
  // Discovery params
  niche: z.string().optional().describe('Business niche (for Google Maps discovery)'),
  keyword: z.string().optional().describe('Job title keyword (for hiring discovery)'),
  city: z.string(),
  state: z.string(),
  service: z.string().optional().describe('Specific service (e.g., "AC repair", "Botox")'),
  limit: z.number().default(100),
  
  // Analysis options
  runCMOAnalysis: z.boolean().default(false).describe('Run expensive CMO analysis ($0.05 each)'),
  checkAIRankings: z.boolean().default(true).describe('Check AI search visibility'),
});

type CompleteSDRDiscoveryInput = z.infer<typeof CompleteSDRDiscoveryInput>;

const CompleteSDRDiscoveryOutput = z.object({
  summary: z.object({
    businessesDiscovered: z.number(),
    businessesScanned: z.number(),
    businessesAnalyzed: z.number(),
    businessesMentionedInAI: z.number(),
    businessesInvisibleToAI: z.number(),
    totalCostUsd: z.number(),
  }),
  costs: z.object({
    discovery: z.number(),
    scanning: z.number(),
    cmoAnalysis: z.number(),
    aiRankings: z.number(),
  }),
  aiRankings: z.object({
    query: z.string(),
    topBusinesses: z.array(z.string()),
  }).optional(),
  leadsStoredInSupabase: z.array(z.string()),
});

type CompleteSDRDiscoveryOutput = z.infer<typeof CompleteSDRDiscoveryOutput>;

function getSupabaseClient() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Supabase not configured');
  return createClient(url, key);
}

async function completeSDRDiscoveryHandler(
  ctx: StepContext,
  input: Record<string, unknown>
): Promise<CompleteSDRDiscoveryOutput> {
  const params = CompleteSDRDiscoveryInput.parse(input);
  
  const costs = {
    discovery: 0,
    scanning: 0,
    cmoAnalysis: 0,
    aiRankings: 0,
  };
  
  const location = `${params.city}, ${params.state}`;
  
  await ctx.log('info', `Starting complete SDR discovery: ${params.niche || params.keyword} in ${location}`);
  
  // ==========================================================================
  // STEP 0: Select Discovery Method (if auto)
  // ==========================================================================
  let selectedMethod = params.method;
  
  if (selectedMethod === 'auto') {
    await ctx.log('info', 'Auto-selecting discovery method based on params...');
    
    // Use hiring discovery if keyword provided
    if (params.keyword) {
      selectedMethod = 'discover-hiring-businesses';
      await ctx.log('info', `Selected: Hiring-based discovery (keyword: "${params.keyword}")`);
    } 
    // Default to Google Maps if niche provided
    else if (params.niche) {
      selectedMethod = 'discover-businesses';
      await ctx.log('info', `Selected: Geographic discovery (niche: "${params.niche}")`);
    }
    else {
      throw new Error('Must provide either niche (for Google Maps) or keyword (for hiring discovery)');
    }
  }
  
  const methodMetadata = WORKFLOW_REGISTRY[selectedMethod];
  if (methodMetadata) {
    await ctx.log('info', `Using: ${methodMetadata.name}`);
    await ctx.log('info', `Expected: ~${methodMetadata.benchmarks.avgLeadsFound} leads, $${methodMetadata.estimatedCostPer100.toFixed(2)} per 100`);
  }
  
  // ==========================================================================
  // STEP 1: Discover Businesses (using selected method)
  // ==========================================================================
  runner.updateStep(ctx.jobId, 1, `Discovering businesses via ${selectedMethod}`, 6);
  
  // Build method-specific params
  const discoveryParams: Record<string, unknown> = {
    location,
    limit: params.limit,
    enrich: true, // Enable website scanner for both methods
  };
  
  if (selectedMethod === 'discover-businesses') {
    if (!params.niche) throw new Error('niche required for Google Maps discovery');
    discoveryParams.niche = params.niche;
  } else if (selectedMethod === 'discover-hiring-businesses') {
    if (!params.keyword) throw new Error('keyword required for hiring discovery');
    discoveryParams.keyword = params.keyword;
  }
  
  const discoveryJob = await runner.execute(selectedMethod, discoveryParams, {
    tenantId: ctx.tenantId,
    tier: 'pro',
  });
  
  if (discoveryJob.status !== 'completed' || !discoveryJob.output) {
    throw new Error('Discovery failed');
  }
  
  const businesses = discoveryJob.output.businesses as any[];
  costs.discovery = discoveryJob.actualCostUsd;
  costs.scanning = 0; // Website scanner is FREE (included in discovery)
  
  await ctx.log('info', `✅ Found ${businesses.length} businesses with signals. Cost: $${costs.discovery.toFixed(4)}`);
  
  // ==========================================================================
  // STEP 2: CMO Analysis (Optional - Expensive)
  // ==========================================================================
  
  let analyzedCount = 0;
  
  if (params.runCMOAnalysis) {
    runner.updateStep(ctx.jobId, 2, 'Running CMO-level analysis', 6);
    
    const businessesToAnalyze = businesses
      .filter(b => b.website)
      .slice(0, Math.min(10, businesses.length)); // Max 10 to control cost
    
    for (const business of businessesToAnalyze) {
      try {
        const analysisJob = await runner.execute('analyze-business', {
          website: business.website,
          businessName: business.name,
          type: 'opportunity_analysis',
        }, {
          tenantId: ctx.tenantId,
          tier: 'pro',
        });
        
        if (analysisJob.status === 'completed' && analysisJob.output) {
          costs.cmoAnalysis += analysisJob.actualCostUsd;
          
          // Store analysis in audit_data
          business.cmoAnalysis = analysisJob.output;
          analyzedCount++;
        }
      } catch (error) {
        await ctx.log('warn', `CMO analysis failed for ${business.name}`);
      }
    }
    
    await ctx.log('info', `✅ CMO analysis complete for ${analyzedCount} businesses. Cost: $${costs.cmoAnalysis.toFixed(4)}`);
  }
  
  // ==========================================================================
  // STEP 3: Check AI Rankings (ONE query for all businesses)
  // ==========================================================================
  
  let aiRankingsData: any = null;
  
  if (params.checkAIRankings) {
    runner.updateStep(ctx.jobId, 3, 'Checking AI search rankings', 6);
    
    const servicePhrase = params.service || 'service';
    
    const rankingsJob = await runner.execute('check-ai-rankings', {
      niche: params.niche,
      city: params.city,
      state: params.state,
      service: servicePhrase,
    }, {
      tenantId: ctx.tenantId,
      tier: 'pro',
    });
    
    if (rankingsJob.status === 'completed' && rankingsJob.output) {
      aiRankingsData = rankingsJob.output;
      costs.aiRankings = rankingsJob.actualCostUsd;
      
      await ctx.log('info', `✅ AI rankings: ${aiRankingsData.total_businesses_mentioned} businesses mentioned. Cost: $${costs.aiRankings.toFixed(4)}`);
    }
  }
  
  // ==========================================================================
  // STEP 4: Match Businesses Against AI Results
  // ==========================================================================
  
  runner.updateStep(ctx.jobId, 4, 'Matching businesses against AI rankings', 6);
  
  let mentionedCount = 0;
  let invisibleCount = 0;
  
  for (const business of businesses) {
    // Check if this business was mentioned in AI results
    let mentioned = false;
    let position: number | null = null;
    
    if (aiRankingsData && aiRankingsData.top_businesses) {
      const match = aiRankingsData.top_businesses.find((b: any) =>
        b.name.toLowerCase().includes(business.name.toLowerCase()) ||
        business.name.toLowerCase().includes(b.name.toLowerCase())
      );
      
      if (match) {
        mentioned = true;
        position = match.position;
        mentionedCount++;
      } else {
        invisibleCount++;
      }
    }
    
    // Add AI visibility data to business object
    business.aiVisibility = {
      mentioned,
      position,
      query: aiRankingsData?.query,
      aiEngine: 'perplexity',
    };
    
    // Update AEO score based on AI visibility
    if (mentioned && position !== null) {
      business.aeoScore = position <= 3 ? 9.0 : position <= 10 ? 6.0 : 4.0;
    } else {
      business.aeoScore = business.signals?.aiReadable ? 3.0 : 1.0;
    }
  }
  
  await ctx.log('info', `✅ Matching complete: ${mentionedCount} mentioned in AI, ${invisibleCount} invisible`);
  
  // ==========================================================================
  // STEP 5: Store in Supabase (with AI visibility data)
  // ==========================================================================
  
  runner.updateStep(ctx.jobId, 5, 'Storing in Supabase with AI visibility', 6);
  
  const supabase = getSupabaseClient();
  const leadUUIDs: string[] = [];
  
  // Store leads
  const leadRecords = businesses.map(b => {
    const signals = b.signals || {};
    
    // Calculate lead score
    let score = 50;
    if (b.website) score += 20;
    if (signals.hasAds) score += 10;
    if (b.aiVisibility?.mentioned) score += 15; // In AI = valuable
    else score += 10; // Not in AI = opportunity
    if (b.reviewCount && b.reviewCount > 20) score += 5;
    
    return {
      company_name: b.name,
      website: b.website,
      phone: b.phone,
      email: b.email,
      owner_name: b.ownerName,
      industry: params.niche,
      address: b.address,
      city: b.city,
      state: b.state,
      zip_code: b.zipCode,
      google_place_id: b.googlePlaceId,
      google_rating: b.rating,
      google_reviews: b.reviewCount,
      google_maps_url: b.googleMapsUrl,
      image_url: b.imageUrl,
      website_signals: signals,
      lead_score: Math.min(score, 100),
      geo_readiness_score: signals.seoOptimized ? 7.0 : 3.0,
      aeo_readiness_score: b.aeoScore || 3.0,
      stage: 'discovered',
      source_job_id: ctx.jobId,
      audit_data: {
        signals,
        aiVisibility: b.aiVisibility,
        cmoAnalysis: b.cmoAnalysis,
        scannedAt: new Date().toISOString(),
      },
    };
  });
  
  const { data: storedLeads, error: leadsError } = await supabase
    .schema('crm')
    .from('leads')
    .insert(leadRecords)
    .select('id, company_name');
  
  if (leadsError) {
    throw new Error(`Failed to store leads: ${leadsError.message}`);
  }
  
  if (storedLeads) {
    leadUUIDs.push(...storedLeads.map(l => l.id));
  }
  
  await ctx.log('info', `✅ Stored ${storedLeads?.length || 0} leads in Supabase`);
  
  // ==========================================================================
  // STEP 6: Store AI Visibility Tracking
  // ==========================================================================
  
  runner.updateStep(ctx.jobId, 6, 'Recording AI visibility data', 6);
  
  const visibilityRecords = businesses
    .filter(b => b.aiVisibility)
    .map((b, idx) => ({
      client_id: null,
      test_query: aiRankingsData?.query,
      query_category: 'service_search',
      ai_engine: 'perplexity',
      brand_mentioned: b.aiVisibility.mentioned,
      citation_position: b.aiVisibility.position,
      citation_snippet: null,
      competitors_mentioned: aiRankingsData?.top_businesses?.map((tb: any) => tb.name) || [],
    }));
  
  if (visibilityRecords.length > 0) {
    const { error: visError } = await supabase
      .schema('analytics')
      .from('ai_visibility_tracking')
      .insert(visibilityRecords);
    
    if (visError) {
      await ctx.log('warn', `Failed to store visibility data: ${visError.message}`);
    } else {
      await ctx.log('info', `✅ Stored ${visibilityRecords.length} AI visibility records`);
    }
  }
  
  // ==========================================================================
  // Summary
  // ==========================================================================
  
  const totalCost = costs.discovery + costs.scanning + costs.cmoAnalysis + costs.aiRankings;
  
  await ctx.log('info', `Complete! Total cost: $${totalCost.toFixed(4)}`);
  
  return {
    summary: {
      businessesDiscovered: businesses.length,
      businessesScanned: businesses.filter(b => b.signals).length,
      businessesAnalyzed: analyzedCount,
      businessesMentionedInAI: mentionedCount,
      businessesInvisibleToAI: invisibleCount,
      totalCostUsd: totalCost,
    },
    costs,
    aiRankings: aiRankingsData ? {
      query: aiRankingsData.query,
      topBusinesses: aiRankingsData.top_businesses?.map((b: any) => b.name) || [],
    } : undefined,
    leadsStoredInSupabase: leadUUIDs,
  };
}

runner.registerWorkflow('complete-sdr-discovery', completeSDRDiscoveryHandler);

export { completeSDRDiscoveryHandler, CompleteSDRDiscoveryInput, CompleteSDRDiscoveryOutput };
