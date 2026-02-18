/**
 * Analysis Workflow
 * 
 * Calls your nabl Python analysis service (analysis.py)
 * for Quick Intelligence and Opportunity Analysis.
 */

import { z } from 'zod';
import type { StepContext } from '../execution/runner';
import { runner } from '../execution/runner';
import { artifactStore } from '../artifacts';
import { registry } from '../registry';

// =============================================================================
// CONFIGURATION
// =============================================================================

const NABL_ANALYSIS_URL = process.env.NABL_ANALYSIS_URL || process.env.NABL_AUDIT_URL || 'http://localhost:8001';
const NABL_API_SECRET = process.env.NABL_API_SECRET || process.env.API_SECRET || '';

// =============================================================================
// SCHEMAS
// =============================================================================

const AnalysisInput = z.object({
  businessId: z.string().uuid(),
  type: z.enum(['quick_intelligence', 'opportunity_analysis']),
});
type AnalysisInput = z.infer<typeof AnalysisInput>;

const InsightSchema = z.object({
  type: z.enum(['opportunity', 'strength', 'weakness', 'recommendation']),
  dimension: z.string(),
  title: z.string(),
  description: z.string(),
  priority: z.enum(['high', 'medium', 'low']),
});

const AnalysisOutput = z.object({
  id: z.string(),
  businessId: z.string(),
  type: z.string(),
  overallScore: z.number().min(0).max(100),
  dimensionScores: z.object({
    websiteQuality: z.number(),
    localSeo: z.number(),
    adPresence: z.number(),
    socialEngagement: z.number(),
  }),
  summary: z.string(),
  insights: z.array(InsightSchema),
  analyzedAt: z.string(),
});
type AnalysisOutput = z.infer<typeof AnalysisOutput>;

// =============================================================================
// REGISTER TOOL
// =============================================================================

registry.register({
  id: 'analyze-business',
  name: 'Business Analysis',
  description: 'AI-powered business analysis including Quick Intelligence and Opportunity Analysis',
  version: '1.0.0',
  inputSchema: AnalysisInput,
  outputSchema: AnalysisOutput,
  requiredSecrets: [],  // Uses platform OpenAI key
  networkPolicy: {
    allowedDomains: ['*.supabase.co', 'api.openai.com'],
    blockedDomains: [],
    allowLocalhost: true,
  },
  costClass: 'medium',
  estimatedCostUsd: 0.05,  // LLM cost for analysis
  retryPolicy: {
    maxAttempts: 2,
    backoffMs: 3000,
    backoffMultiplier: 2,
    retryableErrors: ['TIMEOUT', 'SERVICE_UNAVAILABLE'],
  },
  timeoutMs: 60000,  // 1 minute
  idempotent: true,
  isPublic: false,
  tags: ['analysis', 'ai', 'scoring'],
  createdAt: new Date(),
  updatedAt: new Date(),
});

// =============================================================================
// WORKFLOW HANDLER
// =============================================================================

async function analysisWorkflowHandler(
  ctx: StepContext,
  input: Record<string, unknown>
): Promise<AnalysisOutput> {
  const params = input as AnalysisInput;
  const { businessId, type } = params;
  
  await ctx.log('info', `Starting ${type} analysis for business ${businessId}`);
  
  // ==========================================================================
  // STEP 1: Call nabl analysis service
  // ==========================================================================
  runner.updateStep(ctx.jobId, 1, `Running ${type}`, 2);
  
  const startTime = Date.now();
  
  let result: any;
  
  try {
    const response = await fetch(`${NABL_ANALYSIS_URL}/api/analyze`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${NABL_API_SECRET}`,
      },
      body: JSON.stringify({
        business_id: businessId,
        type: type,
      }),
    });
    
    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Analysis service error: ${response.status} - ${error}`);
    }
    
    result = await response.json();
    
  } catch (error) {
    await ctx.log('error', 'Analysis service call failed', { error: String(error) });
    
    // Mock result for development
    if (NABL_ANALYSIS_URL.includes('localhost') || !NABL_API_SECRET) {
      await ctx.log('warn', 'Using mock analysis result');
      result = generateMockAnalysis(businessId, type);
    } else {
      throw error;
    }
  }
  
  const duration = Date.now() - startTime;
  await ctx.log('info', `Analysis completed in ${duration}ms`);
  
  // ==========================================================================
  // STEP 2: Record costs and store artifacts
  // ==========================================================================
  runner.updateStep(ctx.jobId, 2, 'Finalizing', 2);
  
  // Record LLM token usage (approximate)
  // Quick intelligence ~500 tokens, opportunity analysis ~2000 tokens
  const tokenEstimate = type === 'quick_intelligence' ? 500 : 2000;
  ctx.recordApiCall('openai', 'gpt4o_mini_input', Math.floor(tokenEstimate * 0.7));
  ctx.recordApiCall('openai', 'gpt4o_mini_output', Math.floor(tokenEstimate * 0.3));
  
  // Store the analysis result
  await artifactStore.storeLog(
    ctx.jobId,
    2,
    'Analysis result',
    'info',
    `${type} completed with score ${result.overall_score}`,
    { 
      overallScore: result.overall_score,
      insightCount: result.insights?.length || 0,
    }
  );
  
  // Transform to output format
  const output: AnalysisOutput = {
    id: result.id || ctx.jobId,
    businessId,
    type,
    overallScore: result.overall_score || 0,
    dimensionScores: {
      websiteQuality: result.dimension_scores?.website_quality || 50,
      localSeo: result.dimension_scores?.local_seo || 50,
      adPresence: result.dimension_scores?.ad_presence || 50,
      socialEngagement: result.dimension_scores?.social_engagement || 50,
    },
    summary: result.summary || '',
    insights: (result.insights || []).map((i: any) => ({
      type: i.type,
      dimension: i.dimension,
      title: i.title,
      description: i.description,
      priority: i.priority,
    })),
    analyzedAt: new Date().toISOString(),
  };
  
  return output;
}

// =============================================================================
// HELPERS
// =============================================================================

function generateMockAnalysis(businessId: string, type: string) {
  const score = Math.floor(Math.random() * 40) + 40;  // 40-80 range
  
  return {
    id: `mock-${Date.now()}`,
    overall_score: score,
    dimension_scores: {
      website_quality: Math.floor(Math.random() * 30) + 50,
      local_seo: Math.floor(Math.random() * 30) + 40,
      ad_presence: Math.floor(Math.random() * 30) + 35,
      social_engagement: Math.floor(Math.random() * 30) + 45,
    },
    summary: `Analysis of business ${businessId} reveals moderate online presence with opportunities for improvement in local SEO and digital advertising.`,
    insights: [
      {
        type: 'opportunity',
        dimension: 'local_seo',
        title: 'Improve Google Business Profile',
        description: 'Add more photos, respond to reviews, and keep hours updated.',
        priority: 'high',
      },
      {
        type: 'strength',
        dimension: 'website_quality',
        title: 'Good Website Foundation',
        description: 'Website has solid structure. Consider adding more service pages.',
        priority: 'medium',
      },
    ],
  };
}

// =============================================================================
// REGISTER WORKFLOW
// =============================================================================

runner.registerWorkflow('analyze-business', analysisWorkflowHandler);

export { analysisWorkflowHandler, AnalysisInput, AnalysisOutput };
