/**
 * Google Maps Reviews Scraper
 * 
 * Uses compass/Google-Maps-Reviews-Scraper to get detailed reviews with full reviewer names
 */

const APIFY_ACTOR_ID = 'compass/Google-Maps-Reviews-Scraper';
const APIFY_API_BASE = 'https://api.apify.com/v2';

function getApifyToken(): string | undefined {
  return process.env.APIFY_API_TOKEN || process.env.APIFY_TOKEN;
}

export interface ReviewResult {
  title: string;  // Business name
  url: string;    // Google Maps URL
  stars: number;
  name: string;   // Full reviewer name
  reviewUrl: string;
  text: string;
}

export interface ScrapeReviewsInput {
  placeIds?: string[];      // Array of Google Place IDs
  startUrls?: string[];     // Array of Google Maps URLs
  maxReviews?: number;      // Max reviews per place (default: 3)
  reviewsSort?: 'newest' | 'most_relevant' | 'highest_ranking' | 'lowest_ranking';
}

/**
 * Scrape reviews for businesses using the dedicated reviews scraper
 */
export async function scrapeReviews(
  input: ScrapeReviewsInput
): Promise<ReviewResult[]> {
  const token = getApifyToken();
  if (!token) {
    throw new Error('APIFY_API_TOKEN is not set');
  }

  // Validate input
  if (!input.placeIds && !input.startUrls) {
    throw new Error('Must provide either placeIds or startUrls');
  }

  // Start the actor run
  const actorInput: any = {
    maxReviews: input.maxReviews || 3,
    reviewsSort: input.reviewsSort || 'newest',
  };

  if (input.placeIds) {
    actorInput.placeIds = input.placeIds;
  }
  if (input.startUrls) {
    actorInput.startUrls = input.startUrls;
  }

  const runResponse = await fetch(
    `${APIFY_API_BASE}/acts/${encodeURIComponent(APIFY_ACTOR_ID)}/runs?token=${token}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(actorInput),
    }
  );

  if (!runResponse.ok) {
    const errorText = await runResponse.text();
    throw new Error(`Apify run failed: ${runResponse.status} ${errorText}`);
  }

  const runData = await runResponse.json();
  const runId = runData.data.id;
  const datasetId = runData.data.defaultDatasetId;

  // Wait for the run to complete
  let status = 'RUNNING';
  while (status === 'RUNNING') {
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    const statusResponse = await fetch(
      `${APIFY_API_BASE}/acts/${encodeURIComponent(APIFY_ACTOR_ID)}/runs/${runId}?token=${token}`
    );
    const statusData = await statusResponse.json();
    status = statusData.data.status;
  }

  if (status !== 'SUCCEEDED') {
    // Fetch error details if available
    try {
      const logResponse = await fetch(
        `${APIFY_API_BASE}/acts/${encodeURIComponent(APIFY_ACTOR_ID)}/runs/${runId}/log?token=${token}`
      );
      if (logResponse.ok) {
        const logText = await logResponse.text();
        console.error('[Apify] Run log:', logText.slice(-1000)); // Last 1000 chars
      }
    } catch (e) {
      // Ignore log fetch errors
    }
    throw new Error(`Apify run failed with status: ${status}`);
  }

  // Get the results from the dataset
  const resultsResponse = await fetch(
    `${APIFY_API_BASE}/datasets/${datasetId}/items?token=${token}`
  );

  if (!resultsResponse.ok) {
    throw new Error(`Failed to fetch results: ${resultsResponse.status}`);
  }

  const results = await resultsResponse.json();
  return results as ReviewResult[];
}
