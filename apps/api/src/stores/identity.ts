/**
 * OneClaw Identity Resolution
 * 
 * Simple identity resolution that works with existing schema.
 * Uses Discord ID directly as user ID for backwards compatibility.
 */

import { getStores, isStoresInitialized, NotFoundError } from '@oneclaw/harness';

interface User {
  id: string;
  email: string | null;
  name: string | null;
  avatarUrl: string | null;
  createdAt: Date;
  updatedAt: Date;
}

interface ResolveOptions {
  providerName?: string;
  providerEmail?: string;
  providerAvatar?: string;
}

/**
 * Resolve a Discord (or other provider) user to our internal user.
 * 
 * IMPORTANT: For backwards compatibility with existing wallets table,
 * we use the providerId directly as the user ID.
 * e.g., Discord user "397102686660591616" has user_id "397102686660591616"
 */
export async function resolveUserForOneClaw(
  provider: 'discord' | 'telegram' | 'phone',
  providerId: string,
  options?: ResolveOptions
): Promise<User> {
  // For OneClaw, user ID = provider ID (simple 1:1 mapping)
  const userId = providerId;
  
  if (!isStoresInitialized()) {
    // Return synthetic user if stores not ready
    console.warn(`[identity] Stores not initialized, returning synthetic user for ${provider}:${providerId}`);
    return {
      id: userId,
      email: options?.providerEmail ?? null,
      name: options?.providerName ?? null,
      avatarUrl: options?.providerAvatar ?? null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
  }

  const stores = getStores();

  // Check if user has a wallet (our source of truth for "user exists")
  try {
    await stores.wallet.getByUserId(userId);
    // User exists
    console.log(`[identity] Found existing user: ${userId}`);
  } catch (err) {
    if (err instanceof NotFoundError) {
      // New user - create wallet
      console.log(`[identity] Creating new user: ${userId}`);
      await stores.wallet.create(userId);
    } else {
      throw err;
    }
  }

  // Return user object
  return {
    id: userId,
    email: options?.providerEmail ?? null,
    name: options?.providerName ?? null,
    avatarUrl: options?.providerAvatar ?? null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}
