/**
 * Test email using Resend - Plain Text Only
 */

import { config } from 'dotenv';
import { createClient } from '@supabase/supabase-js';
import { Resend } from 'resend';

config();

const supabaseUrl = process.env.SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

const resend = new Resend(process.env.RESEND_API_KEY);

const TEST_RECIPIENT = 'Ryan@nabl.ai';
const SENDER_EMAIL = 'riley@closelanepro.com';
const SENDER_NAME = 'Riley';

async function sendTestEmail() {
  console.log('\n📧 Sending Test Email (Resend - Plain Text)\n');
  console.log('='.repeat(60) + '\n');
  
  // Check for API key
  if (!process.env.RESEND_API_KEY) {
    console.error('❌ RESEND_API_KEY not set in .env');
    console.log('\n👉 Get an API key at https://resend.com/api-keys');
    console.log('   Then add RESEND_API_KEY=re_xxxxx to your .env file\n');
    return;
  }
  
  // Get a campaign
  const { data: campaigns, error } = await supabase
    .schema('crm')
    .from('email_campaigns')
    .select('id, subject, body, template_name')
    .limit(1);
  
  if (error || !campaigns || campaigns.length === 0) {
    console.error('❌ No campaigns found');
    return;
  }
  
  const campaign = campaigns[0];
  
  console.log('📄 Campaign:');
  console.log(`   Template: ${campaign.template_name}`);
  console.log(`   Subject: ${campaign.subject}`);
  console.log(`   From: ${SENDER_NAME} <${SENDER_EMAIL}>`);
  console.log(`   To: ${TEST_RECIPIENT}\n`);
  
  console.log('📝 Body:');
  console.log('---');
  console.log(campaign.body);
  console.log('---\n');
  
  console.log('📤 Sending via Resend...\n');
  
  try {
    const { data, error } = await resend.emails.send({
      from: `${SENDER_NAME} <${SENDER_EMAIL}>`,
      to: [TEST_RECIPIENT],
      subject: `[TEST] ${campaign.subject}`,
      text: campaign.body,
      // No html field - plain text only!
    });
    
    if (error) {
      console.error('❌ Resend error:', error);
      return;
    }
    
    console.log('✅ Email sent successfully!');
    console.log(`   ID: ${data?.id}`);
    console.log(`\n📬 Check your inbox at ${TEST_RECIPIENT}\n`);
    
  } catch (err) {
    console.error('❌ Send error:', err);
  }
}

sendTestEmail().catch(console.error);
