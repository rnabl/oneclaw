// Supabase client factory

import { createClient, SupabaseClient } from '@supabase/supabase-js';

// Use 'any' for simplicity - in production you'd use generated types
export type TypedSupabaseClient = SupabaseClient<any>;

let supabaseClient: TypedSupabaseClient | null = null;
let supabaseAdminClient: TypedSupabaseClient | null = null;

/**
 * Get Supabase client with anon key (for read operations)
 */
export function getSupabaseClient(): TypedSupabaseClient {
  if (supabaseClient) return supabaseClient;

  const url = process.env.SUPABASE_URL;
  const anonKey = process.env.SUPABASE_ANON_KEY;

  if (!url || !anonKey) {
    throw new Error('Missing SUPABASE_URL or SUPABASE_ANON_KEY');
  }

  supabaseClient = createClient(url, anonKey);
  return supabaseClient;
}

/**
 * Get Supabase admin client with service role key (for write operations)
 */
export function getSupabaseAdminClient(): TypedSupabaseClient {
  if (supabaseAdminClient) return supabaseAdminClient;

  const url = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceRoleKey) {
    throw new Error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  }

  supabaseAdminClient = createClient(url, serviceRoleKey);
  return supabaseAdminClient;
}

/**
 * Create a new Supabase client with custom credentials
 */
export function createSupabaseClient(
  url: string,
  key: string
): TypedSupabaseClient {
  return createClient(url, key);
}
