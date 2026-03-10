/**
 * Check Review Scraping Status
 * 
 * Queries Supabase to see how many leads have been enriched with reviews
 */

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

async function checkStatus() {
  console.log('📊 Review Scraping Status Check\n');

  // Total leads with reviews
  const { count: withReviews } = await supabase
    .schema('crm')
    .from('leads')
    .select('*', { count: 'exact', head: true })
    .not('source_metadata->reviews', 'is', null);

  // Total leads
  const { count: totalLeads } = await supabase
    .schema('crm')
    .from('leads')
    .select('*', { count: 'exact', head: true });

  // Get most recent review scrape
  const { data: recent } = await supabase
    .schema('crm')
    .from('leads')
    .select('company_name, city, state, source_metadata')
    .not('source_metadata->reviews', 'is', null)
    .order('updated_at', { ascending: false })
    .limit(5);

  console.log(`✅ Leads with reviews: ${withReviews} / ${totalLeads}`);
  console.log(`📈 Progress: ${((withReviews! / totalLeads!) * 100).toFixed(1)}%`);
  console.log(`\n🔥 Most recently scraped:\n`);
  
  recent?.forEach((lead, i) => {
    const reviewCount = lead.source_metadata?.reviews?.length || 0;
    console.log(`${i + 1}. ${lead.company_name} (${lead.city}, ${lead.state}) - ${reviewCount} reviews`);
  });

  console.log(`\n💡 Expected target: ~1,119 filtered leads`);
}

checkStatus();
