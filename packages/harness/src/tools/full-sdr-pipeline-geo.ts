/**
 * Full SDR Pipeline - Geographic Discovery Tool
 * 
 * Complete end-to-end pipeline:
 * 1. Discover businesses via Google Maps
 * 2. Check AI rankings (optional)
 * 3. Match visibility
 * 4. Store in Supabase
 * 
 * Use case: Full-service lead generation for local businesses
 */

import { z } from 'zod';
import { runner } from '../execution/runner';

const FullSDRPipelineGeoInputSchema = z.object({
  niche: z.string().describe('Business niche (e.g., "HVAC companies")'),
  city: z.string(),
  state: z.string(),
  service: z.string().optional().describe('Service for AI ranking (e.g., "AC repair")'),
  limit: z.number().default(100),
  checkAIRankings: z.boolean().default(true),
  storeInSupabase: z.boolean().default(true),
});

type FullSDRPipelineGeoInput = z.infer<typeof FullSDRPipelineGeoInputSchema>;

const FullSDRPipelineGeoOutputSchema = z.object({
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

type FullSDRPipelineGeoOutput = z.infer<typeof FullSDRPipelineGeoOutputSchema>;

async function fullSDRPipelineGeoHandler(
  input: FullSDRPipelineGeoInput,
  context: { tenantId: string }
): Promise<FullSDRPipelineGeoOutput> {
  
  const job = await runner.execute('full-sdr-pipeline-geo', input, {
    tenantId: context.tenantId,
    tier: 'pro',
  });
  
  if (job.status !== 'completed' || !job.output) {
    throw new Error('Full SDR pipeline (geo) failed');
  }
  
  return job.output as FullSDRPipelineGeoOutput;
}

export const FULL_SDR_PIPELINE_GEO_TOOL = {
  id: 'full-sdr-pipeline-geo',
  name: 'full-sdr-pipeline-geo',
  description: 'Complete SDR pipeline: Discover businesses via Google Maps, check AI rankings, match visibility, store in database. All-in-one lead generation.',
  version: '1.0.0',
  costClass: 'medium' as const,
  estimatedCostUsd: 0.75,
  requiredSecrets: ['apify', 'perplexity'] as string[],
  tags: ['discovery', 'pipeline', 'sdr', 'geo', 'ai-rankings'],
  inputSchema: FullSDRPipelineGeoInputSchema,
  outputSchema: FullSDRPipelineGeoOutputSchema,
  networkPolicy: {
    allowedDomains: ['*.apify.com', '*.perplexity.ai', '*.supabase.co'],
    blockedDomains: [],
    allowLocalhost: false,
  },
  isPublic: true,
  handler: async (input: unknown, context: { tenantId: string }) => {
    const validated = FullSDRPipelineGeoInputSchema.parse(input);
    return fullSDRPipelineGeoHandler(validated, { tenantId: context.tenantId });
  },
};

export { FullSDRPipelineGeoInputSchema, FullSDRPipelineGeoOutputSchema, fullSDRPipelineGeoHandler };
