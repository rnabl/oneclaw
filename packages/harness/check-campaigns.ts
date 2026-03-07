import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config({ path: '.env.production' });

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function checkCampaigns() {
  console.log('📊 Checking email campaigns data structure...\n');
  
  // Check total sent
  const { count: totalSent } = await supabase
    .schema('crm')
    .from('email_campaigns')
    .select('*', { count: 'exact', head: true })
    .not('sent_at', 'is', null);
  
  console.log(`Total sent campaigns: ${totalSent}`);
  
  // Check how many have thread IDs
  const { count: withThreads } = await supabase
    .schema('crm')
    .from('email_campaigns')
    .select('*', { count: 'exact', head: true })
    .not('sent_at', 'is', null)
    .not('gmail_thread_id', 'is', null);
  
  console.log(`Campaigns with Gmail thread IDs: ${withThreads}`);
  console.log(`Campaigns WITHOUT thread IDs: ${(totalSent || 0) - (withThreads || 0)}\n`);
  
  // Sample a few campaigns
  const { data: samples } = await supabase
    .schema('crm')
    .from('email_campaigns')
    .select('id, sent_at, gmail_thread_id, gmail_message_id, approval_status, rejection_reason')
    .not('sent_at', 'is', null)
    .order('sent_at', { ascending: false })
    .limit(5);
  
  console.log('Sample recent campaigns:');
  samples?.forEach((c, idx) => {
    console.log(`\n${idx + 1}. Campaign ${c.id.substring(0, 8)}...`);
    console.log(`   Status: ${c.approval_status}`);
    console.log(`   Has thread ID: ${c.gmail_thread_id ? 'YES' : 'NO'}`);
    console.log(`   Has message ID: ${c.gmail_message_id ? 'YES' : 'NO'}`);
    if (c.rejection_reason) {
      console.log(`   Rejection: ${c.rejection_reason.substring(0, 60)}...`);
    }
  });
  
  // Check if any already marked as rejected
  const { count: rejected } = await supabase
    .schema('crm')
    .from('email_campaigns')
    .select('*', { count: 'exact', head: true })
    .eq('approval_status', 'rejected');
  
  console.log(`\n\nCampaigns already marked as rejected: ${rejected}`);
}

checkCampaigns().catch(console.error);
