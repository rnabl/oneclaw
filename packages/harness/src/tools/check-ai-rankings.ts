/**
 * Check AI Rankings Tool
 * 
 * Queries Perplexity (or ChatGPT) with format:
 * "Best [niche] in [city, state] for [service]"
 * 
 * Extracts:
 * 1. Which businesses are mentioned
 * 2. Ranking order (top 3)
 * 3. Why they were recommended
 * 
 * Use case: Check if a business is being recommended by AI engines
 */

import { z } from 'zod';

const CheckAIRankingsInputSchema = z.object({
  niche: z.string().describe('Business niche (e.g., "HVAC", "plumbing", "med spa")'),
  city: z.string().describe('City name'),
  state: z.string().describe('State abbreviation'),
  service: z.string().optional().describe('Specific service (e.g., "AC repair", "Botox")'),
  checkBusiness: z.string().optional().describe('Specific business name to check if mentioned'),
});

type CheckAIRankingsInput = z.infer<typeof CheckAIRankingsInputSchema>;

const CheckAIRankingsOutputSchema = z.object({
  query: z.string(),
  ai_engine: z.string(),
  top_businesses: z.array(z.object({
    name: z.string(),
    position: z.number(),
    reason: z.string().optional(),
  })),
  target_business_mentioned: z.boolean().optional(),
  target_business_position: z.number().optional(),
  total_businesses_mentioned: z.number(),
  full_response: z.string(),
  citations: z.array(z.string()),
  cost: z.number(),
});

type CheckAIRankingsOutput = z.infer<typeof CheckAIRankingsOutputSchema>;

const PERPLEXITY_API_KEY = process.env.PERPLEXITY_API_KEY;
const PERPLEXITY_API_BASE = 'https://api.perplexity.ai';

async function checkAIRankingsHandler(
  input: CheckAIRankingsInput,
  context: { tenantId: string }
): Promise<CheckAIRankingsOutput> {
  
  if (!PERPLEXITY_API_KEY) {
    throw new Error('PERPLEXITY_API_KEY not configured');
  }
  
  // Build query in the format you specified
  const servicePhrase = input.service ? ` for ${input.service}` : '';
  const query = `Best ${input.niche} in ${input.city}, ${input.state}${servicePhrase}`;
  
  console.log(`[AI Rankings] Query: "${query}"`);
  
  try {
    // Query Perplexity
    const response = await fetch(`${PERPLEXITY_API_BASE}/chat/completions`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${PERPLEXITY_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'sonar',
        messages: [
          {
            role: 'system',
            content: 'You are a local business recommendation assistant. When asked for the best businesses, list them in order with brief reasons why. Be specific with business names.',
          },
          {
            role: 'user',
            content: query,
          },
        ],
        temperature: 0.3,
        max_tokens: 1000,
        return_citations: true,
        return_related_questions: false,
      }),
    });
    
    if (!response.ok) {
      throw new Error(`Perplexity API error: ${response.status}`);
    }
    
    const data = await response.json();
    const fullResponse = data.choices?.[0]?.message?.content || '';
    const citations = data.citations || [];
    
    console.log(`[AI Rankings] Response length: ${fullResponse.length} chars, ${citations.length} citations`);
    
    // Extract businesses from response
    const businesses = extractBusinessesFromResponse(fullResponse);
    
    // Check if target business was mentioned
    let targetMentioned = false;
    let targetPosition: number | undefined;
    
    if (input.checkBusiness) {
      const targetIndex = businesses.findIndex(b => 
        b.name.toLowerCase().includes(input.checkBusiness!.toLowerCase()) ||
        input.checkBusiness!.toLowerCase().includes(b.name.toLowerCase())
      );
      
      if (targetIndex !== -1) {
        targetMentioned = true;
        targetPosition = targetIndex + 1;
      }
    }
    
    return {
      query,
      ai_engine: 'perplexity',
      top_businesses: businesses.slice(0, 3), // Top 3
      target_business_mentioned: targetMentioned,
      target_business_position: targetPosition,
      total_businesses_mentioned: businesses.length,
      full_response: fullResponse,
      citations,
      cost: 0.005,
    };
    
  } catch (error) {
    throw new Error(`AI rankings check failed: ${error instanceof Error ? error.message : String(error)}`);
  }
}

/**
 * Extract business names and reasons from Perplexity response
 * 
 * Handles common formats:
 * - "1. ABC HVAC - Known for..."
 * - "**ABC HVAC** - Great reviews..."
 * - "ABC HVAC is recommended because..."
 */
function extractBusinessesFromResponse(text: string): Array<{ name: string; position: number; reason?: string }> {
  const businesses: Array<{ name: string; position: number; reason?: string }> = [];
  
  // Pattern 1: Numbered list "1. Business Name - reason"
  const numberedPattern = /^\s*(\d+)\.\s*\*?\*?([^-\n]+?)\*?\*?\s*[-–—]\s*(.+?)(?=\n|$)/gm;
  let matches = text.matchAll(numberedPattern);
  
  for (const match of matches) {
    const position = parseInt(match[1]);
    const name = match[2].trim();
    const reason = match[3].trim();
    
    if (name.length > 3 && name.length < 100) {
      businesses.push({ name, position, reason });
    }
  }
  
  // If numbered list worked, return it
  if (businesses.length > 0) {
    return businesses;
  }
  
  // Pattern 2: Bold business names "**Business Name** - reason"
  const boldPattern = /\*\*([^*]+)\*\*\s*[-–—]\s*(.+?)(?=\n|$)/gm;
  matches = text.matchAll(boldPattern);
  
  let position = 1;
  for (const match of matches) {
    const name = match[1].trim();
    const reason = match[2].trim();
    
    // Filter out section headers
    if (name.length > 3 && name.length < 100 && !name.match(/^(Top|Best|Here|The)/)) {
      businesses.push({ name, position: position++, reason });
    }
  }
  
  // If bold pattern worked, return it
  if (businesses.length > 0) {
    return businesses;
  }
  
  // Pattern 3: Just extract proper nouns (company names)
  // This is less reliable but catches free-form responses
  const sentencePattern = /([A-Z][A-Za-z]+(?: [A-Z][A-Za-z]+)*(?:\s+(?:HVAC|Plumbing|Dental|Spa|Services?|LLC|Inc\.?|Co\.?))?)/g;
  const properNouns = Array.from(new Set(text.match(sentencePattern) || []));
  
  position = 1;
  for (const name of properNouns.slice(0, 10)) {
    // Filter out common words
    if (!['Here', 'The', 'Best', 'Top', 'This', 'That', 'When'].includes(name)) {
      businesses.push({ name, position: position++ });
    }
  }
  
  return businesses;
}

export const CHECK_AI_RANKINGS_TOOL = {
  id: 'check-ai-rankings',
  name: 'check-ai-rankings',
  description: 'Check which businesses AI engines recommend for a query and extract top 3 ranked',
  version: '1.0.0',
  costClass: 'cheap' as const,
  estimatedCostUsd: 0.005,
  requiredSecrets: ['perplexity'] as string[],
  tags: ['aeo', 'geo', 'ai-visibility', 'rankings', 'perplexity'],
  inputSchema: CheckAIRankingsInputSchema,
  outputSchema: CheckAIRankingsOutputSchema,
  networkPolicy: {
    allowedDomains: ['api.perplexity.ai'],
    blockedDomains: [],
    allowLocalhost: false,
  },
  isPublic: false,
  handler: async (input: unknown, context: { tenantId: string }) => {
    const validated = CheckAIRankingsInputSchema.parse(input);
    return checkAIRankingsHandler(validated, { tenantId: context.tenantId });
  },
};

export { CheckAIRankingsInputSchema, CheckAIRankingsOutputSchema, checkAIRankingsHandler };
