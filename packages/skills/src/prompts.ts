// System prompts and prompt utilities

import type { User, ConversationContext } from '@oneclaw/core';
import { TIERS, MESSAGES } from '@oneclaw/core';

/**
 * Base system prompt for iClaw
 */
export const BASE_SYSTEM_PROMPT = `You are iClaw, a personal AI assistant for iPhone users via iMessage.

## Your Identity
- Name: iClaw
- Personality: Friendly, efficient, helpful
- Tone: Casual but professional, like a smart friend who gets things done
- Keep messages concise (iMessage bubbles should be readable)

## Response Guidelines
1. Keep responses SHORT - this is iMessage, not email
2. Use emojis sparingly but effectively
3. Always confirm important actions before executing
4. Be proactive - suggest next steps
5. Handle errors gracefully - always offer alternatives

## Formatting (CRITICAL - this is iMessage, not a website)
- Use line breaks to separate thoughts
- Use bullet points (• or -) for lists
- Use emojis as visual markers (✅ ❌ 🎯 👋)
- NEVER use markdown like **bold**, *italics*, or [links](url)
- NEVER use ### headers or code blocks
- Just plain text with emojis and line breaks

## Important
- Never make up information
- If you can't do something, say so clearly
- Always protect user privacy
- Confirm purchases before completing them`;

/**
 * Build the complete system prompt for a user
 */
export function buildSystemPrompt(user: User | null, skillPrompts: string[] = []): string {
  const parts: string[] = [BASE_SYSTEM_PROMPT];

  // Add user context
  if (user) {
    parts.push(`
## Current User
- Name: ${user.name || 'Unknown'}
- Tier: ${user.tier} (${TIERS[user.tier]?.name || 'None'})
- Features: ${TIERS[user.tier]?.features?.join(', ') || 'None'}`);

    // Add tier-specific instructions
    if (user.tier === 'none') {
      parts.push(`
## User Status: Not Subscribed
This user has not subscribed yet. Your primary goal is to help them choose a plan.
When they're ready, they can reply "Starter" or "Pro".`);
    } else if (user.tier === 'starter') {
      parts.push(`
## User Status: Starter Plan
This user has the Starter plan ($19/mo).
They can use all on-demand features but NOT automated features like snipers or scheduled tasks.
If they ask for a Pro feature, explain it requires an upgrade.`);
    } else if (user.tier === 'pro') {
      parts.push(`
## User Status: Pro Plan
This user has the Pro plan ($49/mo).
They have access to ALL features including automated tasks, snipers, and scheduled alerts.`);
    }
  } else {
    parts.push(`
## User Status: New User
This is a new user who just messaged for the first time.
Welcome them and explain what you can do.`);
  }

  // Add skill-specific prompts
  if (skillPrompts.length > 0) {
    parts.push('\n## Active Skills');
    parts.push(...skillPrompts);
  }

  return parts.join('\n');
}

/**
 * Build conversation messages for AI context
 */
export function buildConversationMessages(
  context: ConversationContext
): Array<{ role: 'user' | 'assistant'; content: string }> {
  const messages: Array<{ role: 'user' | 'assistant'; content: string }> = [];

  // Add conversation history
  for (const msg of context.messages) {
    messages.push({
      role: msg.role,
      content: msg.content,
    });
  }

  // Add current message
  messages.push({
    role: 'user',
    content: context.currentMessage,
  });

  return messages;
}

/**
 * Get the welcome message for new users
 */
export function getWelcomeMessage(): string {
  return MESSAGES.WELCOME;
}

/**
 * Get the payment success message
 */
export function getPaymentSuccessMessage(name: string): string {
  return MESSAGES.PAYMENT_SUCCESS(name);
}

/**
 * Get the ask name message
 */
export function getAskNameMessage(): string {
  return MESSAGES.ASK_NAME;
}

/**
 * Get the Pro upsell message
 */
export function getProUpsellMessage(feature: string, upgradeLink: string): string {
  return `${MESSAGES.PRO_UPSELL(feature)}

${upgradeLink}`;
}

/**
 * Get the subscription expired message
 */
export function getSubscriptionExpiredMessage(starterLink: string, proLink: string): string {
  return `${MESSAGES.SUBSCRIPTION_EXPIRED}

${starterLink}
${proLink}`;
}

/**
 * Get the plan selection message based on user choice
 */
export function getPlanSelectionMessage(plan: 'starter' | 'pro', paymentLink: string): string {
  if (plan === 'starter') {
    return `Great choice! One tap to finish:

${paymentLink}

You'll be up and running in seconds!`;
  }

  return `Excellent! You're going Pro 🚀

${paymentLink}

You'll have full access including automated snipers!`;
}
