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

async function checkLast6Hours() {
  const sixHoursAgo = new Date(Date.now() - 6 * 60 * 60 * 1000).toISOString();
  
  const { data } = await supabase
    .schema('crm')
    .from('leads')
    .select('company_name, city, state, updated_at')
    .not('source_metadata->reviews', 'is', null)
    .gte('updated_at', sixHoursAgo)
    .order('updated_at', { ascending: true });

  console.log('\n📊 LAST 6 HOURS ACTIVITY:');
  console.log(`Total leads scraped: ${data?.length || 0}`);
  
  if (data && data.length > 0) {
    console.log(`\nFirst: ${data[0].company_name} (${data[0].city}, ${data[0].state})`);
    console.log(`Time: ${data[0].updated_at}`);
    console.log(`\nLast: ${data[data.length-1].company_name} (${data[data.length-1].city}, ${data[data.length-1].state})`);
    console.log(`Time: ${data[data.length-1].updated_at}`);
  }
}

checkLast6Hours();
