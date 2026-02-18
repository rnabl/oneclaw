/**
 * Perplexity/Gemini Citation Checker Client
 * 
 * Checks if a business is cited by AI when users ask questions.
 * Supports Perplexity (sonar-pro) and Google Gemini (with google_search tool).
 */

import OpenAI from 'openai';

export interface CitationCheckResult {
  isCited: boolean;
  competitors: string[];
  rawResponse: string;
}

export type CitationProvider = 'perplexity' | 'gemini';

export class CitationChecker {
  private provider: CitationProvider;
  private perplexityClient: OpenAI | null = null;
  private geminiApiKey: string | null = null;

  constructor(provider: CitationProvider = 'perplexity') {
    this.provider = provider;

    if (provider === 'perplexity') {
      const apiKey = process.env.PERPLEXITY_API_KEY;
      if (!apiKey) {
        console.warn('[CitationChecker] PERPLEXITY_API_KEY not set, citations will be mocked');
      } else {
        this.perplexityClient = new OpenAI({
          apiKey,
          baseURL: 'https://api.perplexity.ai',
        });
      }
    } else if (provider === 'gemini') {
      this.geminiApiKey = process.env.GOOGLE_GEMINI_API_KEY ?? process.env.GOOGLE_API_KEY ?? null;
      if (!this.geminiApiKey) {
        console.warn('[CitationChecker] GOOGLE_GEMINI_API_KEY not set, citations will be mocked');
      }
    }
  }

  /**
   * Check if a business is cited for a specific query
   */
  async checkCitation(businessName: string, query: string): Promise<CitationCheckResult> {
    if (this.provider === 'perplexity' && this.perplexityClient) {
      return this.checkWithPerplexity(businessName, query);
    } else if (this.provider === 'gemini' && this.geminiApiKey) {
      return this.checkWithGemini(businessName, query);
    }

    // Mock response for development
    return this.mockCitationCheck(businessName, query);
  }

  /**
   * Check citation using Perplexity sonar-pro
   */
  private async checkWithPerplexity(businessName: string, query: string): Promise<CitationCheckResult> {
    try {
      const response = await this.perplexityClient!.chat.completions.create({
        model: 'sonar-pro',
        messages: [
          {
            role: 'system',
            content: `You are researching local service providers. Provide specific business recommendations based on current web data. Be specific with names, locations, and what makes each business stand out.`,
          },
          {
            role: 'user',
            content: query,
          },
        ],
        max_tokens: 1000,
        temperature: 0.2,
      });

      const rawResponse = response.choices[0]?.message?.content ?? '';
      
      // Check if business is mentioned
      const businessLower = businessName.toLowerCase();
      const responseLower = rawResponse.toLowerCase();
      const isCited = responseLower.includes(businessLower);

      // Extract competitor names using simple heuristics
      const competitors = this.extractCompetitors(rawResponse, businessName);

      return {
        isCited,
        competitors: competitors.slice(0, 5),
        rawResponse,
      };
    } catch (error) {
      console.error('[CitationChecker] Perplexity error:', error);
      return this.mockCitationCheck(businessName, query);
    }
  }

  /**
   * Check citation using Google Gemini with google_search tool
   */
  private async checkWithGemini(businessName: string, query: string): Promise<CitationCheckResult> {
    try {
      // Use Gemini REST API with google_search tool
      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${this.geminiApiKey}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [
              {
                role: 'user',
                parts: [{ text: query }],
              },
            ],
            tools: [
              {
                google_search: {},
              },
            ],
            generationConfig: {
              maxOutputTokens: 1000,
              temperature: 0.2,
            },
          }),
        }
      );

      if (!response.ok) {
        throw new Error(`Gemini API error: ${response.status}`);
      }

      const data = await response.json() as {
        candidates?: Array<{
          content?: {
            parts?: Array<{ text?: string }>;
          };
        }>;
      };
      
      const rawResponse = data.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
      
      const businessLower = businessName.toLowerCase();
      const responseLower = rawResponse.toLowerCase();
      const isCited = responseLower.includes(businessLower);

      const competitors = this.extractCompetitors(rawResponse, businessName);

      return {
        isCited,
        competitors: competitors.slice(0, 5),
        rawResponse,
      };
    } catch (error) {
      console.error('[CitationChecker] Gemini error:', error);
      return this.mockCitationCheck(businessName, query);
    }
  }

  /**
   * Extract competitor names from AI response
   */
  private extractCompetitors(response: string, ourBusiness: string): string[] {
    const competitors: string[] = [];
    const ourLower = ourBusiness.toLowerCase();

    // Common patterns for business mentions
    const patterns = [
      // "BusinessName is known for..."
      /\b([A-Z][a-zA-Z\s&']+(?:HVAC|Plumbing|Heating|Cooling|Services?|Company|Inc\.?|LLC)?)\s+(?:is|are|has|have|offers?|provides?)/gi,
      // "Top businesses include BusinessName"
      /(?:include|including|such as|like|are|recommends?)\s+([A-Z][a-zA-Z\s&',]+?)(?:\.|,|and)/gi,
      // "1. BusinessName" or "- BusinessName"
      /(?:^|\n)\s*(?:\d+\.|[-•])\s*\**([A-Z][a-zA-Z\s&']+)\**/gm,
    ];

    for (const pattern of patterns) {
      let match;
      while ((match = pattern.exec(response)) !== null) {
        const name = match[1].trim();
        // Filter out common false positives and our own business
        if (
          name.length > 3 &&
          name.length < 50 &&
          !name.toLowerCase().includes(ourLower) &&
          !['The', 'They', 'This', 'These', 'Their', 'Some', 'Many'].includes(name)
        ) {
          if (!competitors.includes(name)) {
            competitors.push(name);
          }
        }
      }
    }

    return competitors;
  }

  /**
   * Mock citation check for development
   */
  private mockCitationCheck(businessName: string, query: string): CitationCheckResult {
    // Deterministic mock based on query hash
    const hash = query.split('').reduce((a, b) => ((a << 5) - a + b.charCodeAt(0)) | 0, 0);
    const isCited = (hash % 4) === 0; // 25% chance of being cited

    return {
      isCited,
      competitors: isCited ? [] : ['Competitor HVAC Co', 'Local Heating & Air'],
      rawResponse: `[Mock Response] ${isCited ? businessName : 'Other Company'} was recommended for this query.`,
    };
  }
}

// Singleton instance
let _checker: CitationChecker | null = null;

export function getCitationChecker(): CitationChecker {
  if (!_checker) {
    // Prefer Perplexity, fallback to Gemini
    const provider = process.env.PERPLEXITY_API_KEY ? 'perplexity' : 'gemini';
    _checker = new CitationChecker(provider);
  }
  return _checker;
}

/**
 * Check if any citation provider is configured
 */
export function isCitationProviderConfigured(): boolean {
  return !!(
    process.env.PERPLEXITY_API_KEY || 
    process.env.GOOGLE_GEMINI_API_KEY || 
    process.env.GOOGLE_API_KEY
  );
}
