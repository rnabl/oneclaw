/**
 * User Schema
 * 
 * Core identity - one user, one wallet, multiple provider links.
 */

import { z } from 'zod';

export const UserSchema = z.object({
  id: z.string().uuid(),
  email: z.string().email().nullable(),
  name: z.string().nullable(),
  avatarUrl: z.string().url().nullable(),
  createdAt: z.date(),
  updatedAt: z.date(),
});

export type User = z.infer<typeof UserSchema>;

export const CreateUserSchema = UserSchema.pick({
  email: true,
  name: true,
  avatarUrl: true,
}).partial();

export type CreateUser = z.infer<typeof CreateUserSchema>;
