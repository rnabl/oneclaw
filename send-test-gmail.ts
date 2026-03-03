/**
 * Test email via Gmail API - HTML styled as plain text
 */

import { config } from 'dotenv';
import { createClient } from '@supabase/supabase-js';

config();

const supabaseUrl = process.env.SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

const TEST_RECIPIENT = 'Ryan@nabl.ai';

// Extract sender name from email (riley@ -> Riley)
function getSenderName(email: string): string {
  const localPart = email.split('@')[0];
  return localPart.charAt(0).toUpperCase() + localPart.slice(1);
}

const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || '';
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET || '';

async function refreshAccessToken(refreshToken: string): Promise<string | null> {
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
  
  if (!response.ok) return null;
  const data = await response.json();
  return data.access_token;
}

function bodyToHtml(body: string): string {
  // Convert body to minimal HTML
  // Merge CTA + signature into same paragraph so Gmail doesn't hide it
  const paragraphs = body.split('\n\n');
  let html = '';
  
  for (let i = 0; i < paragraphs.length; i++) {
    const p = paragraphs[i];
    const nextP = paragraphs[i + 1];
    const isSignature = p.startsWith('-') && p.length < 20;
    const nextIsSignature = nextP?.startsWith('-') && nextP.length < 20;
    
    if (isSignature) {
      // Already merged with previous, skip
      continue;
    } else if (nextIsSignature) {
      // Merge this paragraph with signature
      html += `<p style="margin:0 0 1em 0;">${p.replace(/\n/g, '<br>')}<br><br>${nextP}</p>`;
    } else {
      html += `<p style="margin:0 0 1em 0;">${p.replace(/\n/g, '<br>')}</p>`;
    }
  }
  
  return `<div>${html}</div>`;
}

async function sendTestEmail() {
  console.log('\n📧 Sending Test Email (Gmail API)\n');
  console.log('='.repeat(60) + '\n');
  
  // Get a random campaign (any sender)
  const { data: campaigns, error } = await supabase
    .schema('crm')
    .from('email_campaigns')
    .select('id, subject, body, template_name, sent_from_email')
    .eq('sent_from_email', 'madison@closelanepro.com')
    .limit(1);
  
  if (error || !campaigns || campaigns.length === 0) {
    console.error('❌ No campaigns found');
    return;
  }
  
  const campaign = campaigns[0];
  const senderEmail = campaign.sent_from_email;
  const senderName = getSenderName(senderEmail);
  
  // Get OAuth token - try sender-specific first, then fallback
  const senderUser = senderEmail.split('@')[0];
  const senderNodeId = `sender-${senderUser}`;
  
  let { data: integrations } = await supabase
    .from('node_integrations')
    .select('*')
    .eq('node_id', senderNodeId)
    .eq('provider', 'google')
    .order('created_at', { ascending: false })
    .limit(1);
  
  // Fallback to legacy oneclaw-vps-1
  if (!integrations || integrations.length === 0) {
    console.log(`⚠️  No OAuth for ${senderNodeId}, falling back to oneclaw-vps-1`);
    const fallback = await supabase
      .from('node_integrations')
      .select('*')
      .eq('node_id', 'oneclaw-vps-1')
      .eq('provider', 'google')
      .order('created_at', { ascending: false })
      .limit(1);
    integrations = fallback.data;
  }
  
  const integration = integrations?.[0];
  
  if (!integration) {
    console.error('❌ No Gmail OAuth found. Connect at /gmail/senders');
    return;
  }
  
  console.log(`✅ Using OAuth from: ${integration.node_id}`);
  
  console.log('📄 Campaign:');
  console.log(`   Template: ${campaign.template_name}`);
  console.log(`   Subject: ${campaign.subject}`);
  console.log(`   From: ${senderName} <${senderEmail}>`);
  console.log(`   To: ${TEST_RECIPIENT}\n`);
  
  console.log('📝 Body:');
  console.log('---');
  console.log(campaign.body);
  console.log('---\n');
  
  // Convert to HTML
  const htmlBody = bodyToHtml(campaign.body);
  
  // Build raw RFC 2822 message
  const rawMessage = [
    `From: "${senderName}" <${senderEmail}>`,
    `To: ${TEST_RECIPIENT}`,
    `Subject: [TEST] ${campaign.subject}`,
    `Date: ${new Date().toUTCString()}`,
    'MIME-Version: 1.0',
    'Content-Type: text/html; charset=UTF-8',
    '',
    htmlBody,
  ].join('\r\n');
  
  console.log('📝 HTML:');
  console.log(htmlBody);
  console.log('\n');
  
  // Base64url encode
  const encodedMessage = Buffer.from(rawMessage)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
  
  // Refresh token
  const accessToken = await refreshAccessToken(integration.refresh_token);
  if (!accessToken) {
    console.error('❌ Failed to refresh token');
    return;
  }
  
  // Send via Gmail API
  try {
    const response = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/send', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ raw: encodedMessage }),
    });
    
    if (!response.ok) {
      console.error('❌ Gmail API error:', await response.text());
      return;
    }
    
    const result = await response.json();
    console.log('✅ Email sent!');
    console.log(`   Message ID: ${result.id}`);
    console.log(`\n📬 Check ${TEST_RECIPIENT}\n`);
    
  } catch (error) {
    console.error('❌ Send error:', error);
  }
}

sendTestEmail().catch(console.error);
