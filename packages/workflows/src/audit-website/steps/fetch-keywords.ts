/**
 * Step: Fetch Keyword Volumes
 * 
 * Gets search volume data for industry keywords.
 */

import { getDataForSEOClient, isDataForSEOConfigured } from '@oneclaw/clients';
import { getTaxonomy, getStandardKeywords } from '@oneclaw/taxonomy';
import type { KeywordVolume, LocationInput } from '../types';

export async function fetchKeywordVolumes(
  location: LocationInput,
  industry: string
): Promise<{
  keywords: KeywordVolume[];
  estimatedMonthlySearches: number;
}> {
  const taxonomy = getTaxonomy(industry);
  
  // Skip if DataForSEO not configured
  if (!isDataForSEOConfigured()) {
    console.log('[Keywords] DataForSEO not configured, using estimates');
    return generateEstimatedKeywords(taxonomy, location);
  }

  try {
    const client = getDataForSEOClient();
    
    // Get standard keywords with location modifiers
    const baseKeywords = getStandardKeywords(taxonomy);
    const localKeywords = baseKeywords.flatMap((kw: string) => [
      `${kw} ${location.city}`,
      `${kw} near me`,
    ]).slice(0, 20);

    // Get volumes (use US location code)
    const volumes = await client.getKeywordVolumes(localKeywords, 2840);

    const keywords: KeywordVolume[] = volumes.map((v: { keyword: string; searchVolume: number; cpc: number | null; competition: number | null }) => ({
      keyword: v.keyword,
      volume: v.searchVolume,
      cpc: v.cpc,
      difficulty: v.competition ? Math.round(v.competition * 100) : null,
    }));

    // Sort by volume
    keywords.sort((a, b) => b.volume - a.volume);

    const estimatedMonthlySearches = keywords.reduce((sum, k) => sum + k.volume, 0);

    return {
      keywords: keywords.slice(0, 15),
      estimatedMonthlySearches,
    };
  } catch (error) {
    console.error('[Keywords] Error fetching volumes:', error);
    return generateEstimatedKeywords(taxonomy, location);
  }
}

/**
 * Generate estimated keywords when API is unavailable
 */
function generateEstimatedKeywords(
  taxonomy: ReturnType<typeof getTaxonomy>,
  location: LocationInput
): {
  keywords: KeywordVolume[];
  estimatedMonthlySearches: number;
} {
  const keywords: KeywordVolume[] = [];
  
  // Use services to generate estimated volumes
  for (const service of taxonomy.services.slice(0, 10)) {
    const primaryKeyword = service.keywords[0];
    
    // Estimate volume based on job value (higher value = more searches)
    const baseVolume = Math.round(service.avgJobValue / 5);
    
    keywords.push({
      keyword: `${primaryKeyword} ${location.city}`,
      volume: baseVolume,
      cpc: service.avgJobValue > 1000 ? 15 : 8,
      difficulty: service.avgJobValue > 2000 ? 60 : 40,
    });
  }

  keywords.sort((a, b) => b.volume - a.volume);

  const estimatedMonthlySearches = keywords.reduce((sum, k) => sum + k.volume, 0);

  return { keywords, estimatedMonthlySearches };
}
