/**
 * Gmail OAuth Token API
 * 
 * Provides access tokens for OneClaw Node Runtime to send emails.
 * Node calls this endpoint to get fresh tokens before making Gmail API calls.
 */

import type { Context } from 'hono';
import { getNodeIntegration, getNodeIntegrations, saveNodeIntegration, deleteNodeIntegration } from '@oneclaw/database';
import { createGmailClient } from '@oneclaw/harness/gmail/client';

// Simple in-memory cache for tokens (valid for ~1 hour)
const tokenCache = new Map<string, { token: string; expires_at: number }>();

// Google OAuth config - read at runtime, not import time
function getGoogleConfig() {
  return {
    clientId: process.env.GOOGLE_CLIENT_ID || '',
    clientSecret: process.env.GOOGLE_CLIENT_SECRET || '',
  };
}

/**
 * POST /api/v1/oauth/google/token
 * 
 * Returns a fresh access token for a user's Gmail account.
 * Node Runtime uses this to get tokens before sending emails.
 */
export async function getGoogleTokenHandler(c: Context) {
  try {
    const { user_id } = await c.req.json();
    
    if (!user_id) {
      return c.json({ error: 'user_id required' }, 400);
    }
    
    // Check cache first
    const cacheKey = `${user_id}:google`;
    const cached = tokenCache.get(cacheKey);
    if (cached && cached.expires_at > Date.now()) {
      return c.json({
        access_token: cached.token,
        expires_at: new Date(cached.expires_at).toISOString(),
        cached: true,
      });
    }
    
    const integration = await getNodeIntegration(user_id, 'google');
    
    if (!integration) {
      return c.json({ 
        error: 'Gmail account not found',
        message: 'User needs to connect Gmail via OAuth first'
      }, 404);
    }
    
    let accessToken = integration.access_token;
    let expiresAt = integration.token_expires_at ? new Date(integration.token_expires_at) : new Date();
    
    // If token is expired or will expire in 5 minutes, refresh it
    if (expiresAt.getTime() - Date.now() < 5 * 60 * 1000 && integration.refresh_token) {
      const refreshed = await refreshAccessToken(integration.refresh_token);
      
      if (refreshed) {
        accessToken = refreshed.access_token;
        expiresAt = new Date(Date.now() + refreshed.expires_in * 1000);
        
        // Update in database
        await saveNodeIntegration(user_id, 'google', {
          accessToken: refreshed.access_token,
          refreshToken: integration.refresh_token,
          expiresAt,
          scopes: integration.scopes || [],
        });
      }
    }
    
    // Cache the token
    tokenCache.set(cacheKey, {
      token: accessToken,
      expires_at: expiresAt.getTime(),
    });
    
    return c.json({
      access_token: accessToken,
      expires_at: expiresAt.toISOString(),
    });
    
  } catch (error) {
    console.error('[Gmail Token] Error:', error);
    return c.json({ 
      error: 'Failed to get Gmail token',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, 500);
  }
}

/**
 * Refresh an access token using the refresh token
 */
async function refreshAccessToken(refreshToken: string): Promise<{ access_token: string; expires_in: number } | null> {
  const config = getGoogleConfig();
  try {
    const response = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: config.clientId,
        client_secret: config.clientSecret,
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
    
    const integration = await getNodeIntegration(user_id, 'google');
    
    if (integration) {
      return c.json({
        connected: true,
        email: integration.email,
        has_refresh_token: !!integration.refresh_token,
        expires_at: integration.token_expires_at,
      });
    }
    
    return c.json({
      connected: false,
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
    
    const integration = await getNodeIntegration(user_id, 'google');
    
    if (!integration) {
      return c.json({ error: 'Gmail not connected' }, 404);
    }
    
    return c.json({
      id: integration.id,
      node_id: integration.node_id,
      email: integration.email,
      provider: integration.provider,
      connected_at: integration.created_at,
      expires_at: integration.token_expires_at,
      scopes: integration.scopes,
    });
    
  } catch (error) {
    console.error('[Gmail Account] Error:', error);
    return c.json({ error: 'Failed to get account' }, 500);
  }
}

/**
 * GET /api/v1/oauth/google/accounts
 * 
 * Get all Gmail accounts for a node
 */
export async function getGmailAccountsHandler(c: Context) {
  try {
    const user_id = c.req.query('user_id');
    
    if (!user_id) {
      return c.json({ error: 'user_id required' }, 400);
    }
    
    const integrations = await getNodeIntegrations(user_id);
    const googleAccounts = integrations.filter(i => i.provider === 'google');
    
    return c.json({
      accounts: googleAccounts.map(a => ({
        id: a.id,
        node_id: a.node_id,
        email: a.email,
        connected_at: a.created_at,
        expires_at: a.token_expires_at,
        scopes: a.scopes,
      })),
      count: googleAccounts.length,
    });
    
  } catch (error) {
    console.error('[Gmail Accounts] Error:', error);
    return c.json({ error: 'Failed to get accounts' }, 500);
  }
}

/**
 * POST /api/v1/oauth/google/disconnect
 * 
 * Disconnect a Gmail account
 */
export async function disconnectGmailHandler(c: Context) {
  try {
    const { user_id } = await c.req.json();
    
    if (!user_id) {
      return c.json({ error: 'user_id required' }, 400);
    }
    
    await deleteNodeIntegration(user_id, 'google');
    
    return c.json({ success: true, message: 'Gmail disconnected' });
    
  } catch (error) {
    console.error('[Gmail Disconnect] Error:', error);
    return c.json({ error: 'Failed to disconnect' }, 500);
  }
}

/**
 * Send an email via a user's Gmail account.
 * Supports from_email to pick which account to send from (for multi-account)
 */
export async function sendGmailHandler(c: Context) {
  try {
    const { user_id, to, subject, body, from_name, from_email } = await c.req.json();
    
    if (!user_id || !to || !subject || !body) {
      return c.json({ error: 'Missing required fields: user_id, to, subject, body' }, 400);
    }
    
    // Get integration with tokens - if from_email specified, use that account
    let integration;
    if (from_email) {
      const { getNodeIntegrationByEmail } = await import('@oneclaw/database');
      integration = await getNodeIntegrationByEmail(user_id, 'google', from_email);
    } else {
      integration = await getNodeIntegration(user_id, 'google');
    }
    
    if (!integration) {
      return c.json({
        success: false,
        error: 'No Gmail account connected. Please connect via OAuth first.'
      }, 404);
    }
    
    let accessToken = integration.access_token;
    const expiresAt = integration.token_expires_at ? new Date(integration.token_expires_at) : new Date(0);
    
    // Refresh token if expired
    if (expiresAt.getTime() - Date.now() < 60 * 1000 && integration.refresh_token) {
      const refreshed = await refreshAccessToken(integration.refresh_token);
      if (refreshed) {
        accessToken = refreshed.access_token;
        await saveNodeIntegration(user_id, 'google', {
          accessToken: refreshed.access_token,
          refreshToken: integration.refresh_token,
          expiresAt: new Date(Date.now() + refreshed.expires_in * 1000),
          scopes: integration.scopes || [],
        });
      }
    }
    
    // Build the email
    const gmailClient = createGmailClient();
    const result = await gmailClient.sendEmailWithToken(accessToken, {
      to,
      subject,
      body,
      fromName: from_name,
    });
    
    return c.json({
      success: true,
      message_id: result.id,
      thread_id: result.threadId,
    });
    
  } catch (error) {
    console.error('[Gmail Send] Error:', error);
    return c.json({
      success: false,
      error: 'Failed to send email',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, 500);
  }
}
