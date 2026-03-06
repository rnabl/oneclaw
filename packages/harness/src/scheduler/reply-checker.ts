/**
 * Reply Checker
 * 
 * Polls Gmail for replies to sent campaign emails.
 * Sends Telegram notifications when replies are detected.
 */

import { google } from 'googleapis';
import { getSupabaseClient } from '../lib/supabase';
import { sendTelegramNotification } from './email-sender';

// Check for replies every 5 minutes
const CHECK_INTERVAL_MS = 5 * 60 * 1000;

// Track if checker is running
let isRunning = false;
let lastCheckTime: Date | null = null;

interface SentCampaign {
  id: string;
  lead_id: string;
  gmail_thread_id: string;
  gmail_message_id: string;
  sent_from_email: string;
  sent_at: string;
  reply_detected_at: string | null;
  lead: {
    email: string;
    company_name: string;
    contact_name: string | null;
  } | null;
}

interface Reply {
  campaignId: string;
  leadEmail: string;
  companyName: string;
  contactName: string | null;
  snippet: string;
  fullBody: string;
  receivedAt: string;
}

/**
 * Get OAuth token for a sender email
 */
async function getAccessToken(senderEmail: string): Promise<string | null> {
  const supabase = getSupabaseClient();
  if (!supabase) return null;
  
  // Find the tenant ID for this sender
  const { data: integration } = await supabase
    .from('node_integrations')
    .select('node_id, access_token, refresh_token, token_expires_at')
    .eq('provider', 'google')
    .single();
  
  if (!integration) return null;
  
  // Check if token needs refresh
  const expiresAt = new Date(integration.token_expires_at);
  if (expiresAt.getTime() - Date.now() < 60 * 1000 && integration.refresh_token) {
    // Refresh the token
    const oauth2Client = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET
    );
    oauth2Client.setCredentials({ refresh_token: integration.refresh_token });
    
    try {
      const { credentials } = await oauth2Client.refreshAccessToken();
      if (credentials.access_token) {
        // Update in database
        await supabase
          .from('node_integrations')
          .update({
            access_token: credentials.access_token,
            token_expires_at: new Date(credentials.expiry_date || Date.now() + 3600000).toISOString(),
          })
          .eq('node_id', integration.node_id)
          .eq('provider', 'google');
        
        return credentials.access_token;
      }
    } catch (e) {
      console.error('[ReplyChecker] Failed to refresh token:', e);
      return null;
    }
  }
  
  return integration.access_token;
}

/**
 * Get sent campaigns that haven't had replies detected yet
 */
async function getSentCampaignsWithThreads(): Promise<SentCampaign[]> {
  const supabase = getSupabaseClient();
  if (!supabase) return [];
  
  // Get campaigns sent in the last 30 days that have thread IDs and no reply yet
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
  
  const { data, error } = await supabase
    .schema('crm')
    .from('email_campaigns')
    .select(`
      id,
      lead_id,
      gmail_thread_id,
      gmail_message_id,
      sent_from_email,
      sent_at,
      reply_detected_at,
      lead:leads(email, company_name, contact_data)
    `)
    .not('gmail_thread_id', 'is', null)
    .not('sent_at', 'is', null)
    .is('reply_detected_at', null)
    .gte('sent_at', thirtyDaysAgo.toISOString())
    .order('sent_at', { ascending: false })
    .limit(50); // Check 50 most recent campaigns per run
  
  if (error) {
    console.error('[ReplyChecker] Error fetching campaigns:', error);
    return [];
  }
  
  return (data || []).map(d => {
    const lead = Array.isArray(d.lead) ? d.lead[0] : d.lead;
    return {
      ...d,
      lead: lead ? {
        email: lead.email,
        company_name: lead.company_name,
        contact_name: lead.contact_data?.owner_name || null,
      } : null,
    };
  }) as SentCampaign[];
}

/**
 * Check if a message is a bounce/automated response
 */
function isBounceOrAutomated(fromHeader: string, subject: string, body: string, snippet: string): boolean {
  const from = fromHeader.toLowerCase();
  const subjectLower = subject.toLowerCase();
  const bodyLower = body.toLowerCase();
  const snippetLower = snippet.toLowerCase();
  
  // Check sender patterns
  const bouncePatterns = [
    'mailer-daemon',
    'postmaster',
    'no-reply',
    'noreply',
    'do-not-reply',
    'bounce',
    'undeliverable',
    'mail delivery',
    'delivery status notification',
    'automatic reply',
    'auto-reply',
    'out of office',
    'out-of-office',
  ];
  
  for (const pattern of bouncePatterns) {
    if (from.includes(pattern)) {
      return true;
    }
  }
  
  // Check subject patterns
  const bounceSubjects = [
    'undeliverable',
    'delivery failed',
    'failure notice',
    'returned mail',
    'delivery status notification',
    'mail delivery failed',
    'address not found',
    'domain not found',
    'user unknown',
    'out of office',
    'automatic reply',
    'auto-reply',
  ];
  
  for (const pattern of bounceSubjects) {
    if (subjectLower.includes(pattern)) {
      return true;
    }
  }
  
  // Check body/snippet patterns
  const bounceBodyPatterns = [
    'address not found',
    'domain not found',
    'does not exist',
    'user unknown',
    'mailbox unavailable',
    'recipient address rejected',
    'delivery has failed',
    'message could not be delivered',
    'permanent error',
    'mail system error',
  ];
  
  for (const pattern of bounceBodyPatterns) {
    if (bodyLower.includes(pattern) || snippetLower.includes(pattern)) {
      return true;
    }
  }
  
  return false;
}

/**
 * Check a single thread for replies
 */
async function checkThreadForReply(
  accessToken: string,
  campaign: SentCampaign
): Promise<Reply | null> {
  try {
    const oauth2Client = new google.auth.OAuth2();
    oauth2Client.setCredentials({ access_token: accessToken });
    
    const gmail = google.gmail({ version: 'v1', auth: oauth2Client });
    
    // Get the thread
    const thread = await gmail.users.threads.get({
      userId: 'me',
      id: campaign.gmail_thread_id,
      format: 'metadata',
      metadataHeaders: ['From', 'To', 'Subject', 'Date'],
    });
    
    if (!thread.data.messages || thread.data.messages.length <= 1) {
      // No replies yet (only our sent message)
      return null;
    }
    
    // Get our email to identify inbound messages
    const profile = await gmail.users.getProfile({ userId: 'me' });
    const myEmail = profile.data.emailAddress?.toLowerCase() || '';
    
    // Find the first inbound message (reply)
    for (const msg of thread.data.messages) {
      const headers = msg.payload?.headers || [];
      const fromHeader = headers.find(h => h.name?.toLowerCase() === 'from')?.value || '';
      const fromEmail = fromHeader.match(/<(.+)>/)?.[1] || fromHeader;
      const subjectHeader = headers.find(h => h.name?.toLowerCase() === 'subject')?.value || '';
      
      // Skip our own messages
      if (fromEmail.toLowerCase().includes(myEmail)) {
        continue;
      }
      
      // Skip if this is our original sent message
      if (msg.id === campaign.gmail_message_id) {
        continue;
      }
      
      // Skip bounces and automated responses
      const snippet = msg.snippet || '';
      if (isBounceOrAutomated(fromHeader, subjectHeader, '', snippet)) {
        console.log(`[ReplyChecker] Skipping bounce/automated response from ${fromEmail}`);
        continue;
      }
      
      // This is a reply! Get the full body
      const fullMessage = await gmail.users.messages.get({
        userId: 'me',
        id: msg.id!,
        format: 'full',
      });
      
      // Extract body
      const getBody = (part: any): string => {
        if (part.mimeType === 'text/plain' && part.body?.data) {
          return Buffer.from(part.body.data, 'base64').toString('utf-8');
        }
        if (part.parts) {
          for (const subPart of part.parts) {
            const body = getBody(subPart);
            if (body) return body;
          }
        }
        return '';
      };
      
      let body = getBody(fullMessage.data.payload);
      if (!body && fullMessage.data.snippet) {
        body = fullMessage.data.snippet;
      }
      
      // Double-check body for bounce patterns
      if (isBounceOrAutomated(fromHeader, subjectHeader, body, snippet)) {
        console.log(`[ReplyChecker] Skipping bounce/automated response after body check from ${fromEmail}`);
        continue;
      }
      
      const dateHeader = headers.find(h => h.name?.toLowerCase() === 'date')?.value;
      
      return {
        campaignId: campaign.id,
        leadEmail: campaign.lead?.email || '',
        companyName: campaign.lead?.company_name || 'Unknown',
        contactName: campaign.lead?.contact_name || null,
        snippet: msg.snippet || '',
        fullBody: body,
        receivedAt: dateHeader || new Date().toISOString(),
      };
    }
    
    return null;
  } catch (e) {
    console.error(`[ReplyChecker] Error checking thread ${campaign.gmail_thread_id}:`, e);
    return null;
  }
}

/**
 * Mark a campaign as having received a reply
 */
async function markReplyDetected(campaignId: string, replySnippet: string): Promise<void> {
  const supabase = getSupabaseClient();
  if (!supabase) return;
  
  await supabase
    .schema('crm')
    .from('email_campaigns')
    .update({
      reply_detected_at: new Date().toISOString(),
      reply_snippet: replySnippet.substring(0, 500), // Store first 500 chars
    })
    .eq('id', campaignId);
}

/**
 * Send Telegram notification for a reply
 */
async function notifyReply(reply: Reply): Promise<void> {
  const contactDisplay = reply.contactName || reply.leadEmail;
  const snippet = reply.snippet.length > 200 
    ? reply.snippet.substring(0, 200) + '...' 
    : reply.snippet;
  
  const message = `📬 <b>New Reply!</b>

<b>From:</b> ${contactDisplay}
<b>Company:</b> ${reply.companyName}

<i>"${snippet}"</i>

Check Gmail for the full conversation.`;
  
  await sendTelegramNotification(message);
}

/**
 * Run one check cycle
 */
async function checkForReplies(): Promise<{ checked: number; repliesFound: number }> {
  const stats = { checked: 0, repliesFound: 0 };
  
  console.log('[ReplyChecker] Checking for replies...');
  
  // Get campaigns to check
  const campaigns = await getSentCampaignsWithThreads();
  
  if (campaigns.length === 0) {
    console.log('[ReplyChecker] No campaigns to check');
    return stats;
  }
  
  console.log(`[ReplyChecker] Checking ${campaigns.length} campaigns for replies`);
  
  // Group campaigns by sender email to use the right token
  const bySender = new Map<string, SentCampaign[]>();
  for (const campaign of campaigns) {
    const sender = campaign.sent_from_email;
    if (!bySender.has(sender)) {
      bySender.set(sender, []);
    }
    bySender.get(sender)!.push(campaign);
  }
  
  // Check each sender's campaigns
  for (const [senderEmail, senderCampaigns] of bySender) {
    const accessToken = await getAccessToken(senderEmail);
    if (!accessToken) {
      console.log(`[ReplyChecker] No access token for ${senderEmail}, skipping`);
      continue;
    }
    
    for (const campaign of senderCampaigns) {
      stats.checked++;
      
      const reply = await checkThreadForReply(accessToken, campaign);
      
      if (reply) {
        stats.repliesFound++;
        console.log(`[ReplyChecker] 📬 Reply detected from ${reply.companyName}!`);
        
        // Mark in database
        await markReplyDetected(campaign.id, reply.snippet);
        
        // Send Telegram notification
        await notifyReply(reply);
      }
      
      // Small delay between API calls to avoid rate limits
      await new Promise(resolve => setTimeout(resolve, 200));
    }
  }
  
  console.log(`[ReplyChecker] Done. Checked ${stats.checked}, found ${stats.repliesFound} replies`);
  lastCheckTime = new Date();
  
  return stats;
}

/**
 * Start the reply checker loop
 */
export async function startReplyChecker(): Promise<void> {
  if (isRunning) {
    console.log('[ReplyChecker] Already running');
    return;
  }
  
  isRunning = true;
  console.log('[ReplyChecker] Starting reply checker (every 5 minutes)');
  
  // Run immediately on start
  await checkForReplies();
  
  // Then run every 5 minutes
  const interval = setInterval(async () => {
    if (!isRunning) {
      clearInterval(interval);
      return;
    }
    
    try {
      await checkForReplies();
    } catch (e) {
      console.error('[ReplyChecker] Error in check cycle:', e);
    }
  }, CHECK_INTERVAL_MS);
}

/**
 * Stop the reply checker
 */
export function stopReplyChecker(): void {
  isRunning = false;
  console.log('[ReplyChecker] Stopped');
}

/**
 * Get reply checker status
 */
export function getReplyCheckerStatus(): { running: boolean; lastCheck: Date | null } {
  return {
    running: isRunning,
    lastCheck: lastCheckTime,
  };
}

/**
 * Manually trigger a reply check (for testing/API)
 */
export async function triggerReplyCheck(): Promise<{ checked: number; repliesFound: number }> {
  return await checkForReplies();
}
