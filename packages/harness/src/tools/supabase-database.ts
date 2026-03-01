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
  table: z.string().describe('Table name (can include schema prefix like "crm.leads")'),
  schema: z.string().optional().describe('Schema name (e.g., "crm", "content", "platform"). If table includes schema prefix like "crm.leads", this is extracted automatically.'),
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

function parseTableName(table: string, inputSchema?: string): { schema: string | null; tableName: string } {
  if (table.includes('.')) {
    const [schema, tableName] = table.split('.');
    return { schema, tableName };
  }
  return { schema: inputSchema || null, tableName: table };
}

async function supabaseDatabaseHandler(
  input: SupabaseDatabaseInput,
  context: { tenantId: string }
): Promise<SupabaseDatabaseOutput> {
  try {
    const supabase = getSupabaseClient();
    const { schema, tableName } = parseTableName(input.table, input.schema);

    switch (input.action) {
      case 'query': {
        let baseQuery = schema ? supabase.schema(schema) : supabase;
        let query = baseQuery
          .from(tableName)
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
          data: (data || []) as any as Record<string, unknown>[],
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

        let insertBase = schema ? supabase.schema(schema) : supabase;
        const { data, error } = await insertBase
          .from(tableName)
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

        let updateBase = schema ? supabase.schema(schema) : supabase;
        let query = updateBase
          .from(tableName)
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
        let deleteBase = schema ? supabase.schema(schema) : supabase;
        let query = deleteBase.from(tableName).delete();

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

        let upsertBase = schema ? supabase.schema(schema) : supabase;
        const { data, error } = await upsertBase
          .from(tableName)
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
