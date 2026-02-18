/**
 * Transaction Schema
 * 
 * Immutable record of every wallet change.
 * Idempotency key prevents duplicate processing.
 */

import { z } from 'zod';

export const TransactionTypeSchema = z.enum([
  'credit',      // Money added (topup, refund, promo)
  'debit',       // Money removed (workflow charge)
  'adjustment',  // Manual correction
]);

export type TransactionType = z.infer<typeof TransactionTypeSchema>;

export const TransactionSourceSchema = z.enum([
  'stripe',      // Payment from Stripe
  'workflow',    // Charge for running workflow
  'refund',      // Refund for failed workflow
  'admin',       // Manual admin action
  'promo',       // Promotional credit
  'migration',   // Data migration
]);

export type TransactionSource = z.infer<typeof TransactionSourceSchema>;

export const TransactionSchema = z.object({
  id: z.string().uuid(),
  walletId: z.string().uuid(),
  type: TransactionTypeSchema,
  amountCents: z.number().int(), // Positive for credit, negative for debit
  balanceAfterCents: z.number().int(),
  idempotencyKey: z.string(), // UNIQUE - prevents duplicates
  source: TransactionSourceSchema,
  sourceId: z.string().nullable(), // Stripe event ID, workflow run ID, etc.
  description: z.string(),
  metadata: z.record(z.unknown()).optional(),
  createdAt: z.date(),
});

export type Transaction = z.infer<typeof TransactionSchema>;

export const CreateTransactionSchema = z.object({
  walletId: z.string().uuid(),
  type: TransactionTypeSchema,
  amountCents: z.number().int(),
  idempotencyKey: z.string(),
  source: TransactionSourceSchema,
  sourceId: z.string().nullable().optional(),
  description: z.string(),
  metadata: z.record(z.unknown()).optional(),
});

export type CreateTransaction = z.infer<typeof CreateTransactionSchema>;

/**
 * Generate idempotency key for different sources
 */
export function generateIdempotencyKey(
  source: TransactionSource,
  sourceId: string
): string {
  return `${source}_${sourceId}`;
}
