// Message processor - handles incoming messages and generates AI responses

import { createLogger, containsProFeature, hasActiveSubscription } from '@oneclaw/core';
import { MESSAGES, SKILLS, ONBOARDING_STATE } from '@oneclaw/core';
import type { IncomingMessage, User, ConversationContext } from '@oneclaw/core';
import type { SkillId, OnboardingState } from '@oneclaw/core';
import { 
  getOrCreateUser, 
  updateUserName, 
  logUsage,
  updateOnboardingState,
  updateSelectedSkills,
  hasRequiredIntegrations,
} from '@oneclaw/database';
import { createBlueBubblesClient } from '@oneclaw/bluebubbles';
import { 
  SkillRegistry, 
  buildSystemPrompt, 
  getProUpsellMessage,
} from '@oneclaw/skills';
import { generateAIResponse } from './ai';
import { generateOAuthLink } from '../routes/oauth';

const log = createLogger('MessageProcessor');

/**
 * Process an incoming message
 */
export async function processMessage(message: IncomingMessage): Promise<void> {
  const { sender, text, chatGuid } = message;

  log.info('Processing message', { sender: sender.substring(0, 6) + '***' });

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

    // Send response via BlueBubbles
    await sendResponse(chatGuid, response);

    // Log usage
    await logUsage(sender, 'message');
  } catch (error) {
    log.error('Error processing message', error);

    // Send error message to user
    try {
      const bb = createBlueBubblesClient();
      await bb.sendMessage(
        chatGuid,
        "Sorry, I ran into an issue. Can you try that again?"
      );
    } catch (sendError) {
      log.error('Error sending error message', sendError);
    }
  }
}

/**
 * Handle onboarding and special conversation flows
 */
async function handleSpecialFlows(user: User, text: string): Promise<string | null> {
  // Safe access - columns might not exist yet
  const state = (user as any).onboarding_state || ONBOARDING_STATE.NEW;

  // ============================================
  // NEW USER - Send welcome with skill options
  // ============================================
  if (state === ONBOARDING_STATE.NEW) {
    // Try to update state, but don't fail if column doesn't exist
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
    const selectedSkills = parseSkillSelection(text);
    
    if (selectedSkills.length === 0) {
      // Didn't understand, prompt again
      return `I didn't catch that. Reply with numbers to select:

1️⃣ Email
2️⃣ Calendar
3️⃣ Food
4️⃣ Golf

For example: "1 2" or "1, 3, 4"`;
    }

    // Try to save selected skills
    try {
      await updateSelectedSkills(user.phone_number, selectedSkills);
    } catch (e) {
      log.warn('Could not save selected skills (column may not exist yet)');
    }

    // Build confirmation message
    const skillNames = selectedSkills.map(id => {
      const skill = SKILLS[id];
      return `${skill.emoji} ${skill.name}`;
    });
    
    // Check if any skills need OAuth
    const needsOAuth = selectedSkills.some(id => SKILLS[id].oauthRequired);
    
    if (needsOAuth) {
      // Generate OAuth link
      const baseUrl = process.env.API_BASE_URL || 'http://localhost:3000';
      const oauthLink = generateOAuthLink(user.id, baseUrl);
      
      // Try to update state
      try {
        await updateOnboardingState(user.phone_number, ONBOARDING_STATE.AWAITING_OAUTH);
      } catch (e) {
        log.warn('Could not update onboarding state (column may not exist yet)');
      }
      
      return `${MESSAGES.SKILL_SELECTION_CONFIRM(skillNames)}

${MESSAGES.OAUTH_PROMPT(oauthLink)}`;
    } else {
      // No OAuth needed, they're ready!
      try {
        await updateOnboardingState(user.phone_number, ONBOARDING_STATE.READY);
      } catch (e) {
        log.warn('Could not update onboarding state (column may not exist yet)');
      }
      
      return `${MESSAGES.SKILL_SELECTION_CONFIRM(skillNames)}

You're all set! What would you like to do?`;
    }
  }

  // ============================================
  // AWAITING OAUTH - Check if they've authenticated
  // ============================================
  if (state === ONBOARDING_STATE.AWAITING_OAUTH) {
    // Check if they've completed OAuth
    try {
      const { complete } = await hasRequiredIntegrations(user.id, (user as any).selected_skills || []);
      
      if (complete) {
        // They're done!
        try {
          await updateOnboardingState(user.phone_number, ONBOARDING_STATE.READY);
        } catch (e) {
          log.warn('Could not update onboarding state');
        }
        return MESSAGES.OAUTH_SUCCESS(['Gmail', 'Calendar']);
      }
    } catch (e) {
      log.warn('Could not check integrations (table may not exist yet)');
    }
    
    // Still waiting or error checking
    const baseUrl = process.env.API_BASE_URL || 'http://localhost:3000';
    const oauthLink = generateOAuthLink(user.id, baseUrl);
    
    return `Looks like you haven't connected your account yet.

Tap to sign in with Google:
${oauthLink}

Come back here when you're done!`;
  }

  // ============================================
  // READY - Normal operation, check for Pro upsell
  // ============================================
  if (state === ONBOARDING_STATE.READY) {
    // Check for Pro-only features for non-Pro users
    if (user.tier !== 'pro') {
      const proFeature = containsProFeature(text);
      if (proFeature) {
        return getProUpsellMessage(
          proFeature,
          process.env.STRIPE_PRO_LINK || ''
        );
      }
    }
  }

  // No special handling needed - pass to AI
  return null;
}

/**
 * Parse skill selection from user input
 * Accepts: "1", "1 2", "1, 2, 3", "email calendar", "all", etc.
 */
function parseSkillSelection(text: string): SkillId[] {
  const normalized = text.toLowerCase().trim();
  const selected: SkillId[] = [];

  // Check for "all"
  if (normalized === 'all' || normalized.includes('all')) {
    return ['email', 'calendar', 'food', 'golf'];
  }

  // Check for numbers: 1, 2, 3, 4
  const numberMap: Record<string, SkillId> = {
    '1': 'email',
    '2': 'calendar',
    '3': 'food',
    '4': 'golf',
  };

  for (const [num, skill] of Object.entries(numberMap)) {
    if (normalized.includes(num)) {
      selected.push(skill);
    }
  }

  // If no numbers found, check for skill names
  if (selected.length === 0) {
    const nameMap: Record<string, SkillId> = {
      'email': 'email',
      'mail': 'email',
      'gmail': 'email',
      'calendar': 'calendar',
      'schedule': 'calendar',
      'food': 'food',
      'delivery': 'food',
      'order': 'food',
      'restaurant': 'food',
      'golf': 'golf',
      'tee': 'golf',
    };

    for (const [keyword, skill] of Object.entries(nameMap)) {
      if (normalized.includes(keyword) && !selected.includes(skill)) {
        selected.push(skill);
      }
    }
  }

  return selected;
}

/**
 * Generate AI response for normal messages
 */
async function generateResponse(
  user: User,
  text: string,
  message: IncomingMessage
): Promise<string> {
  // Find matching skill
  const matchedSkill = SkillRegistry.findMatching(text);
  
  // Check if user can access the skill
  if (matchedSkill && user.tier !== 'none') {
    const canAccess = SkillRegistry.getForTier(user.tier).includes(matchedSkill);
    
    if (!canAccess) {
      return getProUpsellMessage(
        matchedSkill.name,
        process.env.STRIPE_PRO_LINK || ''
      );
    }
  }

  // Build context
  const context: ConversationContext = {
    user,
    messages: [], // TODO: Load conversation history
    currentMessage: text,
    sender: message.sender,
  };

  // Get skill prompts
  const skillPrompts = SkillRegistry.getForTier(user.tier).map((s) => s.systemPrompt);

  // Build system prompt
  const systemPrompt = buildSystemPrompt(user, skillPrompts);

  // Generate AI response
  return generateAIResponse(systemPrompt, context);
}

/**
 * Send response via BlueBubbles
 */
async function sendResponse(chatGuid: string, message: string): Promise<void> {
  const bb = createBlueBubblesClient();
  
  log.info('Sending response', { chatGuid, messageLength: message.length });
  
  await bb.sendMessage(chatGuid, message);
}
