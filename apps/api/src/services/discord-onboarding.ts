/**
 * Discord Onboarding Flow
 * 
 * Handles the complete user onboarding:
 * 1. Welcome → Model selection
 * 2. API key input (if BYOK)
 * 3. Plan selection → Stripe payment
 * 4. Agent deployment
 * 5. Tool/provider setup
 */

// Onboarding state stored per user (in-memory for now, should be Redis/DB in production)
interface OnboardingState {
  step: 'welcome' | 'model_select' | 'api_key_input' | 'plan_select' | 'payment_pending' | 'deploying' | 'tool_setup' | 'ready';
  selectedModel?: 'oneclaw' | 'claude' | 'openai';
  apiKey?: string;
  selectedPlan?: 'starter' | 'pro';
  discordUserId: string;
  discordGuildId?: string;
  channelId: string;
  createdAt: Date;
}

// In-memory store (replace with Redis/Supabase in production)
const onboardingStates = new Map<string, OnboardingState>();

export function getOnboardingState(userId: string): OnboardingState | undefined {
  return onboardingStates.get(userId);
}

export function setOnboardingState(userId: string, state: OnboardingState): void {
  onboardingStates.set(userId, state);
}

export function clearOnboardingState(userId: string): void {
  onboardingStates.delete(userId);
}

// ============================================
// MESSAGE TEMPLATES
// ============================================

export const ONBOARDING_MESSAGES = {
  welcome: {
    embeds: [{
      title: '🦞 Welcome to OneClaw',
      description: `**Your AI agent is ready to deploy.**

OneClaw gives you a personal AI assistant that can:
• 🔍 Find leads and research businesses
• 📊 Audit websites for SEO & AI visibility  
• 📧 Manage email and calendar
• 🏌️ Book reservations and more

Let's get you set up in 60 seconds.`,
      color: 0x5865F2,
      footer: { text: 'Powered by OpenClaw • oneclaw.chat' }
    }],
    components: [{
      type: 1, // Action Row
      components: [{
        type: 2, // Button
        style: 1, // Primary
        label: '🚀 Deploy My Agent',
        custom_id: 'onboard_start'
      }]
    }]
  },

  modelSelect: {
    embeds: [{
      title: '⚡ Choose Your AI Model',
      description: `Which AI model should power your agent?

**OneClaw Shared** (Recommended)
Use our API keys - no setup needed. Included in your plan.

**Claude (BYOK)**
Bring your own Anthropic API key for Claude.

**OpenAI (BYOK)**  
Bring your own OpenAI API key for GPT-4.`,
      color: 0x5865F2,
    }],
    components: [{
      type: 1,
      components: [{
        type: 3, // Select Menu
        custom_id: 'model_select',
        placeholder: 'Select AI model...',
        options: [
          { 
            label: 'OneClaw Shared (Recommended)', 
            value: 'oneclaw', 
            description: 'No setup needed, included in plan',
            emoji: { name: '✨' }
          },
          { 
            label: 'Claude (Your Key)', 
            value: 'claude', 
            description: 'Use your Anthropic API key',
            emoji: { name: '🔑' }
          },
          { 
            label: 'OpenAI (Your Key)', 
            value: 'openai', 
            description: 'Use your OpenAI API key',
            emoji: { name: '🔑' }
          }
        ]
      }]
    }]
  },

  apiKeyInput: (provider: string) => ({
    title: `🔑 Enter Your ${provider} API Key`,
    custom_id: 'api_key_modal',
    components: [{
      type: 1,
      components: [{
        type: 4, // Text Input
        custom_id: 'api_key',
        label: `${provider} API Key`,
        style: 1, // Short
        placeholder: provider === 'claude' ? 'sk-ant-...' : 'sk-...',
        required: true,
        min_length: 20,
        max_length: 200
      }]
    }]
  }),

  planSelect: (model: string) => ({
    embeds: [{
      title: '💳 Choose Your Plan',
      description: `**Model:** ${model === 'oneclaw' ? 'OneClaw Shared' : model === 'claude' ? 'Claude (Your Key)' : 'OpenAI (Your Key)'}

**Pay As You Go** 💰
• No monthly fee - pay only for what you use
• Top up: $5, $10, or $25
• Discover: $1 | Audit: $20

**Starter - $19/mo** ⭐
• 20% off all workflows
• Website audits & lead discovery
• Great for regular users

**Pro - $49/mo** 🚀
• 50% off all workflows
• Priority support
• Best for power users`,
      color: 0x5865F2,
    }],
    components: [{
      type: 1,
      components: [
        {
          type: 2,
          style: 2, // Secondary
          label: '💰 Pay As You Go',
          custom_id: 'plan_payg'
        },
        {
          type: 2,
          style: 1, // Primary
          label: '⭐ Starter - $19/mo',
          custom_id: 'plan_starter'
        },
        {
          type: 2,
          style: 3, // Success/Green
          label: '🚀 Pro - $49/mo',
          custom_id: 'plan_pro'
        }
      ]
    }]
  }),

  paymentLink: (plan: string, link: string) => ({
    embeds: [{
      title: '💳 Complete Payment',
      description: `**Plan:** ${plan}

Click below to complete your payment securely via Stripe.

After payment, your agent will be deployed automatically.`,
      color: 0x00FF00,
    }],
    components: [{
      type: 1,
      components: [{
        type: 2,
        style: 5, // Link
        label: '💳 Pay Now',
        url: link
      }]
    }]
  }),

  deploying: {
    embeds: [{
      title: '🚀 Deploying Your Agent...',
      description: `Payment received! Setting up your personal AI agent.

⏳ Creating secure instance...
⏳ Configuring AI model...
⏳ Setting up connections...

This usually takes about 30 seconds.`,
      color: 0xFFFF00,
    }]
  },

  deployComplete: {
    embeds: [{
      title: '✅ Your Agent is Live!',
      description: `**Your OneClaw agent is ready to work.**

Try saying:
• "Find 100 HVAC companies in Denver"
• "Audit example.com"
• "What can you do?"

What would you like me to do today?`,
      color: 0x00FF00,
      footer: { text: 'Your agent runs 24/7 • oneclaw.chat' }
    }]
  },

  toolSetup: (workflow: string) => ({
    embeds: [{
      title: '🔧 Data Provider Setup',
      description: `To run **${workflow}**, I need access to data providers.

**Use OneClaw's providers** (Recommended)
No setup needed - included in your plan.

**Bring Your Own Keys**
Use your own Apify, DataForSEO, or Perplexity keys.`,
      color: 0x5865F2,
    }],
    components: [{
      type: 1,
      components: [
        {
          type: 2,
          style: 1,
          label: '✨ Use OneClaw Providers',
          custom_id: 'provider_oneclaw'
        },
        {
          type: 2,
          style: 2, // Secondary
          label: '🔑 Use My Keys',
          custom_id: 'provider_byok'
        }
      ]
    }]
  }),

  providerKeyInput: {
    title: '🔑 Enter Provider Keys',
    custom_id: 'provider_keys_modal',
    components: [
      {
        type: 1,
        components: [{
          type: 4,
          custom_id: 'apify_key',
          label: 'Apify API Key (optional)',
          style: 1,
          placeholder: 'apify_api_...',
          required: false
        }]
      },
      {
        type: 1,
        components: [{
          type: 4,
          custom_id: 'dataforseo_login',
          label: 'DataForSEO Login (optional)',
          style: 1,
          placeholder: 'your@email.com',
          required: false
        }]
      },
      {
        type: 1,
        components: [{
          type: 4,
          custom_id: 'dataforseo_password',
          label: 'DataForSEO Password (optional)',
          style: 1,
          placeholder: 'password',
          required: false
        }]
      },
      {
        type: 1,
        components: [{
          type: 4,
          custom_id: 'perplexity_key',
          label: 'Perplexity API Key (optional)',
          style: 1,
          placeholder: 'pplx-...',
          required: false
        }]
      }
    ]
  }
};

// ============================================
// ONBOARDING HANDLERS
// ============================================

/**
 * Handle "setup" or "hey" message - start onboarding
 */
export function handleSetupMessage(userId: string, channelId: string, guildId?: string): object {
  // Initialize onboarding state
  setOnboardingState(userId, {
    step: 'welcome',
    discordUserId: userId,
    discordGuildId: guildId,
    channelId,
    createdAt: new Date()
  });

  return ONBOARDING_MESSAGES.welcome;
}

/**
 * Handle "Deploy My Agent" button click
 */
export function handleOnboardStart(userId: string): object {
  const state = getOnboardingState(userId);
  if (state) {
    state.step = 'model_select';
    setOnboardingState(userId, state);
  }
  
  return ONBOARDING_MESSAGES.modelSelect;
}

/**
 * Handle model selection
 */
export function handleModelSelect(userId: string, model: 'oneclaw' | 'claude' | 'openai'): object | { modal: object } {
  const state = getOnboardingState(userId);
  if (state) {
    state.selectedModel = model;
    state.step = model === 'oneclaw' ? 'plan_select' : 'api_key_input';
    setOnboardingState(userId, state);
  }

  // If BYOK, show modal for API key
  if (model === 'claude' || model === 'openai') {
    return { 
      modal: ONBOARDING_MESSAGES.apiKeyInput(model === 'claude' ? 'Anthropic' : 'OpenAI')
    };
  }

  // If OneClaw shared, go straight to plan selection
  return ONBOARDING_MESSAGES.planSelect(model);
}

/**
 * Handle API key submission
 */
export function handleApiKeySubmit(userId: string, apiKey: string): object {
  const state = getOnboardingState(userId);
  if (state) {
    state.apiKey = apiKey;
    state.step = 'plan_select';
    setOnboardingState(userId, state);
  }

  return ONBOARDING_MESSAGES.planSelect(state?.selectedModel || 'oneclaw');
}

/**
 * Handle plan selection - return payment link
 */
export function handlePlanSelect(userId: string, plan: 'starter' | 'pro'): object {
  const state = getOnboardingState(userId);
  if (state) {
    state.selectedPlan = plan;
    state.step = 'payment_pending';
    setOnboardingState(userId, state);
  }

  // Get Stripe link with user ID for tracking
  const baseLink = plan === 'starter' 
    ? process.env.STRIPE_STARTER_LINK 
    : process.env.STRIPE_PRO_LINK;
  
  const link = `${baseLink}?client_reference_id=discord_${userId}`;
  const planName = plan === 'starter' ? 'Starter ($19/mo)' : 'Pro ($49/mo)';

  return ONBOARDING_MESSAGES.paymentLink(planName, link);
}

/**
 * Handle payment complete (called from Stripe webhook)
 */
export async function handlePaymentComplete(userId: string): Promise<object> {
  const state = getOnboardingState(userId);
  if (state) {
    state.step = 'deploying';
    setOnboardingState(userId, state);
  }

  return ONBOARDING_MESSAGES.deploying;
}

/**
 * Handle deployment complete
 */
export function handleDeployComplete(userId: string): object {
  const state = getOnboardingState(userId);
  if (state) {
    state.step = 'ready';
    setOnboardingState(userId, state);
  }

  return ONBOARDING_MESSAGES.deployComplete;
}

/**
 * Handle tool setup prompt (when user requests a workflow that needs providers)
 */
export function handleToolSetupPrompt(userId: string, workflow: string): object {
  const state = getOnboardingState(userId);
  if (state) {
    state.step = 'tool_setup';
    setOnboardingState(userId, state);
  }

  return ONBOARDING_MESSAGES.toolSetup(workflow);
}

/**
 * Check if message should trigger onboarding
 * Only trigger on explicit "deploy" or "setup" - not casual greetings
 * Users can always use /deploy slash command for the full flow
 */
export function shouldStartOnboarding(content: string): boolean {
  const triggers = ['deploy', 'setup my bot', 'deploy my bot'];
  return triggers.includes(content.toLowerCase().trim());
}

/**
 * Check if user needs tool setup for a workflow
 */
export function needsToolSetup(userId: string, workflow: string): boolean {
  // For now, always return false if using OneClaw shared providers
  const state = getOnboardingState(userId);
  
  // If no state or using oneclaw, no setup needed
  if (!state || state.selectedModel === 'oneclaw') {
    return false;
  }
  
  // If BYOK and no provider keys set, need setup
  // This would check against saved provider keys in production
  return true;
}
