/**
 * DataForSEO API Client
 * 
 * Handles:
 * - Google Maps search for Google Business Profile reviews
 * - Keyword volume lookups (city and DMA level)
 * - Location code resolution
 */

export interface DataForSEOConfig {
  login: string;
  password: string;
}

export interface KeywordVolumeData {
  keyword: string;
  searchVolume: number;
  cpc: number | null;
  competition: number | null;
  competitionLevel: string | null;
}

export interface GoogleMapsResult {
  reviewCount: number;
  rating: number;
  domain: string | null;
}

// DMA lookup table for major metros
const DMA_POPULATIONS: Record<string, number> = {
  'new york': 20_000_000,
  'los angeles': 13_000_000,
  'chicago': 9_500_000,
  'dallas': 7_500_000,
  'houston': 7_000_000,
  'washington': 6_300_000,
  'miami': 6_200_000,
  'philadelphia': 6_100_000,
  'atlanta': 6_000_000,
  'phoenix': 4_900_000,
  'boston': 4_900_000,
  'san francisco': 4_700_000,
  'seattle': 4_000_000,
  'detroit': 4_300_000,
  'minneapolis': 3_600_000,
  'denver': 2_900_000,
  'orlando': 2_600_000,
  'tampa': 3_200_000,
  'portland': 2_500_000,
  'sacramento': 2_400_000,
  'austin': 2_300_000,
  'las vegas': 2_300_000,
  'san diego': 3_300_000,
};

export class DataForSEOClient {
  private auth: string;
  private baseUrl = 'https://api.dataforseo.com/v3';

  constructor(config?: DataForSEOConfig) {
    const login = config?.login ?? process.env.DATAFORSEO_LOGIN;
    const password = config?.password ?? process.env.DATAFORSEO_PASSWORD;

    if (!login || !password) {
      throw new Error('DataForSEO credentials required (DATAFORSEO_LOGIN, DATAFORSEO_PASSWORD)');
    }

    this.auth = Buffer.from(`${login}:${password}`).toString('base64');
  }

  private async request<T>(endpoint: string, body: unknown): Promise<T> {
    const response = await fetch(`${this.baseUrl}${endpoint}`, {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${this.auth}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      throw new Error(`DataForSEO error: ${response.status} ${response.statusText}`);
    }

    return response.json() as Promise<T>;
  }

  /**
   * Search Google Maps for business reviews
   */
  async searchGoogleMaps(query: string, locationCode: number = 2840): Promise<GoogleMapsResult[]> {
    try {
      const data = await this.request<{
        tasks: Array<{
          result: Array<{
            items: Array<{
              type: string;
              domain?: string;
              title?: string;
              rating?: { value: number; votes_count: number } | number;
              reviews_count?: number;
            }>;
          }>;
        }>;
      }>('/serp/google/maps/live/advanced', [{
        keyword: query,
        location_code: locationCode,
        language_code: 'en',
        device: 'desktop',
        os: 'windows',
        depth: 1,
      }]);

      const items = data.tasks?.[0]?.result?.[0]?.items ?? [];
      
      return items
        .filter(item => item.type === 'maps_search' || item.title)
        .map(item => {
          const ratingObj = item.rating;
          let rating = 0;
          let reviewCount = 0;

          if (typeof ratingObj === 'object' && ratingObj) {
            rating = ratingObj.value ?? 0;
            reviewCount = ratingObj.votes_count ?? 0;
          } else if (typeof ratingObj === 'number') {
            rating = ratingObj;
            reviewCount = item.reviews_count ?? 0;
          }

          return {
            reviewCount,
            rating,
            domain: item.domain?.toLowerCase() ?? null,
          };
        });
    } catch (error) {
      console.error('[DataForSEO] Maps search error:', error);
      return [];
    }
  }

  /**
   * Find a business on Google Maps by domain
   */
  async findBusinessReviews(
    domain: string,
    businessName: string,
    location: string
  ): Promise<{ reviewCount: number; rating: number; verified: boolean }> {
    const cleanDomain = domain.replace('www.', '').toLowerCase();

    // Strategy 1: Search by domain + location
    let results = await this.searchGoogleMaps(`${cleanDomain} ${location}`);
    let match = results.find(r => 
      r.domain && (
        r.domain === cleanDomain || 
        r.domain.includes(cleanDomain) || 
        cleanDomain.includes(r.domain)
      )
    );

    if (match) {
      return { reviewCount: match.reviewCount, rating: match.rating, verified: true };
    }

    // Strategy 2: Search by business name + location
    results = await this.searchGoogleMaps(`${businessName} ${location}`);
    match = results.find(r => 
      r.domain && (
        r.domain === cleanDomain || 
        r.domain.includes(cleanDomain) || 
        cleanDomain.includes(r.domain)
      )
    );

    if (match) {
      return { reviewCount: match.reviewCount, rating: match.rating, verified: true };
    }

    return { reviewCount: 0, rating: 0, verified: false };
  }

  /**
   * Get keyword search volumes
   */
  async getKeywordVolumes(
    keywords: string[],
    locationCode: number
  ): Promise<KeywordVolumeData[]> {
    try {
      // DataForSEO max 1000 keywords per request
      const batches: string[][] = [];
      for (let i = 0; i < keywords.length; i += 1000) {
        batches.push(keywords.slice(i, i + 1000));
      }

      const allResults: KeywordVolumeData[] = [];

      for (const batch of batches) {
        const data = await this.request<{
          tasks: Array<{
            result: Array<{
              keyword: string;
              search_volume: number;
              cpc: number | null;
              competition: number | null;
              competition_level: string | null;
            }>;
          }>;
        }>('/keywords_data/google_ads/search_volume/live', [{
          keywords: batch,
          location_code: locationCode,
          language_code: 'en',
        }]);

        const results = data.tasks?.[0]?.result ?? [];
        
        for (const item of results) {
          allResults.push({
            keyword: item.keyword,
            searchVolume: item.search_volume ?? 0,
            cpc: item.cpc,
            competition: item.competition,
            competitionLevel: item.competition_level,
          });
        }
      }

      return allResults;
    } catch (error) {
      console.error('[DataForSEO] Keyword volume error:', error);
      return keywords.map(kw => ({
        keyword: kw,
        searchVolume: 0,
        cpc: null,
        competition: null,
        competitionLevel: null,
      }));
    }
  }

  /**
   * Get DMA population for scaling city-level estimates
   */
  getDMAPopulation(dmaName: string): number {
    const dmaLower = dmaName.toLowerCase();
    for (const [metroName, pop] of Object.entries(DMA_POPULATIONS)) {
      if (dmaLower.includes(metroName)) {
        return pop;
      }
    }
    return 1_000_000; // Default for unknown DMAs
  }
}

// Singleton instance
let _client: DataForSEOClient | null = null;

export function getDataForSEOClient(): DataForSEOClient {
  if (!_client) {
    _client = new DataForSEOClient();
  }
  return _client;
}

/**
 * Check if DataForSEO is configured
 */
export function isDataForSEOConfigured(): boolean {
  return !!(process.env.DATAFORSEO_LOGIN && process.env.DATAFORSEO_PASSWORD);
}
