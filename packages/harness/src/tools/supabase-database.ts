/**
 * Supabase Database Tool
 * 
 * Production database operations using Supabase Postgres.
 * Use this for business data, campaigns, user records.
 * 
 * For AI coding workspace, use the 'database' tool (SQLite).
 */

import { z } from 'zod';
import { createClient, SupabaseClient } from '@supabase/supabase-js';

const SupabaseDatabaseInputSchema = z.object({
  action: z.enum(['query', 'insert', 'update', 'delete', 'upsert']).describe('Database operation'),
  table: z.string().describe('Table name'),
  data: z.record(z.unknown()).optional().describe('Data to insert/update'),
  where: z.record(z.unknown()).optional().describe('WHERE conditions'),
  select: z.string().optional().default('*').describe('Columns to select'),
  order: z.string().optional().describe('Order by column'),
  limit: z.number().optional().describe('Limit results'),
});

type SupabaseDatabaseInput = z.infer<typeof SupabaseDatabaseInputSchema>;

const SupabaseDatabaseOutputSchema = z.object({
  success: z.boolean(),
  data: z.array(z.record(z.unknown())).optional(),
  count: z.number().optional(),
  error: z.string().optional(),
});

type SupabaseDatabaseOutput = z.infer<typeof SupabaseDatabaseOutputSchema>;

let supabaseClient: SupabaseClient | null = null;

function getSupabaseClient(): SupabaseClient {
  if (supabaseClient) {
    return supabaseClient;
  }

  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseKey) {
    throw new Error('Supabase credentials not found. Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY');
  }

  supabaseClient = createClient(supabaseUrl, supabaseKey);
  return supabaseClient;
}

async function supabaseDatabaseHandler(
  input: SupabaseDatabaseInput,
  context: { tenantId: string }
): Promise<SupabaseDatabaseOutput> {
  try {
    const supabase = getSupabaseClient();

    switch (input.action) {
      case 'query': {
        let query = supabase
          .from(input.table)
          .select(input.select || '*');

        // Apply WHERE conditions
        if (input.where) {
          for (const [key, value] of Object.entries(input.where)) {
            query = query.eq(key, value);
          }
        }

        // Apply ORDER BY
        if (input.order) {
          query = query.order(input.order);
        }

        // Apply LIMIT
        if (input.limit) {
          query = query.limit(input.limit);
        }

        const { data, error, count } = await query;

        if (error) {
          return {
            success: false,
            error: error.message,
          };
        }

        return {
          success: true,
          data: data as Record<string, unknown>[],
          count: count || data?.length || 0,
        };
      }

      case 'insert': {
        if (!input.data) {
          return { success: false, error: 'Data is required for insert' };
        }

        // Add tenant_id if multi-tenant
        const dataWithTenant = {
          ...input.data,
          // Uncomment for multi-tenant:
          // tenant_id: context.tenantId,
        };

        const { data, error } = await supabase
          .from(input.table)
          .insert(dataWithTenant)
          .select();

        if (error) {
          return {
            success: false,
            error: error.message,
          };
        }

        return {
          success: true,
          data: data as Record<string, unknown>[],
          count: data?.length || 0,
        };
      }

      case 'update': {
        if (!input.data) {
          return { success: false, error: 'Data is required for update' };
        }

        let query = supabase
          .from(input.table)
          .update(input.data);

        // Apply WHERE conditions
        if (input.where) {
          for (const [key, value] of Object.entries(input.where)) {
            query = query.eq(key, value);
          }
        } else {
          return {
            success: false,
            error: 'WHERE conditions required for update (safety feature)',
          };
        }

        const { data, error } = await query.select();

        if (error) {
          return {
            success: false,
            error: error.message,
          };
        }

        return {
          success: true,
          data: data as Record<string, unknown>[],
          count: data?.length || 0,
        };
      }

      case 'delete': {
        let query = supabase.from(input.table).delete();

        // Apply WHERE conditions
        if (input.where) {
          for (const [key, value] of Object.entries(input.where)) {
            query = query.eq(key, value);
          }
        } else {
          return {
            success: false,
            error: 'WHERE conditions required for delete (safety feature)',
          };
        }

        const { data, error } = await query.select();

        if (error) {
          return {
            success: false,
            error: error.message,
          };
        }

        return {
          success: true,
          data: data as Record<string, unknown>[],
          count: data?.length || 0,
        };
      }

      case 'upsert': {
        if (!input.data) {
          return { success: false, error: 'Data is required for upsert' };
        }

        const { data, error } = await supabase
          .from(input.table)
          .upsert(input.data)
          .select();

        if (error) {
          return {
            success: false,
            error: error.message,
          };
        }

        return {
          success: true,
          data: data as Record<string, unknown>[],
          count: data?.length || 0,
        };
      }

      default:
        return {
          success: false,
          error: `Unknown action: ${input.action}`,
        };
    }
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

export const SUPABASE_DATABASE_TOOL = {
  id: 'supabase-database',
  name: 'supabase-database',
  description: 'Execute Supabase (Postgres) database operations for production data',
  version: '1.0.0',
  costClass: 'low' as const,
  estimatedCostUsd: 0,
  requiredSecrets: ['supabase'] as string[],
  tags: ['database', 'storage', 'supabase', 'postgres'],
  inputSchema: SupabaseDatabaseInputSchema,
  outputSchema: SupabaseDatabaseOutputSchema,
  networkPolicy: {
    allowedDomains: ['*.supabase.co'],
    blockedDomains: [],
    allowLocalhost: false,
  },
  isPublic: false,
  handler: async (input: unknown, context: { tenantId: string }) => {
    const validated = SupabaseDatabaseInputSchema.parse(input);
    return supabaseDatabaseHandler(validated, { tenantId: context.tenantId });
  },
};

export { SupabaseDatabaseInputSchema, SupabaseDatabaseOutputSchema, supabaseDatabaseHandler };
