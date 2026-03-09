/**
 * Backfill Google Maps URLs from Apify Historical Data
 * 
 * Simple script to populate the google_maps_url field in crm.leads
 * by fetching data from your recent Apify runs.
 */

import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import * as path from 'path';

// Load environment variables (try multiple locations)
dotenv.config({ path: path.resolve(__dirname, '../.env.production') });
dotenv.config({ path: path.resolve(__dirname, '../.env.local') });
dotenv.config({ path: path.resolve(__dirname, '../.env') });

const APIFY_API_TOKEN = process.env.APIFY_API_TOKEN || process.env.APIFY_TOKEN;
const APIFY_API_BASE = 'https://api.apify.com/v2';
const APIFY_ACTOR_ID = 'compass/crawler-google-places';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

// Check required environment variables
if (!APIFY_API_TOKEN) {
  console.error('❌ APIFY_API_TOKEN or APIFY_TOKEN environment variable is required');
  console.error('Set it in .env.local or .env file');
  process.exit(1);
}

if (!SUPABASE_URL) {
  console.error('❌ SUPABASE_URL environment variable is required');
  console.error('Set it in .env.local or .env file');
  process.exit(1);
}

if (!SUPABASE_SERVICE_KEY) {
  console.error('❌ SUPABASE_SERVICE_ROLE_KEY environment variable is required');
  console.error('Set it in .env.local or .env file');
  process.exit(1);
}

interface ApifyRun {
  id: string;
  defaultDatasetId: string;
  startedAt: string;
}

interface ApifyPlace {
  placeId: string;
  url?: string; // Google Maps URL
}

/**
 * Get recent Apify runs
 */
async function getRecentRuns(limit: number = 5): Promise<ApifyRun[]> {
  if (!APIFY_API_TOKEN) {
    throw new Error('APIFY_API_TOKEN not configured');
  }

  const url = `${APIFY_API_BASE}/acts/${encodeURIComponent(APIFY_ACTOR_ID)}/runs?limit=${limit}&status=SUCCEEDED`;
  
  const response = await fetch(url, {
    headers: { 'Authorization': `Bearer ${APIFY_API_TOKEN}` },
  });
  
  if (!response.ok) {
    throw new Error(`Failed to list runs: ${response.statusText}`);
  }
  
  const data = await response.json();
  return data.data.items;
}

/**
 * Fetch dataset (placeId, url, title, city, state)
 */
async function fetchPlaceData(datasetId: string): Promise<Array<{
  placeId: string;
  url: string;
  title: string;
  city?: string;
  state?: string;
}>> {
  if (!APIFY_API_TOKEN) {
    throw new Error('APIFY_API_TOKEN not configured');
  }
  
  const url = `${APIFY_API_BASE}/datasets/${datasetId}/items?format=json&fields=placeId,url,title,city,state`;
  
  const response = await fetch(url, {
    headers: { 'Authorization': `Bearer ${APIFY_API_TOKEN}` },
  });
  
  if (!response.ok) {
    throw new Error(`Failed to fetch dataset: ${response.statusText}`);
  }
  
  const places = await response.json();
  
  return places.filter((p: any) => p.placeId && p.url && p.title);
}

/**
 * Normalize company name for matching
 */
function normalizeCompanyName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^\w\s]/g, '') // Remove punctuation
    .replace(/\s+/g, ' ')     // Normalize whitespace
    .trim();
}

/**
 * Check if two company names match (fuzzy)
 */
function companiesMatch(name1: string, name2: string): boolean {
  const norm1 = normalizeCompanyName(name1);
  const norm2 = normalizeCompanyName(name2);
  
  // Exact match
  if (norm1 === norm2) return true;
  
  // One contains the other (for cases like "ABC HVAC" vs "ABC HVAC LLC")
  if (norm1.includes(norm2) || norm2.includes(norm1)) return true;
  
  return false;
}

/**
 * Check if locations match
 */
function locationsMatch(
  city1: string | null | undefined,
  state1: string | null | undefined,
  city2: string | null | undefined,
  state2: string | null | undefined
): boolean {
  // If both have states, they must match
  if (state1 && state2 && state1.toLowerCase() !== state2.toLowerCase()) {
    return false;
  }
  
  // If both have cities, they should match (or be close)
  if (city1 && city2) {
    const normCity1 = city1.toLowerCase().trim();
    const normCity2 = city2.toLowerCase().trim();
    return normCity1 === normCity2;
  }
  
  // If only one has location data, consider it a possible match
  return true;
}

/**
 * Main function: Backfill google_maps_url and google_place_id in Supabase
 */
export async function backfillGoogleMapsUrls(params?: {
  maxRuns?: number;
  dryRun?: boolean;
}): Promise<{
  leadsChecked: number;
  leadsUpdated: number;
  leadsSkipped: number;
  leadsMatched: number;
}> {
  const { maxRuns = 5, dryRun = false } = params || {};
  
  console.log(`\n[Backfill] Backfilling Google Maps data from last ${maxRuns} runs`);
  console.log(`[Backfill] Strategy: Match by company name + location`);
  console.log(`[Backfill] Dry run: ${dryRun ? 'YES (no changes)' : 'NO'}\n`);
  
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
    auth: { persistSession: false },
  });
  
  // Step 1: Fetch all place data from Apify runs
  console.log('[Backfill] Fetching place data from Apify runs...');
  const runs = await getRecentRuns(maxRuns);
  
  const allPlaces: Array<{
    placeId: string;
    url: string;
    title: string;
    city?: string;
    state?: string;
  }> = [];
  
  for (const run of runs) {
    console.log(`  Processing run from ${new Date(run.startedAt).toLocaleString()}...`);
    const places = await fetchPlaceData(run.defaultDatasetId);
    console.log(`    Found ${places.length} places`);
    allPlaces.push(...places);
  }
  
  console.log(`\n[Backfill] Total places from Apify: ${allPlaces.length}\n`);
  
  // Step 2: Get all leads from Supabase
  console.log('[Backfill] Fetching leads from database...');
  
  const { data: leads, error } = await supabase
    .schema('crm')
    .from('leads')
    .select('id, company_name, city, state, google_place_id, google_maps_url');
  
  if (error) {
    throw new Error(`Failed to fetch leads: ${error.message}`);
  }
  
  console.log(`[Backfill] Found ${leads?.length || 0} leads in database\n`);
  
  // Step 3: Match leads to places and update
  let leadsChecked = 0;
  let leadsUpdated = 0;
  let leadsSkipped = 0;
  let leadsMatched = 0;
  
  for (const lead of leads || []) {
    leadsChecked++;
    
    // Skip if already has both place_id and maps_url
    if (lead.google_place_id && lead.google_maps_url) {
      leadsSkipped++;
      continue;
    }
    
    // Try to find a matching place in Apify data
    const matchingPlace = allPlaces.find(place => {
      return companiesMatch(lead.company_name, place.title) &&
             locationsMatch(lead.city, lead.state, place.city, place.state);
    });
    
    if (!matchingPlace) {
      leadsSkipped++;
      continue;
    }
    
    leadsMatched++;
    
    if (dryRun) {
      console.log(`[DRY RUN] Would update: ${lead.company_name} (${lead.city}, ${lead.state})`);
      console.log(`  Matched with: ${matchingPlace.title}`);
      console.log(`  Place ID: ${matchingPlace.placeId}`);
      console.log(`  Maps URL: ${matchingPlace.url}\n`);
      leadsUpdated++;
      continue;
    }
    
    // Update the lead with place_id and maps_url
    const { error: updateError } = await supabase
      .schema('crm')
      .from('leads')
      .update({
        google_place_id: matchingPlace.placeId,
        google_maps_url: matchingPlace.url,
      })
      .eq('id', lead.id);
    
    if (updateError) {
      console.error(`Error updating ${lead.company_name}:`, updateError);
      leadsSkipped++;
    } else {
      leadsUpdated++;
      
      // Log progress every 50 updates
      if (leadsUpdated % 50 === 0) {
        console.log(`  Progress: ${leadsUpdated} leads updated...`);
      }
    }
  }
  
  // Summary
  console.log('\n=== BACKFILL SUMMARY ===');
  console.log(`Leads checked: ${leadsChecked}`);
  console.log(`Leads matched: ${leadsMatched}`);
  console.log(`Leads updated: ${leadsUpdated}`);
  console.log(`Leads skipped: ${leadsSkipped} (already had data or no match found)`);
  
  return {
    leadsChecked,
    leadsUpdated,
    leadsSkipped,
    leadsMatched,
  };
}

/**
 * Example usage
 */
async function main() {
  try {
    // Option 1: Dry run with more runs to see potential
    console.log('=== DRY RUN PREVIEW (checking last 20 runs) ===');
    await backfillGoogleMapsUrls({
      maxRuns: 20,
      dryRun: true,
    });
    
    // Option 2: Actually run the update
    // Uncomment when ready:
    // 
    // console.log('\n\nStarting actual update in 5 seconds...');
    // await new Promise(resolve => setTimeout(resolve, 5000));
    // 
    // await backfillGoogleMapsUrls({
    //   maxRuns: 20,
    //   dryRun: false,
    // });
    
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}
