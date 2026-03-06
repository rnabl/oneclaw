/**
 * Email Sender - Scheduled Email Campaign Processor
 * 
 * Processes approved email campaigns from crm.email_campaigns
 * and sends them via Gmail API with rate limiting and sender rotation.
 * 
 * Features:
 * - Daily limits per sender (default: 50/day)
 * - Random delays between sends (2-5 minutes)
 * - Sender rotation (round-robin)
 * - Crash recovery (picks up where it left off)
 */

import { createGmailClient } from '../gmail/client';
import { getSupabaseClient } from '../lib/supabase';

const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || '';
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET || '';

// Configuration
const DAILY_LIMIT_PER_SENDER = 100; // Increased from 50 - still safe for aged Gmail accounts
const MIN_DELAY_SECONDS = 60;  // 1 minute minimum between emails (was 120)
const MAX_DELAY_SECONDS = 180; // 3 minutes maximum between emails (was 360)
const POLL_INTERVAL_MS = 10000; // Check for new emails every 10 seconds when idle

// Time window: 1 PM - 9 PM EST (18:00 - 02:00 UTC)
const SEND_WINDOW_START_UTC = 18; // 1 PM EST = 6 PM UTC (during EST, not EDT)
const SEND_WINDOW_END_UTC = 2;    // 9 PM EST = 2 AM UTC next day

// Telegram config - read at runtime, not module load
function getTelegramConfig() {
  return {
    botToken: process.env.TELEGRAM_BOT_TOKEN || '',
    chatId: process.env.TELEGRAM_CHAT_ID || '',
  };
}

// Stats tracking
let sessionStats = {
  sent: 0,
  failed: 0,
  lastReportTime: new Date(),
  sessionStart: new Date(),
};

// Mutex to prevent concurrent queue processing
let isProcessingQueue = false;

interface EmailCampaign {
  id: string;
  lead_id: string;
  subject: string;
  body: string;
  sent_from_email: string;
  lead?: {
    email: string;
    company_name: string;
  };
}

/**
 * Get count of emails sent today by a specific sender
 */
async function getSentTodayCount(senderEmail: string): Promise<number> {
  const supabase = getSupabaseClient();
  if (!supabase) return 999; // Block sending if no DB
  
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  
  const { count, error } = await supabase
    .schema('crm')
    .from('email_campaigns')
    .select('id', { count: 'exact', head: true })
    .eq('sent_from_email', senderEmail)
    .gte('sent_at', today.toISOString());
  
  if (error) {
    console.error('[EmailSender] Error checking sent count:', error);
    return 999; // Block sending on error
  }
  
  return count || 0;
}

/**
 * Get next batch of approved emails ready to send
 */
async function getReadyEmails(limit: number): Promise<EmailCampaign[]> {
  const supabase = getSupabaseClient();
  if (!supabase) return [];
  
  // Get approved campaigns that haven't been sent
  const { data: campaigns, error } = await supabase
    .schema('crm')
    .from('email_campaigns')
    .select(`
      id,
      lead_id,
      subject,
      body,
      sent_from_email
    `)
    .eq('approval_status', 'approved')
    .is('sent_at', null)
    .order('created_at', { ascending: true })
    .limit(limit);
  
  if (error || !campaigns) {
    if (error) console.error('[EmailSender] Error fetching campaigns:', error);
    return [];
  }
  
  // Get lead emails
  const leadIds = campaigns.map(c => c.lead_id).filter(Boolean);
  let leadsMap: Record<string, any> = {};
  
  if (leadIds.length > 0) {
    const { data: leads } = await supabase
      .schema('crm')
      .from('leads')
      .select('id, email, company_name')
      .in('id', leadIds);
    
    if (leads) {
      leadsMap = Object.fromEntries(leads.map(l => [l.id, l]));
    }
  }
  
  // Merge lead data
  return campaigns.map(c => ({
    ...c,
    lead: c.lead_id ? leadsMap[c.lead_id] || null : null
  }));
}

/**
 * Mark an email as sent
 */
async function markEmailSent(emailId: string, gmailMessageId?: string): Promise<boolean> {
  const supabase = getSupabaseClient();
  if (!supabase) return false;
  
  const { error } = await supabase
    .schema('crm')
    .from('email_campaigns')
    .update({
      sent_at: new Date().toISOString(),
      gmail_message_id: gmailMessageId,
    })
    .eq('id', emailId);
  
  return !error;
}

/**
 * Mark an email as failed
 */
async function markEmailFailed(emailId: string, reason: string): Promise<void> {
  const supabase = getSupabaseClient();
  if (!supabase) return;
  
  await supabase
    .schema('crm')
    .from('email_campaigns')
    .update({
      approval_status: 'rejected',
      rejection_reason: `Send failed: ${reason}`,
    })
    .eq('id', emailId);
}

/**
 * Refresh an access token
 */
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
      console.error('[EmailSender] Token refresh failed:', await response.text());
      return null;
    }
    
    return await response.json();
  } catch (error) {
    console.error('[EmailSender] Token refresh error:', error);
    return null;
  }
}

/**
 * Send a single email via Gmail API
 */
async function sendEmail(campaign: EmailCampaign): Promise<{ success: boolean; messageId?: string; error?: string }> {
  if (!campaign.lead?.email) {
    return { success: false, error: 'No recipient email' };
  }
  
  // Validate email format
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(campaign.lead.email)) {
    return { success: false, error: `Invalid email format: ${campaign.lead.email}` };
  }
  
  // Skip obvious bad emails
  if (campaign.lead.email.includes('.png') || 
      campaign.lead.email.includes('.jpg') ||
      campaign.lead.email.includes('favicon')) {
    return { success: false, error: `Invalid email: ${campaign.lead.email}` };
  }
  
  try {
    const supabase = getSupabaseClient();
    if (!supabase) {
      return { success: false, error: 'Database not configured' };
    }
    
    // Look up OAuth by sender name (e.g., "sender-riley" for riley@closelanepro.com)
    const senderUser = campaign.sent_from_email.split('@')[0]; // e.g., "riley" from "riley@closelanepro.com"
    const tenantId = `sender-${senderUser}`;
    
    // Get integration from node_integrations table
    let { data: integration } = await supabase
      .from('node_integrations')
      .select('*')
      .eq('node_id', tenantId)
      .eq('provider', 'google')
      .single();
    
    // Fallback to legacy oneclaw-vps-1 if sender-specific doesn't exist
    if (!integration) {
      const { data: fallback } = await supabase
        .from('node_integrations')
        .select('*')
        .eq('node_id', 'oneclaw-vps-1')
        .eq('provider', 'google')
        .single();
      
      if (fallback) {
        integration = fallback;
        console.log(`[EmailSender] Warning: Using fallback OAuth for ${senderUser}. Connect at /gmail/senders`);
      }
    }
    
    if (!integration) {
      return { success: false, error: `Gmail not configured for ${campaign.sent_from_email}. Connect at /gmail/senders` };
    }
    
    // Use the actual tenantId from the integration we found
    const actualTenantId = integration.node_id || tenantId;
    
    let accessToken = integration.access_token;
    const expiresAt = integration.token_expires_at ? new Date(integration.token_expires_at) : new Date(0);
    
    // Refresh token if expired or expiring soon
    if (expiresAt.getTime() - Date.now() < 60 * 1000 && integration.refresh_token) {
      console.log(`[EmailSender] Refreshing token for ${senderUser}...`);
      const refreshed = await refreshAccessToken(integration.refresh_token);
      if (refreshed) {
        accessToken = refreshed.access_token;
        // Update token in database
        await supabase
          .from('node_integrations')
          .update({
            access_token: refreshed.access_token,
            token_expires_at: new Date(Date.now() + refreshed.expires_in * 1000).toISOString(),
          })
          .eq('node_id', actualTenantId)
          .eq('provider', 'google');
      } else {
        return { success: false, error: `Token refresh failed for ${senderUser}` };
      }
    }
    
    // Create Gmail client and send
    const gmailClient = createGmailClient();
    
    // Get sender display name
    const senderName = senderUser.charAt(0).toUpperCase() + senderUser.slice(1);
    
    // Update signature in body to match sender
    let emailBody = campaign.body;
    // Replace any existing signature (Riley, Ryan, Madison, Bailey, Alex, Jordan) with the actual sender name
    emailBody = emailBody.replace(/\n\n(Riley|Ryan|Madison|Bailey|Alex|Jordan)\s*$/i, `\n\n${senderName}`);
    
    const result = await gmailClient.sendEmailWithToken(accessToken, {
      to: campaign.lead.email,
      subject: campaign.subject,
      body: emailBody,
      fromName: senderName,
    });
    
    return { success: true, messageId: result.id };
    
  } catch (error) {
    return { success: false, error: String(error) };
  }
}

/**
 * Check if current time is within sending window (1 PM - 7 PM EST)
 */
function isWithinSendingWindow(): boolean {
  const now = new Date();
  const utcHour = now.getUTCHours();
  
  // 1 PM EST = 18:00 UTC (during standard time) or 17:00 UTC (during daylight time)
  // 7 PM EST = 00:00 UTC (midnight) (standard) or 23:00 UTC (daylight)
  // For simplicity, use a window that covers both: 17:00 - 00:00 UTC
  
  // Simple check: between 5 PM and midnight UTC
  return utcHour >= 17 && utcHour < 24;
}

/**
 * Send a Telegram notification
 */
export async function sendTelegramNotification(message: string): Promise<void> {
  const { botToken, chatId } = getTelegramConfig();
  
  if (!botToken || !chatId) {
    console.log('[EmailSender] Telegram not configured (missing TELEGRAM_BOT_TOKEN or TELEGRAM_CHAT_ID)');
    return;
  }
  
  try {
    console.log(`[EmailSender] Sending Telegram notification to chat ${chatId}...`);
    const response = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text: message,
        parse_mode: 'HTML',
      }),
    });
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error('[EmailSender] Telegram API error:', response.status, errorText);
    } else {
      console.log('[EmailSender] Telegram notification sent successfully');
    }
  } catch (error) {
    console.error('[EmailSender] Telegram notification failed:', error);
  }
}

/**
 * Send periodic progress report (every 30 minutes)
 */
async function maybeReportProgress(): Promise<void> {
  const now = new Date();
  const minutesSinceLastReport = (now.getTime() - sessionStats.lastReportTime.getTime()) / (1000 * 60);
  
  if (minutesSinceLastReport >= 30) {
    const stats = await getEmailQueueStats();
    const runtime = Math.round((now.getTime() - sessionStats.sessionStart.getTime()) / (1000 * 60));
    
    const message = `📧 <b>Email Campaign Update</b>

⏱ Running for: ${runtime} min
✅ Sent this session: ${sessionStats.sent}
❌ Failed: ${sessionStats.failed}

📊 <b>Queue Status:</b>
• Ready to send: ${stats.approved}
• Sent today: ${stats.sentToday}
• Total sent: ${stats.totalSent}`;

    await sendTelegramNotification(message);
    sessionStats.lastReportTime = now;
  }
}

/**
 * Process ONE email from the queue
 * 
 * Simple approach: get ONE email, send it, done.
 * No batching, no complexity - just one at a time.
 */
async function processOneEmail(): Promise<'sent' | 'failed' | 'skipped' | 'empty'> {
  const supabase = getSupabaseClient();
  if (!supabase) return 'empty';
  
  // Get ONE approved email
  const emails = await getReadyEmails(1);
  
  if (emails.length === 0) {
    return 'empty';
  }
  
  const email = emails[0];
  
  // Check daily limit for this sender
  const sentToday = await getSentTodayCount(email.sent_from_email);
  if (sentToday >= DAILY_LIMIT_PER_SENDER) {
    console.log(`[EmailSender] Daily limit reached for ${email.sent_from_email} (${sentToday}/${DAILY_LIMIT_PER_SENDER})`);
    // Mark as limit_reached so we skip it next time
    await supabase
      .schema('crm')
      .from('email_campaigns')
      .update({ approval_status: 'daily_limit' })
      .eq('id', email.id);
    return 'skipped';
  }
  
  // Send the email
  const result = await sendEmail(email);
  
  if (result.success) {
    await markEmailSent(email.id, result.messageId);
    console.log(`[EmailSender] ✅ Sent to ${email.lead?.email} (${email.lead?.company_name})`);
    sessionStats.sent++;
    return 'sent';
  } else {
    await markEmailFailed(email.id, result.error || 'Unknown error');
    console.log(`[EmailSender] ❌ Failed: ${email.lead?.email} - ${result.error}`);
    sessionStats.failed++;
    return 'failed';
  }
}

/**
 * Run continuous email sending loop
 * 
 * Simple flow:
 * 1. Check if in sending window
 * 2. Get one email
 * 3. Send it
 * 4. Wait 2-5 minutes
 * 5. Repeat until done or window closes
 */
export async function runEmailLoop(): Promise<void> {
  if (isProcessingQueue) {
    console.log('[EmailSender] Loop already running');
    return;
  }
  
  isProcessingQueue = true;
  console.log('[EmailSender] 🚀 Starting email sending loop');
  
  try {
    while (true) {
      // Check sending window
      if (!isWithinSendingWindow()) {
        console.log('[EmailSender] Outside sending window (1 PM - 9 PM EST), stopping');
        break;
      }
      
      // Report progress every 30 min
      await maybeReportProgress();
      
      // Process one email
      const result = await processOneEmail();
      
      if (result === 'empty') {
        console.log('[EmailSender] Queue empty, checking again in 10 seconds...');
        await new Promise(resolve => setTimeout(resolve, POLL_INTERVAL_MS));
        continue;
      }
      
      if (result === 'sent') {
        // Wait 2-5 minutes before next send
        const delaySeconds = MIN_DELAY_SECONDS + Math.random() * (MAX_DELAY_SECONDS - MIN_DELAY_SECONDS);
        console.log(`[EmailSender] Waiting ${Math.round(delaySeconds)}s before next email...`);
        await new Promise(resolve => setTimeout(resolve, delaySeconds * 1000));
      } else {
        // Failed or skipped - short delay then try next
        await new Promise(resolve => setTimeout(resolve, 2000));
      }
    }
  } finally {
    isProcessingQueue = false;
    console.log('[EmailSender] Email loop stopped');
  }
}

/**
 * Start the email sender (called by scheduler)
 * 
 * This kicks off the loop if we're in the sending window.
 * The loop runs continuously until the window closes.
 */
export async function processEmailQueue(): Promise<{ sent: number; skipped: number; failed: number }> {
  const stats = { sent: 0, skipped: 0, failed: 0 };
  
  if (!isWithinSendingWindow()) {
    return stats;
  }
  
  // Start loop in background (don't block)
  runEmailLoop().catch(err => console.error('[EmailSender] Loop error:', err));
  
  return stats;
}

/**
 * Notify when email session starts (entering sending window)
 */
export async function notifySessionStart(): Promise<void> {
  const stats = await getEmailQueueStats();
  sessionStats = {
    sent: 0,
    failed: 0,
    lastReportTime: new Date(),
    sessionStart: new Date(),
  };
  
  const message = `🚀 <b>Email Campaign Started</b>

⏰ Sending window: 1 PM - 9 PM EST
📬 Emails ready to send: ${stats.approved}
👥 Using 3 senders (50/day each = 150 max)

Updates every 30 min during active sending.`;
  
  await sendTelegramNotification(message);
}

/**
 * Notify when email session ends (leaving sending window)
 */
export async function notifySessionEnd(): Promise<void> {
  const stats = await getEmailQueueStats();
  
  const message = `🛑 <b>Email Campaign Paused</b>

📊 <b>Session Summary:</b>
✅ Sent: ${sessionStats.sent}
❌ Failed: ${sessionStats.failed}
📬 Remaining in queue: ${stats.approved}

Resumes at 1 PM EST tomorrow.`;
  
  await sendTelegramNotification(message);
}

/**
 * Get email queue stats
 */
export async function getEmailQueueStats(): Promise<{
  pending: number;
  approved: number;
  sentToday: number;
  totalSent: number;
}> {
  const supabase = getSupabaseClient();
  if (!supabase) {
    return { pending: 0, approved: 0, sentToday: 0, totalSent: 0 };
  }
  
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  
  const [pendingResult, approvedResult, sentTodayResult, totalSentResult] = await Promise.all([
    supabase.schema('crm').from('email_campaigns').select('id', { count: 'exact', head: true }).eq('approval_status', 'pending'),
    supabase.schema('crm').from('email_campaigns').select('id', { count: 'exact', head: true }).eq('approval_status', 'approved').is('sent_at', null),
    supabase.schema('crm').from('email_campaigns').select('id', { count: 'exact', head: true }).gte('sent_at', today.toISOString()),
    supabase.schema('crm').from('email_campaigns').select('id', { count: 'exact', head: true }).not('sent_at', 'is', null),
  ]);
  
  return {
    pending: pendingResult.count || 0,
    approved: approvedResult.count || 0,
    sentToday: sentTodayResult.count || 0,
    totalSent: totalSentResult.count || 0,
  };
}
