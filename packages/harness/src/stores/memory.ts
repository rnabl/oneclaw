/**
 * In-Memory Store Implementations
 * 
 * Used for:
 * - Unit tests
 * - Local development
 * - Quick prototyping
 * 
 * NOT for production (data is lost on restart)
 */

import { randomUUID } from 'crypto';
import type { User, CreateUser } from '../schemas/user';
import type { Identity, CreateIdentity, Provider } from '../schemas/identity';
import type { Wallet, Tier } from '../schemas/wallet';
import type { Transaction, CreateTransaction } from '../schemas/transaction';
import type {
  UserStore,
  IdentityStore,
  WalletStore,
  TransactionStore,
  Stores,
} from './types';
import {
  NotFoundError,
  DuplicateError,
  InsufficientBalanceError,
} from './types';

// =============================================================================
// IN-MEMORY USER STORE
// =============================================================================

export class InMemoryUserStore implements UserStore {
  private users = new Map<string, User>();

  async getById(id: string): Promise<User> {
    const user = this.users.get(id);
    if (!user) throw new NotFoundError('User', id);
    return user;
  }

  async create(data?: CreateUser): Promise<User> {
    const now = new Date();
    const user: User = {
      id: randomUUID(),
      email: data?.email ?? null,
      name: data?.name ?? null,
      avatarUrl: data?.avatarUrl ?? null,
      createdAt: now,
      updatedAt: now,
    };
    this.users.set(user.id, user);
    return user;
  }

  async update(id: string, data: Partial<CreateUser>): Promise<User> {
    const user = await this.getById(id);
    const updated: User = {
      ...user,
      ...data,
      updatedAt: new Date(),
    };
    this.users.set(id, updated);
    return updated;
  }

  async delete(id: string): Promise<void> {
    this.users.delete(id);
  }

  // Test helper
  clear(): void {
    this.users.clear();
  }
}

// =============================================================================
// IN-MEMORY IDENTITY STORE
// =============================================================================

export class InMemoryIdentityStore implements IdentityStore {
  private identities = new Map<string, Identity>();
  private providerIndex = new Map<string, string>(); // "provider:providerId" -> id

  private makeProviderKey(provider: Provider, providerId: string): string {
    return `${provider}:${providerId}`;
  }

  async findByProvider(provider: Provider, providerId: string): Promise<Identity | null> {
    const key = this.makeProviderKey(provider, providerId);
    const id = this.providerIndex.get(key);
    if (!id) return null;
    return this.identities.get(id) ?? null;
  }

  async getByUserId(userId: string): Promise<Identity[]> {
    return Array.from(this.identities.values()).filter(i => i.userId === userId);
  }

  async create(data: CreateIdentity): Promise<Identity> {
    const key = this.makeProviderKey(data.provider, data.providerId);
    if (this.providerIndex.has(key)) {
      throw new DuplicateError('Identity', key);
    }

    const now = new Date();
    const identity: Identity = {
      id: randomUUID(),
      userId: data.userId,
      provider: data.provider,
      providerId: data.providerId,
      providerEmail: data.providerEmail ?? null,
      providerName: data.providerName ?? null,
      providerAvatar: data.providerAvatar ?? null,
      metadata: data.metadata,
      verifiedAt: null,
      createdAt: now,
      updatedAt: now,
    };

    this.identities.set(identity.id, identity);
    this.providerIndex.set(key, identity.id);
    return identity;
  }

  async delete(id: string): Promise<void> {
    const identity = this.identities.get(id);
    if (identity) {
      const key = this.makeProviderKey(identity.provider, identity.providerId);
      this.providerIndex.delete(key);
      this.identities.delete(id);
    }
  }

  async transferToUser(fromUserId: string, toUserId: string): Promise<void> {
    for (const identity of this.identities.values()) {
      if (identity.userId === fromUserId) {
        identity.userId = toUserId;
        identity.updatedAt = new Date();
      }
    }
  }

  // Test helper
  clear(): void {
    this.identities.clear();
    this.providerIndex.clear();
  }
}

// =============================================================================
// IN-MEMORY WALLET STORE
// =============================================================================

export class InMemoryWalletStore implements WalletStore {
  private wallets = new Map<string, Wallet>(); // userId -> Wallet
  private transactionStore: InMemoryTransactionStore;

  constructor(transactionStore?: InMemoryTransactionStore) {
    this.transactionStore = transactionStore ?? new InMemoryTransactionStore();
  }

  async getByUserId(userId: string): Promise<Wallet> {
    const wallet = this.wallets.get(userId);
    if (!wallet) throw new NotFoundError('Wallet', userId);
    return wallet;
  }

  async create(userId: string): Promise<Wallet> {
    if (this.wallets.has(userId)) {
      throw new DuplicateError('Wallet', userId);
    }

    const now = new Date();
    const wallet: Wallet = {
      id: randomUUID(),
      userId,
      balanceCents: 0,
      tier: 'free',
      lifetimeTopupCents: 0,
      lifetimeSpentCents: 0,
      createdAt: now,
      updatedAt: now,
    };

    this.wallets.set(userId, wallet);
    return wallet;
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
      console.log(`[wallet] Duplicate idempotency key: ${idempotencyKey}`);
      return existing;
    }

    const wallet = await this.getByUserId(userId);
    const newBalance = wallet.balanceCents + amountCents;

    // Update wallet
    wallet.balanceCents = newBalance;
    wallet.lifetimeTopupCents += amountCents;
    wallet.updatedAt = new Date();

    // Create transaction
    const txn = await this.transactionStore.create({
      walletId: wallet.id,
      type: 'credit',
      amountCents,
      balanceAfterCents: newBalance,
      idempotencyKey,
      source,
      sourceId: sourceId ?? null,
      description: description ?? `Credit ${amountCents} cents`,
    });

    console.log(`[wallet] Credit: ${userId} +${amountCents} = ${newBalance}`);
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
      console.log(`[wallet] Duplicate idempotency key: ${idempotencyKey}`);
      return existing;
    }

    const wallet = await this.getByUserId(userId);

    if (wallet.balanceCents < amountCents) {
      throw new InsufficientBalanceError(userId, amountCents, wallet.balanceCents);
    }

    const newBalance = wallet.balanceCents - amountCents;

    // Update wallet
    wallet.balanceCents = newBalance;
    wallet.lifetimeSpentCents += amountCents;
    wallet.updatedAt = new Date();

    // Create transaction
    const txn = await this.transactionStore.create({
      walletId: wallet.id,
      type: 'debit',
      amountCents: -amountCents,
      balanceAfterCents: newBalance,
      idempotencyKey,
      source: 'workflow',
      sourceId: sourceId ?? null,
      description: description ?? `Debit ${amountCents} cents`,
    });

    console.log(`[wallet] Debit: ${userId} -${amountCents} = ${newBalance}`);
    return txn;
  }

  async setTier(userId: string, tier: Tier): Promise<Wallet> {
    const wallet = await this.getByUserId(userId);
    wallet.tier = tier;
    wallet.updatedAt = new Date();
    return wallet;
  }

  async delete(userId: string): Promise<void> {
    this.wallets.delete(userId);
  }

  // Test helper
  clear(): void {
    this.wallets.clear();
  }
}

// =============================================================================
// IN-MEMORY TRANSACTION STORE
// =============================================================================

export class InMemoryTransactionStore implements TransactionStore {
  private transactions = new Map<string, Transaction>();
  private idempotencyIndex = new Map<string, string>(); // key -> id

  async findByIdempotencyKey(key: string): Promise<Transaction | null> {
    const id = this.idempotencyIndex.get(key);
    if (!id) return null;
    return this.transactions.get(id) ?? null;
  }

  async getByWalletId(walletId: string, limit: number = 50): Promise<Transaction[]> {
    return Array.from(this.transactions.values())
      .filter(t => t.walletId === walletId)
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
      .slice(0, limit);
  }

  async create(data: CreateTransaction & { balanceAfterCents: number }): Promise<Transaction> {
    if (this.idempotencyIndex.has(data.idempotencyKey)) {
      throw new DuplicateError('Transaction', data.idempotencyKey);
    }

    const txn: Transaction = {
      id: randomUUID(),
      walletId: data.walletId,
      type: data.type,
      amountCents: data.amountCents,
      balanceAfterCents: data.balanceAfterCents,
      idempotencyKey: data.idempotencyKey,
      source: data.source,
      sourceId: data.sourceId ?? null,
      description: data.description,
      metadata: data.metadata,
      createdAt: new Date(),
    };

    this.transactions.set(txn.id, txn);
    this.idempotencyIndex.set(data.idempotencyKey, txn.id);
    return txn;
  }

  // Test helper
  clear(): void {
    this.transactions.clear();
    this.idempotencyIndex.clear();
  }
}

// =============================================================================
// CREATE IN-MEMORY STORES
// =============================================================================

export function createInMemoryStores(): Stores {
  const transactionStore = new InMemoryTransactionStore();
  return {
    user: new InMemoryUserStore(),
    identity: new InMemoryIdentityStore(),
    wallet: new InMemoryWalletStore(transactionStore),
    transaction: transactionStore,
  };
}
