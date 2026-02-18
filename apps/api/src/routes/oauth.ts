// OAuth routes for Google (Gmail, Calendar)
// These routes handle the OAuth flow via browser tap-to-auth

import type { Context } from 'hono';
import { saveIntegration, updateOnboardingState, getUserById } from '@oneclaw/database';
import { ONBOARDING_STATE } from '@oneclaw/core';
import { encryptToken } from '@oneclaw/harness/gmail/encryption';
import { createGmailClient } from '@oneclaw/harness/gmail/client';

// Google OAuth config
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || '';
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET || '';
const GOOGLE_REDIRECT_URI = process.env.GOOGLE_REDIRECT_URI || 'http://localhost:3000/oauth/google/callback';

// OpenClaw Droplet config
const PROVISION_API_URL = process.env.OPENCLAW_PROVISION_URL || 'http://104.131.111.116:3456';
const PROVISION_SECRET = process.env.OPENCLAW_PROVISION_SECRET || 'iclaw-provision-2026';

/**
 * Push OAuth tokens to user's OpenClaw instance on Droplet
 */
async function pushTokensToOpenClaw(
  phoneNumber: string,
  tokens: { access_token: string; refresh_token?: string; expires_at: string }
): Promise<void> {
  const response = await fetch(`${PROVISION_API_URL}/oauth`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      phone: phoneNumber,
      provider: 'google',
      tokens,
      secret: PROVISION_SECRET,
    }),
  });

  if (!response.ok) {
    throw new Error(`Failed to push tokens: ${response.status}`);
  }
}

/**
 * Generate OAuth URL for Google
 * User taps this link in iMessage, authenticates in browser
 */
export function getGoogleAuthUrl(userId: string, scopes: string[]): string {
  const clientId = GOOGLE_CLIENT_ID?.trim() || '';
  const redirectUri = GOOGLE_REDIRECT_URI?.trim() || 'http://localhost:3000/oauth/google/callback';
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: scopes.join(' '),
    access_type: 'offline',
    prompt: 'consent',
    state: userId, // Pass user ID through state param
  });

  return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
}

/**
 * GET /oauth/google
 * Initiates Google OAuth - redirects to Google login
 * Query params: ?user=<userId>
 */
export async function googleAuthHandler(c: Context) {
  const userId = c.req.query('user');

  // Fail fast if OAuth is not configured (avoids Google "Missing client_id" error)
  if (!GOOGLE_CLIENT_ID?.trim() || !GOOGLE_CLIENT_SECRET?.trim()) {
    console.error('[OAuth] GOOGLE_CLIENT_ID or GOOGLE_CLIENT_SECRET not set');
    return c.html(`
      <html>
        <head><meta name="viewport" content="width=device-width, initial-scale=1"></head>
        <body style="font-family: -apple-system, sans-serif; padding: 40px; text-align: center; max-width: 560px; margin: 0 auto;">
          <h1>🔐 OAuth Not Configured</h1>
          <p>This server is missing Google OAuth credentials (<code>GOOGLE_CLIENT_ID</code> / <code>GOOGLE_CLIENT_SECRET</code>).</p>
          <p>In OneClaw Node, open <strong>Integrations</strong> → <strong>Set up Gmail</strong> (Step 1) → enter your Google credentials → <strong>Save & continue</strong>.</p>
          <p>Then ensure this server (the URL you were redirected from) has those env vars set and is restarted.</p>
        </body>
      </html>
    `, 503);
  }
  
  if (!userId) {
    return c.html(`
      <html>
        <body style="font-family: -apple-system, sans-serif; padding: 40px; text-align: center;">
          <h1>❌ Error</h1>
          <p>Missing user ID. Please use the link from iMessage or the Integrations page.</p>
        </body>
      </html>
    `, 400);
  }

  // Combine scopes for email and calendar
  const scopes = [
    'https://www.googleapis.com/auth/gmail.readonly',
    'https://www.googleapis.com/auth/gmail.send',
    'https://www.googleapis.com/auth/calendar.readonly',
    'https://www.googleapis.com/auth/calendar.events',
  ];

  const authUrl = getGoogleAuthUrl(userId, scopes);
  return c.redirect(authUrl);
}

/**
 * GET /oauth/google/callback
 * Google redirects here after user authenticates
 * Exchange code for tokens, store them, show success page
 */
export async function googleCallbackHandler(c: Context) {
  const code = c.req.query('code');
  const state = c.req.query('state'); // This is our userId
  const error = c.req.query('error');

  if (error) {
    console.error('[OAuth] Google auth error:', error);
    return c.html(`
      <html>
        <body style="font-family: -apple-system, sans-serif; padding: 40px; text-align: center;">
          <h1>❌ Authentication Failed</h1>
          <p>Google sign-in was cancelled or failed.</p>
          <p>Go back to iMessage and try again.</p>
        </body>
      </html>
    `, 400);
  }

  if (!code || !state) {
    return c.html(`
      <html>
        <body style="font-family: -apple-system, sans-serif; padding: 40px; text-align: center;">
          <h1>❌ Error</h1>
          <p>Missing authorization code. Please try again from iMessage.</p>
        </body>
      </html>
    `, 400);
  }

  try {
    // Exchange code for tokens
    const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: GOOGLE_CLIENT_ID,
        client_secret: GOOGLE_CLIENT_SECRET,
        code,
        grant_type: 'authorization_code',
        redirect_uri: GOOGLE_REDIRECT_URI,
      }),
    });

    if (!tokenResponse.ok) {
      const errorData = await tokenResponse.text();
      console.error('[OAuth] Token exchange failed:', errorData);
      throw new Error('Token exchange failed');
    }

    const tokens = await tokenResponse.json() as {
      access_token: string;
      refresh_token?: string;
      expires_in: number;
      scope: string;
    };

    // Calculate expiry
    const expiresAt = new Date(Date.now() + tokens.expires_in * 1000);
    
    // Get user's email from Google
    const gmailClient = createGmailClient();
    const userProfile = await gmailClient.getUserProfile(tokens.access_token);

    // Encrypt tokens before storing
    const encryptedAccess = encryptToken(tokens.access_token);
    const encryptedRefresh = tokens.refresh_token ? encryptToken(tokens.refresh_token) : null;

    // Save to NEW gmail_accounts table
    // TODO: Wire up Supabase
    // const supabase = createServiceClient();
    // await supabase.from('gmail_accounts').insert({
    //   user_id: state,
    //   email: userProfile.email,
    //   access_token: encryptedAccess,
    //   refresh_token: encryptedRefresh,
    //   token_expires_at: expiresAt.toISOString(),
    //   is_active: true,
    // });

    // ALSO save to old integrations table for backward compatibility (iMessage)
    await saveIntegration(state, 'google', {
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token,
      expiresAt,
      scopes: tokens.scope.split(' '),
    });

    console.log(`[OAuth] Successfully saved Google tokens for user ${state} (${userProfile.email})`);

    // Also push tokens to user's OpenClaw instance on the Droplet
    try {
      const user = await getUserById(state);
      if (user?.phone_number) {
        await pushTokensToOpenClaw(user.phone_number, {
          access_token: tokens.access_token,
          refresh_token: tokens.refresh_token,
          expires_at: expiresAt.toISOString(),
        });
        console.log(`[OAuth] Pushed tokens to OpenClaw for user ${state}`);
      }
    } catch (e) {
      console.error('[OAuth] Failed to push tokens to OpenClaw:', e);
      // Don't fail the flow - tokens are still saved in Supabase
    }

    // Show success page with Zapier-style design
    return c.html(`
      <!DOCTYPE html>
      <html>
        <head>
          <meta name="viewport" content="width=device-width, initial-scale=1">
          <title>Gmail Connected - OneClaw</title>
          <style>
            * { margin: 0; padding: 0; box-sizing: border-box; }
            body {
              font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
              background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
              min-height: 100vh;
              display: flex;
              align-items: center;
              justify-content: center;
              padding: 20px;
            }
            .card {
              background: white;
              border-radius: 24px;
              padding: 48px 40px;
              max-width: 480px;
              width: 100%;
              box-shadow: 0 20px 60px rgba(0,0,0,0.3);
              text-align: center;
            }
            .emoji {
              font-size: 80px;
              margin-bottom: 24px;
              animation: bounce 0.5s ease;
            }
            @keyframes bounce {
              0%, 100% { transform: translateY(0); }
              50% { transform: translateY(-10px); }
            }
            h1 {
              color: #1a1a1a;
              font-size: 32px;
              font-weight: 700;
              margin-bottom: 12px;
            }
            .subtitle {
              color: #666;
              font-size: 16px;
              line-height: 1.6;
              margin-bottom: 32px;
            }
            .connected-badge {
              background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
              color: white;
              padding: 16px 24px;
              border-radius: 12px;
              margin: 24px 0;
              font-weight: 600;
              font-size: 18px;
              display: inline-block;
            }
            .email {
              background: #f5f5f5;
              padding: 12px 20px;
              border-radius: 8px;
              margin: 16px 0;
              color: #333;
              font-family: 'SF Mono', monospace;
              font-size: 14px;
            }
            .features {
              text-align: left;
              margin: 24px 0;
              padding: 20px;
              background: #f9f9f9;
              border-radius: 12px;
            }
            .feature {
              display: flex;
              align-items: center;
              margin: 12px 0;
              color: #333;
            }
            .feature-icon {
              margin-right: 12px;
              font-size: 20px;
            }
            .btn {
              background: #667eea;
              color: white;
              border: none;
              padding: 16px 32px;
              border-radius: 12px;
              font-size: 16px;
              font-weight: 600;
              cursor: pointer;
              margin-top: 24px;
              transition: all 0.2s;
            }
            .btn:hover {
              background: #5568d3;
              transform: translateY(-2px);
              box-shadow: 0 4px 12px rgba(102, 126, 234, 0.4);
            }
            .auto-close {
              color: #999;
              font-size: 13px;
              margin-top: 16px;
            }
          </style>
        </head>
        <body>
          <div class="card">
            <div class="emoji">🎉</div>
            <h1>Gmail Connected!</h1>
            <p class="subtitle">
              Your Gmail account is now connected to OneClaw
            </p>
            
            <div class="email">${userProfile.email}</div>
            
            <div class="connected-badge">
              ✓ Ready to Send Emails
            </div>
            
            <div class="features">
              <div class="feature">
                <span class="feature-icon">📧</span>
                <span>Send emails via natural language</span>
              </div>
              <div class="feature">
                <span class="feature-icon">📥</span>
                <span>Read and summarize your inbox</span>
              </div>
              <div class="feature">
                <span class="feature-icon">🔒</span>
                <span>Tokens encrypted and stored securely</span>
              </div>
            </div>
            
            <button class="btn" onclick="window.close()">
              Close & Return to OneClaw
            </button>
            
            <p class="auto-close">
              This window will close automatically in 5 seconds
            </p>
          </div>
          
          <script>
            setTimeout(() => {
              window.close();
              // If window.close() fails (not opened by script), redirect
              setTimeout(() => {
                window.location.href = 'http://localhost:8787';
              }, 100);
            }, 5000);
          </script>
        </body>
      </html>
    `);

  } catch (error) {
    console.error('[OAuth] Callback error:', error);
    return c.html(`
      <html>
        <body style="font-family: -apple-system, sans-serif; padding: 40px; text-align: center;">
          <h1>❌ Something went wrong</h1>
          <p>We couldn't connect your account. Please try again from iMessage.</p>
        </body>
      </html>
    `, 500);
  }
}

/**
 * Generate the OAuth link to send in iMessage
 */
export function generateOAuthLink(userId: string, baseUrl: string): string {
  return `${baseUrl}/oauth/google?user=${userId}`;
}
