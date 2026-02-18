// OneClaw API Server
// Main entry point for the API that handles BlueBubbles webhooks and AI interactions

import * as dotenv from 'dotenv';
import * as path from 'path';

// Load environment variables from root .env.local
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });
dotenv.config({ path: path.resolve(process.cwd(), '../../.env.local') });

import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { logger } from 'hono/logger';

import { healthHandler } from './routes/health';
import { stripeWebhookHandler } from './routes/stripe';
import { googleAuthHandler, googleCallbackHandler } from './routes/oauth';
import { getGoogleTokenHandler, sendGmailHandler, getGmailStatusHandler, getGmailAccountHandler } from './routes/gmail';
import { emailQueueCronHandler } from './services/email-queue-processor';
import { 
  nablWorkflowHandler, 
  listWorkflowsHandler, 
  getWalletHandler, 
  topUpWalletHandler,
  getPriceHandler,
} from './routes/nabl-workflow';
import { discordInteractionHandler, registerCommandsHandler } from './routes/discord';
import { 
  registerNodeHandler,
  pairNodeHandler,
  heartbeatHandler,
  dispatchWorkflowHandler,
  pollWorkflowsHandler,
  completeWorkflowHandler,
  getRunStatusHandler,
  listNodesHandler,
} from './routes/nodes';
import { startDiscordBot } from './services/discord-bot';
import { registerNodeWorkflows } from './services/node-workflows';
import { initStores } from '@oneclaw/harness';
import { createSupabaseStores } from './stores/supabase';

// Create Hono app
const app = new Hono();

// Middleware
app.use('*', logger());
app.use('*', cors());

// Routes
app.get('/', (c) => c.json({ name: 'OneClaw API', version: '0.2.0', status: 'ok' }));
app.get('/health', healthHandler);

// Stripe webhook - handles subscription events
app.post('/webhook/stripe', stripeWebhookHandler);

// OAuth routes - user taps link in iMessage, authenticates in browser
app.get('/oauth/google', googleAuthHandler);
app.get('/oauth/google/callback', googleCallbackHandler);

// Gmail API routes - for Node Runtime
app.post('/api/v1/oauth/google/token', getGoogleTokenHandler);
app.post('/api/v1/oauth/google/send', sendGmailHandler);
app.get('/api/v1/oauth/google/status', getGmailStatusHandler);
app.get('/api/v1/oauth/google/account', getGmailAccountHandler);

// OneClaw Universal Workflow API - framework agnostic
app.post('/api/v1/workflow', nablWorkflowHandler);
app.get('/api/v1/workflows', listWorkflowsHandler);

// Wallet & Pricing API
app.get('/api/v1/wallet', getWalletHandler);
app.post('/api/v1/wallet/topup', topUpWalletHandler);
app.get('/api/v1/price', getPriceHandler);

// Discord interaction routes
app.post('/discord/interactions', discordInteractionHandler);
app.get('/discord/register-commands', registerCommandsHandler);

// OneClaw Node Control Plane - manage distributed nodes
app.post('/api/v1/nodes/register', registerNodeHandler);
app.post('/api/v1/nodes/pair', pairNodeHandler);
app.post('/api/v1/nodes/heartbeat', heartbeatHandler);
app.post('/api/v1/nodes/dispatch', dispatchWorkflowHandler);
app.get('/api/v1/nodes/poll', pollWorkflowsHandler);
app.post('/api/v1/nodes/complete', completeWorkflowHandler);
app.get('/api/v1/nodes/runs/:run_id', getRunStatusHandler);
app.get('/api/v1/nodes', listNodesHandler);

// Cron endpoints - for scheduled background jobs
app.post('/api/cron/email-queue', emailQueueCronHandler);

// Status/debug endpoint - shows current configuration
app.get('/api/v1/status', async (c) => {
  const status: Record<string, unknown> = {
    api: 'ok',
    version: '0.2.0',
    timestamp: new Date().toISOString(),
    config: {
      openrouter_api_key: process.env.OPENROUTER_API_KEY ? '✓ configured' : '✗ missing',
      anthropic_api_key: process.env.ANTHROPIC_API_KEY ? '✓ configured' : '✗ missing',
      supabase_url: process.env.SUPABASE_URL ? '✓ configured' : '✗ missing',
      discord_bot_token: process.env.DISCORD_BOT_TOKEN ? '✓ configured' : '✗ missing',
    },
  };
  
  return c.json(status);
});

// Test endpoint - simulate payment notification (remove in production)
app.get('/test/payment-message', async (c) => {
  const channelId = c.req.query('channel');
  const userId = c.req.query('user') || '397102686660591616';
  const amount = c.req.query('amount') || '1000';
  
  if (!channelId) {
    return c.json({ error: 'Missing ?channel=CHANNEL_ID' }, 400);
  }
  
  const botToken = process.env.DISCORD_BOT_TOKEN;
  if (!botToken) {
    return c.json({ error: 'No bot token configured' }, 500);
  }
  
  const response = await fetch(`https://discord.com/api/v10/channels/${channelId}/messages`, {
    method: 'POST',
    headers: {
      'Authorization': `Bot ${botToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      content: `<@${userId}>`,
      embeds: [{
        title: '💰 Funds Added!',
        description: `**$${(parseInt(amount) / 100).toFixed(2)}** has been added to your wallet.`,
        color: 0x00FF00,
        fields: [
          { name: 'New Balance', value: `$${(parseInt(amount) / 100).toFixed(2)}`, inline: true },
        ],
        footer: { text: 'OneClaw • Ready to run workflows' },
      }],
    }),
  });
  
  if (!response.ok) {
    const error = await response.text();
    return c.json({ error: 'Discord API error', status: response.status, details: error }, 500);
  }
  
  return c.json({ success: true, message: 'Sent!' });
});

// Export for different runtimes
export default app;

// Start server
const port = process.env.PORT || 3000;

console.log(`🚀 OneClaw API starting on port ${port}`);

// Initialize stores before anything else
function initializeStores(): void {
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;
  
  if (supabaseUrl && supabaseKey) {
    try {
      const stores = createSupabaseStores();
      initStores(stores);
      console.log('✅ Supabase stores initialized');
    } catch (error) {
      console.error('❌ Failed to initialize Supabase stores:', error);
      console.warn('⚠️ Continuing without persistent storage');
    }
  } else {
    console.warn('⚠️ No Supabase credentials - stores not initialized');
    console.warn('   Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY for persistence');
  }
}

import('@hono/node-server').then(async ({ serve }) => {
  // Initialize stores FIRST
  initializeStores();
  
  // Register OneClaw Node workflows in harness registry
  try {
    registerNodeWorkflows();
    console.log('✅ OneClaw Node workflows registered');
  } catch (error) {
    console.error('❌ Failed to register node workflows:', error);
  }
  
  serve({
    fetch: app.fetch,
    port: Number(port),
  });
  console.log(`✅ Server running on port ${port}`);
  
  // Start Discord bot if token is configured
  if (process.env.DISCORD_BOT_TOKEN) {
    try {
      await startDiscordBot();
      console.log('✅ Discord bot started');
    } catch (error) {
      console.error('❌ Failed to start Discord bot:', error);
    }
  }
});
