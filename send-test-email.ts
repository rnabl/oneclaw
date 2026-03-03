/**
 * Send a test email from one of the generated campaigns
 */

import { config } from 'dotenv';
import { createClient } from '@supabase/supabase-js';

config();

const supabaseUrl = process.env.SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

const TEST_RECIPIENT = 'Ryan@nabl.ai';

const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || '';
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET || '';

async function refreshAccessToken(refreshToken: string): Promise<{ access_token: string; expires_in: number } | null> {
  try {
    const response = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: GOOGLE_CLIENT_ID,
        client_secret: GOOGLE_CLIENT_SECRET,
        refresh_token: refreshToken,
        grant_type: 'refresh_token',
      }),
    });
    
    if (!response.ok) {
      console.error('Token refresh failed:', await response.text());
      return null;
    }
    
    return await response.json();
  } catch (error) {
    console.error('Token refresh error:', error);
    return null;
  }
}

async function sendTestEmail() {
  console.log('\n📧 Sending Test Email\n');
  console.log('='.repeat(60) + '\n');
  
  // Get one campaign from each template type
  const { data: campaigns, error } = await supabase
    .schema('crm')
    .from('email_campaigns')
    .select('id, subject, body, sent_from_email, template_name')
    .limit(4);
  
  if (error || !campaigns || campaigns.length === 0) {
    console.error('❌ No campaigns found:', error);
    return;
  }
  
  // Pick the first one
  const campaign = campaigns[0];
  
  console.log('📄 Selected Campaign:');
  console.log(`   Template: ${campaign.template_name}`);
  console.log(`   Subject: ${campaign.subject}`);
  console.log(`   From: ${campaign.sent_from_email}`);
  console.log(`   To: ${TEST_RECIPIENT}\n`);
  
  // Get the sender's OAuth token
  // Currently all senders use the same OAuth connection (oneclaw-vps-1)
  // TODO: Set up separate OAuth for each sender
  const tenantId = 'oneclaw-vps-1';
  const senderUser = campaign.sent_from_email.split('@')[0]; // e.g., "riley"
  
  console.log(`🔑 Looking for OAuth token for: ${tenantId}\n`);
  
  // Get integration from node_integrations (get most recent)
  const { data: integrations, error: intError } = await supabase
    .from('node_integrations')
    .select('*')
    .eq('node_id', tenantId)
    .eq('provider', 'google')
    .order('created_at', { ascending: false })
    .limit(1);
  
  const integration = integrations?.[0];
  
  if (intError || !integration) {
    console.error(`❌ No Gmail OAuth found for ${tenantId}`);
    console.log(`\n👉 Connect Gmail at: http://localhost:8787/oauth/google?node_id=${tenantId}\n`);
    return;
  }
  
  console.log('✅ Found OAuth token\n');
  
  let accessToken = integration.access_token;
  const expiresAt = integration.token_expires_at ? new Date(integration.token_expires_at) : new Date(0);
  
  // Refresh if needed
  if (expiresAt.getTime() - Date.now() < 60 * 1000 && integration.refresh_token) {
    console.log('🔄 Refreshing token...');
    const refreshed = await refreshAccessToken(integration.refresh_token);
    if (refreshed) {
      accessToken = refreshed.access_token;
      console.log('✅ Token refreshed\n');
    } else {
      console.error('❌ Token refresh failed');
      return;
    }
  }
  
  // Send the email via Gmail API
  console.log('📤 Sending email...\n');
  
  const senderName = senderUser.charAt(0).toUpperCase() + senderUser.slice(1);
  const fromHeader = `${senderName} <${campaign.sent_from_email}>`;
  
  // Build plain text email with format=flowed for natural wrapping
  const emailLines = [
    `From: ${fromHeader}`,
    `To: ${TEST_RECIPIENT}`,
    `Subject: [TEST] ${campaign.subject}`,
    'MIME-Version: 1.0',
    'Content-Type: text/plain; charset=utf-8; format=flowed',
    '',
    campaign.body,
  ];
  
  const rawEmail = emailLines.join('\r\n');
  const encodedEmail = Buffer.from(rawEmail)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
  
  try {
    const response = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/send', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ raw: encodedEmail }),
    });
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error('❌ Gmail API error:', errorText);
      return;
    }
    
    const result = await response.json();
    console.log('✅ Email sent successfully!');
    console.log(`   Message ID: ${result.id}`);
    console.log(`   Thread ID: ${result.threadId}`);
    console.log(`\n📬 Check your inbox at ${TEST_RECIPIENT}\n`);
    
  } catch (error) {
    console.error('❌ Send error:', error);
  }
}

sendTestEmail().catch(console.error);
