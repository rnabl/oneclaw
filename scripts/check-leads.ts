/**
 * Quick check of what's in the leads table
 */

import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import * as path from 'path';

// Load environment variables
dotenv.config({ path: path.resolve(__dirname, '../.env.production') });
dotenv.config({ path: path.resolve(__dirname, '../.env.local') });
dotenv.config({ path: path.resolve(__dirname, '../.env') });

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

async function checkLeads() {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
    console.error('Missing Supabase credentials');
    process.exit(1);
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
    auth: { persistSession: false },
  });

  console.log('\n=== CHECKING LEADS TABLE ===\n');

  // Count total leads
  const { count: totalCount, error: countError } = await supabase
    .schema('crm')
    .from('leads')
    .select('*', { count: 'exact', head: true });

  if (countError) {
    console.error('Error counting leads:', countError);
    return;
  }

  console.log(`Total leads in database: ${totalCount}`);

  // Count leads with google_place_id
  const { count: withPlaceId, error: placeIdError } = await supabase
    .schema('crm')
    .from('leads')
    .select('*', { count: 'exact', head: true })
    .not('google_place_id', 'is', null);

  if (placeIdError) {
    console.error('Error counting leads with place ID:', placeIdError);
    return;
  }

  console.log(`Leads with google_place_id: ${withPlaceId}`);

  // Count leads with google_maps_url
  const { count: withMapsUrl, error: mapsUrlError } = await supabase
    .schema('crm')
    .from('leads')
    .select('*', { count: 'exact', head: true })
    .not('google_maps_url', 'is', null);

  if (mapsUrlError) {
    console.error('Error counting leads with maps URL:', mapsUrlError);
    return;
  }

  console.log(`Leads with google_maps_url: ${withMapsUrl}`);

  // Get a sample of leads
  const { data: sampleLeads, error: sampleError } = await supabase
    .schema('crm')
    .from('leads')
    .select('company_name, google_place_id, google_maps_url, city, state')
    .limit(5);

  if (sampleError) {
    console.error('Error fetching sample:', sampleError);
    return;
  }

  console.log('\nSample leads:');
  console.table(sampleLeads);

  console.log('\n');
}

checkLeads();
