// Onboarding skill - handles new user flow and plan selection

import { skill } from '../base';
import { registerSkill } from '../registry';
import { getWelcomeMessage, getPlanSelectionMessage, getAskNameMessage } from '../prompts';
import type { Skill, ConversationContext, SkillResponse } from '@oneclaw/core';

/**
 * Onboarding skill for new users
 */
export const OnboardingSkill: Skill = registerSkill(
  skill()
    .id('onboarding')
    .name('Onboarding')
    .description('Handles new user onboarding and plan selection')
    .requiredTier('none')
    .triggers(['starter', 'pro', 'subscribe', 'sign up', 'get started'])
    .systemPrompt(`
## Onboarding Flow

When handling new users:
1. If this is their first message ever, send the welcome message
2. If they say "Starter" or "Pro", send the appropriate payment link
3. After payment is confirmed (tier changes), ask for their name
4. After they give their name, welcome them and ask what they'd like to do

### Plan Selection
- "Starter" → Send Starter payment link ($19/mo)
- "Pro" → Send Pro payment link ($49/mo)

### Payment Links
Use these environment variables:
- STRIPE_STARTER_LINK for Starter
- STRIPE_PRO_LINK for Pro
`)
    .handler(async (context: ConversationContext): Promise<SkillResponse> => {
      const message = context.currentMessage.toLowerCase().trim();

      // Check for plan selection
      if (message === 'starter' || message.includes('starter plan')) {
        const link = process.env.STRIPE_STARTER_LINK || '';
        return {
          message: getPlanSelectionMessage('starter', link),
        };
      }

      if (message === 'pro' || message.includes('pro plan')) {
        const link = process.env.STRIPE_PRO_LINK || '';
        return {
          message: getPlanSelectionMessage('pro', link),
        };
      }

      // New user - send welcome
      const userTier: string | undefined = context.user?.tier;
      if (!context.user || userTier === 'none') {
        return {
          message: getWelcomeMessage(),
        };
      }

      // User just subscribed, ask for name
      if (context.user && userTier !== 'none' && !context.user.name) {
        return {
          message: getAskNameMessage(),
        };
      }

      // Fallback
      return {
        message: getWelcomeMessage(),
      };
    })
    .build()
);

/**
 * Check if message is a plan selection
 */
export function isPlanSelection(message: string): 'starter' | 'pro' | null {
  const lower = message.toLowerCase().trim();

  if (lower === 'starter' || lower.includes('starter plan')) {
    return 'starter';
  }

  if (lower === 'pro' || lower.includes('pro plan')) {
    return 'pro';
  }

  return null;
}

/**
 * Check if message looks like a name
 */
export function isNameResponse(message: string): boolean {
  // Simple heuristic: 1-3 words, no special commands
  const words = message.trim().split(/\s+/);
  if (words.length > 3) return false;

  // Check it's not a command
  const commands = ['book', 'order', 'check', 'read', 'help', 'cancel', 'starter', 'pro'];
  const lower = message.toLowerCase();

  return !commands.some((cmd) => lower.includes(cmd));
}
