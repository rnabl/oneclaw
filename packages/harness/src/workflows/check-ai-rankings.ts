/**
 * Check AI Rankings Workflow
 * 
 * Queries AI search engines (Perplexity) to see which businesses
 * are recommended for a given service + location.
 * 
 * Pure, focused workflow - does ONE thing well.
 */

import type { StepContext } from '../execution/runner';
import { runner } from '../execution/runner';
import { z } from 'zod';

const CheckAIRankingsInput = z.object({
  niche: z.string().describe('Business niche (e.g., "HVAC", "plumbing")'),
  city: z.string(),
  state: z.string(),
  service: z.string().optional().describe('Specific service (e.g., "AC repair")'),
  checkBusiness: z.string().optional().describe('Specific business to check for'),
});

type CheckAIRankingsInput = z.infer<typeof CheckAIRankingsInput>;

const CheckAIRankingsOutput = z.object({
  query: z.string(),
  total_businesses_mentioned: z.number(),
  top_businesses: z.array(z.object({
    name: z.string(),
    position: z.number(),
    snippet: z.string().optional(),
  })),
  target_business_found: z.boolean().optional(),
  target_business_position: z.number().optional(),
  ai_engine: z.string(),
  cost_usd: z.number(),
});

type CheckAIRankingsOutput = z.infer<typeof CheckAIRankingsOutput>;

async function checkAIRankingsHandler(
  ctx: StepContext,
  input: Record<string, unknown>
): Promise<CheckAIRankingsOutput> {
  const params = CheckAIRankingsInput.parse(input);
  
  const servicePhrase = params.service || params.niche;
  const query = `Best ${servicePhrase} companies in ${params.city}, ${params.state}`;
  
  await ctx.log('info', `Checking AI rankings: "${query}"`);
  
  // Call Perplexity API
  const perplexityKey = process.env.PERPLEXITY_API_KEY;
  if (!perplexityKey) {
    throw new Error('PERPLEXITY_API_KEY not configured');
  }
  
  const response = await fetch('https://api.perplexity.ai/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${perplexityKey}`,
    },
    body: JSON.stringify({
      model: 'llama-3.1-sonar-large-128k-online',
      messages: [
        {
          role: 'system',
          content: 'You are a helpful assistant that provides business recommendations. List the top businesses with their names clearly.',
        },
        {
          role: 'user',
          content: query,
        },
      ],
      temperature: 0.2,
      max_tokens: 1000,
    }),
  });
  
  if (!response.ok) {
    throw new Error(`Perplexity API failed: ${response.status}`);
  }
  
  const data = await response.json();
  const aiResponse = data.choices[0].message.content;
  
  // Parse business names from response
  const businessMatches = aiResponse.match(/\d+\.\s*\*?\*?([^*\n]+)\*?\*?/g) || [];
  const businesses = businessMatches.map((match, idx) => {
    const nameMatch = match.match(/\d+\.\s*\*?\*?([^*\n]+)\*?\*?/);
    const name = nameMatch ? nameMatch[1].trim() : match.trim();
    return {
      name,
      position: idx + 1,
      snippet: aiResponse.split(name)[1]?.split('\n')[0]?.trim(),
    };
  });
  
  // Check if target business was found
  let targetFound = false;
  let targetPosition: number | undefined;
  
  if (params.checkBusiness) {
    const targetLower = params.checkBusiness.toLowerCase();
    const match = businesses.find(b => 
      b.name.toLowerCase().includes(targetLower) || 
      targetLower.includes(b.name.toLowerCase())
    );
    
    if (match) {
      targetFound = true;
      targetPosition = match.position;
      await ctx.log('info', `✅ Found ${params.checkBusiness} at position ${targetPosition}`);
    } else {
      await ctx.log('info', `❌ ${params.checkBusiness} not mentioned in AI results`);
    }
  }
  
  await ctx.log('info', `Found ${businesses.length} businesses in AI results`);
  
  // Estimate cost (Perplexity pricing)
  const inputTokens = query.length / 4;
  const outputTokens = aiResponse.length / 4;
  const costUsd = (inputTokens * 0.001 / 1000) + (outputTokens * 0.005 / 1000);
  
  return {
    query,
    total_businesses_mentioned: businesses.length,
    top_businesses: businesses,
    target_business_found: params.checkBusiness ? targetFound : undefined,
    target_business_position: targetPosition,
    ai_engine: 'perplexity',
    cost_usd: costUsd,
  };
}

runner.registerWorkflow('check-ai-rankings', checkAIRankingsHandler);

export { checkAIRankingsHandler, CheckAIRankingsInput, CheckAIRankingsOutput };
