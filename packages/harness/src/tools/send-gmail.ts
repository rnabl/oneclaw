/**
 * Send Gmail Tool
 * 
 * Registered tool for sending emails via connected Gmail accounts.
 * Uses the integrations table in Supabase for token storage.
 */

import { z } from 'zod';
import { registry } from '../registry';
import { createGmailClient } from '../gmail/client';

// Input schema
const SendGmailInputSchema = z.object({
  to: z.string().email().describe('Recipient email address'),
  subject: z.string().min(1).max(200).describe('Email subject line'),
  body: z.string().min(1).max(10000).describe('Email body (plain text)'),
  fromName: z.string().optional().describe('Display name for sender'),
});

type SendGmailInput = z.infer<typeof SendGmailInputSchema>;

// Output schema
const SendGmailOutputSchema = z.object({
  success: z.boolean(),
  messageId: z.string().optional(),
  threadId: z.string().optional(),
  sentAt: z.string().optional(),
  error: z.string().optional(),
});

type SendGmailOutput = z.infer<typeof SendGmailOutputSchema>;

// Google OAuth config for token refresh
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || '';
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET || '';

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
      console.error('[Gmail] Token refresh failed:', await response.text());
      return null;
    }
    
    return await response.json();
  } catch (error) {
    console.error('[Gmail] Token refresh error:', error);
    return null;
  }
}

/**
 * Tool handler - uses database for token storage
 */
export async function sendGmailHandler(
  input: SendGmailInput,
  context: { tenantId: string }
): Promise<SendGmailOutput> {
  try {
    // Check if today is Sunday (EST timezone)
    const now = new Date();
    const dayOfWeek = now.getUTCDay(); // 0 = Sunday, 6 = Saturday
    const estOffset = -5; // EST is UTC-5
    const estHour = now.getUTCHours() + estOffset;
    
    // Adjust day if EST time crosses midnight
    let estDayOfWeek = dayOfWeek;
    if (estHour < 0) estDayOfWeek = (dayOfWeek - 1 + 7) % 7;
    if (estHour >= 24) estDayOfWeek = (dayOfWeek + 1) % 7;
    
    if (estDayOfWeek === 0) {
      return {
        success: false,
        error: 'Email sending is disabled on Sundays (EST). Will retry on Monday.',
      };
    }
    
    // Dynamic import to avoid circular dependency issues
    const { getNodeIntegration, saveNodeIntegration } = await import('@oneclaw/database');
    
    // Get integration from database (uses node_integrations table with string IDs)
    const integration = await getNodeIntegration(context.tenantId, 'google');
    
    if (!integration) {
      return {
        success: false,
        error: 'No Gmail account connected. Please connect Gmail via OAuth first.',
      };
    }
    
    let accessToken = integration.access_token;
    const expiresAt = integration.token_expires_at ? new Date(integration.token_expires_at) : new Date(0);
    
    // Refresh token if expired or expiring soon
    if (expiresAt.getTime() - Date.now() < 60 * 1000 && integration.refresh_token) {
      console.log('[Gmail] Refreshing expired access token...');
      const refreshed = await refreshAccessToken(integration.refresh_token);
      if (refreshed) {
        accessToken = refreshed.access_token;
        // Update in database
        await saveNodeIntegration(context.tenantId, 'google', {
          accessToken: refreshed.access_token,
          refreshToken: integration.refresh_token,
          expiresAt: new Date(Date.now() + refreshed.expires_in * 1000),
          scopes: integration.scopes || [],
        });
      } else {
        return {
          success: false,
          error: 'Failed to refresh Gmail token. Please reconnect Gmail.',
        };
      }
    }
    
    // Create Gmail client and send
    const gmailClient = createGmailClient();
    
    const result = await gmailClient.sendEmailWithToken(accessToken, {
      to: input.to,
      subject: input.subject,
      body: input.body,
      fromName: input.fromName,
    });
    
    return {
      success: true,
      messageId: result.id,
      threadId: result.threadId,
      sentAt: new Date().toISOString(),
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
  costClass: 'cheap',
  estimatedCostUsd: 0,
  requiredSecrets: ['google'],
  tags: ['email', 'gmail', 'communication'],
  inputSchema: SendGmailInputSchema,
  outputSchema: SendGmailOutputSchema,
  networkPolicy: {
    allowedDomains: ['gmail.googleapis.com', 'oauth2.googleapis.com'],
    blockedDomains: [],
    allowLocalhost: false,
  },
  retryPolicy: {
    maxAttempts: 2,
    backoffMs: 1000,
    backoffMultiplier: 2,
    retryableErrors: ['TIMEOUT', 'RATE_LIMITED', 'NETWORK_ERROR'],
  },
  timeoutMs: 30000,
  idempotent: false,
  isPublic: false,
  createdAt: new Date(),
  updatedAt: new Date(),
});

export { SendGmailInputSchema, SendGmailOutputSchema };
