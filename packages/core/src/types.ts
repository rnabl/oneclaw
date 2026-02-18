// Core types for iClaw

import type { OnboardingState, SkillId } from './constants';

/**
 * User subscription tiers
 */
export type UserTier = 'none' | 'starter' | 'pro';

/**
 * User record from database
 */
export interface User {
  id: string;
  phone_number: string;
  name: string | null;
  tier: UserTier;
  stripe_customer_id: string | null;
  onboarding_state: OnboardingState;
  selected_skills: SkillId[];
  created_at: string;
  updated_at: string;
}

/**
 * Integration/OAuth token record
 */
export interface Integration {
  id: string;
  user_id: string;
  provider: 'google' | 'apple' | 'microsoft';
  access_token: string;
  refresh_token: string | null;
  token_expires_at: string | null;
  scopes: string[];
  created_at: string;
  updated_at: string;
}

/**
 * Usage action types for billing
 */
export type ActionType =
  | 'message'
  | 'golf_booking'
  | 'food_order'
  | 'restaurant_reservation'
  | 'email_read'
  | 'calendar_event'
  | 'sniper_created'
  | 'sniper_alert'
  | 'browser_action';

/**
 * Usage record for tracking actions
 */
export interface Usage {
  id: string;
  phone_number: string;
  action: ActionType;
  metadata: Record<string, unknown>;
  billing_period: string;
  created_at: string;
}

/**
 * Incoming message from BlueBubbles
 */
export interface IncomingMessage {
  id: string;
  guid: string;
  text: string;
  sender: string; // phone number or email
  timestamp: number;
  isFromMe: boolean;
  chatGuid: string;
  attachments?: Attachment[];
}

/**
 * Outgoing message to BlueBubbles
 */
export interface OutgoingMessage {
  chatGuid: string;
  text: string;
  tempGuid?: string;
}

/**
 * Message attachment
 */
export interface Attachment {
  guid: string;
  filename: string;
  mimeType: string;
  data?: string; // base64 encoded
}

/**
 * Conversation context for AI
 */
export interface ConversationContext {
  user: User | null;
  messages: ConversationMessage[];
  currentMessage: string;
  sender: string;
}

/**
 * Message in conversation history
 */
export interface ConversationMessage {
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
}

/**
 * Skill definition
 */
export interface Skill {
  id: string;
  name: string;
  description: string;
  requiredTier: UserTier;
  systemPrompt: string;
  triggers?: string[]; // keywords that activate this skill
  handler?: SkillHandler;
}

/**
 * Skill handler function
 */
export type SkillHandler = (
  context: ConversationContext,
  params: Record<string, unknown>
) => Promise<SkillResponse>;

/**
 * Skill response
 */
export interface SkillResponse {
  message: string;
  action?: SkillAction;
}

/**
 * Skill action to perform
 */
export interface SkillAction {
  type: 'browser' | 'api' | 'schedule';
  payload: Record<string, unknown>;
}

/**
 * BlueBubbles webhook payload
 */
export interface BlueBubblesWebhook {
  type: string;
  data: IncomingMessage;
}

/**
 * API response envelope
 */
export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
}

/**
 * Stripe webhook event types we handle
 */
export type StripeEventType =
  | 'customer.subscription.created'
  | 'customer.subscription.updated'
  | 'customer.subscription.deleted'
  | 'checkout.session.completed'
  | 'invoice.payment_failed';

/**
 * Config for iClaw instance
 */
export interface IClawConfig {
  supabase: {
    url: string;
    anonKey: string;
    serviceRoleKey?: string;
  };
  stripe: {
    secretKey: string;
    webhookSecret: string;
    starterPriceId: string;
    proPriceId: string;
    starterLink: string;
    proLink: string;
  };
  bluebubbles: {
    serverUrl: string;
    password: string;
  };
  anthropic: {
    apiKey: string;
    model?: string;
  };
}
