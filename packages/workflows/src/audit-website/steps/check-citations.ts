/**
 * Step: Check AI Citations
 * 
 * Queries AI models to see if the business is cited in responses.
 */

import { getCitationChecker, isCitationProviderConfigured } from '@oneclaw/clients';
import { getTaxonomy } from '@oneclaw/taxonomy';
import type { CitationResult, LocationInput } from '../types';

export async function checkCitations(
  businessName: string,
  location: LocationInput,
  industry: string
): Promise<{
  results: CitationResult[];
  citationRate: number;
  competitorsCitedInstead: string[];
}> {
  const taxonomy = getTaxonomy(industry);
  
  // Skip if no provider configured
  if (!isCitationProviderConfigured()) {
    console.log('[Citations] No citation provider configured, using mock data');
    return {
      results: [],
      citationRate: 0,
      competitorsCitedInstead: ['[Mock] Competitor A', '[Mock] Competitor B'],
    };
  }

  const checker = getCitationChecker();
  const results: CitationResult[] = [];
  const allCompetitors: string[] = [];
  let citedCount = 0;

  // Generate queries from taxonomy
  const queries = taxonomy.aiQuestions.map((q: string) =>
    q.replace('{city}', location.city).replace('{state}', location.state)
  );

  // Check each query
  for (const query of queries.slice(0, 4)) { // Limit to 4 queries
    try {
      const result = await checker.checkCitation(businessName, query);
      
      results.push({
        query,
        isCited: result.isCited,
        competitors: result.competitors,
        response: result.rawResponse.slice(0, 500),
      });

      if (result.isCited) {
        citedCount++;
      } else {
        allCompetitors.push(...result.competitors);
      }
    } catch (error) {
      console.error(`[Citations] Error checking query "${query}":`, error);
    }
  }

  // Calculate citation rate
  const citationRate = results.length > 0 ? (citedCount / results.length) * 100 : 0;

  // Dedupe competitors
  const competitorsCitedInstead = [...new Set(allCompetitors)].slice(0, 10);

  return {
    results,
    citationRate,
    competitorsCitedInstead,
  };
}
