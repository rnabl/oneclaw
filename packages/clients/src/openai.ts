/**
 * OpenAI Client for auxiliary LLM tasks
 * 
 * Used for:
 * - City population lookup
 * - Competitor name extraction
 * - Industry detection refinement
 */

import OpenAI from 'openai';

let _client: OpenAI | null = null;

function getClient(): OpenAI | null {
  if (_client) return _client;
  
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    console.warn('[OpenAI] OPENAI_API_KEY not set');
    return null;
  }
  
  _client = new OpenAI({ apiKey });
  return _client;
}

/**
 * Get city population using GPT-4o-mini
 * Fast, cheap, and accurate for US cities
 */
export async function getCityPopulation(city: string, state: string): Promise<number> {
  const client = getClient();
  if (!client) {
    console.log(`[Population] No OpenAI key, defaulting to 50,000`);
    return 50_000;
  }

  try {
    const response = await client.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'system',
          content: 'You are a data assistant. Respond with only a number.',
        },
        {
          role: 'user',
          content: `What is the population of ${city}, ${state}?
Just respond with a single number, no commas, no text. Example: 45000`,
        },
      ],
      max_tokens: 20,
      temperature: 0,
    });

    const content = response.choices[0]?.message?.content?.trim() ?? '';
    
    // Extract number from response
    const numbers = content.replace(/,/g, '').match(/\d+/);
    if (numbers) {
      const pop = parseInt(numbers[0], 10);
      console.log(`[Population] ${city}, ${state} = ${pop.toLocaleString()}`);
      return pop;
    }
  } catch (error) {
    console.error(`[Population] Lookup failed for ${city}, ${state}:`, error);
  }

  return 50_000;
}

/**
 * Extract competitor names from AI response text
 */
export async function extractCompetitors(
  responseText: string,
  businessType: string
): Promise<string[]> {
  const client = getClient();
  if (!client) {
    return [];
  }

  try {
    const response = await client.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'system',
          content: `Extract business names from the text. Return a JSON array of business names only.
Focus on ${businessType} businesses mentioned.
Return format: ["Business 1", "Business 2"]`,
        },
        {
          role: 'user',
          content: responseText.slice(0, 2000), // Limit input
        },
      ],
      max_tokens: 200,
      temperature: 0,
      response_format: { type: 'json_object' },
    });

    const content = response.choices[0]?.message?.content ?? '{}';
    const parsed = JSON.parse(content) as { businesses?: string[] };
    return parsed.businesses ?? [];
  } catch (error) {
    console.error('[OpenAI] Competitor extraction failed:', error);
    return [];
  }
}

/**
 * Generic chat completion helper
 */
export async function chatCompletion(params: {
  model?: string;
  systemPrompt?: string;
  userPrompt: string;
  maxTokens?: number;
  temperature?: number;
}): Promise<string | null> {
  const client = getClient();
  if (!client) return null;

  try {
    const messages: OpenAI.ChatCompletionMessageParam[] = [];
    
    if (params.systemPrompt) {
      messages.push({ role: 'system', content: params.systemPrompt });
    }
    messages.push({ role: 'user', content: params.userPrompt });

    const response = await client.chat.completions.create({
      model: params.model ?? 'gpt-4o-mini',
      messages,
      max_tokens: params.maxTokens ?? 1000,
      temperature: params.temperature ?? 0.7,
    });

    return response.choices[0]?.message?.content ?? null;
  } catch (error) {
    console.error('[OpenAI] Chat completion failed:', error);
    return null;
  }
}

/**
 * Check if OpenAI is configured
 */
export function isOpenAIConfigured(): boolean {
  return !!process.env.OPENAI_API_KEY;
}
