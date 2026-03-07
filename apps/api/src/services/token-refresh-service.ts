/**
 * Token Refresh Service
 * 
 * Proactively refreshes OAuth tokens before they expire
 * Runs periodically to keep all tokens fresh
 */

import { getNodeIntegrations, saveNodeIntegration, deleteNodeIntegration } from '@oneclaw/database';

const REFRESH_BEFORE_EXPIRY_MS = 10 * 60 * 1000; // Refresh 10 minutes before expiry
const CHECK_INTERVAL_MS = 5 * 60 * 1000; // Check every 5 minutes

interface RefreshResult {
  success: boolean;
  nodeId: string;
  email: string;
  error?: string;
}

/**
 * Refresh an access token using the refresh token
 */
async function refreshAccessToken(
  refreshToken: string,
  clientId: string,
  clientSecret: string
): Promise<{ access_token: string; expires_in: number } | null> {
  try {
    const response = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        refresh_token: refreshToken,
        grant_type: 'refresh_token',
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('[Token Refresh] Failed:', errorText);
      return null;
    }

    return await response.json();
  } catch (error) {
    console.error('[Token Refresh] Error:', error);
    return null;
  }
}

/**
 * Check and refresh tokens for a single node
 */
async function refreshNodeTokens(nodeId: string): Promise<RefreshResult[]> {
  const results: RefreshResult[] = [];

  try {
    const integrations = await getNodeIntegrations(nodeId);
    const googleIntegrations = integrations.filter(i => i.provider === 'google');

    for (const integration of googleIntegrations) {
      const email = integration.email || 'unknown';

      // Check if token needs refresh
      const expiresAt = integration.token_expires_at ? new Date(integration.token_expires_at) : null;
      if (!expiresAt) {
        results.push({ success: false, nodeId, email, error: 'No expiry date' });
        continue;
      }

      const timeUntilExpiry = expiresAt.getTime() - Date.now();
      
      // Skip if token is still fresh (more than 10 minutes remaining)
      if (timeUntilExpiry > REFRESH_BEFORE_EXPIRY_MS) {
        continue;
      }

      // Token is expired or expiring soon - attempt refresh
      if (!integration.refresh_token) {
        console.warn(`[Token Refresh] No refresh token for ${email}, marking as expired`);
        results.push({ success: false, nodeId, email, error: 'No refresh token' });
        continue;
      }

      const clientId = process.env.GOOGLE_CLIENT_ID || '';
      const clientSecret = process.env.GOOGLE_CLIENT_SECRET || '';

      if (!clientId || !clientSecret) {
        console.error('[Token Refresh] Missing Google OAuth credentials');
        results.push({ success: false, nodeId, email, error: 'Missing OAuth config' });
        continue;
      }

      console.log(`[Token Refresh] Refreshing token for ${email} (expires in ${Math.round(timeUntilExpiry / 1000 / 60)} minutes)`);

      const refreshed = await refreshAccessToken(integration.refresh_token, clientId, clientSecret);

      if (refreshed) {
        // Save the new token
        await saveNodeIntegration(nodeId, 'google', {
          accessToken: refreshed.access_token,
          refreshToken: integration.refresh_token,
          expiresAt: new Date(Date.now() + refreshed.expires_in * 1000),
          scopes: integration.scopes || [],
          email,
        });

        console.log(`[Token Refresh] ✅ Successfully refreshed token for ${email}`);
        results.push({ success: true, nodeId, email });
      } else {
        // Refresh failed - likely revoked by user
        console.error(`[Token Refresh] ❌ Failed to refresh token for ${email} - refresh token may be revoked`);
        results.push({ success: false, nodeId, email, error: 'Refresh failed - token may be revoked' });
        
        // Optionally: Delete the integration if refresh token is permanently invalid
        // Uncomment if you want to auto-cleanup invalid tokens:
        // await deleteNodeIntegration(nodeId, 'google', email);
      }
    }
  } catch (error) {
    console.error(`[Token Refresh] Error processing node ${nodeId}:`, error);
  }

  return results;
}

/**
 * Refresh tokens for all nodes
 */
async function refreshAllTokens(): Promise<void> {
  console.log('[Token Refresh] Starting periodic token refresh check...');

  try {
    // Get all unique node IDs that have Google integrations
    // This is a simplified approach - you might want to query Supabase directly for better performance
    
    // For now, we'll need to track active node IDs separately
    // You can maintain this list in Redis, database, or memory
    const activeNodeIds = await getActiveNodeIds();

    if (activeNodeIds.length === 0) {
      console.log('[Token Refresh] No active nodes to refresh');
      return;
    }

    console.log(`[Token Refresh] Checking ${activeNodeIds.length} nodes...`);

    let successCount = 0;
    let failureCount = 0;

    for (const nodeId of activeNodeIds) {
      const results = await refreshNodeTokens(nodeId);
      
      for (const result of results) {
        if (result.success) {
          successCount++;
        } else {
          failureCount++;
        }
      }
    }

    console.log(`[Token Refresh] Complete - ✅ ${successCount} refreshed, ❌ ${failureCount} failed`);
  } catch (error) {
    console.error('[Token Refresh] Error during refresh cycle:', error);
  }
}

/**
 * Get list of active node IDs
 * TODO: Implement proper tracking - this is a placeholder
 */
async function getActiveNodeIds(): Promise<string[]> {
  // Option 1: Query Supabase for unique node_ids with Google integrations
  // Option 2: Maintain a list in Redis
  // Option 3: Track in-memory (loses state on restart)
  
  // For now, return empty - needs implementation based on your architecture
  console.warn('[Token Refresh] getActiveNodeIds not implemented - no tokens will be refreshed');
  return [];
}

/**
 * Start the token refresh service
 */
export function startTokenRefreshService(): NodeJS.Timeout {
  console.log('[Token Refresh Service] Starting with interval:', CHECK_INTERVAL_MS / 1000 / 60, 'minutes');
  
  // Run immediately on startup
  refreshAllTokens().catch(err => {
    console.error('[Token Refresh] Initial refresh failed:', err);
  });

  // Then run periodically
  const interval = setInterval(() => {
    refreshAllTokens().catch(err => {
      console.error('[Token Refresh] Periodic refresh failed:', err);
    });
  }, CHECK_INTERVAL_MS);

  return interval;
}

/**
 * Stop the token refresh service
 */
export function stopTokenRefreshService(interval: NodeJS.Timeout): void {
  clearInterval(interval);
  console.log('[Token Refresh Service] Stopped');
}

/**
 * Manually trigger a refresh for a specific node
 */
export async function refreshNodeTokensNow(nodeId: string): Promise<RefreshResult[]> {
  console.log(`[Token Refresh] Manual refresh triggered for node ${nodeId}`);
  return await refreshNodeTokens(nodeId);
}

export { refreshAllTokens, refreshNodeTokens };
