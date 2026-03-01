/**
 * Send Gmail Tool
 * 
 * Registered tool for sending emails via connected Gmail accounts.
 * Handles account selection, rate limiting, and token refresh.
 */

import { z } from 'zod';
import { registry } from '../registry';
import { createGmailClient } from '../gmail/client';
import type { GmailAccount } from '../gmail/accounts';
import { GMAIL_LIMITS } from '../gmail/accounts';

// Input schema
const SendGmailInputSchema = z.object({
  to: z.string().email().describe('Recipient email address'),
  subject: z.string().min(1).max(200).describe('Email subject line'),
  body: z.string().min(1).max(10000).describe('Email body (plain text)'),
  fromName: z.string().optional().describe('Display name for sender'),
  accountEmail: z.string().email().optional().describe('Specific Gmail account to send from (uses default if not specified)'),
});

type SendGmailInput = z.infer<typeof SendGmailInputSchema>;

// Output schema
const SendGmailOutputSchema = z.object({
  success: z.boolean(),
  messageId: z.string().optional(),
  threadId: z.string().optional(),
  sentFrom: z.string().optional(),
  sentAt: z.string().optional(),
  error: z.string().optional(),
});

type SendGmailOutput = z.infer<typeof SendGmailOutputSchema>;

// In-memory account storage (replace with database in production)
const gmailAccounts = new Map<string, GmailAccount>();

/**
 * Get a Gmail account for a tenant
 * In production, this would query the database
 */
async function getGmailAccount(tenantId: string, accountEmail?: string): Promise<GmailAccount | null> {
  // For now, check environment for test credentials
  const testEmail = process.env.GMAIL_TEST_EMAIL;
  const testAccessToken = process.env.GMAIL_TEST_ACCESS_TOKEN;
  const testRefreshToken = process.env.GMAIL_TEST_REFRESH_TOKEN;
  
  if (testEmail && testAccessToken && testRefreshToken) {
    return {
      id: 'gml_test',
      user_id: tenantId,
      email: testEmail,
      access_token: testAccessToken,
      refresh_token: testRefreshToken,
      token_expires_at: new Date(Date.now() + 3600000).toISOString(),
      is_active: true,
      daily_send_count: 0,
      daily_send_reset_at: new Date().toISOString(),
      last_sent_at: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
  }
  
  // Check in-memory storage
  const key = accountEmail ? `${tenantId}:${accountEmail}` : tenantId;
  return gmailAccounts.get(key) || null;
}

/**
 * Register a Gmail account (called after OAuth flow)
 */
export function registerGmailAccount(tenantId: string, account: GmailAccount): void {
  const key = `${tenantId}:${account.email}`;
  gmailAccounts.set(key, account);
  gmailAccounts.set(tenantId, account); // Set as default
  console.log(`[Gmail] Registered account ${account.email} for tenant ${tenantId}`);
}

/**
 * Tool handler
 */
async function sendGmailHandler(
  input: SendGmailInput,
  context: { tenantId: string }
): Promise<SendGmailOutput> {
  try {
    // Get Gmail account
    const account = await getGmailAccount(context.tenantId, input.accountEmail);
    
    if (!account) {
      return {
        success: false,
        error: 'No Gmail account connected. Please connect Gmail via OAuth first.',
      };
    }
    
    // Check rate limits
    if (account.daily_send_count >= GMAIL_LIMITS.DAILY_SEND_LIMIT_PER_ACCOUNT) {
      return {
        success: false,
        error: `Daily send limit reached (${GMAIL_LIMITS.DAILY_SEND_LIMIT_PER_ACCOUNT} emails/day). Try again tomorrow.`,
      };
    }
    
    if (account.last_sent_at) {
      const timeSinceLastSend = Date.now() - new Date(account.last_sent_at).getTime();
      if (timeSinceLastSend < GMAIL_LIMITS.MIN_SEND_DELAY_MS) {
        const waitSeconds = Math.ceil((GMAIL_LIMITS.MIN_SEND_DELAY_MS - timeSinceLastSend) / 1000);
        return {
          success: false,
          error: `Rate limited. Please wait ${waitSeconds} seconds before sending another email.`,
        };
      }
    }
    
    // Create Gmail client and send
    const gmailClient = createGmailClient();
    
    const result = await gmailClient.sendEmail(account, {
      to: input.to,
      subject: input.subject,
      body: input.body,
      fromName: input.fromName,
    });
    
    // Update account stats (in production, update database)
    account.daily_send_count++;
    account.last_sent_at = result.sent_at;
    
    return {
      success: true,
      messageId: result.gmail_message_id,
      threadId: result.gmail_thread_id,
      sentFrom: account.email,
      sentAt: result.sent_at,
    };
    
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('[Gmail] Send failed:', message);
    
    return {
      success: false,
      error: message,
    };
  }
}

// Register the tool
registry.register({
  id: 'send-gmail',
  name: 'send-gmail',
  description: 'Send an email via Gmail using connected OAuth account',
  version: '1.0.0',
  costClass: 'free' as const,
  estimatedCostUsd: 0,
  requiredSecrets: ['google'], // Requires Google OAuth tokens
  tags: ['email', 'gmail', 'communication'],
  inputSchema: SendGmailInputSchema,
  handler: async (input, context) => {
    const validated = SendGmailInputSchema.parse(input);
    return sendGmailHandler(validated, { tenantId: context.tenantId });
  },
});

export { SendGmailInputSchema, SendGmailOutputSchema, sendGmailHandler };
