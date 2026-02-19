/**
 * Apify Client for Google Maps Scraper
 * 
 * Uses the compass/google-maps-scraper actor to discover businesses
 * https://apify.com/compass/google-maps-scraper
 */

const APIFY_API_TOKEN = process.env.APIFY_API_TOKEN || process.env.APIFY_TOKEN;
const APIFY_ACTOR_ID = 'compass/crawler-google-places';
const APIFY_API_BASE = 'https://api.apify.com/v2';

// Types for Apify responses
export interface ApifyGoogleMapsResult {
  placeId: string;
  title: string;
  categoryName?: string;
  address?: string;
  street?: string;
  city?: string;
  state?: string;
  postalCode?: string;
  countryCode?: string;
  phone?: string;
  website?: string;
  url?: string; // Google Maps URL
  totalScore?: number; // Rating (1-5)
  reviewsCount?: number;
  reviewsDistribution?: {
    oneStar: number;
    twoStar: number;
    threeStar: number;
    fourStar: number;
    fiveStar: number;
  };
  openingHours?: Array<{ day: string; hours: string }>;
  imageUrls?: string[];
  additionalInfo?: Record<string, unknown>;
  location?: {
    lat: number;
    lng: number;
  };
  isAdvertisement?: boolean;
  claimThisBusiness?: boolean;
}

export interface ApifyRunResult {
  id: string;
  status: 'READY' | 'RUNNING' | 'SUCCEEDED' | 'FAILED' | 'ABORTED' | 'TIMED-OUT';
  datasetId?: string;
  defaultDatasetId?: string;
}

export interface DiscoveryResult {
  id: string;
  googlePlaceId: string;
  name: string;
  category: string;
  address: string | null;
  city: string | null;
  state: string | null;
  zipCode: string | null;
  phone: string | null;
  website: string | null;
  googleMapsUrl: string | null;
  rating: number | null;
  reviewCount: number | null;
  latitude: number | null;
  longitude: number | null;
  imageUrl: string | null;
}

/**
 * Search for businesses using Apify Google Maps Scraper
 */
export async function searchBusinesses(params: {
  query: string; // e.g., "dentist"
  city: string;
  state: string;
  maxResults?: number;
}): Promise<DiscoveryResult[]> {
  if (!APIFY_API_TOKEN) {
    throw new Error('APIFY_API_TOKEN is not configured');
  }

  const { query, city, state, maxResults = 20 } = params;
  
  console.log(`[Apify] Starting search: "${query}" in "${city}, ${state}"`);

  // Start the actor run
  const runResponse = await fetch(
    `${APIFY_API_BASE}/acts/${encodeURIComponent(APIFY_ACTOR_ID)}/runs?token=${APIFY_API_TOKEN}`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        // Search config
        searchStringsArray: [query], // Just the niche, not "dentist in Austin, TX"
        locationQuery: `${city}, ${state}`, // Location separate
        maxCrawledPlacesPerSearch: maxResults,
        language: 'en',
        
        // Minimal scraping to save credits
        includeWebResults: false,
        maxImages: 0,
        maximumLeadsEnrichmentRecords: 0,
        scrapeContacts: false,
        scrapeDirectories: false,
        scrapeImageAuthors: false,
        scrapePlaceDetailPage: false,
        scrapeReviewsPersonalData: false,
        scrapeSocialMediaProfiles: {
          facebooks: false,
          instagrams: false,
          tiktoks: false,
          twitters: false,
          youtubes: false,
        },
        scrapeTableReservationProvider: false,
        skipClosedPlaces: false,
        
        // Additional fields from working config
        searchMatching: 'all',
        placeMinimumStars: '',
        website: 'allPlaces',
        maxQuestions: 0,
        maxReviews: 0,
        reviewsSort: 'newest',
        reviewsFilterString: '',
        reviewsOrigin: 'all',
        allPlacesNoSearchAction: '',
      }),
    }
  );

  if (!runResponse.ok) {
    const error = await runResponse.text();
    console.error('[Apify] Failed to start run:', error);
    throw new Error(`Failed to start Apify run: ${error}`);
  }

  const runData = (await runResponse.json()) as { data: ApifyRunResult };
  const runId = runData.data.id;
  
  console.log(`[Apify] Run started: ${runId}`);

  // Wait for the run to complete (poll every 5 seconds)
  let status: ApifyRunResult['status'] = 'RUNNING';
  let datasetId: string | undefined;
  let defaultDatasetId: string | undefined;
  let attempts = 0;
  const maxAttempts = 60; // 5 minutes max

  while (status === 'RUNNING' || status === 'READY') {
    if (attempts >= maxAttempts) {
      throw new Error('Apify run timed out after 5 minutes');
    }

    await new Promise((resolve) => setTimeout(resolve, 5000)); // Wait 5 seconds

    const statusResponse = await fetch(
      `${APIFY_API_BASE}/actor-runs/${runId}?token=${APIFY_API_TOKEN}`
    );

    if (!statusResponse.ok) {
      throw new Error('Failed to get Apify run status');
    }

    const statusData = (await statusResponse.json()) as {
      data: ApifyRunResult & { defaultDatasetId?: string };
    };
    status = statusData.data.status;
    datasetId = statusData.data.datasetId;
    defaultDatasetId = statusData.data.defaultDatasetId;
    attempts++;

    console.log(
      `[Apify] Run status: ${status} (attempt ${attempts}), datasetId: ${datasetId || defaultDatasetId || 'none'}`
    );
  }

  if (status !== 'SUCCEEDED') {
    throw new Error(`Apify run failed with status: ${status}`);
  }

  // Use defaultDatasetId if datasetId not available
  const finalDatasetId = datasetId || defaultDatasetId;
  if (!finalDatasetId) {
    throw new Error('Apify run succeeded but no dataset ID returned');
  }

  // Fetch the results from the dataset
  const datasetResponse = await fetch(
    `${APIFY_API_BASE}/datasets/${finalDatasetId}/items?token=${APIFY_API_TOKEN}&format=json`
  );

  if (!datasetResponse.ok) {
    throw new Error('Failed to fetch Apify dataset');
  }

  const rawResults = (await datasetResponse.json()) as ApifyGoogleMapsResult[];

  console.log(`[Apify] Got ${rawResults.length} results`);

  // Transform to our format
  return rawResults.map(transformApifyResult);
}

/**
 * Transform Apify result to our DiscoveryResult format
 */
function transformApifyResult(raw: ApifyGoogleMapsResult): DiscoveryResult {
  // Parse city/state from address if not provided directly
  const city = raw.city || parseCity(raw.address);
  const state = raw.state || parseState(raw.address);
  const zipCode = raw.postalCode || parseZipCode(raw.address);
  
  return {
    id: raw.placeId,
    googlePlaceId: raw.placeId,
    name: raw.title,
    category: raw.categoryName || 'unknown',
    address: raw.address || null,
    city: city,
    state: state,
    zipCode: zipCode,
    phone: raw.phone || null,
    website: raw.website || null,
    googleMapsUrl: raw.url || null,
    rating: raw.totalScore || null,
    reviewCount: raw.reviewsCount || null,
    latitude: raw.location?.lat || null,
    longitude: raw.location?.lng || null,
    imageUrl: raw.imageUrls?.[0] || null,
  };
}

/**
 * Parse city from address string
 */
function parseCity(address: string | undefined): string | null {
  if (!address) return null;
  const match = address.match(/([^,]+),\s*([A-Z]{2})/);
  return match ? match[1].trim() : null;
}

/**
 * Parse state from address string
 */
function parseState(address: string | undefined): string | null {
  if (!address) return null;
  const match = address.match(/,\s*([A-Z]{2})\s*\d{5}/);
  return match ? match[1] : null;
}

/**
 * Parse zip code from address string
 */
function parseZipCode(address: string | undefined): string | null {
  if (!address) return null;
  const match = address.match(/\d{5}(-\d{4})?/);
  return match ? match[0] : null;
}
