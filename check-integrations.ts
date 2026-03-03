import { config } from 'dotenv';
import { createClient } from '@supabase/supabase-js';
config();

const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

async function check() {
  const { data, error } = await supabase
    .from('node_integrations')
    .select('node_id, provider, created_at')
    .eq('provider', 'google');

  console.log('Gmail integrations found:');
  if (error) console.log('Error:', error.message);
  if (!data || data.length === 0) console.log('  (none)');
  data?.forEach(d => console.log(`  - ${d.node_id} (connected ${d.created_at})`));
}

check();
