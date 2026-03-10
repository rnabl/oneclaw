/**
 * Perplexity AI - Business Owner Research
 * 
 * Uses Perplexity's sonar model to find business owner information.
 * 
 * Cost: ~$0.005 per search (10x cheaper than DataForSEO SERP)
 * Accuracy: High for local businesses with online presence
 * 
 * Based on your implementation from the audit tool.
 */

const PERPLEXITY_API_BASE = 'https://api.perplexity.ai';

// Read API key at runtime, not module load time
function getPerplexityApiKey(): string {
  const key = process.env.PERPLEXITY_API_KEY;
  if (!key) {
    throw new Error('PERPLEXITY_API_KEY is not configured');
  }
  return key;
}

export interface OwnerInfo {
  name: string;
  role: string | null;
  source: string;
  linkedinUrl?: string;
}

export interface OwnerSearchResult {
  owners: OwnerInfo[];
  sources: string[];
  query: string;
}

/**
 * Search for business owner using Perplexity AI
 * 
 * This is 10x cheaper than DataForSEO while maintaining high accuracy.
 */
export async function searchBusinessOwner(params: {
  businessName: string;
  city?: string;
  state?: string;
}): Promise<OwnerSearchResult> {
  
  const apiKey = getPerplexityApiKey();
  
  const { businessName, city, state } = params;
  
  // Build location context if available
  const location = city && state ? `${city}, ${state}` : city || state || '';
  const locationContext = location ? ` in ${location}` : '';
  
  // Craft a precise query that encourages accurate results
  const query = `Who owns or founded ${businessName}${locationContext}? Please provide the full name and role of the owner, founder, or CEO.`;
  
  console.log(`[Perplexity] Searching for owner: ${businessName}${locationContext}`);
  
  try {
    const response = await fetch(`${PERPLEXITY_API_BASE}/chat/completions`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'sonar',
        messages: [
          {
            role: 'system',
            content: 'You are a business research assistant. Extract owner/founder names accurately. Return structured data.',
          },
          {
            role: 'user',
            content: query,
          },
        ],
        temperature: 0.2,
        max_tokens: 500,
      }),
    });
    
    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Perplexity API error: ${error}`);
    }
    
    const data = await response.json();
    const content = data.choices?.[0]?.message?.content || '';
    const citations = data.citations || [];
    
    console.log(`[Perplexity] Response: ${content.substring(0, 200)}...`);
    
    // Parse owner info from response
    const owners = parseOwnerFromText(content);
    
    return {
      owners,
      sources: citations,
      query,
    };
    
  } catch (error) {
    console.error('[Perplexity] Search failed:', error);
    throw error;
  }
}

/**
 * Parse owner information from Perplexity response text
 */
function parseOwnerFromText(text: string): OwnerInfo[] {
  const owners: OwnerInfo[] = [];
  
  // Strip markdown formatting first
  const cleanText = text
    .replace(/\*\*/g, '')  // Remove bold **
    .replace(/\*/g, '')    // Remove italic *
    .replace(/\[(\d+)\]/g, '') // Remove citation references like [1]
    .replace(/Mr\.\s*/gi, '')  // Remove Mr.
    .replace(/Mrs\.\s*/gi, '') // Remove Mrs.
    .replace(/Ms\.\s*/gi, '')  // Remove Ms.
    .replace(/Dr\.\s*/gi, ''); // Remove Dr.
  
  console.log('[Perplexity] Cleaned text for parsing:', cleanText.substring(0, 300));
  
  // Name pattern: First Last or First Middle Last (2-4 words, each capitalized)
  const namePattern = '([A-Z][a-z]+(?:\\s+[A-Z][a-z]+){1,3})';
  
  // More precise patterns - require complete context
  const patterns = [
    // "John Smith founded" or "John Smith and Jane Doe founded"
    new RegExp(`${namePattern}(?:\\s+and\\s+${namePattern})?\\s+founded`, 'g'),
    // "founded by John Smith" or "owned by John Smith"
    new RegExp(`(?:founded|owned|started|established)\\s+by\\s+${namePattern}`, 'gi'),
    // "John Smith is the owner/founder/CEO"
    new RegExp(`${namePattern}\\s+is\\s+(?:the\\s+)?(owner|founder|ceo|president|co-owner)`, 'gi'),
    // "John Smith, the owner" or "John Smith - Owner"
    new RegExp(`${namePattern},?\\s+(?:the\\s+)?(owner|founder|ceo|president)`, 'gi'),
    // "co-owners" or "co-founders" - extract names before this
    new RegExp(`${namePattern}(?:\\s+and\\s+${namePattern})?\\s+are\\s+the\\s+(co-owners|co-founders|owners|founders)`, 'g'),
  ];
  
  for (const pattern of patterns) {
    const matches = cleanText.matchAll(pattern);
    for (const match of matches) {
      // Extract all captured names (groups 1, 3, etc.)
      const capturedNames = [];
      for (let i = 1; i < match.length; i++) {
        if (match[i] && /^[A-Z][a-z]+(?:\s+[A-Z][a-z]+)+$/.test(match[i])) {
          capturedNames.push(match[i]);
        }
      }
      
      for (const name of capturedNames) {
        const cleanName = name.replace(/\s+/g, ' ').trim();
        
        // Validation: name must be 2+ words, no numbers, reasonable length
        const words = cleanName.split(' ');
        if (words.length < 2 || words.length > 4 || /\d/.test(cleanName) || cleanName.length < 4) {
          continue;
        }
        
        // Blacklist invalid names
        const blacklist = [
          'key details', 'business owner', 'company owner', 'the owner',
          'the founder', 'the ceo', 'vice president', 'one man',
          'multiple family', 'includes conflicting', 'conflicting reports',
          'and serves as', 'he serves as', 'she serves as'
        ];
        
        if (blacklist.some(phrase => cleanName.toLowerCase().includes(phrase))) {
          console.log(`[Perplexity] Skipped blacklisted: ${cleanName}`);
          continue;
        }
        
        // Avoid duplicates
        if (!owners.find(o => o.name.toLowerCase() === cleanName.toLowerCase())) {
          console.log(`[Perplexity] Extracted owner: ${cleanName}`);
          owners.push({
            name: cleanName,
            role: 'Owner',
            source: 'perplexity-ai',
          });
        }
      }
    }
  }
  
  return owners;
}
