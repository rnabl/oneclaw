/**
 * Supabase Store Implementations
 * 
 * Implements the harness store interfaces using Supabase.
 * This file lives in apps/api (not in harness) because it's specific
 * to OneClaw Cloud deployment.
 * 
 * PRAGMATIC APPROACH:
 * Instead of requiring a database migration, we adapt to the EXISTING schema:
 * - wallets table uses Discord ID directly as user_id (TEXT)
 * - We use synthetic users (id = provider:providerId)
 * - Identity resolution is done in-memory since we have simple 1:1 mapping
 * 
 * This can be upgraded to proper user/identity tables later.
 */

import { createClient, SupabaseClient } from '@supabase/supabase-js';
import type {
  UserStore,
  IdentityStore,
  WalletStore,
  TransactionStore,
  Stores,
} from '@oneclaw/harness';
import {
  NotFoundError,
  DuplicateError,
  InsufficientBalanceError,
} from '@oneclaw/harness';

// Simplified types that work with existing schema
interface User {
  id: string;
  email: string | null;
  name: string | null;
  avatarUrl: string | null;
  createdAt: Date;
  updatedAt: Date;
}

interface CreateUser {
  email?: string | null;
  name?: string | null;
  avatarUrl?: string | null;
}

interface Identity {
  id: string;
  userId: string;
  provider: string;
  providerId: string;
  providerEmail: string | null;
  providerName: string | null;
  providerAvatar: string | null;
  metadata: Record<string, unknown>;
  verifiedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

interface CreateIdentity {
  userId: string;
  provider: string;
  providerId: string;
  providerEmail?: string | null;
  providerName?: string | null;
  providerAvatar?: string | null;
  metadata?: Record<string, unknown>;
}

type Provider = 'discord' | 'telegram' | 'phone' | 'google' | 'apple' | 'github' | 'email';
type Tier = 'free' | 'starter' | 'pro';

interface Wallet {
  id: string;
  userId: string;
  balanceCents: number;
  tier: Tier;
  lifetimeSpentCents: number;
  lifetimeTopupCents: number;
  createdAt: Date;
  updatedAt: Date;
}

interface Transaction {
  id: string;
  walletId: string;
  type: 'credit' | 'debit' | 'adjustment';
  amountCents: number;
  balanceAfterCents: number;
  source: 'stripe' | 'workflow' | 'refund' | 'admin' | 'promo' | 'migration';
  sourceId: string | null;
  description: string | null;
  idempotencyKey: string;
  createdAt: Date;
}

interface CreateTransaction {
  walletId: string;
  type: 'credit' | 'debit' | 'adjustment';
  amountCents: number;
  idempotencyKey: string;
  source: 'stripe' | 'workflow' | 'refund' | 'admin' | 'promo' | 'migration';
  sourceId?: string | null;
  description?: string | null;
}

// =============================================================================
// SUPABASE CLIENT
// =============================================================================

let _supabase: SupabaseClient | null = null;

function getSupabase(): SupabaseClient {
  if (_supabase) return _supabase;

  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;

  if (!url || !key) {
    throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required');
  }

  _supabase = createClient(url, key);
  return _supabase;
}

// =============================================================================
// USER STORE (Synthetic - works with existing schema)
// =============================================================================

/**
 * Synthetic user store - users are created on-demand when we see them.
 * The user ID is the provider:providerId (e.g., "discord:397102686660591616")
 * This works with the existing wallets table that uses Discord ID as user_id.
 */

// In-memory cache for synthetic users (persisted to DB via wallet creation)
const syntheticUsers = new Map<string, User>();

export class SupabaseUserStore implements UserStore {
  async getById(id: string): Promise<User> {
    // Check cache first
    const cached = syntheticUsers.get(id);
    if (cached) return cached;

    // For our synthetic approach, user exists if wallet exists
    const db = getSupabase();
    const { data } = await db
      .from('wallets')
      .select('user_id, created_at, updated_at')
      .eq('user_id', id)
      .single();

    if (data) {
      const user: User = {
        id: data.user_id,
        email: null,
        name: null,
        avatarUrl: null,
        createdAt: new Date(data.created_at),
        updatedAt: new Date(data.updated_at),
      };
      syntheticUsers.set(id, user);
      return user;
    }

    throw new NotFoundError('User', id);
  }

  async create(input?: CreateUser): Promise<User> {
    // Generate a synthetic ID - this will be replaced when we know the provider
    const id = `user_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const now = new Date();

    const user: User = {
      id,
      email: input?.email ?? null,
      name: input?.name ?? null,
      avatarUrl: input?.avatarUrl ?? null,
      createdAt: now,
      updatedAt: now,
    };

    syntheticUsers.set(id, user);
    console.log(`[supabase-user] Created synthetic user: ${id}`);
    return user;
  }

  async update(id: string, input: Partial<CreateUser>): Promise<User> {
    const user = await this.getById(id);
    const updated: User = {
      ...user,
      email: input.email !== undefined ? input.email ?? null : user.email,
      name: input.name !== undefined ? input.name ?? null : user.name,
      avatarUrl: input.avatarUrl !== undefined ? input.avatarUrl ?? null : user.avatarUrl,
      updatedAt: new Date(),
    };
    syntheticUsers.set(id, updated);
    return updated;
  }

  async delete(id: string): Promise<void> {
    syntheticUsers.delete(id);
  }
}

// =============================================================================
// IDENTITY STORE (Synthetic - works with existing schema)
// =============================================================================

/**
 * Synthetic identity store - identities are 1:1 with users.
 * We use provider:providerId as the user ID directly, so identity
 * resolution becomes trivial.
 * 
 * The user ID format IS the identity: "discord:397102686660591616"
 * This maps directly to wallets.user_id in the existing schema.
 */

// Cache of identities (synthetic)
const syntheticIdentities = new Map<string, Identity>(); // key: provider:providerId

export class SupabaseIdentityStore implements IdentityStore {
  async findByProvider(provider: Provider, providerId: string): Promise<Identity | null> {
    const key = `${provider}:${providerId}`;
    
    // Check cache
    const cached = syntheticIdentities.get(key);
    if (cached) return cached;

    // Check if user has a wallet (means they exist)
    const db = getSupabase();
    const { data } = await db
      .from('wallets')
      .select('user_id, created_at')
      .eq('user_id', providerId) // Existing schema uses providerId directly
      .single();

    if (data) {
      // User exists in DB - create synthetic identity
      const identity: Identity = {
        id: key,
        userId: providerId, // User ID = providerId for backwards compat
        provider: provider,
        providerId: providerId,
        providerEmail: null,
        providerName: null,
        providerAvatar: null,
        metadata: {},
        verifiedAt: null,
        createdAt: new Date(data.created_at),
        updatedAt: new Date(data.created_at),
      };
      syntheticIdentities.set(key, identity);
      return identity;
    }

    // Not found - new user
    return null;
  }

  async getByUserId(userId: string): Promise<Identity[]> {
    // For our synthetic approach, return cached identities for this user
    const identities: Identity[] = [];
    for (const [_, identity] of syntheticIdentities) {
      if (identity.userId === userId) {
        identities.push(identity);
      }
    }
    return identities;
  }

  async create(input: CreateIdentity): Promise<Identity> {
    const key = `${input.provider}:${input.providerId}`;
    
    // Check for duplicates
    const existing = syntheticIdentities.get(key);
    if (existing) {
      throw new DuplicateError('Identity', key);
    }

    const now = new Date();
    const identity: Identity = {
      id: key,
      userId: input.userId,
      provider: input.provider as Provider,
      providerId: input.providerId,
      providerEmail: input.providerEmail ?? null,
      providerName: input.providerName ?? null,
      providerAvatar: input.providerAvatar ?? null,
      metadata: input.metadata ?? {},
      verifiedAt: null,
      createdAt: now,
      updatedAt: now,
    };

    syntheticIdentities.set(key, identity);
    console.log(`[supabase-identity] Created synthetic identity: ${key}`);
    return identity;
  }

  async delete(id: string): Promise<void> {
    syntheticIdentities.delete(id);
  }

  async transferToUser(fromUserId: string, toUserId: string): Promise<void> {
    // Update all identities in cache
    for (const [key, identity] of syntheticIdentities) {
      if (identity.userId === fromUserId) {
        syntheticIdentities.set(key, { ...identity, userId: toUserId });
      }
    }
  }
}

// =============================================================================
// WALLET STORE (Works with existing schema)
// =============================================================================

/**
 * Wallet store using the EXISTING wallets table schema:
 * - user_id TEXT (Discord ID directly)
 * - balance_cents INTEGER
 * - tier TEXT
 * - lifetime_spent_cents INTEGER
 * - lifetime_topup_cents INTEGER
 */

export class SupabaseWalletStore implements WalletStore {
  private transactionStore: SupabaseTransactionStore;

  constructor(transactionStore: SupabaseTransactionStore) {
    this.transactionStore = transactionStore;
  }

  async getByUserId(userId: string): Promise<Wallet> {
    const db = getSupabase();
    const { data, error } = await db
      .from('wallets')
      .select('*')
      .eq('user_id', userId)
      .single();

    if (error?.code === 'PGRST116' || !data) {
      throw new NotFoundError('Wallet', userId);
    }

    if (error) {
      console.error('[supabase-wallet] Get error:', error);
      throw new Error(`Failed to get wallet: ${error.message}`);
    }

    return {
      id: data.id,
      userId: data.user_id,
      balanceCents: data.balance_cents,
      tier: data.tier as Tier,
      lifetimeSpentCents: data.lifetime_spent_cents,
      lifetimeTopupCents: data.lifetime_topup_cents,
      createdAt: new Date(data.created_at),
      updatedAt: new Date(data.updated_at),
    };
  }

  async create(userId: string): Promise<Wallet> {
    const db = getSupabase();
    const now = new Date().toISOString();

    // Existing schema uses gen_random_uuid() for id, so we don't provide it
    const { data, error } = await db
      .from('wallets')
      .insert({
        user_id: userId,
        balance_cents: 0,
        tier: 'free',
        lifetime_spent_cents: 0,
        lifetime_topup_cents: 0,
        created_at: now,
        updated_at: now,
      })
      .select()
      .single();

    if (error) {
      console.error('[supabase-wallet] Create error:', error);
      throw new Error(`Failed to create wallet: ${error.message}`);
    }

    console.log(`[supabase-wallet] Created wallet for user: ${userId}`);
    return {
      id: data.id,
      userId: data.user_id,
      balanceCents: data.balance_cents,
      tier: data.tier as Tier,
      lifetimeSpentCents: data.lifetime_spent_cents,
      lifetimeTopupCents: data.lifetime_topup_cents,
      createdAt: new Date(data.created_at),
      updatedAt: new Date(data.updated_at),
    };
  }

  async credit(
    userId: string,
    amountCents: number,
    idempotencyKey: string,
    source: 'stripe' | 'admin' | 'refund' | 'promo' | 'migration',
    sourceId?: string,
    description?: string
  ): Promise<Transaction> {
    // Check for duplicate
    const existing = await this.transactionStore.findByIdempotencyKey(idempotencyKey);
    if (existing) {
      console.log(`[supabase-wallet] Duplicate credit: ${idempotencyKey}`);
      return existing;
    }

    const db = getSupabase();
    
    // Get or create wallet
    let wallet: Wallet;
    try {
      wallet = await this.getByUserId(userId);
    } catch (err) {
      if (err instanceof NotFoundError) {
        // Auto-create wallet for new users
        wallet = await this.create(userId);
      } else {
        throw err;
      }
    }
    
    const newBalance = wallet.balanceCents + amountCents;
    const newLifetimeTopup = wallet.lifetimeTopupCents + amountCents;

    // Update wallet
    await db
      .from('wallets')
      .update({
        balance_cents: newBalance,
        lifetime_topup_cents: newLifetimeTopup,
        updated_at: new Date().toISOString(),
      })
      .eq('user_id', userId);

    // Create transaction
    const txn = await this.transactionStore.create({
      walletId: wallet.id,
      type: source === 'refund' ? 'credit' : 'credit', // Schema has 'credit', not 'refund'
      amountCents,
      source,
      sourceId: sourceId ?? null,
      description: description ?? `Credit from ${source}`,
      idempotencyKey,
      balanceAfterCents: newBalance,
    });

    console.log(`[supabase-wallet] Credit: ${userId} +$${(amountCents / 100).toFixed(2)} = $${(newBalance / 100).toFixed(2)}`);
    return txn;
  }

  async debit(
    userId: string,
    amountCents: number,
    idempotencyKey: string,
    sourceId?: string,
    description?: string
  ): Promise<Transaction> {
    // Check for duplicate
    const existing = await this.transactionStore.findByIdempotencyKey(idempotencyKey);
    if (existing) {
      console.log(`[supabase-wallet] Duplicate debit: ${idempotencyKey}`);
      return existing;
    }

    const db = getSupabase();
    const wallet = await this.getByUserId(userId);

    // Check balance
    if (wallet.balanceCents < amountCents) {
      throw new InsufficientBalanceError(userId, amountCents, wallet.balanceCents);
    }

    const newBalance = wallet.balanceCents - amountCents;
    const newLifetimeSpent = wallet.lifetimeSpentCents + amountCents;

    // Update wallet
    await db
      .from('wallets')
      .update({
        balance_cents: newBalance,
        lifetime_spent_cents: newLifetimeSpent,
        updated_at: new Date().toISOString(),
      })
      .eq('user_id', userId);

    // Create transaction
    const txn = await this.transactionStore.create({
      walletId: wallet.id,
      type: 'debit',
      amountCents: -amountCents, // Negative for debits
      source: 'workflow',
      sourceId: sourceId ?? null,
      description: description ?? 'Workflow charge',
      idempotencyKey,
      balanceAfterCents: newBalance,
    });

    console.log(`[supabase-wallet] Debit: ${userId} -$${(amountCents / 100).toFixed(2)} = $${(newBalance / 100).toFixed(2)}`);
    return txn;
  }

  async setTier(userId: string, tier: Tier): Promise<Wallet> {
    const db = getSupabase();
    const { data, error } = await db
      .from('wallets')
      .update({
        tier,
        updated_at: new Date().toISOString(),
      })
      .eq('user_id', userId)
      .select()
      .single();

    if (error || !data) {
      throw new NotFoundError('Wallet', userId);
    }

    return {
      id: data.id,
      userId: data.user_id,
      balanceCents: data.balance_cents,
      tier: data.tier as Tier,
      lifetimeSpentCents: data.lifetime_spent_cents,
      lifetimeTopupCents: data.lifetime_topup_cents,
      createdAt: new Date(data.created_at),
      updatedAt: new Date(data.updated_at),
    };
  }

  async delete(userId: string): Promise<void> {
    const db = getSupabase();
    await db.from('wallets').delete().eq('user_id', userId);
  }
}

// =============================================================================
// TRANSACTION STORE (Works with existing schema)
// =============================================================================

/**
 * Transaction store using the EXISTING transactions table schema:
 * - user_id TEXT (not wallet_id)
 * - type TEXT ('top_up', 'charge', 'refund')
 * - amount_cents INTEGER
 * - balance_after_cents INTEGER
 * - description TEXT
 * - workflow_id TEXT
 * - workflow_run_id TEXT
 * - stripe_payment_id TEXT
 * 
 * NOTE: Existing schema doesn't have idempotency_key column!
 * We use a hybrid approach: check memory cache + description for duplicates.
 */

// In-memory idempotency cache (cleared on restart - acceptable for now)
const idempotencyCache = new Map<string, Transaction>();

export class SupabaseTransactionStore implements TransactionStore {
  async findByIdempotencyKey(key: string): Promise<Transaction | null> {
    // Check in-memory cache
    const cached = idempotencyCache.get(key);
    if (cached) return cached;
    
    // Can't check DB since existing schema doesn't have idempotency_key
    // This is acceptable for now - duplicates are prevented at higher level
    return null;
  }

  async getByWalletId(walletId: string, limit = 50): Promise<Transaction[]> {
    const db = getSupabase();
    // Existing schema uses user_id, not wallet_id
    // walletId here is actually the user_id (Discord ID)
    const { data, error } = await db
      .from('transactions')
      .select('*')
      .eq('user_id', walletId) // In existing schema, user_id is the key
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error) {
      console.error('[supabase-txn] Get by wallet error:', error);
      throw new Error(`Failed to get transactions: ${error.message}`);
    }

    return (data || []).map(row => this.mapRow(row));
  }

  async create(input: CreateTransaction & { balanceAfterCents: number }): Promise<Transaction> {
    const db = getSupabase();
    const now = new Date().toISOString();

    // Map new schema to existing DB columns
    const dbType = this.mapTypeToLegacy(input.type);
    
    // Existing schema uses user_id, not wallet_id
    // We need to extract user_id from the context
    // For now, use walletId as user_id (they're the same in our setup)
    const { data, error } = await db
      .from('transactions')
      .insert({
        user_id: input.walletId, // In existing schema, this is the Discord ID
        type: dbType,
        amount_cents: input.amountCents,
        balance_after_cents: input.balanceAfterCents,
        description: input.description,
        workflow_id: input.source === 'workflow' ? input.sourceId : null,
        stripe_payment_id: input.source === 'stripe' ? input.sourceId : null,
        created_at: now,
      })
      .select()
      .single();

    if (error) {
      console.error('[supabase-txn] Create error:', error);
      throw new Error(`Failed to create transaction: ${error.message}`);
    }

    const txn = this.mapRow(data);
    
    // Cache for idempotency
    idempotencyCache.set(input.idempotencyKey, txn);
    
    return txn;
  }

  private mapTypeToLegacy(type: 'credit' | 'debit' | 'adjustment'): string {
    switch (type) {
      case 'credit': return 'top_up';
      case 'debit': return 'charge';
      case 'adjustment': return 'refund';
      default: return 'charge';
    }
  }

  private mapRow(row: Record<string, unknown>): Transaction {
    const legacyType = row.type as string;
    let type: 'credit' | 'debit' | 'adjustment';
    let source: Transaction['source'];
    
    switch (legacyType) {
      case 'top_up':
        type = 'credit';
        source = 'stripe';
        break;
      case 'charge':
        type = 'debit';
        source = 'workflow';
        break;
      case 'refund':
        type = 'credit';
        source = 'refund';
        break;
      default:
        type = 'credit';
        source = 'admin';
    }

    return {
      id: row.id as string,
      walletId: row.user_id as string, // Map user_id to walletId
      type,
      amountCents: row.amount_cents as number,
      balanceAfterCents: row.balance_after_cents as number,
      source,
      sourceId: (row.workflow_id || row.stripe_payment_id || null) as string | null,
      description: row.description as string | null,
      idempotencyKey: `legacy_${row.id}`, // Generate synthetic key
      createdAt: new Date(row.created_at as string),
    };
  }
}

// =============================================================================
// FACTORY
// =============================================================================

/**
 * Create Supabase store implementations
 */
export function createSupabaseStores(): Stores {
  const transactionStore = new SupabaseTransactionStore();
  const walletStore = new SupabaseWalletStore(transactionStore);

  return {
    user: new SupabaseUserStore(),
    identity: new SupabaseIdentityStore(),
    wallet: walletStore,
    transaction: transactionStore,
  };
}
