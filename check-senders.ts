import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function main() {
  const { data, error } = await supabase
    .from('node_integrations')
    .select('*')
    .eq('provider', 'google')
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Error:', error);
    return;
  }

  console.log('\n=== All Google Integrations ===\n');
  if (data && data.length > 0) {
    console.log('Columns:', Object.keys(data[0]));
    console.log('');
  }
  for (const row of data || []) {
    console.log(JSON.stringify(row, null, 2));
    console.log('---');
  }
  console.log(`\nTotal: ${data?.length || 0} integrations`);
}

main();
