// Stripe webhook handler

import type { Context } from 'hono';
import { createLogger, ONBOARDING_STATE } from '@oneclaw/core';
import { updateUserTierByStripeId, updateUserTierByPhone, updateOnboardingState, linkStripeCustomer, saveOpenClawConfig } from '@oneclaw/database';
import type { UserTier } from '@oneclaw/core';
import { handlePaymentComplete, handleDeployComplete, getOnboardingState } from '../services/discord-onboarding';
import { topUpAsync, formatCents, loadWallet } from '@oneclaw/harness';

const log = createLogger('StripeWebhook');

// Price IDs from environment
const STARTER_PRICE_ID = process.env.STRIPE_STARTER_PRICE_ID || '';
const PRO_PRICE_ID = process.env.STRIPE_PRO_PRICE_ID || '';

// OpenClaw provisioning API (DigitalOcean droplet)
const PROVISION_API_URL = process.env.OPENCLAW_PROVISION_URL || 'http://104.131.111.116:3456';
const PROVISION_SECRET = process.env.OPENCLAW_PROVISION_SECRET || 'iclaw-provision-2026';

// Track next available port (start at 18001)
let nextPort = 18001;

// Admin channel for payment notifications (set in .env)
const ADMIN_CHANNEL_ID = process.env.DISCORD_ADMIN_CHANNEL_ID || '';

/**
 * Send a message to a Discord channel
 */
async function sendDiscordChannelMessage(channelId: string, content: string | object): Promise<boolean> {
  const botToken = process.env.DISCORD_BOT_TOKEN;
  if (!botToken || !channelId) return false;
  
  try {
    const payload = typeof content === 'string' ? { content } : content;
    const response = await fetch(`https://discord.com/api/v10/channels/${channelId}/messages`, {
      method: 'POST',
      headers: {
        'Authorization': `Bot ${botToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });
    
    if (!response.ok) {
      log.error('Failed to send channel message', { channelId, status: response.status });
      return false;
    }
    return true;
  } catch (error) {
    log.error('Failed to send channel message', error);
    return false;
  }
}

/**
 * Send a DM to a Discord user
 */
async function sendDiscordDM(userId: string, content: string | object): Promise<boolean> {
  const botToken = process.env.DISCORD_BOT_TOKEN;
  if (!botToken) return false;
  
  try {
    // First, create a DM channel
    const dmChannelResponse = await fetch('https://discord.com/api/v10/users/@me/channels', {
      method: 'POST',
      headers: {
        'Authorization': `Bot ${botToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ recipient_id: userId }),
    });
    
    if (!dmChannelResponse.ok) {
      log.error('Failed to create DM channel', { status: dmChannelResponse.status });
      return false;
    }
    
    const dmChannel = await dmChannelResponse.json();
    
    // Then send the message
    const payload = typeof content === 'string' ? { content } : content;
    const messageResponse = await fetch(`https://discord.com/api/v10/channels/${dmChannel.id}/messages`, {
      method: 'POST',
      headers: {
        'Authorization': `Bot ${botToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });
    
    return messageResponse.ok;
  } catch (error) {
    log.error('Failed to send Discord DM', error);
    return false;
  }
}

/**
 * Notify admin channel about a payment
 */
async function notifyAdminPayment(discordUserId: string, amountCents: number, newBalance: number): Promise<void> {
  if (!ADMIN_CHANNEL_ID) return;
  
  await sendDiscordChannelMessage(ADMIN_CHANNEL_ID, {
    embeds: [{
      title: '💵 Payment Received',
      color: 0x00FF00,
      fields: [
        { name: 'User', value: `<@${discordUserId}>`, inline: true },
        { name: 'Amount', value: formatCents(amountCents), inline: true },
        { name: 'New Balance', value: formatCents(newBalance), inline: true },
      ],
      timestamp: new Date().toISOString(),
    }],
  });
}

/**
 * Provision a new OpenClaw instance for a user
 */
async function provisionOpenClawInstance(phoneNumber: string): Promise<{ port: number; token: string } | null> {
  try {
    const port = nextPort++;
    
    const response = await fetch(`${PROVISION_API_URL}/provision`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        phone: phoneNumber,
        port,
        secret: PROVISION_SECRET,
      }),
    });

    if (!response.ok) {
      log.error('Provision API error', { status: response.status });
      return null;
    }

    const data = await response.json();
    return { port: data.port || port, token: data.token };
  } catch (error) {
    log.error('Failed to provision OpenClaw instance', error);
    return null;
  }
}

/**
 * Map price ID to tier
 */
function getTierFromPriceId(priceId: string): UserTier {
  if (priceId === PRO_PRICE_ID) return 'pro';
  if (priceId === STARTER_PRICE_ID) return 'starter';
  return 'none';
}

export async function stripeWebhookHandler(c: Context) {
  try {
    // Get the raw body for signature verification
    const rawBody = await c.req.text();
    const signature = c.req.header('stripe-signature');

    if (!signature) {
      log.warn('Missing Stripe signature');
      return c.json({ error: 'Missing signature' }, 400);
    }

    // Verify webhook signature
    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
    if (!webhookSecret) {
      log.error('STRIPE_WEBHOOK_SECRET not configured');
      return c.json({ error: 'Webhook not configured' }, 500);
    }

    // Parse the event
    // In production, you'd verify the signature with Stripe SDK
    // For now, we'll parse directly (add verification in production)
    let event;
    try {
      event = JSON.parse(rawBody);
    } catch {
      log.warn('Invalid JSON in webhook');
      return c.json({ error: 'Invalid JSON' }, 400);
    }

    log.info('Received Stripe event', { type: event.type });

    // Handle subscription events
    switch (event.type) {
      case 'customer.subscription.created':
      case 'customer.subscription.updated': {
        const subscription = event.data.object;
        const customerId = subscription.customer as string;
        const priceId = subscription.items?.data?.[0]?.price?.id;

        if (!priceId) {
          log.warn('No price ID in subscription');
          break;
        }

        // Only update if subscription is active
        if (subscription.status === 'active' || subscription.status === 'trialing') {
          const tier = getTierFromPriceId(priceId);
          const success = await updateUserTierByStripeId(customerId, tier);
          log.info('Updated user tier', { customerId, tier, success });
        }
        break;
      }

      case 'customer.subscription.deleted': {
        const subscription = event.data.object;
        const customerId = subscription.customer as string;

        const success = await updateUserTierByStripeId(customerId, 'none');
        log.info('Subscription cancelled', { customerId, success });
        break;
      }

      case 'checkout.session.completed': {
        const session = event.data.object;
        const clientRefId = session.client_reference_id; // Could be phone, discord_USERID, or topup_USERID_CENTS
        const customerId = session.customer as string;
        const mode = session.mode;

        log.info('Checkout completed', { 
          customerId,
          clientRefId,
          mode 
        });

        // =============================================
        // WALLET TOP-UP (format: topup_USERID_CENTS_CHANNELID)
        // =============================================
        if (clientRefId?.startsWith('topup_')) {
          const parts = clientRefId.split('_'); // topup_123456789_500_987654321
          const discordUserId = parts[1];
          const amountCents = parseInt(parts[2], 10) || session.amount_total || 500;
          const channelId = parts[3]; // Channel where user started the flow
          
          log.info('Processing wallet top-up', { discordUserId, amountCents, channelId });
          
          // Add funds to wallet (persists to Supabase)
          const transaction = await topUpAsync(discordUserId, amountCents, session.id);
          const wallet = await loadWallet(discordUserId);
          
          const successEmbed = {
            embeds: [{
              title: '💰 Funds Added!',
              description: `**${formatCents(amountCents)}** has been added to your wallet.`,
              color: 0x00FF00,
              fields: [
                { name: 'New Balance', value: formatCents(wallet.balanceCents), inline: true },
              ],
              footer: { text: 'OneClaw • Ready to run workflows' },
            }],
          };
          
          // Try to send to the original channel first, fall back to DM
          let notified = false;
          if (channelId) {
            notified = await sendDiscordChannelMessage(channelId, {
              content: `<@${discordUserId}>`, // Mention user
              ...successEmbed,
            });
            log.info('Sent channel notification', { channelId, success: notified });
          }
          
          // Fall back to DM if channel message failed
          if (!notified) {
            const dmSent = await sendDiscordDM(discordUserId, successEmbed);
            log.info('Sent DM notification', { dmSent });
          }
          
          // Notify admin channel (for internal tracking)
          await notifyAdminPayment(discordUserId, amountCents, wallet.balanceCents);
          
          log.info('Top-up complete', { 
            discordUserId, 
            newBalance: wallet.balanceCents,
            channelId,
          });
          break;
        }

        // Determine tier from session
        let tier: UserTier = 'starter';
        if (session.amount_total && session.amount_total >= 4900) {
          tier = 'pro';
        }

        // =============================================
        // SUBSCRIPTION / DEPLOY (format: discord_USERID)
        // =============================================
        if (clientRefId?.startsWith('discord_')) {
          const discordUserId = clientRefId.replace('discord_', '');
          log.info('Processing Discord user payment', { discordUserId, tier });
          
          // Send "deploying" message
          const deployingMsg = handlePaymentComplete(discordUserId);
          await sendDiscordDM(discordUserId, deployingMsg);
          
          // Provision OpenClaw instance for Discord user
          const provisionResult = await provisionOpenClawInstance(discordUserId);
          
          if (provisionResult) {
            log.info('Provisioned OpenClaw for Discord user', { discordUserId, ...provisionResult });
            
            // Wait a moment for deployment to settle
            await new Promise(resolve => setTimeout(resolve, 3000));
            
            // Send "ready" message
            const readyMsg = handleDeployComplete(discordUserId);
            await sendDiscordDM(discordUserId, readyMsg);
          } else {
            // Deployment failed - notify user
            await sendDiscordDM(discordUserId, '❌ There was an issue deploying your agent. Our team has been notified and will reach out shortly.');
            log.error('Failed to provision OpenClaw for Discord user', { discordUserId });
          }
        }
        // Phone number flow (legacy iMessage)
        else if (clientRefId) {
          const phoneNumber = clientRefId;
          
          // Link Stripe customer ID to user
          await linkStripeCustomer(phoneNumber, customerId);

          // Update user tier by phone
          const success = await updateUserTierByPhone(phoneNumber, tier);
          log.info('Updated user tier by phone', { phoneNumber, tier, success });

          // Provision OpenClaw instance for this user
          const provisionResult = await provisionOpenClawInstance(phoneNumber);
          if (provisionResult) {
            log.info('Provisioned OpenClaw instance', provisionResult);
            // Save port and token to database
            await saveOpenClawConfig(phoneNumber, provisionResult.port, provisionResult.token);
          }

          // Move to next onboarding state
          try {
            await updateOnboardingState(phoneNumber, ONBOARDING_STATE.SETTING_UP_SKILLS);
          } catch (e) {
            log.warn('Could not update onboarding state', e);
          }

          // TODO: Send confirmation via email/notification instead of Sendblue
          log.info('Payment confirmed for phone', { phoneNumber });
        }
        break;
      }

      case 'invoice.payment_failed': {
        const invoice = event.data.object;
        log.warn('Payment failed', { customerId: invoice.customer });
        // Could send a notification to user here
        break;
      }

      default:
        log.debug('Unhandled event type', { type: event.type });
    }

    return c.json({ received: true });
  } catch (error) {
    log.error('Stripe webhook error', error);
    return c.json({ error: 'Internal server error' }, 500);
  }
}
