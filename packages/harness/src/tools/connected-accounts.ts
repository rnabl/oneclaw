/**
 * Connected Accounts Tool
 * 
 * Allows the LLM to check what accounts/integrations are connected.
 */

import { z } from 'zod';
import { registry } from '../registry';
import { getSupabaseClient } from '../lib/supabase';

// Input schema
const ConnectedAccountsInputSchema = z.object({
  provider: z.string().optional().describe('Filter by provider (e.g., "google", "gmail")'),
});

type ConnectedAccountsInput = z.infer<typeof ConnectedAccountsInputSchema>;

// Output schema
const ConnectedAccountsOutputSchema = z.object({
  success: z.boolean(),
  accounts: z.array(z.object({
    provider: z.string(),
    email: z.string().optional(),
    connected_at: z.string().optional(),
    status: z.string(),
  })).optional(),
  error: z.string().optional(),
});

type ConnectedAccountsOutput = z.infer<typeof ConnectedAccountsOutputSchema>;

/**
 * Tool handler
 */
export async function connectedAccountsHandler(
  input: ConnectedAccountsInput,
  _context: { tenantId: string }
): Promise<ConnectedAccountsOutput> {
  try {
    const supabase = getSupabaseClient();
    if (!supabase) {
      return { success: false, error: 'Database not configured' };
    }
    
    // Query node_integrations for connected accounts
    let query = supabase
      .from('node_integrations')
      .select('provider, email, created_at, token_expires_at');
    
    if (input.provider) {
      query = query.eq('provider', input.provider);
    }
    
    const { data, error } = await query;
    
    if (error) {
      return { success: false, error: error.message };
    }
    
    const accounts = (data || []).map(acc => {
      const expiresAt = acc.token_expires_at ? new Date(acc.token_expires_at) : null;
      const isExpired = expiresAt && expiresAt < new Date();
      
      return {
        provider: acc.provider,
        email: acc.email || undefined,
        connected_at: acc.created_at || undefined,
        status: isExpired ? 'expired' : 'active',
      };
    });
    
    return { success: true, accounts };
  } catch (error) {
    return {
      success: false,
      error: String(error),
    };
  }
}

// Register the tool
registry.register({
  id: 'get_connected_accounts',
  name: 'Get Connected Accounts',
  description: 'Check what accounts and integrations are connected (Gmail, etc). Use this to see if email sending is available.',
  category: 'integrations',
  tier: 'free',
  inputSchema: ConnectedAccountsInputSchema,
  outputSchema: ConnectedAccountsOutputSchema,
  handler: connectedAccountsHandler,
});

export default connectedAccountsHandler;
