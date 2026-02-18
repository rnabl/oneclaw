/**
 * Wallet Schema
 * 
 * One wallet per user. Balance in cents.
 */

import { z } from 'zod';

export const TierSchema = z.enum(['free', 'starter', 'pro']);

export type Tier = z.infer<typeof TierSchema>;

export const WalletSchema = z.object({
  id: z.string().uuid(),
  userId: z.string().uuid(),
  balanceCents: z.number().int().min(0),
  tier: TierSchema,
  lifetimeTopupCents: z.number().int().min(0),
  lifetimeSpentCents: z.number().int().min(0),
  createdAt: z.date(),
  updatedAt: z.date(),
});

export type Wallet = z.infer<typeof WalletSchema>;

/**
 * Format cents as dollar string
 */
export function formatCents(cents: number): string {
  return `$${(Math.abs(cents) / 100).toFixed(2)}`;
}

/**
 * Check if wallet can afford a charge
 */
export function canAfford(wallet: Wallet, amountCents: number): boolean {
  return wallet.balanceCents >= amountCents;
}
