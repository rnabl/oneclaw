/**
 * Real Search Query Templates
 * 
 * Actual queries people ask AI engines.
 * Based on search intent data, not guesses.
 * 
 * Format: Per niche, the most common queries with service intent
 */

export interface QueryTemplate {
  niche: string;
  commonQueries: string[];
  services: string[];
}

export const SEARCH_QUERY_TEMPLATES: Record<string, QueryTemplate> = {
  hvac: {
    niche: 'hvac',
    commonQueries: [
      'best {niche} company in {city}',
      'top rated {niche} near me',
      '{niche} repair in {city}',
      'emergency {niche} service {city}',
      'affordable {niche} {city}',
    ],
    services: [
      'AC repair',
      'furnace repair',
      'heating and cooling',
      'air conditioning installation',
      'emergency HVAC service',
      'duct cleaning',
    ],
  },
  
  plumbing: {
    niche: 'plumbing',
    commonQueries: [
      'best plumber in {city}',
      'emergency plumber {city}',
      'plumbing repair near me',
      '24 hour plumber {city}',
      'affordable plumber {city}',
    ],
    services: [
      'emergency plumbing',
      'water heater repair',
      'drain cleaning',
      'leak repair',
      'pipe replacement',
      'sewer line repair',
    ],
  },
  
  'med spa': {
    niche: 'med spa',
    commonQueries: [
      'best med spa in {city}',
      'medical spa near me',
      '{service} {city}',
      'cosmetic treatments {city}',
      'medical aesthetics {city}',
    ],
    services: [
      'Botox',
      'dermal fillers',
      'laser hair removal',
      'chemical peel',
      'microneedling',
      'CoolSculpting',
    ],
  },
  
  dental: {
    niche: 'dental',
    commonQueries: [
      'best dentist in {city}',
      'family dentist {city}',
      '{service} near me',
      'dental implants {city}',
      'cosmetic dentist {city}',
    ],
    services: [
      'teeth whitening',
      'dental implants',
      'veneers',
      'root canal',
      'wisdom teeth removal',
      'Invisalign',
    ],
  },
  
  roofing: {
    niche: 'roofing',
    commonQueries: [
      'best roofer in {city}',
      'roof repair {city}',
      'roofing company near me',
      'roof replacement {city}',
      'emergency roof repair {city}',
    ],
    services: [
      'roof repair',
      'roof replacement',
      'roof inspection',
      'storm damage repair',
      'gutter installation',
    ],
  },
};

/**
 * Get the primary search query for a niche + location
 * Uses the most common query template
 */
export function getPrimaryQuery(niche: string, city: string, state: string, service?: string): string {
  const template = SEARCH_QUERY_TEMPLATES[niche.toLowerCase()];
  
  if (!template) {
    // Fallback for unknown niches
    return `best ${niche} in ${city}, ${state}`;
  }
  
  // Use first (most common) query template
  let query = template.commonQueries[0];
  
  // Replace placeholders
  query = query.replace('{niche}', niche);
  query = query.replace('{city}', city);
  query = query.replace('{state}', state);
  
  // If service provided, use it; otherwise use first service from template
  const serviceToUse = service || template.services[0];
  query = query.replace('{service}', serviceToUse);
  
  return query;
}

/**
 * Get all common queries for a niche (for comprehensive testing)
 */
export function getAllQueries(niche: string, city: string, state: string): string[] {
  const template = SEARCH_QUERY_TEMPLATES[niche.toLowerCase()];
  
  if (!template) {
    return [`best ${niche} in ${city}, ${state}`];
  }
  
  return template.commonQueries.map(q => 
    q.replace('{niche}', niche)
     .replace('{city}', city)
     .replace('{state}', state)
     .replace('{service}', template.services[0])
  );
}

/**
 * Get primary service for a niche
 */
export function getPrimaryService(niche: string): string {
  const template = SEARCH_QUERY_TEMPLATES[niche.toLowerCase()];
  return template?.services[0] || 'service';
}

/**
 * Add new niche template (for learning)
 */
export function addNicheTemplate(template: QueryTemplate): void {
  SEARCH_QUERY_TEMPLATES[template.niche.toLowerCase()] = template;
}
