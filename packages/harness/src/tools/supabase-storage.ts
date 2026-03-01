/**
 * Supabase Storage Tool
 * 
 * Upload and manage files (images, PDFs, etc.) in Supabase Storage.
 * Returns public URLs for uploaded files.
 */

import { z } from 'zod';
import { createClient, SupabaseClient } from '@supabase/supabase-js';

const SupabaseStorageInputSchema = z.object({
  action: z.enum(['upload', 'download', 'delete', 'list', 'getPublicUrl']).describe('Storage operation'),
  bucket: z.string().describe('Storage bucket name'),
  path: z.string().describe('File path in bucket'),
  content: z.string().optional().describe('File content (base64 for upload)'),
  contentType: z.string().optional().describe('MIME type (e.g., image/png)'),
  cacheControl: z.string().optional().default('3600').describe('Cache control header'),
  upsert: z.boolean().optional().default(false).describe('Overwrite if exists'),
});

type SupabaseStorageInput = z.infer<typeof SupabaseStorageInputSchema>;

const SupabaseStorageOutputSchema = z.object({
  success: z.boolean(),
  publicUrl: z.string().optional(),
  path: z.string().optional(),
  files: z.array(z.string()).optional(),
  error: z.string().optional(),
});

type SupabaseStorageOutput = z.infer<typeof SupabaseStorageOutputSchema>;

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

async function supabaseStorageHandler(
  input: SupabaseStorageInput,
  context: { tenantId: string }
): Promise<SupabaseStorageOutput> {
  try {
    const supabase = getSupabaseClient();

    switch (input.action) {
      case 'upload': {
        if (!input.content) {
          return { success: false, error: 'Content is required for upload' };
        }

        // Decode base64 content
        const buffer = Buffer.from(input.content, 'base64');

        const { data, error } = await supabase.storage
          .from(input.bucket)
          .upload(input.path, buffer, {
            contentType: input.contentType,
            cacheControl: input.cacheControl,
            upsert: input.upsert,
          });

        if (error) {
          return {
            success: false,
            error: error.message,
          };
        }

        // Get public URL
        const { data: { publicUrl } } = supabase.storage
          .from(input.bucket)
          .getPublicUrl(data.path);

        return {
          success: true,
          path: data.path,
          publicUrl,
        };
      }

      case 'download': {
        const { data, error } = await supabase.storage
          .from(input.bucket)
          .download(input.path);

        if (error) {
          return {
            success: false,
            error: error.message,
          };
        }

        // Convert blob to base64
        const buffer = Buffer.from(await data.arrayBuffer());
        const base64 = buffer.toString('base64');

        return {
          success: true,
          path: input.path,
          // Note: content returned as base64 in real implementation
        };
      }

      case 'delete': {
        const { data, error } = await supabase.storage
          .from(input.bucket)
          .remove([input.path]);

        if (error) {
          return {
            success: false,
            error: error.message,
          };
        }

        return {
          success: true,
          path: input.path,
        };
      }

      case 'list': {
        const { data, error } = await supabase.storage
          .from(input.bucket)
          .list(input.path);

        if (error) {
          return {
            success: false,
            error: error.message,
          };
        }

        const files = data.map(file => file.name);

        return {
          success: true,
          files,
        };
      }

      case 'getPublicUrl': {
        const { data: { publicUrl } } = supabase.storage
          .from(input.bucket)
          .getPublicUrl(input.path);

        return {
          success: true,
          publicUrl,
          path: input.path,
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

export const SUPABASE_STORAGE_TOOL = {
  id: 'supabase-storage',
  name: 'supabase-storage',
  description: 'Upload and manage files (images, PDFs) in Supabase Storage with CDN',
  version: '1.0.0',
  costClass: 'low' as const,
  estimatedCostUsd: 0,
  requiredSecrets: ['supabase'] as string[],
  tags: ['storage', 'files', 'images', 'supabase', 'cdn'],
  inputSchema: SupabaseStorageInputSchema,
  outputSchema: SupabaseStorageOutputSchema,
  networkPolicy: {
    allowedDomains: ['*.supabase.co'],
    blockedDomains: [],
    allowLocalhost: false,
  },
  isPublic: false,
  handler: async (input: unknown, context: { tenantId: string }) => {
    const validated = SupabaseStorageInputSchema.parse(input);
    return supabaseStorageHandler(validated, { tenantId: context.tenantId });
  },
};

export { SupabaseStorageInputSchema, SupabaseStorageOutputSchema, supabaseStorageHandler };
