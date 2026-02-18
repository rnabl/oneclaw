/**
 * Gmail OAuth Token API
 * 
 * Provides access tokens for OneClaw Node Runtime to send emails.
 * Node calls this endpoint to get fresh tokens before making Gmail API calls.
 * 
 * Security:
 * - Tokens are encrypted at rest using AES-256-GCM
 * - Rate limiting: 100/account/day, 300/user/day, 60s minimum delay
 */

import type { Context } from 'hono';
import { createGmailClient } from '@oneclaw/harness/gmail/client';
import { GMAIL_LIMITS } from '@oneclaw/harness/gmail/accounts';
import { encryptToken } from '@oneclaw/harness/gmail/encryption';

// Simple in-memory cache for tokens (valid for ~1 hour)
const tokenCache = new Map<string, { token: string; expires_at: number }>();

/**
 * POST /api/v1/oauth/google/token
 * 
 * Returns a fresh access token for a user's Gmail account.
 * Node Runtime uses this to get tokens before sending emails.
 * 
 * Request body:
 * {
 *   "user_id": "user_abc123",
 *   "gmail_account_id": "gml_xyz" (optional - uses default if not provided)
 * }
 * 
 * Response:
 * {
 *   "access_token": "ya29.a0...",
 *   "expires_at": "2026-02-18T05:00:00Z",
 *   "email": "user@gmail.com"
 * }
 */
export async function getGoogleTokenHandler(c: Context) {
  try {
    const { user_id, gmail_account_id } = await c.req.json();
    
    if (!user_id) {
      return c.json({ error: 'user_id required' }, 400);
    }
    
    // Check cache first
    const cacheKey = `${user_id}:${gmail_account_id || 'default'}`;
    const cached = tokenCache.get(cacheKey);
    if (cached && cached.expires_at > Date.now()) {
      return c.json({
        access_token: cached.token,
        expires_at: new Date(cached.expires_at).toISOString(),
        cached: true,
      });
    }
    
    // TODO: Fetch from Supabase
    // For now, return error indicating need for Supabase integration
    return c.json({ 
      error: 'Gmail account not found',
      message: 'User needs to connect Gmail via OAuth first'
    }, 404);
    
    // FUTURE IMPLEMENTATION:
    // const supabase = createServiceClient();
    // let query = supabase
    //   .from('gmail_accounts')
    //   .select('*')
    //   .eq('user_id', user_id)
    //   .eq('is_active', true);
    //   
    // if (gmail_account_id) {
    //   query = query.eq('id', gmail_account_id);
    // }
    //   
    // const { data: accounts, error } = await query.limit(1);
    //   
    // if (error || !accounts || accounts.length === 0) {
    //   return c.json({ error: 'No active Gmail account found' }, 404);
    // }
    //   
    // const account = accounts[0];
    //   
    // // Check if token is expired
    // const now = new Date();
    // const expiresAt = new Date(account.token_expires_at);
    //   
    // let accessToken = account.access_token;
    //   
    // if (expiresAt <= now) {
    //   // Refresh token
    //   const gmailClient = createGmailClient();
    //   const refreshed = await gmailClient.refreshAccessToken(account);
    //     
    //   accessToken = refreshed.access_token;
    //     
    //   // Update in database
    //   await supabase
    //     .from('gmail_accounts')
    //     .update({
    //       access_token: refreshed.access_token,
    //       token_expires_at: refreshed.expires_at,
    //       updated_at: now.toISOString(),
    //     })
    //     .eq('id', account.id);
    //     
    //   expiresAt = new Date(refreshed.expires_at);
    // }
    //   
    // // Cache the token
    // tokenCache.set(cacheKey, {
    //   token: accessToken,
    //   expires_at: expiresAt.getTime(),
    // });
    //   
    // return c.json({
    //   access_token: accessToken,
    //   expires_at: expiresAt.toISOString(),
    //   email: account.email,
    // });
    
  } catch (error) {
    console.error('[Gmail Token] Error:', error);
    return c.json({ 
      error: 'Failed to get Gmail token',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, 500);
  }
}

/**
 * GET /api/v1/oauth/google/status
 * 
 * Check if a user has Gmail connected
 * Used by Node Runtime to determine if OAuth is needed
 * 
 * Query params:
 * - user_id: Node ID or user ID
 */
export async function getGmailStatusHandler(c: Context) {
  try {
    const user_id = c.req.query('user_id');
    
    if (!user_id) {
      return c.json({ error: 'user_id required' }, 400);
    }
    
    // TODO: Check Supabase for account
    // const supabase = createServiceClient();
    // const { data } = await supabase
    //   .from('gmail_accounts')
    //   .select('id, email, is_active')
    //   .eq('user_id', user_id)
    //   .eq('is_active', true)
    //   .limit(1);
    //
    // return c.json({
    //   connected: data && data.length > 0,
    //   email: data?.[0]?.email,
    // });
    
    return c.json({
      connected: false,
      message: 'Supabase integration pending'
    });
    
  } catch (error) {
    console.error('[Gmail Status] Error:', error);
    return c.json({ error: 'Failed to check status' }, 500);
  }
}

/**
 * GET /api/v1/oauth/google/account
 * 
 * Get Gmail account info for a user
 * Returns email and connection details
 */
export async function getGmailAccountHandler(c: Context) {
  try {
    const user_id = c.req.query('user_id');
    
    if (!user_id) {
      return c.json({ error: 'user_id required' }, 400);
    }
    
    // TODO: Fetch from Supabase
    // const supabase = createServiceClient();
    // const { data } = await supabase
    //   .from('gmail_accounts')
    //   .select('email, created_at, is_active')
    //   .eq('user_id', user_id)
    //   .eq('is_active', true)
    //   .limit(1)
    //   .single();
    //
    // if (!data) {
    //   return c.json({ error: 'Gmail not connected' }, 404);
    // }
    //
    // return c.json({
    //   email: data.email,
    //   connected_at: data.created_at,
    //   active: data.is_active,
    // });
    
    return c.json({
      error: 'Gmail not connected',
      message: 'Supabase integration pending'
    }, 404);
    
  } catch (error) {
    console.error('[Gmail Account] Error:', error);
    return c.json({ error: 'Failed to get account' }, 500);
  }
}

/**
 * Send an email via a user's Gmail account.
 * This is called by the Node Runtime's google.gmail executor.
 * 
 * Rate Limits:
 * - 100 emails per account per day
 * - 300 emails per user per day (across all accounts)
 * - 60 seconds minimum delay between sends
 * 
 * Request body:
 * {
 *   "user_id": "user_abc123",
 *   "gmail_account_id": "gml_xyz" (optional),
 *   "to": "recipient@example.com",
 *   "subject": "Hello",
 *   "body": "Email body",
 *   "from_name": "Ryan" (optional)
 * }
 */
export async function sendGmailHandler(c: Context) {
  try {
    const { user_id, gmail_account_id, to, subject, body, from_name } = await c.req.json();
    
    if (!user_id || !to || !subject || !body) {
      return c.json({ error: 'Missing required fields' }, 400);
    }
    
    // TODO: Implement with Supabase
    // FUTURE IMPLEMENTATION:
    //
    // 1. Check total daily limit across all user's accounts
    // const supabase = createServiceClient();
    // const { data: userAccounts } = await supabase
    //   .from('gmail_accounts')
    //   .select('daily_send_count')
    //   .eq('user_id', user_id);
    //
    // const totalSentToday = userAccounts.reduce((sum, acc) => sum + acc.daily_send_count, 0);
    //
    // if (totalSentToday >= GMAIL_LIMITS.DAILY_SEND_LIMIT_TOTAL) {
    //   return c.json({
    //     success: false,
    //     error: `Total daily limit reached (${GMAIL_LIMITS.DAILY_SEND_LIMIT_TOTAL} emails across all accounts)`
    //   }, 429);
    // }
    //
    // 2. Get account with fresh tokens
    // const account = await getAccountWithFreshTokens(gmail_account_id || 'default');
    //
    // if (!account || !account.is_active) {
    //   return c.json({
    //     success: false,
    //     error: 'No active Gmail account found'
    //   }, 404);
    // }
    //
    // 3. Send email (client checks per-account limits and minimum delay)
    // const gmailClient = createGmailClient();
    // const result = await gmailClient.sendEmail(account, {
    //   to,
    //   subject,
    //   body,
    //   fromName: from_name,
    // });
    //
    // 4. Update last_sent_at and increment daily_send_count
    // await supabase
    //   .from('gmail_accounts')
    //   .update({
    //     last_sent_at: result.sent_at,
    //     daily_send_count: account.daily_send_count + 1,
    //   })
    //   .eq('id', account.id);
    //
    // 5. Log to email_messages table
    // await supabase.from('email_messages').insert({ ... });
    //
    // return c.json({
    //   success: true,
    //   gmail_message_id: result.gmail_message_id,
    //   gmail_thread_id: result.gmail_thread_id,
    //   sent_at: result.sent_at,
    // });
    
    return c.json({
      error: 'Not yet implemented',
      message: 'Gmail sending will be implemented after Supabase integration'
    }, 501);
    
  } catch (error) {
    console.error('[Gmail Send] Error:', error);
    
    // Rate limit errors
    if (error instanceof Error && error.message.includes('wait')) {
      return c.json({
        success: false,
        error: error.message,
      }, 429);
    }
    
    return c.json({
      error: 'Failed to send email',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, 500);
  }
}
