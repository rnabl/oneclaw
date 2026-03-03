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
  
  // Patterns for extracting owner info - more flexible but precise
  // Name pattern: First Last or First Middle Last (2-4 words, each capitalized)
  const namePattern = '([A-Z][a-z]+(?:\\s+[A-Z][a-z]+){1,3})';
  
  const patterns = [
    // "John Smith is the owner/founder/CEO" - must be at word boundary
    new RegExp(`\\b${namePattern}\\s+is\\s+(?:the\\s+)?(owner|founder|ceo|president|co-founder|managing member)\\b`, 'gi'),
    // "Founded/owned by John Smith"
    new RegExp(`(?:founded|owned|started|established)\\s+by\\s+${namePattern}\\b`, 'gi'),
    // "John Smith, Owner" or "John Smith - Owner" (comma or dash before role)
    new RegExp(`\\b${namePattern}[,\\s]+-?\\s*(?:the\\s+)?(owner|founder|ceo|president)\\b`, 'gi'),
    // "lists John Smith as Owner"
    new RegExp(`lists\\s+${namePattern}\\s+as\\s+(owner|founder|ceo|president)`, 'gi'),
  ];
  
  for (const pattern of patterns) {
    const matches = cleanText.matchAll(pattern);
    for (const match of matches) {
      let name = match[1]?.trim();
      const role = match[2] || 'Owner';
      
      // Clean up the name
      if (name) {
        name = name.replace(/\s+/g, ' ').trim();
        
        // Skip if name looks invalid (too short, contains numbers, etc.)
        if (name.length < 4 || /\d/.test(name) || name.split(' ').length < 2) {
          continue;
        }
        
        // Avoid duplicates
        if (!owners.find(o => o.name.toLowerCase() === name.toLowerCase())) {
          console.log(`[Perplexity] Extracted owner: ${name} (${role})`);
          owners.push({
            name,
            role: role.charAt(0).toUpperCase() + role.slice(1).toLowerCase(),
            source: 'perplexity-ai',
          });
        }
      }
    }
  }
  
  // If no structured match, try to find the first bolded name that looks like a person
  if (owners.length === 0) {
    // Look for patterns like "Name is the" or "Name, an" at the start
    const firstNameMatch = cleanText.match(/^([A-Z][a-z]+(?:\s+[A-Z][a-z]+)+)/);
    if (firstNameMatch) {
      const name = firstNameMatch[1].trim();
      if (name.length >= 4 && name.split(' ').length >= 2 && !/\d/.test(name)) {
        console.log(`[Perplexity] Extracted owner from start: ${name}`);
        owners.push({
          name,
          role: 'Owner',
          source: 'perplexity-ai',
        });
      }
    }
  }
  
  return owners;
}
