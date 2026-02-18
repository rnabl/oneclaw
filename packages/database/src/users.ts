// User database operations

import { getSupabaseClient, getSupabaseAdminClient } from './client';
import type { User, UserTier, Integration } from '@oneclaw/core';
import type { OnboardingState, SkillId } from '@oneclaw/core';
import { ONBOARDING_STATE } from '@oneclaw/core';

/**
 * Get user by phone number
 */
export async function getUserByPhone(phoneNumber: string): Promise<User | null> {
  const supabase = getSupabaseClient();

  const { data, error } = await supabase
    .from('users')
    .select('*')
    .eq('phone_number', phoneNumber)
    .single();

  if (error && error.code !== 'PGRST116') {
    console.error('[DB] Error fetching user:', error);
    throw error;
  }

  return data as User | null;
}

/**
 * Get user by ID
 */
export async function getUserById(userId: string): Promise<User | null> {
  const supabase = getSupabaseClient();

  const { data, error } = await supabase
    .from('users')
    .select('*')
    .eq('id', userId)
    .single();

  if (error && error.code !== 'PGRST116') {
    console.error('[DB] Error fetching user by ID:', error);
    throw error;
  }

  return data as User | null;
}

/**
 * Get user by Stripe customer ID
 */
export async function getUserByStripeId(stripeCustomerId: string): Promise<User | null> {
  const supabase = getSupabaseClient();

  const { data, error } = await supabase
    .from('users')
    .select('*')
    .eq('stripe_customer_id', stripeCustomerId)
    .single();

  if (error && error.code !== 'PGRST116') {
    console.error('[DB] Error fetching user by Stripe ID:', error);
    throw error;
  }

  return data as User | null;
}

/**
 * Create a new user
 */
export async function createUser(phoneNumber: string): Promise<User> {
  const supabase = getSupabaseAdminClient();

  const { data, error } = await supabase
    .from('users')
    .insert({
      phone_number: phoneNumber,
      tier: 'none',
      onboarding_state: ONBOARDING_STATE.NEW,
      selected_skills: [],
    })
    .select()
    .single();

  if (error) {
    console.error('[DB] Error creating user:', error);
    throw error;
  }

  return data as User;
}

/**
 * Update user tier
 */
export async function updateUserTier(
  phoneNumber: string,
  tier: UserTier
): Promise<User> {
  const supabase = getSupabaseAdminClient();

  const { data, error } = await supabase
    .from('users')
    .update({ tier })
    .eq('phone_number', phoneNumber)
    .select()
    .single();

  if (error) {
    console.error('[DB] Error updating user tier:', error);
    throw error;
  }

  return data as User;
}

/**
 * Update user name
 */
export async function updateUserName(
  phoneNumber: string,
  name: string
): Promise<User> {
  const supabase = getSupabaseAdminClient();

  const { data, error } = await supabase
    .from('users')
    .update({ name })
    .eq('phone_number', phoneNumber)
    .select()
    .single();

  if (error) {
    console.error('[DB] Error updating user name:', error);
    throw error;
  }

  return data as User;
}

/**
 * Link Stripe customer ID to user
 */
export async function linkStripeCustomer(
  phoneNumber: string,
  stripeCustomerId: string
): Promise<User> {
  const supabase = getSupabaseAdminClient();

  const { data, error } = await supabase
    .from('users')
    .update({ stripe_customer_id: stripeCustomerId })
    .eq('phone_number', phoneNumber)
    .select()
    .single();

  if (error) {
    console.error('[DB] Error linking Stripe customer:', error);
    throw error;
  }

  return data as User;
}

/**
 * Update user tier by Stripe customer ID
 */
export async function updateUserTierByStripeId(
  stripeCustomerId: string,
  tier: UserTier
): Promise<boolean> {
  const supabase = getSupabaseAdminClient();

  const { error } = await supabase
    .from('users')
    .update({ tier })
    .eq('stripe_customer_id', stripeCustomerId);

  if (error) {
    console.error('[DB] Error updating user tier by Stripe ID:', error);
    return false;
  }

  return true;
}

/**
 * Update user tier by phone number
 */
export async function updateUserTierByPhone(
  phoneNumber: string,
  tier: UserTier
): Promise<boolean> {
  const supabase = getSupabaseAdminClient();

  const { error } = await supabase
    .from('users')
    .update({ tier })
    .eq('phone_number', phoneNumber);

  if (error) {
    console.error('[DB] Error updating user tier by phone:', error);
    return false;
  }

  return true;
}

/**
 * Get or create user by phone number
 */
export async function getOrCreateUser(phoneNumber: string): Promise<User> {
  const existingUser = await getUserByPhone(phoneNumber);
  
  if (existingUser) {
    return existingUser;
  }

  return await createUser(phoneNumber);
}

/**
 * Update user onboarding state
 */
export async function updateOnboardingState(
  phoneNumber: string,
  state: OnboardingState
): Promise<User> {
  const supabase = getSupabaseAdminClient();

  const { data, error } = await supabase
    .from('users')
    .update({ onboarding_state: state })
    .eq('phone_number', phoneNumber)
    .select()
    .single();

  if (error) {
    console.error('[DB] Error updating onboarding state:', error);
    throw error;
  }

  return data as User;
}

/**
 * Update user selected skills
 */
export async function updateSelectedSkills(
  phoneNumber: string,
  skills: SkillId[]
): Promise<User> {
  const supabase = getSupabaseAdminClient();

  const { data, error } = await supabase
    .from('users')
    .update({ selected_skills: skills })
    .eq('phone_number', phoneNumber)
    .select()
    .single();

  if (error) {
    console.error('[DB] Error updating selected skills:', error);
    throw error;
  }

  return data as User;
}

// ============================================
// Integration / OAuth token operations
// ============================================

/**
 * Save or update an integration (OAuth tokens)
 */
export async function saveIntegration(
  userId: string,
  provider: 'google' | 'apple' | 'microsoft',
  tokens: {
    accessToken: string;
    refreshToken?: string;
    expiresAt?: Date;
    scopes: string[];
  }
): Promise<Integration> {
  const supabase = getSupabaseAdminClient();

  const { data, error } = await supabase
    .from('integrations')
    .upsert({
      user_id: userId,
      provider,
      access_token: tokens.accessToken,
      refresh_token: tokens.refreshToken || null,
      token_expires_at: tokens.expiresAt?.toISOString() || null,
      scopes: tokens.scopes,
    }, {
      onConflict: 'user_id,provider',
    })
    .select()
    .single();

  if (error) {
    console.error('[DB] Error saving integration:', error);
    throw error;
  }

  return data as Integration;
}

/**
 * Get user's integration by provider
 */
export async function getIntegration(
  userId: string,
  provider: 'google' | 'apple' | 'microsoft'
): Promise<Integration | null> {
  const supabase = getSupabaseClient();

  const { data, error } = await supabase
    .from('integrations')
    .select('*')
    .eq('user_id', userId)
    .eq('provider', provider)
    .single();

  if (error && error.code !== 'PGRST116') {
    console.error('[DB] Error fetching integration:', error);
    throw error;
  }

  return data as Integration | null;
}

/**
 * Get all integrations for a user
 */
export async function getUserIntegrations(userId: string): Promise<Integration[]> {
  const supabase = getSupabaseClient();

  const { data, error } = await supabase
    .from('integrations')
    .select('*')
    .eq('user_id', userId);

  if (error) {
    console.error('[DB] Error fetching user integrations:', error);
    throw error;
  }

  return (data || []) as Integration[];
}

/**
 * Save OpenClaw instance config for a user
 */
export async function saveOpenClawConfig(
  phoneNumber: string,
  port: number,
  token: string
): Promise<boolean> {
  const supabase = getSupabaseAdminClient();

  const { error } = await supabase
    .from('users')
    .update({
      openclaw_port: port,
      openclaw_token: token,
      openclaw_provisioned_at: new Date().toISOString(),
    })
    .eq('phone_number', phoneNumber);

  if (error) {
    console.error('[DB] Error saving OpenClaw config:', error);
    return false;
  }

  return true;
}

/**
 * Check if user has completed OAuth for required skills
 */
export async function hasRequiredIntegrations(
  userId: string,
  skills: SkillId[]
): Promise<{ complete: boolean; missing: SkillId[] }> {
  const { SKILLS } = await import('@oneclaw/core');
  const integrations = await getUserIntegrations(userId);
  
  const missing: SkillId[] = [];
  
  for (const skillId of skills) {
    const skill = SKILLS[skillId];
    if (skill.oauthRequired) {
      const hasIntegration = integrations.some(i => i.provider === skill.oauthProvider);
      if (!hasIntegration) {
        missing.push(skillId);
      }
    }
  }

  return {
    complete: missing.length === 0,
    missing,
  };
}
