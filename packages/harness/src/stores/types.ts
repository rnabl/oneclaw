/**
 * Store Interfaces
 * 
 * These interfaces define the contract for data persistence.
 * Implementations are provided by the host application (OneClaw API, self-hosted, etc.)
 * 
 * Harness NEVER imports a specific database client.
 */

import type { User, CreateUser } from '../schemas/user';
import type { Identity, CreateIdentity, Provider } from '../schemas/identity';
import type { Wallet, Tier } from '../schemas/wallet';
import type { Transaction, CreateTransaction } from '../schemas/transaction';

// =============================================================================
// USER STORE
// =============================================================================

export interface UserStore {
  /**
   * Get user by ID
   * @throws if not found (never returns null for get by ID)
   */
  getById(id: string): Promise<User>;
  
  /**
   * Create a new user
   */
  create(data?: CreateUser): Promise<User>;
  
  /**
   * Update user fields
   */
  update(id: string, data: Partial<CreateUser>): Promise<User>;
  
  /**
   * Delete user (use with caution - also deletes identities, wallet)
   */
  delete(id: string): Promise<void>;
}

// =============================================================================
// IDENTITY STORE
// =============================================================================

export interface IdentityStore {
  /**
   * Find identity by provider + providerId
   * Returns null if not found (this is normal for new users)
   */
  findByProvider(provider: Provider, providerId: string): Promise<Identity | null>;
  
  /**
   * Get all identities for a user
   */
  getByUserId(userId: string): Promise<Identity[]>;
  
  /**
   * Create a new identity link
   * @throws if provider+providerId already exists
   */
  create(data: CreateIdentity): Promise<Identity>;
  
  /**
   * Delete identity link
   */
  delete(id: string): Promise<void>;
  
  /**
   * Move all identities from one user to another (for account merge)
   */
  transferToUser(fromUserId: string, toUserId: string): Promise<void>;
}

// =============================================================================
// WALLET STORE
// =============================================================================

export interface WalletStore {
  /**
   * Get wallet by user ID
   * @throws if not found
   */
  getByUserId(userId: string): Promise<Wallet>;
  
  /**
   * Create wallet for user
   */
  create(userId: string): Promise<Wallet>;
  
  /**
   * Credit wallet (add money)
   * @param idempotencyKey - Unique key to prevent double-processing
   * @returns The created transaction, or existing if duplicate
   */
  credit(
    userId: string,
    amountCents: number,
    idempotencyKey: string,
    source: 'stripe' | 'admin' | 'refund' | 'promo' | 'migration',
    sourceId?: string,
    description?: string
  ): Promise<Transaction>;
  
  /**
   * Debit wallet (remove money)
   * @throws InsufficientBalanceError if not enough funds
   */
  debit(
    userId: string,
    amountCents: number,
    idempotencyKey: string,
    sourceId?: string,
    description?: string
  ): Promise<Transaction>;
  
  /**
   * Update wallet tier
   */
  setTier(userId: string, tier: Tier): Promise<Wallet>;
  
  /**
   * Delete wallet (use with caution)
   */
  delete(userId: string): Promise<void>;
}

// =============================================================================
// TRANSACTION STORE
// =============================================================================

export interface TransactionStore {
  /**
   * Find transaction by idempotency key
   * Used to check for duplicates
   */
  findByIdempotencyKey(key: string): Promise<Transaction | null>;
  
  /**
   * Get transactions for a wallet
   */
  getByWalletId(walletId: string, limit?: number): Promise<Transaction[]>;
  
  /**
   * Create transaction (internal - usually called by WalletStore)
   */
  create(data: CreateTransaction & { balanceAfterCents: number }): Promise<Transaction>;
}

// =============================================================================
// STORE REGISTRY
// =============================================================================

export interface Stores {
  user: UserStore;
  identity: IdentityStore;
  wallet: WalletStore;
  transaction: TransactionStore;
}

// =============================================================================
// ERRORS
// =============================================================================

export class StoreError extends Error {
  constructor(message: string, public code: string, public details?: Record<string, unknown>) {
    super(message);
    this.name = 'StoreError';
  }
}

export class NotFoundError extends StoreError {
  constructor(entity: string, id: string) {
    super(`${entity} not found: ${id}`, 'NOT_FOUND', { entity, id });
    this.name = 'NotFoundError';
  }
}

export class DuplicateError extends StoreError {
  constructor(entity: string, key: string) {
    super(`${entity} already exists: ${key}`, 'DUPLICATE', { entity, key });
    this.name = 'DuplicateError';
  }
}

export class InsufficientBalanceError extends StoreError {
  constructor(userId: string, required: number, available: number) {
    super(
      `Insufficient balance: need ${required}, have ${available}`,
      'INSUFFICIENT_BALANCE',
      { userId, required, available }
    );
    this.name = 'InsufficientBalanceError';
  }
}
