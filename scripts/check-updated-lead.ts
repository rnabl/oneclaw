import * as dotenv from 'dotenv';
import * as path from 'path';
import { createClient } from '@supabase/supabase-js';

dotenv.config({ path: path.resolve(process.cwd(), '.env.production') });
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });
dotenv.config({ path: path.resolve(process.cwd(), '.env') });

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function checkLead() {
  const { data, error } = await supabase
    .schema('crm')
    .from('leads')
    .select('company_name, city, state, google_place_id, google_maps_url, google_rating, google_reviews, source_metadata')
    .eq('company_name', 'American Rooter Plumbing')
    .eq('city', 'Omaha')
    .limit(1);

  if (error) {
    console.error('Error:', error);
    return;
  }

  const lead = data[0];
  
  console.log('\n📊 Updated Lead Data:\n');
  console.log(`Company: ${lead.company_name} (${lead.city}, ${lead.state})`);
  console.log(`Place ID: ${lead.google_place_id}`);
  console.log(`Maps URL: ${lead.google_maps_url}`);
  console.log(`Rating: ${lead.google_rating} (${lead.google_reviews} reviews)`);
  console.log('\n📝 Reviews in source_metadata:');
  
  if (lead.source_metadata?.reviews) {
    lead.source_metadata.reviews.forEach((review: any, idx: number) => {
      console.log(`\nReview ${idx + 1}:`);
      console.log(`  Reviewer: ${review.reviewer_name}`);
      console.log(`  Rating: ${review.rating} stars`);
      console.log(`  Text: ${review.text.substring(0, 100)}...`);
    });
  }
}

checkLead();
