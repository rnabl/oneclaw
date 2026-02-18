/**
 * OneClaw Wallet System
 * 
 * Simple balance management for pay-as-you-go.
 * Users top up with $5/$10/$25, spend $1-$50 per task.
 * 
 * Uses Supabase for persistence, falls back to in-memory if unavailable.
 */

import { createClient, SupabaseClient } from '@supabase/supabase-js';

// =============================================================================
// TYPES
// =============================================================================

export interface Wallet {
  userId: string;
  balanceCents: number;
  tier: 'free' | 'starter' | 'pro';
  lifetimeSpentCents: number;
  lifetimeTopUpCents: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface Transaction {
  id: string;
  userId: string;
  type: 'top_up' | 'charge' | 'refund';
  amountCents: number;
  balanceAfterCents: number;
  description: string;
  workflowId?: string;
  workflowRunId?: string;
  stripePaymentId?: string;
  createdAt: Date;
}

export interface ChargeResult {
  success: boolean;
  transactionId?: string;
  balanceAfterCents?: number;
  error?: 'insufficient_balance' | 'wallet_not_found' | 'charge_failed';
  required?: number;
  available?: number;
}

// =============================================================================
// SUPABASE CLIENT
// =============================================================================

let supabase: SupabaseClient | null = null;

function getSupabase(): SupabaseClient | null {
  if (supabase) return supabase;
  
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;
  
  if (url && key) {
    supabase = createClient(url, key);
    console.log('[wallet] Using Supabase for persistence');
    return supabase;
  }
  
  console.log('[wallet] No Supabase config, using in-memory storage');
  return null;
}

// =============================================================================
// IN-MEMORY FALLBACK
// =============================================================================

const memoryWallets = new Map<string, Wallet>();
const memoryTransactions: Transaction[] = [];

// =============================================================================
// WALLET OPERATIONS
// =============================================================================

/**
 * Load wallet from Supabase (or create if doesn't exist)
 */
export async function loadWallet(userId: string): Promise<Wallet> {
  const db = getSupabase();
  
  if (db) {
    try {
      console.log(`[wallet] Loading wallet for user: ${userId}`);
      
      // Try to get from Supabase
      const { data, error } = await db
        .from('wallets')
        .select('*')
        .eq('user_id', userId)
        .single();
      
      console.log(`[wallet] Supabase response:`, { data: !!data, error: error?.code || 'none' });
      
      if (data && !error) {
        const wallet: Wallet = {
          userId: data.user_id,
          balanceCents: data.balance_cents,
          tier: data.tier as 'free' | 'starter' | 'pro',
          lifetimeSpentCents: data.lifetime_spent_cents,
          lifetimeTopUpCents: data.lifetime_topup_cents,
          createdAt: new Date(data.created_at),
          updatedAt: new Date(data.updated_at),
        };
        console.log(`[wallet] Loaded from Supabase: ${userId} balance=${wallet.balanceCents}`);
        // Cache in memory
        memoryWallets.set(userId, wallet);
        return wallet;
      }
      
      // Create new wallet if doesn't exist (PGRST116 = not found)
      if (error?.code === 'PGRST116') {
        console.log(`[wallet] Creating new wallet for: ${userId}`);
        const { data: created, error: createError } = await db
          .from('wallets')
          .insert({
            user_id: userId,
            balance_cents: 0,
            tier: 'free',
            lifetime_spent_cents: 0,
            lifetime_topup_cents: 0,
          })
          .select()
          .single();
        
        if (created && !createError) {
          const wallet: Wallet = {
            userId: created.user_id,
            balanceCents: created.balance_cents,
            tier: created.tier as 'free' | 'starter' | 'pro',
            lifetimeSpentCents: created.lifetime_spent_cents,
            lifetimeTopUpCents: created.lifetime_topup_cents,
            createdAt: new Date(created.created_at),
            updatedAt: new Date(created.updated_at),
          };
          console.log(`[wallet] Created new wallet: ${userId}`);
          memoryWallets.set(userId, wallet);
          return wallet;
        }
        console.error('[wallet] Failed to create wallet:', createError);
      } else if (error) {
        console.error('[wallet] Unexpected Supabase error:', error.code, error.message);
      }
    } catch (err) {
      console.error('[wallet] Failed to load from Supabase:', err);
    }
  } else {
    console.warn('[wallet] No Supabase connection, using memory');
  }
  
  // Fallback to memory - but log this as a WARNING
  console.warn(`[wallet] FALLBACK to memory for user: ${userId}`);
  return getWalletSync(userId);
}

/**
 * Sync version for backwards compatibility (memory only)
 */
export function getWallet(userId: string): Wallet {
  return getWalletSync(userId);
}

function getWalletSync(userId: string): Wallet {
  let wallet = memoryWallets.get(userId);
  
  if (!wallet) {
    wallet = {
      userId,
      balanceCents: 0,
      tier: 'free',
      lifetimeSpentCents: 0,
      lifetimeTopUpCents: 0,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    memoryWallets.set(userId, wallet);
  }
  
  return wallet;
}

/**
 * Add funds to wallet (from Stripe payment) - persists to Supabase
 */
export async function topUpAsync(
  userId: string,
  amountCents: number,
  stripePaymentId?: string
): Promise<Transaction> {
  const db = getSupabase();
  
  if (db) {
    try {
      // Get current wallet or create
      const wallet = await loadWallet(userId);
      const newBalance = wallet.balanceCents + amountCents;
      const newLifetimeTopup = wallet.lifetimeTopUpCents + amountCents;
      
      // Update balance in Supabase
      await db
        .from('wallets')
        .update({
          balance_cents: newBalance,
          lifetime_topup_cents: newLifetimeTopup,
          updated_at: new Date().toISOString(),
        })
        .eq('user_id', userId);
      
      // Record transaction
      const txnId = generateId();
      await db
        .from('transactions')
        .insert({
          user_id: userId,
          type: 'top_up',
          amount_cents: amountCents,
          balance_after_cents: newBalance,
          description: `Added ${formatCents(amountCents)} to wallet`,
          stripe_payment_id: stripePaymentId,
        });
      
      // Update memory cache
      wallet.balanceCents = newBalance;
      wallet.lifetimeTopUpCents = newLifetimeTopup;
      wallet.updatedAt = new Date();
      memoryWallets.set(userId, wallet);
      
      console.log(`[wallet] Top up: ${userId} +${formatCents(amountCents)} = ${formatCents(newBalance)}`);
      
      return {
        id: txnId,
        userId,
        type: 'top_up',
        amountCents,
        balanceAfterCents: newBalance,
        description: `Added ${formatCents(amountCents)} to wallet`,
        stripePaymentId,
        createdAt: new Date(),
      };
    } catch (err) {
      console.error('[wallet] Failed to persist top-up to Supabase:', err);
    }
  }
  
  // Fallback to sync version
  return topUp(userId, amountCents, stripePaymentId);
}

/**
 * Sync version (memory only, for backwards compatibility)
 */
export function topUp(
  userId: string,
  amountCents: number,
  stripePaymentId?: string
): Transaction {
  const wallet = getWalletSync(userId);
  
  wallet.balanceCents += amountCents;
  wallet.lifetimeTopUpCents += amountCents;
  wallet.updatedAt = new Date();
  
  const transaction: Transaction = {
    id: generateId(),
    userId,
    type: 'top_up',
    amountCents,
    balanceAfterCents: wallet.balanceCents,
    description: `Added ${formatCents(amountCents)} to wallet`,
    stripePaymentId,
    createdAt: new Date(),
  };
  
  memoryTransactions.push(transaction);
  
  console.log(`[wallet] Top up: ${userId} +${formatCents(amountCents)} = ${formatCents(wallet.balanceCents)}`);
  
  return transaction;
}

/**
 * Charge wallet for a workflow
 */
export function charge(
  userId: string,
  amountCents: number,
  workflowId: string,
  workflowRunId?: string,
  description?: string
): ChargeResult {
  const wallet = getWalletSync(userId);
  
  // Check balance
  if (wallet.balanceCents < amountCents) {
    return {
      success: false,
      error: 'insufficient_balance',
      required: amountCents,
      available: wallet.balanceCents,
    };
  }
  
  // Deduct
  wallet.balanceCents -= amountCents;
  wallet.lifetimeSpentCents += amountCents;
  wallet.updatedAt = new Date();
  
  const transaction: Transaction = {
    id: generateId(),
    userId,
    type: 'charge',
    amountCents: -amountCents,
    balanceAfterCents: wallet.balanceCents,
    description: description || `Charged for ${workflowId}`,
    workflowId,
    workflowRunId,
    createdAt: new Date(),
  };
  
  memoryTransactions.push(transaction);
  
  console.log(`[wallet] Charge: ${userId} -${formatCents(amountCents)} = ${formatCents(wallet.balanceCents)}`);
  
  // Also persist to Supabase in background
  const db = getSupabase();
  if (db) {
    db.from('wallets')
      .update({
        balance_cents: wallet.balanceCents,
        lifetime_spent_cents: wallet.lifetimeSpentCents,
        updated_at: new Date().toISOString(),
      })
      .eq('user_id', userId)
      .then(() => {
        db.from('transactions').insert({
          user_id: userId,
          type: 'charge',
          amount_cents: -amountCents,
          balance_after_cents: wallet.balanceCents,
          description: transaction.description,
          workflow_id: workflowId,
          workflow_run_id: workflowRunId,
        });
      });
  }
  
  return {
    success: true,
    transactionId: transaction.id,
    balanceAfterCents: wallet.balanceCents,
  };
}

/**
 * Refund a charge (workflow failed)
 */
export function refund(
  userId: string,
  amountCents: number,
  workflowId: string,
  reason: string
): Transaction {
  const wallet = getWalletSync(userId);
  
  wallet.balanceCents += amountCents;
  wallet.lifetimeSpentCents -= amountCents;
  wallet.updatedAt = new Date();
  
  const transaction: Transaction = {
    id: generateId(),
    userId,
    type: 'refund',
    amountCents,
    balanceAfterCents: wallet.balanceCents,
    description: `Refund for ${workflowId}: ${reason}`,
    workflowId,
    createdAt: new Date(),
  };
  
  memoryTransactions.push(transaction);
  
  console.log(`[wallet] Refund: ${userId} +${formatCents(amountCents)} = ${formatCents(wallet.balanceCents)}`);
  
  // Also persist to Supabase in background
  const db = getSupabase();
  if (db) {
    db.from('wallets')
      .update({
        balance_cents: wallet.balanceCents,
        lifetime_spent_cents: wallet.lifetimeSpentCents,
        updated_at: new Date().toISOString(),
      })
      .eq('user_id', userId)
      .then(() => {
        db.from('transactions').insert({
          user_id: userId,
          type: 'refund',
          amount_cents: amountCents,
          balance_after_cents: wallet.balanceCents,
          description: transaction.description,
          workflow_id: workflowId,
        });
      });
  }
  
  return transaction;
}

/**
 * Check if user can afford a charge
 * @param wallet - The wallet object (loaded via loadWallet)
 * @param amountCents - The amount to check
 */
export function canAfford(wallet: Wallet, amountCents: number): boolean {
  return wallet.balanceCents >= amountCents;
}

/**
 * Get transaction history for user
 */
export function getTransactions(userId: string, limit: number = 50): Transaction[] {
  return memoryTransactions
    .filter(t => t.userId === userId)
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
    .slice(0, limit);
}

/**
 * Set user tier (from subscription)
 */
export function setTier(userId: string, tier: 'free' | 'starter' | 'pro'): void {
  const wallet = getWalletSync(userId);
  wallet.tier = tier;
  wallet.updatedAt = new Date();
  
  console.log(`[wallet] Tier update: ${userId} -> ${tier}`);
  
  // Also persist to Supabase
  const db = getSupabase();
  if (db) {
    db.from('wallets')
      .update({ tier, updated_at: new Date().toISOString() })
      .eq('user_id', userId);
  }
}

// =============================================================================
// TOP-UP PACKAGES
// =============================================================================

export const TOP_UP_PACKAGES = [
  { id: 'top_up_5', amountCents: 500, label: '$5', bonus: 0 },
  { id: 'top_up_10', amountCents: 1000, label: '$10', bonus: 0 },
  { id: 'top_up_25', amountCents: 2500, label: '$25', bonus: 0 },
];

// =============================================================================
// HELPERS
// =============================================================================

function generateId(): string {
  return `txn_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

export function formatCents(cents: number): string {
  return `$${(Math.abs(cents) / 100).toFixed(2)}`;
}
