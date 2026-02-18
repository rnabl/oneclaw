// Usage tracking database operations

import { getSupabaseClient, getSupabaseAdminClient } from './client';
import { getCurrentBillingPeriod } from '@oneclaw/core';
import type { ActionType, Usage } from '@oneclaw/core';

/**
 * Log a usage action
 */
export async function logUsage(
  phoneNumber: string,
  action: ActionType,
  metadata: Record<string, unknown> = {}
): Promise<void> {
  const supabase = getSupabaseAdminClient();
  const billingPeriod = getCurrentBillingPeriod();

  const { error } = await supabase.from('usage').insert({
    phone_number: phoneNumber,
    action,
    metadata,
    billing_period: billingPeriod,
  });

  if (error) {
    console.error('[DB] Error logging usage:', error);
    // Don't throw - usage logging should not break the flow
  }
}

/**
 * Get usage count for a user in current billing period
 */
export async function getUsageCount(
  phoneNumber: string,
  billingPeriod?: string
): Promise<number> {
  const supabase = getSupabaseClient();
  const period = billingPeriod || getCurrentBillingPeriod();

  const { count, error } = await supabase
    .from('usage')
    .select('*', { count: 'exact', head: true })
    .eq('phone_number', phoneNumber)
    .eq('billing_period', period);

  if (error) {
    console.error('[DB] Error getting usage count:', error);
    return 0;
  }

  return count || 0;
}

/**
 * Get usage breakdown by action type for a user
 */
export async function getUsageBreakdown(
  phoneNumber: string,
  billingPeriod?: string
): Promise<Record<ActionType, number>> {
  const supabase = getSupabaseClient();
  const period = billingPeriod || getCurrentBillingPeriod();

  const { data, error } = await supabase
    .from('usage')
    .select('action')
    .eq('phone_number', phoneNumber)
    .eq('billing_period', period);

  if (error) {
    console.error('[DB] Error getting usage breakdown:', error);
    return {} as Record<ActionType, number>;
  }

  const breakdown: Record<string, number> = {};
  
  for (const row of data || []) {
    breakdown[row.action] = (breakdown[row.action] || 0) + 1;
  }

  return breakdown as Record<ActionType, number>;
}

/**
 * Get all usage records for a user in a billing period
 */
export async function getUsageHistory(
  phoneNumber: string,
  billingPeriod?: string,
  limit: number = 50
): Promise<Usage[]> {
  const supabase = getSupabaseClient();
  const period = billingPeriod || getCurrentBillingPeriod();

  const { data, error } = await supabase
    .from('usage')
    .select('*')
    .eq('phone_number', phoneNumber)
    .eq('billing_period', period)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) {
    console.error('[DB] Error getting usage history:', error);
    return [];
  }

  return (data || []) as Usage[];
}
