/**
 * Match AI Visibility Workflow
 * 
 * Takes a list of businesses and AI rankings results,
 * matches them, and calculates visibility scores.
 * 
 * Pure function - no API calls, just data transformation.
 */

import type { StepContext } from '../execution/runner';
import { runner } from '../execution/runner';
import { z } from 'zod';

const MatchAIVisibilityInput = z.object({
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

type MatchAIVisibilityInput = z.infer<typeof MatchAIVisibilityInput>;

const MatchAIVisibilityOutput = z.object({
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

type MatchAIVisibilityOutput = z.infer<typeof MatchAIVisibilityOutput>;

async function matchAIVisibilityHandler(
  ctx: StepContext,
  input: Record<string, unknown>
): Promise<MatchAIVisibilityOutput> {
  const params = MatchAIVisibilityInput.parse(input);
  
  await ctx.log('info', `Matching ${params.businesses.length} businesses against AI rankings`);
  
  const matched = params.businesses.map(business => {
    const businessLower = business.name.toLowerCase();
    
    // Find match in AI results
    const aiMatch = params.aiRankings.top_businesses.find(ai =>
      ai.name.toLowerCase().includes(businessLower) ||
      businessLower.includes(ai.name.toLowerCase())
    );
    
    let aeoScore = 1.0; // Default: invisible
    
    if (aiMatch) {
      // Calculate AEO score based on position
      if (aiMatch.position <= 3) aeoScore = 9.0; // Top 3 = excellent
      else if (aiMatch.position <= 5) aeoScore = 7.0; // Top 5 = good
      else if (aiMatch.position <= 10) aeoScore = 5.0; // Top 10 = decent
      else aeoScore = 3.0; // Mentioned but low
    } else {
      // Not visible but check if they have good website signals
      // (This would require passing website signals, for now default to low)
      aeoScore = 1.0;
    }
    
    return {
      business_name: business.name,
      ai_visible: !!aiMatch,
      ai_position: aiMatch?.position ?? null,
      aeo_score: aeoScore,
    };
  });
  
  // Calculate summary stats
  const visible = matched.filter(m => m.ai_visible).length;
  const top3 = matched.filter(m => m.ai_position && m.ai_position <= 3).length;
  const top10 = matched.filter(m => m.ai_position && m.ai_position <= 10).length;
  
  await ctx.log('info', `✅ Matched: ${visible} visible, ${matched.length - visible} invisible`);
  await ctx.log('info', `📊 Top 3: ${top3}, Top 10: ${top10}`);
  
  return {
    matched,
    summary: {
      total: matched.length,
      visible,
      invisible: matched.length - visible,
      top_3: top3,
      top_10: top10,
    },
  };
}

runner.registerWorkflow('match-ai-visibility', matchAIVisibilityHandler);

export { matchAIVisibilityHandler, MatchAIVisibilityInput, MatchAIVisibilityOutput };
