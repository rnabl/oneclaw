/**
 * Identity Schema
 * 
 * Links external providers (Discord, Telegram, phone, OAuth) to a user.
 * One user can have multiple identities.
 * Each provider+providerId combination is unique.
 */

import { z } from 'zod';

export const ProviderSchema = z.enum([
  'discord',
  'telegram',
  'phone',
  'google',
  'apple',
  'github',
  'email',
]);

export type Provider = z.infer<typeof ProviderSchema>;

export const IdentitySchema = z.object({
  id: z.string().uuid(),
  userId: z.string().uuid(),
  provider: ProviderSchema,
  providerId: z.string(), // External ID (Discord user ID, phone number, etc.)
  providerEmail: z.string().email().nullable(),
  providerName: z.string().nullable(),
  providerAvatar: z.string().url().nullable(),
  metadata: z.record(z.unknown()).optional(), // Extra provider-specific data
  verifiedAt: z.date().nullable(),
  createdAt: z.date(),
  updatedAt: z.date(),
});

export type Identity = z.infer<typeof IdentitySchema>;

export const CreateIdentitySchema = z.object({
  userId: z.string().uuid(),
  provider: ProviderSchema,
  providerId: z.string(),
  providerEmail: z.string().email().nullable().optional(),
  providerName: z.string().nullable().optional(),
  providerAvatar: z.string().url().nullable().optional(),
  metadata: z.record(z.unknown()).optional(),
});

export type CreateIdentity = z.infer<typeof CreateIdentitySchema>;

/**
 * Normalize provider ID for consistency
 */
export function normalizeProviderId(provider: Provider, rawId: string): string {
  switch (provider) {
    case 'phone':
      // Ensure E.164 format (basic normalization)
      const digits = rawId.replace(/\D/g, '');
      return digits.startsWith('1') ? `+${digits}` : `+1${digits}`;
    case 'email':
      return rawId.toLowerCase().trim();
    default:
      return rawId.trim();
  }
}
