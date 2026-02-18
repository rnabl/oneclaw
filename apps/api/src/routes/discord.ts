// Discord Bot Handler
// Handles Discord interactions and routes to workflows via AgentKey

import type { Context } from 'hono';
import { handleAuditWorkflow, formatAuditForChat } from '../workflows/audit';
import { handleDiscoveryWorkflow, formatDiscoveryForChat } from '../workflows/discovery';
import {
  handleOnboardStart,
  handleModelSelect,
  handleApiKeySubmit,
  handlePlanSelect,
  handlePaymentComplete,
  handleDeployComplete,
  handleToolSetupPrompt,
  getOnboardingState,
  setOnboardingState,
  ONBOARDING_MESSAGES,
} from '../services/discord-onboarding';
import {
  loadWallet,
  canAfford,
  charge,
  refund,
  formatCents,
  calculatePrice,
  TOP_UP_PACKAGES,
} from '@oneclaw/harness';

// Discord API types
interface DiscordInteraction {
  type: number;
  data?: {
    name?: string;
    options?: Array<{ name: string; value: string | number | boolean }>;
    custom_id?: string;
  };
  token: string;
  member?: {
    user: DiscordUser;
  };
  user?: DiscordUser;
  guild_id?: string;
  channel_id?: string;
}

interface DiscordUser {
  id: string;
  username: string;
  discriminator: string;
  avatar?: string;
}

// Interaction types
const INTERACTION_TYPES = {
  PING: 1,
  APPLICATION_COMMAND: 2,
  MESSAGE_COMPONENT: 3,
  APPLICATION_COMMAND_AUTOCOMPLETE: 4,
  MODAL_SUBMIT: 5,
};

// Response types
const RESPONSE_TYPES = {
  PONG: 1,
  CHANNEL_MESSAGE_WITH_SOURCE: 4,
  DEFERRED_CHANNEL_MESSAGE_WITH_SOURCE: 5,
  DEFERRED_UPDATE_MESSAGE: 6,
  UPDATE_MESSAGE: 7,
  APPLICATION_COMMAND_AUTOCOMPLETE_RESULT: 8,
  MODAL: 9,
};

/**
 * Verify Discord request signature
 */
async function verifyDiscordSignature(
  publicKey: string,
  signature: string,
  timestamp: string,
  body: string
): Promise<boolean> {
  try {
    const encoder = new TextEncoder();
    const data = encoder.encode(timestamp + body);
    
    // Import public key
    const key = await crypto.subtle.importKey(
      'raw',
      hexToUint8Array(publicKey),
      { name: 'Ed25519', namedCurve: 'Ed25519' },
      false,
      ['verify']
    );
    
    // Verify signature
    const signatureBytes = hexToUint8Array(signature);
    return await crypto.subtle.verify('Ed25519', key, signatureBytes, data);
  } catch (error) {
    console.error('[discord] Signature verification error:', error);
    return false;
  }
}

function hexToUint8Array(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = parseInt(hex.slice(i, i + 2), 16);
  }
  return bytes;
}

/**
 * POST /discord/interactions
 * Handle Discord slash command interactions
 */
export async function discordInteractionHandler(c: Context): Promise<Response> {
  const publicKey = process.env.DISCORD_PUBLIC_KEY;
  
  if (!publicKey) {
    console.error('[discord] DISCORD_PUBLIC_KEY not set');
    return c.json({ error: 'Server configuration error' }, 500);
  }
  
  // Get headers for verification
  const signature = c.req.header('x-signature-ed25519');
  const timestamp = c.req.header('x-signature-timestamp');
  const rawBody = await c.req.text();
  
  if (!signature || !timestamp) {
    return c.json({ error: 'Invalid request' }, 401);
  }
  
  // Verify signature (skip in development for testing)
  if (process.env.NODE_ENV !== 'development') {
    const isValid = await verifyDiscordSignature(publicKey, signature, timestamp, rawBody);
    if (!isValid) {
      return c.json({ error: 'Invalid signature' }, 401);
    }
  }
  
  const interaction: DiscordInteraction = JSON.parse(rawBody);
  
  // Handle PING (required for Discord to verify endpoint)
  if (interaction.type === INTERACTION_TYPES.PING) {
    return c.json({ type: RESPONSE_TYPES.PONG });
  }
  
  // Handle slash commands
  if (interaction.type === INTERACTION_TYPES.APPLICATION_COMMAND) {
    return handleSlashCommand(c, interaction);
  }
  
  // Handle button clicks and select menus
  if (interaction.type === INTERACTION_TYPES.MESSAGE_COMPONENT) {
    return handleMessageComponent(c, interaction);
  }
  
  // Handle modal submissions
  if (interaction.type === INTERACTION_TYPES.MODAL_SUBMIT) {
    return handleModalSubmit(c, interaction);
  }
  
  return c.json({ type: RESPONSE_TYPES.PONG });
}

/**
 * Handle modal submissions (API key input, provider keys, etc.)
 */
async function handleModalSubmit(c: Context, interaction: DiscordInteraction): Promise<Response> {
  const customId = interaction.data?.custom_id;
  const user = interaction.member?.user || interaction.user;
  const userId = user?.id || '';
  
  // Get submitted values from modal components
  const components = (interaction.data as any)?.components as Array<{
    type: number;
    components: Array<{ custom_id: string; value: string }>;
  }> | undefined;
  
  const values: Record<string, string> = {};
  components?.forEach(row => {
    row.components?.forEach(input => {
      values[input.custom_id] = input.value;
    });
  });
  
  console.log(`[discord] Modal submit: ${customId}`, values);
  
  switch (customId) {
    case 'api_key_modal': {
      const apiKey = values.api_key;
      if (!apiKey) {
        return c.json({
          type: RESPONSE_TYPES.CHANNEL_MESSAGE_WITH_SOURCE,
          data: { content: '❌ API key is required', flags: 64 },
        });
      }
      
      // Store the API key and move to plan selection
      const response = handleApiKeySubmit(userId, apiKey);
      return c.json({
        type: RESPONSE_TYPES.CHANNEL_MESSAGE_WITH_SOURCE,
        data: response,
      });
    }
    
    case 'provider_keys_modal': {
      // Store provider keys for BYOK users
      const state = getOnboardingState(userId);
      if (state) {
        // In production, encrypt and store these securely
        // For now, just mark as configured
        state.step = 'ready';
        setOnboardingState(userId, state);
      }
      
      return c.json({
        type: RESPONSE_TYPES.CHANNEL_MESSAGE_WITH_SOURCE,
        data: {
          embeds: [{
            title: '✅ Provider Keys Saved',
            description: 'Your API keys have been configured. Running your workflow now...',
            color: 0x00FF00,
          }],
        },
      });
    }
    
    default:
      return c.json({
        type: RESPONSE_TYPES.CHANNEL_MESSAGE_WITH_SOURCE,
        data: { content: '❌ Unknown modal submission', flags: 64 },
      });
  }
}

/**
 * Send a follow-up message after deferring
 */
async function sendFollowUp(
  applicationId: string,
  interactionToken: string,
  content: string
): Promise<void> {
  try {
    const response = await fetch(
      `https://discord.com/api/v10/webhooks/${applicationId}/${interactionToken}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content }),
      }
    );
    
    if (!response.ok) {
      console.error('[discord] Failed to send follow-up:', await response.text());
    }
  } catch (error) {
    console.error('[discord] Error sending follow-up:', error);
  }
}

/**
 * Handle slash commands
 */
async function handleSlashCommand(c: Context, interaction: DiscordInteraction): Promise<Response> {
  const commandName = interaction.data?.name;
  const options = interaction.data?.options || [];
  const user = interaction.member?.user || interaction.user;
  const applicationId = process.env.DISCORD_APPLICATION_ID || '';
  const interactionToken = interaction.token;
  
  console.log(`[discord] Command: /${commandName} from ${user?.username}`);
  
  switch (commandName) {
    case 'help':
      return c.json({
        type: RESPONSE_TYPES.CHANNEL_MESSAGE_WITH_SOURCE,
        data: {
          embeds: [{
            title: '🦞 OneClaw Commands',
            description: 'Here are the available commands:',
            color: 0x5865F2,
            fields: [
              {
                name: '/setup',
                value: 'Deploy your own AI agent (start here!)',
                inline: false
              },
              {
                name: '/audit <url>',
                value: 'Run a comprehensive website audit',
                inline: false
              },
              {
                name: '/discover <niche> <location>',
                value: 'Find businesses by niche and location',
                inline: false
              },
              {
                name: '/status',
                value: 'Check your credits and usage',
                inline: false
              }
            ],
            footer: { text: 'OneClaw - AI Agent Platform • oneclaw.chat' }
          }]
        }
      });
      
    case 'setup': {
      // Start the onboarding flow
      if (user?.id) {
        handleOnboardStart(user.id);
      }
      return c.json({
        type: RESPONSE_TYPES.CHANNEL_MESSAGE_WITH_SOURCE,
        data: ONBOARDING_MESSAGES.welcome,
      });
    }
      
    case 'audit': {
      const url = options.find(o => o.name === 'url')?.value as string;
      const userId = user?.id || 'unknown';
      
      if (!url) {
        return c.json({
          type: RESPONSE_TYPES.CHANNEL_MESSAGE_WITH_SOURCE,
          data: { content: '❌ Please provide a URL to audit. Example: `/audit example.com`' }
        });
      }
      
      // Get price and check balance (load from Supabase)
      const wallet = await loadWallet(userId);
      const price = calculatePrice('audit', 1, wallet.tier);
      
      // Check if user can afford ($20 for audit)
      if (!canAfford(userId, price.finalPriceCents)) {
        return c.json({
          type: RESPONSE_TYPES.CHANNEL_MESSAGE_WITH_SOURCE,
          data: {
            embeds: [{
              title: '💰 Insufficient Balance',
              description: `**Audit** costs ${price.finalPriceFormatted}\nYour balance: ${formatCents(wallet.balanceCents)}`,
              color: 0xFF0000,
            }],
            components: [{
              type: 1,
              components: [
                { type: 2, style: 1, label: '💳 Add $20', custom_id: 'topup_20' },
                { type: 2, style: 3, label: '💳 Add $50', custom_id: 'topup_50' },
              ]
            }],
          }
        });
      }
      
      // Charge upfront
      const chargeResult = charge(userId, price.finalPriceCents, 'audit', undefined, `Audit: ${url}`);
      
      if (!chargeResult.success) {
        return c.json({
          type: RESPONSE_TYPES.CHANNEL_MESSAGE_WITH_SOURCE,
          data: { content: '❌ Payment failed. Please try again.' }
        });
      }
      
      // Start the audit in the background (don't await)
      handleAuditWorkflow({ url })
        .then(result => {
          const formatted = formatAuditForChat(result);
          const balanceMsg = `\n\n💰 ${price.finalPriceFormatted} charged • Balance: ${formatCents(chargeResult.balanceAfterCents || 0)}`;
          console.log(`[discord] Audit complete for ${url}`);
          return sendFollowUp(applicationId, interactionToken, formatted + balanceMsg);
        })
        .catch(err => {
          // Refund on failure
          refund(userId, price.finalPriceCents, 'audit', err.message);
          console.error(`[discord] Audit failed for ${url}:`, err);
          return sendFollowUp(
            applicationId, 
            interactionToken, 
            `❌ Audit failed: ${err.message}\n💰 Refunded ${price.finalPriceFormatted}`
          );
        });
      
      // Immediately return deferred response
      return c.json({
        type: RESPONSE_TYPES.DEFERRED_CHANNEL_MESSAGE_WITH_SOURCE,
      });
    }
      
    case 'discover': {
      const niche = options.find(o => o.name === 'niche')?.value as string;
      const location = options.find(o => o.name === 'location')?.value as string;
      const limit = (options.find(o => o.name === 'limit')?.value as number) || 100;
      const userId = user?.id || 'unknown';
      
      if (!niche || !location) {
        return c.json({
          type: RESPONSE_TYPES.CHANNEL_MESSAGE_WITH_SOURCE,
          data: { content: '❌ Please provide both niche and location. Example: `/discover hvac Denver, CO`' }
        });
      }
      
      // Get price and check balance (load from Supabase)
      const wallet = await loadWallet(userId);
      const price = calculatePrice('discover', 1, wallet.tier);
      
      // Check if user can afford
      if (!canAfford(userId, price.finalPriceCents)) {
        return c.json({
          type: RESPONSE_TYPES.CHANNEL_MESSAGE_WITH_SOURCE,
          data: {
            embeds: [{
              title: '💰 Insufficient Balance',
              description: `**Discovery** costs ${price.finalPriceFormatted}\nYour balance: ${formatCents(wallet.balanceCents)}`,
              color: 0xFF0000,
            }],
            components: [{
              type: 1,
              components: [
                { type: 2, style: 1, label: '💳 Add $5', custom_id: 'topup_5' },
                { type: 2, style: 1, label: '💳 Add $10', custom_id: 'topup_10' },
              ]
            }],
          }
        });
      }
      
      // Charge upfront
      const chargeResult = charge(userId, price.finalPriceCents, 'discover', undefined, `Discover: ${niche} in ${location}`);
      
      if (!chargeResult.success) {
        return c.json({
          type: RESPONSE_TYPES.CHANNEL_MESSAGE_WITH_SOURCE,
          data: { content: '❌ Payment failed. Please try again.' }
        });
      }
      
      // Start discovery in background (don't await)
      handleDiscoveryWorkflow({ niche, location, limit })
        .then(result => {
          const formatted = formatDiscoveryForChat(result);
          const balanceMsg = `\n\n💰 ${price.finalPriceFormatted} charged • Balance: ${formatCents(chargeResult.balanceAfterCents || 0)}`;
          console.log(`[discord] Discovery complete for ${niche} in ${location}`);
          return sendFollowUp(applicationId, interactionToken, formatted + balanceMsg);
        })
        .catch(err => {
          // Refund on failure
          refund(userId, price.finalPriceCents, 'discover', err.message);
          console.error(`[discord] Discovery failed:`, err);
          return sendFollowUp(
            applicationId, 
            interactionToken, 
            `❌ Discovery failed: ${err.message}\n💰 Refunded ${price.finalPriceFormatted}`
          );
        });
      
      return c.json({
        type: RESPONSE_TYPES.DEFERRED_CHANNEL_MESSAGE_WITH_SOURCE,
      });
    }
      
    case 'status': {
      // Get user wallet (load from Supabase)
      const wallet = await loadWallet(user?.id || 'unknown');
      
      const balanceFormatted = formatCents(wallet.balanceCents);
      const lifetimeSpent = formatCents(wallet.lifetimeSpentCents);
      
      // Color based on balance
      const statusColor = wallet.balanceCents >= 2000 ? 0x00FF00 : // $20+
                          wallet.balanceCents >= 500 ? 0xFFFF00 :  // $5+
                          0xFF0000;                                 // Low
      
      // Tier display
      const tierDisplay = wallet.tier === 'pro' ? '⭐ Pro (50% off)' :
                          wallet.tier === 'starter' ? '✨ Starter (20% off)' :
                          'Free';
      
      return c.json({
        type: RESPONSE_TYPES.CHANNEL_MESSAGE_WITH_SOURCE,
        data: {
          embeds: [{
            title: '💰 Your OneClaw Wallet',
            color: statusColor,
            fields: [
              { name: 'Balance', value: balanceFormatted, inline: true },
              { name: 'Plan', value: tierDisplay, inline: true },
              { name: 'Lifetime Spent', value: lifetimeSpent, inline: true },
            ],
            footer: { text: 'Add funds: /topup • oneclaw.chat' }
          }],
          components: wallet.balanceCents < 500 ? [{
            type: 1,
            components: [
              { type: 2, style: 1, label: '💳 Add $5', custom_id: 'topup_5' },
              { type: 2, style: 1, label: '💳 Add $10', custom_id: 'topup_10' },
              { type: 2, style: 3, label: '💳 Add $20', custom_id: 'topup_20' },
            ]
          }] : undefined,
        }
      });
    }
      
    case 'deploy':
      return handleDeployCommand(c, interaction);
      
    default:
      return c.json({
        type: RESPONSE_TYPES.CHANNEL_MESSAGE_WITH_SOURCE,
        data: { content: `❓ Unknown command: ${commandName}. Use /help to see available commands.` }
      });
  }
}

/**
 * Handle deploy command - starts onboarding DM flow
 */
async function handleDeployCommand(c: Context, interaction: DiscordInteraction): Promise<Response> {
  // This would normally start a DM conversation with the user
  return c.json({
    type: RESPONSE_TYPES.CHANNEL_MESSAGE_WITH_SOURCE,
    data: {
      content: '🚀 **Deploy Your Own OneClaw Bot**\n\nI\'ll send you a DM to get started with setup!',
      flags: 64, // Ephemeral - only visible to user
      components: [
        {
          type: 1, // Action Row
          components: [
            {
              type: 2, // Button
              style: 1, // Primary
              label: 'Start Setup',
              custom_id: 'deploy_start'
            }
          ]
        }
      ]
    }
  });
}

/**
 * Handle button clicks and select menus
 */
async function handleMessageComponent(c: Context, interaction: DiscordInteraction): Promise<Response> {
  const customId = interaction.data?.custom_id;
  const user = interaction.member?.user || interaction.user;
  const userId = user?.id || '';
  
  // Get select menu value if this is a select
  const selectValues = (interaction.data as any)?.values as string[] | undefined;
  
  console.log(`[discord] Component interaction: ${customId} from user ${userId}`, selectValues);
  
  switch (customId) {
    // ==========================================
    // TOP-UP / WALLET
    // ==========================================
    case 'topup_5':
    case 'topup_10':
    case 'topup_25': {
      const amounts: Record<string, { cents: number; label: string; envKey: string }> = {
        'topup_5': { cents: 500, label: '$5', envKey: 'STRIPE_TOPUP_5_LINK' },
        'topup_10': { cents: 1000, label: '$10', envKey: 'STRIPE_TOPUP_10_LINK' },
        'topup_25': { cents: 2500, label: '$25', envKey: 'STRIPE_TOPUP_25_LINK' },
      };
      
      const amount = amounts[customId];
      const channelId = interaction.channel_id || '';
      
      // Get Stripe link for this specific amount
      // Format: topup_USERID_CENTS_CHANNELID (channelId for follow-up message)
      const baseLink = process.env[amount.envKey] || process.env.STRIPE_TOPUP_LINK || '';
      const link = `${baseLink}?client_reference_id=topup_${userId}_${amount.cents}_${channelId}`;
      
      return c.json({
        type: RESPONSE_TYPES.CHANNEL_MESSAGE_WITH_SOURCE,
        data: {
          embeds: [{
            title: `💳 Add ${amount.label} to your wallet`,
            description: `Click below to add ${amount.label} to your OneClaw balance.\n\nAfter payment, your balance will be updated automatically.`,
            color: 0x5865F2,
          }],
          components: [{
            type: 1,
            components: [{
              type: 2,
              style: 5, // Link
              label: `Pay ${amount.label}`,
              url: link || 'https://oneclaw.chat/topup',
            }]
          }],
          flags: 64, // Ephemeral
        }
      });
    }
    
    // ==========================================
    // NEW ONBOARDING FLOW
    // ==========================================
    case 'onboard_start': {
      const response = handleOnboardStart(userId);
      return c.json({
        type: RESPONSE_TYPES.UPDATE_MESSAGE,
        data: response,
      });
    }
    
    case 'model_select': {
      const model = selectValues?.[0] as 'oneclaw' | 'claude' | 'openai';
      if (!model) {
        return c.json({
          type: RESPONSE_TYPES.UPDATE_MESSAGE,
          data: { content: '❌ Please select a model' },
        });
      }
      
      const result = handleModelSelect(userId, model);
      
      // If BYOK, show modal for API key
      if ('modal' in result) {
        return c.json({
          type: RESPONSE_TYPES.MODAL,
          data: result.modal,
        });
      }
      
      // Otherwise show plan selection
      return c.json({
        type: RESPONSE_TYPES.UPDATE_MESSAGE,
        data: result,
      });
    }
    
    case 'plan_payg': {
      // Pay As You Go - no subscription, just wallet top-up
      const state = getOnboardingState(userId);
      if (state) {
        state.step = 'ready';
        setOnboardingState(userId, state);
      }
      
      return c.json({
        type: RESPONSE_TYPES.UPDATE_MESSAGE,
        data: {
          embeds: [{
            title: '✅ Pay As You Go Activated',
            description: `**You're all set!**

Your wallet starts at $0. Add credits anytime:
• $5, $10, $20 - instant top-up
• $50 - get 10% bonus
• $100 - get 20% bonus

**Try a workflow:**
• \`/discover hvac Denver\` - Find leads ($1)
• \`/audit example.com\` - Website audit ($20)

Or just ask me anything!`,
            color: 0x00FF00,
            footer: { text: 'OneClaw • Pay only for what you use' }
          }],
          components: [{
            type: 1,
            components: [
              { type: 2, style: 2, label: '💳 Add $5', custom_id: 'topup_5' },
              { type: 2, style: 1, label: '💳 Add $10', custom_id: 'topup_10' },
              { type: 2, style: 3, label: '💳 Add $25', custom_id: 'topup_25' },
            ]
          }]
        },
      });
    }
    
    case 'plan_starter':
    case 'plan_pro': {
      const plan = customId === 'plan_starter' ? 'starter' : 'pro';
      const response = handlePlanSelect(userId, plan);
      return c.json({
        type: RESPONSE_TYPES.UPDATE_MESSAGE,
        data: response,
      });
    }
    
    case 'provider_oneclaw': {
      // User chose to use our shared providers
      // Mark their onboarding as ready for this tool
      const state = getOnboardingState(userId);
      if (state) {
        state.step = 'ready';
        setOnboardingState(userId, state);
      }
      
      return c.json({
        type: RESPONSE_TYPES.UPDATE_MESSAGE,
        data: {
          embeds: [{
            title: '✅ Providers Configured',
            description: 'Using OneClaw shared providers. Running your workflow now...',
            color: 0x00FF00,
          }],
        },
      });
    }
    
    case 'provider_byok': {
      // User wants to use their own keys - show modal
      return c.json({
        type: RESPONSE_TYPES.MODAL,
        data: ONBOARDING_MESSAGES.providerKeyInput,
      });
    }
    
    // ==========================================
    // LEGACY DEPLOY FLOW (kept for /deploy command)
    // ==========================================
    case 'deploy_start':
      return c.json({
        type: RESPONSE_TYPES.CHANNEL_MESSAGE_WITH_SOURCE,
        data: {
          content: '**Step 1: Choose your platform**\n\nWhere do you want your bot?',
          flags: 64,
          components: [
            {
              type: 1,
              components: [
                {
                  type: 3, // Select Menu
                  custom_id: 'platform_select',
                  placeholder: 'Select platform...',
                  options: [
                    { label: 'Discord', value: 'discord', emoji: { name: '💬' } },
                    { label: 'Telegram', value: 'telegram', emoji: { name: '📱' } },
                    { label: 'Slack', value: 'slack', emoji: { name: '💼' } }
                  ]
                }
              ]
            }
          ]
        }
      });
      
    case 'platform_select':
      return c.json({
        type: RESPONSE_TYPES.CHANNEL_MESSAGE_WITH_SOURCE,
        data: {
          content: '**Step 2: Choose your orchestration framework**\n\nThis determines how your bot processes messages:',
          flags: 64,
          components: [
            {
              type: 1,
              components: [
                {
                  type: 3,
                  custom_id: 'framework_select',
                  placeholder: 'Select framework...',
                  options: [
                    { label: 'OpenClaw (Recommended)', value: 'openclaw', description: 'TypeScript, easy setup' },
                    { label: 'ZeroClaw', value: 'zeroclaw', description: 'Rust, lightweight' },
                    { label: 'IronClaw', value: 'ironclaw', description: 'Rust, enterprise security' },
                    { label: 'LangGraph', value: 'langgraph', description: 'Python, complex workflows' },
                    { label: 'CrewAI', value: 'crewai', description: 'Python, multi-agent' }
                  ]
                }
              ]
            }
          ]
        }
      });
      
    case 'framework_select':
      return c.json({
        type: RESPONSE_TYPES.CHANNEL_MESSAGE_WITH_SOURCE,
        data: {
          content: '**Step 3: Choose your plan**',
          flags: 64,
          components: [
            {
              type: 1,
              components: [
                {
                  type: 2,
                  style: 1,
                  label: 'Starter - $19/mo',
                  custom_id: 'plan_starter'
                },
                {
                  type: 2,
                  style: 3, // Success/Green
                  label: 'Pro - $49/mo',
                  custom_id: 'plan_pro'
                }
              ]
            }
          ]
        }
      });
      
    default:
      return c.json({
        type: RESPONSE_TYPES.UPDATE_MESSAGE,
        data: { content: 'Unknown interaction' }
      });
  }
}

/**
 * Register slash commands with Discord API
 * Run this once to set up commands
 */
export async function registerDiscordCommands(): Promise<void> {
  const applicationId = process.env.DISCORD_APPLICATION_ID;
  const botToken = process.env.DISCORD_BOT_TOKEN;
  
  if (!applicationId || !botToken) {
    console.error('[discord] Missing DISCORD_APPLICATION_ID or DISCORD_BOT_TOKEN');
    return;
  }
  
  const commands = [
    {
      name: 'help',
      description: 'Show available commands'
    },
    {
      name: 'setup',
      description: 'Start OneClaw setup and deploy your own AI agent'
    },
    {
      name: 'audit',
      description: 'Run a website audit',
      options: [
        {
          type: 3, // STRING
          name: 'url',
          description: 'Website URL to audit',
          required: true
        }
      ]
    },
    {
      name: 'discover',
      description: 'Find businesses by niche and location',
      options: [
        {
          type: 3,
          name: 'niche',
          description: 'Business niche (e.g., "hvac", "plumber")',
          required: true
        },
        {
          type: 3,
          name: 'location',
          description: 'Location (e.g., "Denver, CO")',
          required: true
        },
        {
          type: 4, // INTEGER
          name: 'limit',
          description: 'Max results (default: 100)',
          required: false
        }
      ]
    },
    {
      name: 'status',
      description: 'Check your credits and usage'
    },
    {
      name: 'deploy',
      description: 'Deploy your own OneClaw bot'
    }
  ];
  
  try {
    const response = await fetch(
      `https://discord.com/api/v10/applications/${applicationId}/commands`,
      {
        method: 'PUT',
        headers: {
          'Authorization': `Bot ${botToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(commands)
      }
    );
    
    if (!response.ok) {
      const error = await response.text();
      console.error('[discord] Failed to register commands:', error);
      return;
    }
    
    console.log('[discord] Successfully registered slash commands');
  } catch (error) {
    console.error('[discord] Error registering commands:', error);
  }
}

/**
 * GET /discord/register-commands
 * Endpoint to trigger command registration
 */
export async function registerCommandsHandler(c: Context): Promise<Response> {
  await registerDiscordCommands();
  return c.json({ success: true, message: 'Commands registered' });
}
