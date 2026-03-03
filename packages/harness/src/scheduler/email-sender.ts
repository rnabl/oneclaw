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

import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { createGmailClient } from '../gmail/client';

const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || '';
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET || '';

let supabase: SupabaseClient | null = null;

function getSupabaseClient() {
  if (!supabase) {
    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY;
    
    if (!supabaseUrl || !supabaseKey) {
      return null;
    }
    
    supabase = createClient(supabaseUrl, supabaseKey);
  }
  return supabase;
}

// Configuration
const DAILY_LIMIT_PER_SENDER = 50;
const MIN_DELAY_SECONDS = 120; // 2 minutes
const MAX_DELAY_SECONDS = 300; // 5 minutes
const EMAILS_PER_TICK = 3; // Max emails to send per scheduler tick (every 60s)

// Track last send time to enforce delays
let lastSendTime: Date | null = null;

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
    // Get integration from database based on sender
    const { getNodeIntegration, saveNodeIntegration } = await import('@oneclaw/database');
    
    // Look up OAuth by sender name (e.g., "sender-riley" for riley@closelanepro.com)
    const senderUser = campaign.sent_from_email.split('@')[0]; // e.g., "riley" from "riley@closelanepro.com"
    const tenantId = `sender-${senderUser}`;
    
    let integration = await getNodeIntegration(tenantId, 'google');
    
    // Fallback to legacy oneclaw-vps-1 if sender-specific doesn't exist
    if (!integration) {
      integration = await getNodeIntegration('oneclaw-vps-1', 'google');
      if (integration) {
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
        await saveNodeIntegration(actualTenantId, 'google', {
          accessToken: refreshed.access_token,
          refreshToken: integration.refresh_token,
          expiresAt: new Date(Date.now() + refreshed.expires_in * 1000),
          scopes: integration.scopes || [],
        });
      } else {
        return { success: false, error: `Token refresh failed for ${senderUser}` };
      }
    }
    
    // Create Gmail client and send
    const gmailClient = createGmailClient();
    
    // Get sender display name
    const senderName = senderUser.charAt(0).toUpperCase() + senderUser.slice(1);
    
    const result = await gmailClient.sendEmailWithToken(accessToken, {
      to: campaign.lead.email,
      subject: campaign.subject,
      body: campaign.body,
      fromName: senderName,
    });
    
    return { success: true, messageId: result.id };
    
  } catch (error) {
    return { success: false, error: String(error) };
  }
}

/**
 * Process email queue - called by scheduler heartbeat
 * 
 * This function:
 * 1. Checks if enough time has passed since last send
 * 2. Gets next batch of approved emails
 * 3. Checks daily limits per sender
 * 4. Sends emails with appropriate delays
 */
export async function processEmailQueue(): Promise<{ sent: number; skipped: number; failed: number }> {
  const stats = { sent: 0, skipped: 0, failed: 0 };
  
  // Check if we're within business hours (9 AM - 5 PM local)
  const now = new Date();
  const hour = now.getHours();
  if (hour < 9 || hour >= 17) {
    // Outside business hours - skip
    return stats;
  }
  
  // Check minimum delay since last send
  if (lastSendTime) {
    const secondsSinceLastSend = (now.getTime() - lastSendTime.getTime()) / 1000;
    if (secondsSinceLastSend < MIN_DELAY_SECONDS) {
      // Not enough time passed
      return stats;
    }
  }
  
  // Get emails ready to send
  const emails = await getReadyEmails(EMAILS_PER_TICK);
  
  if (emails.length === 0) {
    return stats;
  }
  
  console.log(`[EmailSender] Processing ${emails.length} email(s)`);
  
  for (const email of emails) {
    // Check daily limit for this sender
    const sentToday = await getSentTodayCount(email.sent_from_email);
    if (sentToday >= DAILY_LIMIT_PER_SENDER) {
      console.log(`[EmailSender] Daily limit reached for ${email.sent_from_email} (${sentToday}/${DAILY_LIMIT_PER_SENDER})`);
      stats.skipped++;
      continue;
    }
    
    // Send the email
    const result = await sendEmail(email);
    
    if (result.success) {
      await markEmailSent(email.id, result.messageId);
      console.log(`[EmailSender] ✅ Sent to ${email.lead?.email} (${email.lead?.company_name})`);
      stats.sent++;
      lastSendTime = new Date();
    } else {
      await markEmailFailed(email.id, result.error || 'Unknown error');
      console.log(`[EmailSender] ❌ Failed: ${email.lead?.email} - ${result.error}`);
      stats.failed++;
    }
    
    // Add random delay between sends (within this batch)
    if (emails.indexOf(email) < emails.length - 1) {
      const delayMs = (MIN_DELAY_SECONDS + Math.random() * (MAX_DELAY_SECONDS - MIN_DELAY_SECONDS)) * 1000;
      await new Promise(resolve => setTimeout(resolve, delayMs));
    }
  }
  
  return stats;
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
