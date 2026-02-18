/**
 * Step: Fetch Reviews
 * 
 * Gets Google Business Profile reviews data.
 */

import { getDataForSEOClient, isDataForSEOConfigured } from '@oneclaw/clients';
import type { LocationInput } from '../types';

export interface ReviewData {
  reviewCount: number;
  rating: number;
  verified: boolean;
}

export async function fetchReviews(
  url: string,
  businessName: string,
  location: LocationInput
): Promise<ReviewData> {
  // Skip if DataForSEO not configured
  if (!isDataForSEOConfigured()) {
    console.log('[Reviews] DataForSEO not configured, using mock data');
    return {
      reviewCount: 0,
      rating: 0,
      verified: false,
    };
  }

  try {
    const client = getDataForSEOClient();
    const locationString = `${location.city}, ${location.state}`;
    
    // Extract domain from URL
    const domain = new URL(url).hostname.replace('www.', '');
    
    const result = await client.findBusinessReviews(domain, businessName, locationString);
    
    return result;
  } catch (error) {
    console.error('[Reviews] Error fetching reviews:', error);
    return {
      reviewCount: 0,
      rating: 0,
      verified: false,
    };
  }
}
