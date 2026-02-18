/**
 * Taxonomy Registry
 * 
 * Central registry for looking up and detecting industries.
 */

import { IndustryTaxonomy, IndustryDetection } from './types';
import { hvacTaxonomy, plumbingTaxonomy, dentalTaxonomy } from './industries';

// Registry of all supported industries
const industries: Map<string, IndustryTaxonomy> = new Map([
  ['hvac', hvacTaxonomy],
  ['plumbing', plumbingTaxonomy],
  ['dental', dentalTaxonomy],
]);

// Aliases for industry lookup
const aliases: Map<string, string> = new Map([
  ['heating', 'hvac'],
  ['cooling', 'hvac'],
  ['air conditioning', 'hvac'],
  ['ac', 'hvac'],
  ['plumber', 'plumbing'],
  ['dentist', 'dental'],
  ['dentistry', 'dental'],
  ['orthodontics', 'dental'],
]);

/**
 * Get a taxonomy by industry ID or alias
 */
export function getTaxonomy(industry: string): IndustryTaxonomy {
  const normalized = industry.toLowerCase().trim();
  
  // Direct lookup
  const direct = industries.get(normalized);
  if (direct) return direct;
  
  // Alias lookup
  const aliasId = aliases.get(normalized);
  if (aliasId) {
    const fromAlias = industries.get(aliasId);
    if (fromAlias) return fromAlias;
  }
  
  // Default to HVAC for now
  console.warn(`Unknown industry "${industry}", defaulting to HVAC`);
  return hvacTaxonomy;
}

/**
 * List all supported industry IDs
 */
export function listIndustries(): string[] {
  return Array.from(industries.keys());
}

/**
 * Check if an industry is supported
 */
export function hasIndustry(industry: string): boolean {
  const normalized = industry.toLowerCase().trim();
  return industries.has(normalized) || aliases.has(normalized);
}

/**
 * Detect industries from text content
 */
export function detectIndustriesFromText(
  text: string,
  minMatches: number = 3
): IndustryDetection[] {
  const lowerText = text.toLowerCase();
  const results: IndustryDetection[] = [];

  for (const [id, taxonomy] of industries) {
    const matchedKeywords: string[] = [];

    // Check service scan keywords
    for (const keyword of taxonomy.serviceScanKeywords) {
      if (lowerText.includes(keyword.toLowerCase())) {
        matchedKeywords.push(keyword);
      }
    }

    // Check trust signal keywords
    for (const keyword of Object.keys(taxonomy.trustSignalKeywords)) {
      if (lowerText.includes(keyword.toLowerCase())) {
        matchedKeywords.push(keyword);
      }
    }

    // Check service keywords
    for (const service of taxonomy.services) {
      for (const keyword of service.keywords) {
        if (lowerText.includes(keyword.toLowerCase())) {
          matchedKeywords.push(keyword);
        }
      }
    }

    // Remove duplicates
    const uniqueKeywords = [...new Set(matchedKeywords)];

    if (uniqueKeywords.length >= minMatches) {
      results.push({
        industry: id,
        industryName: taxonomy.displayName,
        matches: uniqueKeywords.length,
        confidence: Math.min(uniqueKeywords.length / 10, 1),
        keywords: uniqueKeywords.slice(0, 10),
      });
    }
  }

  // Sort by match count descending
  return results.sort((a, b) => b.matches - a.matches);
}

/**
 * Get standard keywords for an industry (for keyword volume lookups)
 */
export function getStandardKeywords(taxonomy: IndustryTaxonomy): string[] {
  const keywords: string[] = [];
  
  for (const service of taxonomy.services) {
    // Take first 2 keywords from each service
    keywords.push(...service.keywords.slice(0, 2));
  }
  
  return [...new Set(keywords)].slice(0, 20);
}
