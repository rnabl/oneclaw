/**
 * Match AI Visibility Tool
 * 
 * Takes a list of businesses and AI rankings results,
 * matches them, and calculates visibility scores.
 * 
 * Pure data transformation - no API calls.
 * Use case: Identify which businesses are invisible to AI
 */

import { z } from 'zod';
import { runner } from '../execution/runner';

const MatchAIVisibilityInputSchema = z.object({
  businesses: z.array(z.object({
    name: z.string(),
    website: z.string().nullable().optional(),
  })),
  aiRankings: z.object({
    query: z.string(),
    top_businesses: z.array(z.object({
      name: z.string(),
      position: z.number(),
    })),
  }),
});

type MatchAIVisibilityInput = z.infer<typeof MatchAIVisibilityInputSchema>;

const MatchAIVisibilityOutputSchema = z.object({
  matched: z.array(z.object({
    business_name: z.string(),
    ai_visible: z.boolean(),
    ai_position: z.number().nullable(),
    aeo_score: z.number(),
  })),
  summary: z.object({
    total: z.number(),
    visible: z.number(),
    invisible: z.number(),
    top_3: z.number(),
    top_10: z.number(),
  }),
});

type MatchAIVisibilityOutput = z.infer<typeof MatchAIVisibilityOutputSchema>;

async function matchAIVisibilityHandler(
  input: MatchAIVisibilityInput,
  context: { tenantId: string }
): Promise<MatchAIVisibilityOutput> {
  
  const job = await runner.execute('match-ai-visibility', input, {
    tenantId: context.tenantId,
    tier: 'pro',
  });
  
  if (job.status !== 'completed' || !job.output) {
    throw new Error('Match AI visibility failed');
  }
  
  return job.output as MatchAIVisibilityOutput;
}

export const MATCH_AI_VISIBILITY_TOOL = {
  id: 'match-ai-visibility',
  name: 'match-ai-visibility',
  description: 'Match businesses against AI search rankings to identify which ones are visible/invisible. Calculates AEO scores. Pure data transformation.',
  version: '1.0.0',
  costClass: 'free' as const,
  estimatedCostUsd: 0,
  requiredSecrets: [] as string[],
  tags: ['aeo', 'ai-visibility', 'analysis', 'matching'],
  inputSchema: MatchAIVisibilityInputSchema,
  outputSchema: MatchAIVisibilityOutputSchema,
  networkPolicy: {
    allowedDomains: [],
    blockedDomains: [],
    allowLocalhost: false,
  },
  isPublic: true,
  handler: async (input: unknown, context: { tenantId: string }) => {
    const validated = MatchAIVisibilityInputSchema.parse(input);
    return matchAIVisibilityHandler(validated, { tenantId: context.tenantId });
  },
};

export { MatchAIVisibilityInputSchema, MatchAIVisibilityOutputSchema, matchAIVisibilityHandler };
