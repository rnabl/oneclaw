// Sendblue message processor - handles incoming messages and generates AI responses

import { createLogger, containsProFeature } from '@oneclaw/core';
import { MESSAGES, SKILLS, ONBOARDING_STATE } from '@oneclaw/core';
import type { User, ConversationContext } from '@oneclaw/core';
import type { SkillId } from '@oneclaw/core';
import type { ParsedMessage } from '@oneclaw/sendblue';
import {
  getOrCreateUser,
  logUsage,
  updateOnboardingState,
  updateSelectedSkills,
  hasRequiredIntegrations,
} from '@oneclaw/database';
import { createSendblueClient } from '@oneclaw/sendblue';
import {
  SkillRegistry,
  buildSystemPrompt,
  getProUpsellMessage,
} from '@oneclaw/skills';
import { generateAIResponse } from './ai';
import { generateOAuthLink } from '../routes/oauth';

const log = createLogger('MessageProcessor:Sendblue');

/**
 * Process an incoming Sendblue message
 */
export async function processMessageSendblue(message: ParsedMessage): Promise<void> {
  const { sender, text } = message;

  log.info('Processing message', { sender: sender.substring(0, 6) + '****' });

  try {
    // Get or create user
    const user = await getOrCreateUser(sender);
    log.debug('User context', { tier: user.tier, name: user.name });

    // Build response based on user state
    let response: string;

    // Check for special flows first
    const specialResponse = await handleSpecialFlows(user, text);

    if (specialResponse) {
      response = specialResponse;
    } else {
      // Generate AI response
      response = await generateResponse(user, text, message);
    }

    // Send response via Sendblue
    await sendResponse(sender, response);

    // Log usage
    await logUsage(sender, 'message');
  } catch (error) {
    log.error('Error processing message', error);

    // Send error message to user
    try {
      const client = createSendblueClient();
      await client.sendMessage(
        sender,
        "Sorry, I ran into an issue. Can you try that again?"
      );
    } catch (sendError) {
      log.error('Error sending error message', sendError);
    }
  }
}

/**
 * Handle onboarding and special conversation flows
 * 
 * Flow:
 * 1. NEW → Welcome + skill selection
 * 2. SELECTING_SKILLS → Parse selection → Plan options
 * 3. SELECTING_PLAN → Show payment link
 * 4. AWAITING_PAYMENT → Wait for Stripe webhook
 * 5. SETTING_UP_SKILLS → OAuth one by one
 * 6. READY → Route to OpenClaw
 */
async function handleSpecialFlows(user: User, text: string): Promise<string | null> {
  const state = (user as any).onboarding_state || ONBOARDING_STATE.NEW;
  const lowerText = text.toLowerCase().trim();

  // ============================================
  // NEW USER - Send welcome with skill options
  // ============================================
  if (state === ONBOARDING_STATE.NEW) {
    try {
      await updateOnboardingState(user.phone_number, ONBOARDING_STATE.SELECTING_SKILLS);
    } catch (e) {
      log.warn('Could not update onboarding state (column may not exist yet)');
    }
    return MESSAGES.WELCOME;
  }

  // ============================================
  // SELECTING SKILLS - Parse their selection
  // ============================================
  if (state === ONBOARDING_STATE.SELECTING_SKILLS) {
    // Check if it's a greeting - resend welcome
    const greetings = ['hey', 'hi', 'hello', 'yo', 'sup', 'start', 'help'];
    if (greetings.includes(lowerText)) {
      return MESSAGES.WELCOME;
    }

    const selectedSkills = parseSkillSelectionNew(text);

    if (selectedSkills.length === 0) {
      return `I didn't catch that. Reply with a number:

1️⃣ Email & Calendar
2️⃣ Research & Web browsing
3️⃣ Food & Reservations
4️⃣ All of the above`;
    }

    try {
      await updateSelectedSkills(user.phone_number, selectedSkills);
      await updateOnboardingState(user.phone_number, ONBOARDING_STATE.SELECTING_PLAN);
    } catch (e) {
      log.warn('Could not save skills/state');
    }

    return MESSAGES.PLAN_OPTIONS;
  }

  // ============================================
  // SELECTING PLAN - Starter or Pro
  // ============================================
  if (state === ONBOARDING_STATE.SELECTING_PLAN) {
    // Append phone number to payment link so Stripe webhook can identify user
    const encodedPhone = encodeURIComponent(user.phone_number);

    if (lowerText === 'starter' || lowerText === '1') {
      const baseLink = process.env.STRIPE_STARTER_LINK || '';
      const link = `${baseLink}?client_reference_id=${encodedPhone}`;
      try {
        await updateOnboardingState(user.phone_number, ONBOARDING_STATE.AWAITING_PAYMENT);
      } catch (e) {
        log.warn('Could not update state');
      }
      return MESSAGES.PAYMENT_LINK('Starter', link);
    }

    if (lowerText === 'pro' || lowerText === '2') {
      const baseLink = process.env.STRIPE_PRO_LINK || '';
      const link = `${baseLink}?client_reference_id=${encodedPhone}`;
      try {
        await updateOnboardingState(user.phone_number, ONBOARDING_STATE.AWAITING_PAYMENT);
      } catch (e) {
        log.warn('Could not update state');
      }
      return MESSAGES.PAYMENT_LINK('Pro', link);
    }

    return `Reply 'Starter' or 'Pro' to choose your plan:

Starter - $19/mo
Pro - $49/mo`;
  }

  // ============================================
  // AWAITING PAYMENT - Remind them to pay
  // ============================================
  if (state === ONBOARDING_STATE.AWAITING_PAYMENT) {
    const starterLink = process.env.STRIPE_STARTER_LINK || '';
    const proLink = process.env.STRIPE_PRO_LINK || '';

    return `Waiting for payment to complete.

Starter ($19/mo): ${starterLink}
Pro ($49/mo): ${proLink}

Text me after you've paid!`;
  }

  // ============================================
  // SETTING UP SKILLS - OAuth one by one
  // ============================================
  if (state === ONBOARDING_STATE.SETTING_UP_SKILLS) {
    const selectedSkills = (user as any).selected_skills || [];
    const baseUrl = process.env.API_BASE_URL || 'https://iclaw-novw8.ondigitalocean.app';

    // Check what's already connected
    try {
      const { complete, missing } = await hasRequiredIntegrations(user.id, selectedSkills);

      if (complete) {
        await updateOnboardingState(user.phone_number, ONBOARDING_STATE.READY);
        return MESSAGES.SETUP_COMPLETE;
      }

      // Prompt for next missing integration
      if (missing.includes('gmail')) {
        const link = generateOAuthLink(user.id, baseUrl);
        return MESSAGES.SETUP_GMAIL(link);
      }

      if (missing.includes('calendar')) {
        const link = generateOAuthLink(user.id, baseUrl);
        return MESSAGES.SETUP_CALENDAR(link);
      }
    } catch (e) {
      log.warn('Could not check integrations');
    }

    // If no OAuth needed, mark ready
    try {
      await updateOnboardingState(user.phone_number, ONBOARDING_STATE.READY);
    } catch (e) {
      log.warn('Could not update state');
    }
    return MESSAGES.SETUP_COMPLETE;
  }

  // ============================================
  // AWAITING OAUTH - Check if they've connected
  // ============================================
  if (state === ONBOARDING_STATE.AWAITING_OAUTH) {
    const selectedSkills = (user as any).selected_skills || [];

    try {
      const { complete } = await hasRequiredIntegrations(user.id, selectedSkills);

      if (complete) {
        await updateOnboardingState(user.phone_number, ONBOARDING_STATE.READY);
        return MESSAGES.SETUP_COMPLETE;
      }
    } catch (e) {
      log.warn('Could not check integrations');
    }

    const baseUrl = process.env.API_BASE_URL || 'https://iclaw-novw8.ondigitalocean.app';
    const oauthLink = generateOAuthLink(user.id, baseUrl);

    return `Tap to connect your account:
${oauthLink}

Text me when you're done!`;
  }

  // ============================================
  // READY - Normal operation, check for Pro upsell
  // ============================================
  if (state === ONBOARDING_STATE.READY) {
    if (user.tier !== 'pro') {
      const proFeature = containsProFeature(text);
      if (proFeature) {
        return getProUpsellMessage(proFeature, process.env.STRIPE_PRO_LINK || '');
      }
    }
    // Fall through to normal processing
    return null;
  }

  return null;
}

/**
 * Parse skill selection from new flow (1-4 options)
 */
function parseSkillSelectionNew(text: string): SkillId[] {
  const normalized = text.toLowerCase().trim();

  // Option 4 = all
  if (normalized === '4' || normalized === 'all' || normalized.includes('all')) {
    return ['email', 'calendar', 'food', 'golf'];
  }

  // Option 1 = Email & Calendar
  if (normalized === '1') {
    return ['email', 'calendar'];
  }

  // Option 2 = Research (no specific skills, just web)
  if (normalized === '2') {
    return []; // Web browsing is built-in, no OAuth needed
  }

  // Option 3 = Food & Reservations
  if (normalized === '3') {
    return ['food'];
  }

  // Try parsing multiple numbers
  const selected: SkillId[] = [];
  if (normalized.includes('1')) selected.push('email', 'calendar');
  if (normalized.includes('3')) selected.push('food');
  if (normalized.includes('4')) return ['email', 'calendar', 'food', 'golf'];

  return selected;
}

/**
 * Generate AI response for normal messages
 */
async function generateResponse(
  user: User,
  text: string,
  message: ParsedMessage
): Promise<string> {
  // Direct Anthropic integration
  const matchedSkill = SkillRegistry.findMatching(text);

  if (matchedSkill && user.tier !== 'none') {
    const canAccess = SkillRegistry.getForTier(user.tier).includes(matchedSkill);

    if (!canAccess) {
      return getProUpsellMessage(matchedSkill.name, process.env.STRIPE_PRO_LINK || '');
    }
  }

  const context: ConversationContext = {
    user,
    messages: [],
    currentMessage: text,
    sender: message.sender,
  };

  const skillPrompts = SkillRegistry.getForTier(user.tier).map((s) => s.systemPrompt);
  const systemPrompt = buildSystemPrompt(user, skillPrompts);

  return generateAIResponse(systemPrompt, context);
}

/**
 * Send response via Sendblue
 */
async function sendResponse(phoneNumber: string, message: string): Promise<void> {
  const client = createSendblueClient();

  log.info('Sending response', {
    to: phoneNumber.substring(0, 6) + '****',
    messageLength: message.length,
  });

  await client.sendMessage(phoneNumber, message);
}
