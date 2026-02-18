import { z } from 'zod';

/**
 * Gmail Account Schema
 * Represents a connected Gmail account for a user
 */
export const GmailAccountSchema = z.object({
  id: z.string().describe('Unique ID with gml_ prefix'),
  user_id: z.string().describe('User who owns this Gmail account'),
  email: z.string().email().describe('Gmail email address'),
  access_token: z.string().describe('Encrypted Google OAuth access token'),
  refresh_token: z.string().describe('Encrypted Google OAuth refresh token'),
  token_expires_at: z.string().describe('ISO timestamp when access token expires'),
  is_active: z.boolean().default(true).describe('Whether account is active for sending'),
  daily_send_count: z.number().default(0).describe('Emails sent today from this account'),
  daily_send_reset_at: z.string().describe('ISO timestamp when daily count resets'),
  last_sent_at: z.string().nullable().describe('ISO timestamp of last email sent (for rate limiting)'),
  created_at: z.string().describe('ISO timestamp when account was connected'),
  updated_at: z.string().describe('ISO timestamp of last update'),
});

export type GmailAccount = z.infer<typeof GmailAccountSchema>;

/**
 * Schema for inserting new Gmail accounts (omits generated fields)
 */
export const GmailAccountInsertSchema = GmailAccountSchema.omit({
  id: true,
  created_at: true,
  updated_at: true,
  daily_send_count: true,
  daily_send_reset_at: true,
});

export type GmailAccountInsert = z.infer<typeof GmailAccountInsertSchema>;

/**
 * Schema for updating Gmail accounts
 */
export const GmailAccountUpdateSchema = GmailAccountSchema.partial().omit({
  id: true,
  user_id: true,
  created_at: true,
});

export type GmailAccountUpdate = z.infer<typeof GmailAccountUpdateSchema>;

/**
 * Gmail Rate Limits
 * Enforced to prevent spam and comply with Gmail API quotas
 */
export const GMAIL_LIMITS = {
  MAX_ACCOUNTS_PER_USER: 5,
  DAILY_SEND_LIMIT_PER_ACCOUNT: 100,
  DAILY_SEND_LIMIT_TOTAL: 300, // Across all accounts
  MIN_SEND_DELAY_MS: 60_000, // 60 seconds between sends
} as const;
