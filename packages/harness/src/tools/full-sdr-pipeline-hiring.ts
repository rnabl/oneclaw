/**
 * Full SDR Pipeline - Hiring Signal Discovery Tool
 * 
 * Complete end-to-end pipeline:
 * 1. Discover hiring businesses via job postings
 * 2. Check AI rankings (optional)
 * 3. Match visibility
 * 4. Store in Supabase
 * 
 * Use case: Target growth-stage companies with hiring signals
 */

import { z } from 'zod';
import { runner } from '../execution/runner';

const FullSDRPipelineHiringInputSchema = z.object({
  keyword: z.string().describe('Job keyword (e.g., "HVAC technician")'),
  city: z.string(),
  state: z.string(),
  service: z.string().optional().describe('Service for AI ranking (e.g., "HVAC services")'),
  days: z.number().default(30),
  maxResults: z.number().default(100),
  checkAIRankings: z.boolean().default(true),
  storeInSupabase: z.boolean().default(true),
});

type FullSDRPipelineHiringInput = z.infer<typeof FullSDRPipelineHiringInputSchema>;

const FullSDRPipelineHiringOutputSchema = z.object({
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

type FullSDRPipelineHiringOutput = z.infer<typeof FullSDRPipelineHiringOutputSchema>;

async function fullSDRPipelineHiringHandler(
  input: FullSDRPipelineHiringInput,
  context: { tenantId: string }
): Promise<FullSDRPipelineHiringOutput> {
  
  const job = await runner.execute('full-sdr-pipeline-hiring', input, {
    tenantId: context.tenantId,
    tier: 'pro',
  });
  
  if (job.status !== 'completed' || !job.output) {
    throw new Error('Full SDR pipeline (hiring) failed');
  }
  
  return job.output as FullSDRPipelineHiringOutput;
}

export const FULL_SDR_PIPELINE_HIRING_TOOL = {
  id: 'full-sdr-pipeline-hiring',
  name: 'full-sdr-pipeline-hiring',
  description: 'Complete SDR pipeline: Discover hiring businesses via job postings, check AI rankings, match visibility, store in database. All-in-one lead generation with hiring signals.',
  version: '1.0.0',
  costClass: 'medium' as const,
  estimatedCostUsd: 1.25,
  requiredSecrets: ['notte', 'perplexity'] as string[],
  tags: ['discovery', 'pipeline', 'sdr', 'hiring', 'jobs', 'ai-rankings'],
  inputSchema: FullSDRPipelineHiringInputSchema,
  outputSchema: FullSDRPipelineHiringOutputSchema,
  networkPolicy: {
    allowedDomains: ['*.notte.cc', '*.perplexity.ai', '*.supabase.co'],
    blockedDomains: [],
    allowLocalhost: false,
  },
  isPublic: true,
  handler: async (input: unknown, context: { tenantId: string }) => {
    const validated = FullSDRPipelineHiringInputSchema.parse(input);
    return fullSDRPipelineHiringHandler(validated, { tenantId: context.tenantId });
  },
};

export { FullSDRPipelineHiringInputSchema, FullSDRPipelineHiringOutputSchema, fullSDRPipelineHiringHandler };
