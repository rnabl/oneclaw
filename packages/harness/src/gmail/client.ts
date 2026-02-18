/**
 * Gmail API Client
 * 
 * Composable wrapper around googleapis for Gmail operations.
 * Handles OAuth token management and common Gmail API calls.
 * 
 * Security:
 * - Tokens are encrypted at rest using AES-256-GCM
 * - Rate limiting: 100 emails/account/day, 60s minimum delay
 * - Automatic token refresh with 5-minute buffer
 */

import { google } from 'googleapis';
import type { GmailAccount } from './accounts';
import { GMAIL_LIMITS } from './accounts';
import { decryptToken } from './encryption';

export interface GmailClientConfig {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
}

export interface SendEmailInput {
  to: string;
  subject: string;
  body: string;
  fromName?: string;
}

export interface GmailSendResult {
  gmail_message_id: string;
  gmail_thread_id: string;
  sent_at: string;
}

/**
 * Gmail API client
 */
export class GmailClient {
  private config: GmailClientConfig;
  
  constructor(config: GmailClientConfig) {
    this.config = config;
  }
  
  /**
   * Create OAuth2 client with stored tokens
   * Decrypts tokens before use
   */
  private getOAuth2Client(account: GmailAccount) {
    const oauth2Client = new google.auth.OAuth2(
      this.config.clientId,
      this.config.clientSecret,
      this.config.redirectUri
    );
    
    // Decrypt tokens before setting credentials
    const accessToken = decryptToken(account.access_token);
    const refreshToken = decryptToken(account.refresh_token);
    
    oauth2Client.setCredentials({
      access_token: accessToken,
      refresh_token: refreshToken,
      expiry_date: new Date(account.token_expires_at).getTime(),
    });
    
    return oauth2Client;
  }
  
  /**
   * Send an email via Gmail API
   * 
   * Rate Limiting:
   * - Checks daily send count (100/account/day)
   * - Enforces 60-second minimum delay between sends
   * - Caller is responsible for checking total user limit (300/day)
   */
  async sendEmail(
    account: GmailAccount,
    input: SendEmailInput
  ): Promise<GmailSendResult> {
    // Rate limit check: Daily send count
    if (account.daily_send_count >= GMAIL_LIMITS.DAILY_SEND_LIMIT_PER_ACCOUNT) {
      throw new Error(`Daily send limit reached (${GMAIL_LIMITS.DAILY_SEND_LIMIT_PER_ACCOUNT} emails per account)`);
    }
    
    // Rate limit check: Minimum delay between sends
    if (account.last_sent_at) {
      const timeSinceLastSend = Date.now() - new Date(account.last_sent_at).getTime();
      if (timeSinceLastSend < GMAIL_LIMITS.MIN_SEND_DELAY_MS) {
        const waitSeconds = Math.ceil((GMAIL_LIMITS.MIN_SEND_DELAY_MS - timeSinceLastSend) / 1000);
        throw new Error(`Please wait ${waitSeconds} seconds before sending another email`);
      }
    }
    
    const oauth2Client = this.getOAuth2Client(account);
    const gmail = google.gmail({ version: 'v1', auth: oauth2Client });
    
    // Create raw email (RFC 2822 format)
    const rawMessage = this.createRawEmail(
      account.email,
      input.to,
      input.subject,
      input.body,
      input.fromName
    );
    
    // Send via Gmail API
    const response = await gmail.users.messages.send({
      userId: 'me',
      requestBody: {
        raw: rawMessage,
      },
    });
    
    if (!response.data.id || !response.data.threadId) {
      throw new Error('Gmail API did not return message ID');
    }
    
    return {
      gmail_message_id: response.data.id,
      gmail_thread_id: response.data.threadId,
      sent_at: new Date().toISOString(),
    };
  }
  
  /**
   * Refresh access token if expired
   * Returns updated account data with new token
   */
  async refreshAccessToken(account: GmailAccount): Promise<{
    access_token: string;
    expires_at: string;
  }> {
    const oauth2Client = this.getOAuth2Client(account);
    
    const { credentials } = await oauth2Client.refreshAccessToken();
    
    if (!credentials.access_token || !credentials.expiry_date) {
      throw new Error('Failed to refresh access token');
    }
    
    return {
      access_token: credentials.access_token,
      expires_at: new Date(credentials.expiry_date).toISOString(),
    };
  }
  
  /**
   * Get user's Gmail profile (email address)
   */
  async getUserProfile(accessToken: string): Promise<{ email: string }> {
    const oauth2Client = new google.auth.OAuth2();
    oauth2Client.setCredentials({ access_token: accessToken });
    
    const gmail = google.gmail({ version: 'v1', auth: oauth2Client });
    const profile = await gmail.users.getProfile({ userId: 'me' });
    
    if (!profile.data.emailAddress) {
      throw new Error('Failed to get email address from Gmail');
    }
    
    return { email: profile.data.emailAddress };
  }
  
  /**
   * Create RFC 2822 formatted email
   * Returns base64url-encoded email
   */
  private createRawEmail(
    from: string,
    to: string,
    subject: string,
    body: string,
    fromName?: string
  ): string {
    const fromHeader = fromName ? `${fromName} <${from}>` : from;
    
    const email = [
      `From: ${fromHeader}`,
      `To: ${to}`,
      `Subject: ${subject}`,
      'MIME-Version: 1.0',
      'Content-Type: text/plain; charset=UTF-8',
      '',
      body,
    ].join('\r\n');
    
    // Base64url encode
    const encoded = Buffer.from(email)
      .toString('base64')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '');
    
    return encoded;
  }
}

/**
 * Create Gmail client instance
 */
export function createGmailClient(): GmailClient {
  const config: GmailClientConfig = {
    clientId: process.env.GOOGLE_CLIENT_ID || '',
    clientSecret: process.env.GOOGLE_CLIENT_SECRET || '',
    redirectUri: process.env.GOOGLE_REDIRECT_URI || 'http://localhost:3000/oauth/google/callback',
  };
  
  if (!config.clientId || !config.clientSecret) {
    throw new Error('Google OAuth credentials not configured');
  }
  
  return new GmailClient(config);
}
