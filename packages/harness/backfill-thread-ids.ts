/**
 * Backfill Gmail Thread IDs
 * 
 * For campaigns that have message IDs but no thread IDs,
 * query Gmail API to get the thread ID and update the database.
 */

import { createClient } from '@supabase/supabase-js';
import { google } from 'googleapis';
import dotenv from 'dotenv';

dotenv.config({ path: '.env.production' });

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function backfillThreadIds() {
  console.log('🔍 Backfilling Gmail thread IDs for existing campaigns...\n');
  
  // Get campaigns with message IDs but no thread IDs
  const { data: campaigns, error } = await supabase
    .schema('crm')
    .from('email_campaigns')
    .select('id, gmail_message_id, sent_from_email')
    .not('sent_at', 'is', null)
    .not('gmail_message_id', 'is', null)
    .is('gmail_thread_id', null);
  
  if (error || !campaigns) {
    console.error('❌ Error fetching campaigns:', error);
    return;
  }
  
  console.log(`📊 Found ${campaigns.length} campaigns missing thread IDs\n`);
  
  if (campaigns.length === 0) {
    console.log('✅ All campaigns already have thread IDs!');
    return;
  }
  
  // Group by sender
  const bySender = new Map<string, typeof campaigns>();
  for (const campaign of campaigns) {
    const sender = campaign.sent_from_email || 'unknown';
    if (!bySender.has(sender)) {
      bySender.set(sender, []);
    }
    bySender.get(sender)!.push(campaign);
  }
  
  let updated = 0;
  let errors = 0;
  
  // Process each sender
  for (const [senderEmail, senderCampaigns] of bySender.entries()) {
    console.log(`\n🔍 Processing ${senderCampaigns.length} campaigns from ${senderEmail}...`);
    
    try {
      // Get OAuth token for this sender
      const senderUser = senderEmail.split('@')[0];
      const tenantId = `sender-${senderUser}`;
      
      const { data: integration } = await supabase
        .from('node_integrations')
        .select('*')
        .eq('node_id', tenantId)
        .eq('provider', 'google')
        .single();
      
      if (!integration) {
        console.log(`⚠️  No Gmail OAuth found for ${senderEmail}, skipping...`);
        continue;
      }
      
      // Create Gmail API client
      const oauth2Client = new google.auth.OAuth2();
      oauth2Client.setCredentials({ access_token: integration.access_token });
      const gmail = google.gmail({ version: 'v1', auth: oauth2Client });
      
      // Process each campaign
      for (const campaign of senderCampaigns) {
        try {
          // Get the message to extract thread ID
          const message = await gmail.users.messages.get({
            userId: 'me',
            id: campaign.gmail_message_id,
            format: 'minimal', // We only need metadata
          });
          
          const threadId = message.data.threadId;
          
          if (threadId) {
            // Update the campaign with thread ID
            await supabase
              .schema('crm')
              .from('email_campaigns')
              .update({ gmail_thread_id: threadId })
              .eq('id', campaign.id);
            
            updated++;
            
            if (updated % 10 === 0) {
              console.log(`  ... updated ${updated}/${senderCampaigns.length}`);
            }
          }
          
          // Rate limiting
          await new Promise(resolve => setTimeout(resolve, 100));
          
        } catch (msgError: any) {
          console.error(`  ⚠️  Error fetching message ${campaign.gmail_message_id}:`, msgError.message);
          errors++;
        }
      }
      
    } catch (gmailError: any) {
      console.error(`❌ Error with Gmail client for ${senderEmail}:`, gmailError.message);
    }
  }
  
  console.log(`\n✅ Backfill complete!`);
  console.log(`   Updated: ${updated}`);
  console.log(`   Errors: ${errors}`);
  console.log(`\n💡 You can now run the bounce audit to check for bounces!`);
}

backfillThreadIds().catch(console.error);
