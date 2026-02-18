/**
 * Identity Resolution
 * 
 * Resolves external provider identities to internal users.
 * Creates new users when needed.
 */

import type { User } from '../schemas/user';
import type { Provider } from '../schemas/identity';
import { normalizeProviderId } from '../schemas/identity';
import { getStores } from '../stores';

export interface ResolveOptions {
  /** Provider name (e.g., 'name') to store on identity */
  providerName?: string;
  /** Provider email to store on identity */
  providerEmail?: string;
  /** Provider avatar URL to store on identity */
  providerAvatar?: string;
  /** Extra metadata to store */
  metadata?: Record<string, unknown>;
}

/**
 * Resolve a provider identity to an internal user.
 * Creates user + identity + wallet if new.
 * 
 * @param provider - The provider type (discord, telegram, phone, etc.)
 * @param providerId - The external ID from the provider
 * @param options - Optional metadata to store
 * @returns The internal user
 */
export async function resolveUser(
  provider: Provider,
  providerId: string,
  options?: ResolveOptions
): Promise<User> {
  const stores = getStores();
  const normalizedId = normalizeProviderId(provider, providerId);

  // 1. Look for existing identity
  const identity = await stores.identity.findByProvider(provider, normalizedId);

  if (identity) {
    // Known user - return their user record
    console.log(`[identity] Found existing user for ${provider}:${normalizedId}`);
    return await stores.user.getById(identity.userId);
  }

  // 2. New user - create everything
  console.log(`[identity] Creating new user for ${provider}:${normalizedId}`);

  // Create user
  const user = await stores.user.create({
    name: options?.providerName ?? null,
    email: options?.providerEmail ?? null,
    avatarUrl: options?.providerAvatar ?? null,
  });

  // Create identity link
  await stores.identity.create({
    userId: user.id,
    provider,
    providerId: normalizedId,
    providerName: options?.providerName ?? null,
    providerEmail: options?.providerEmail ?? null,
    providerAvatar: options?.providerAvatar ?? null,
    metadata: options?.metadata,
  });

  // Create wallet
  await stores.wallet.create(user.id);

  console.log(`[identity] Created new user ${user.id} for ${provider}:${normalizedId}`);
  return user;
}

/**
 * Link an additional provider to an existing user.
 * 
 * @throws if provider+providerId is already linked to another user
 */
export async function linkProvider(
  userId: string,
  provider: Provider,
  providerId: string,
  options?: ResolveOptions
): Promise<void> {
  const stores = getStores();
  const normalizedId = normalizeProviderId(provider, providerId);

  // Check if already linked to another user
  const existing = await stores.identity.findByProvider(provider, normalizedId);

  if (existing) {
    if (existing.userId === userId) {
      // Already linked to this user, no-op
      console.log(`[identity] ${provider}:${normalizedId} already linked to ${userId}`);
      return;
    }
    throw new Error(
      `${provider} account ${normalizedId} is already linked to another user`
    );
  }

  // Create new identity link
  await stores.identity.create({
    userId,
    provider,
    providerId: normalizedId,
    providerName: options?.providerName ?? null,
    providerEmail: options?.providerEmail ?? null,
    providerAvatar: options?.providerAvatar ?? null,
    metadata: options?.metadata,
  });

  console.log(`[identity] Linked ${provider}:${normalizedId} to user ${userId}`);
}

/**
 * Get all linked providers for a user.
 */
export async function getLinkedProviders(userId: string): Promise<{ provider: Provider; providerId: string }[]> {
  const stores = getStores();
  const identities = await stores.identity.getByUserId(userId);
  return identities.map(i => ({ provider: i.provider, providerId: i.providerId }));
}
