/**
 * Read File Tool
 * 
 * Allows OneClaw to read files from the sandboxed workspace.
 * All paths are validated for security before any read operation.
 */

import { z } from 'zod';
import { pathValidator } from '../security/path-validator';
import fs from 'fs/promises';

const ReadFileInputSchema = z.object({
  path: z.string().min(1).max(500).describe('File path (relative to workspace or absolute within workspace)'),
  encoding: z.enum(['utf-8', 'binary', 'base64']).optional().default('utf-8').describe('File encoding'),
  maxSize: z.number().min(1).max(10000000).optional().default(1000000).describe('Maximum file size in bytes'),
});

type ReadFileInput = z.infer<typeof ReadFileInputSchema>;

const ReadFileOutputSchema = z.object({
  success: z.boolean(),
  content: z.string().optional(),
  size: z.number().optional(),
  path: z.string().optional(),
  error: z.string().optional(),
});

type ReadFileOutput = z.infer<typeof ReadFileOutputSchema>;

async function readFileHandler(
  input: ReadFileInput,
  context: { tenantId: string }
): Promise<ReadFileOutput> {
  try {
    const validation = pathValidator.validateRead(input.path);
    
    if (!validation.allowed) {
      return {
        success: false,
        error: validation.reason,
      };
    }

    const targetPath = validation.normalizedPath!;

    const stats = await fs.stat(targetPath);

    if (stats.size > input.maxSize) {
      return {
        success: false,
        error: `File size (${stats.size} bytes) exceeds maximum allowed (${input.maxSize} bytes)`,
      };
    }

    let content: string;
    
    if (input.encoding === 'binary' || input.encoding === 'base64') {
      const buffer = await fs.readFile(targetPath);
      content = input.encoding === 'base64' 
        ? buffer.toString('base64')
        : buffer.toString('binary');
    } else {
      content = await fs.readFile(targetPath, 'utf-8');
    }

    console.log(`[ReadFile] Successfully read ${stats.size} bytes from ${targetPath}`);

    return {
      success: true,
      content,
      size: stats.size,
      path: targetPath,
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

export const READ_FILE_TOOL = {
  id: 'read-file',
  name: 'read-file',
  description: 'Read a file from the OneClaw workspace',
  version: '1.0.0',
  costClass: 'low' as const,
  estimatedCostUsd: 0,
  requiredSecrets: [] as string[],
  tags: ['filesystem', 'self-improvement', 'development'],
  inputSchema: ReadFileInputSchema,
  outputSchema: ReadFileOutputSchema,
  networkPolicy: {
    allowedDomains: [],
    blockedDomains: [],
    allowLocalhost: false,
  },
  isPublic: false,
  handler: async (input: unknown, context: { tenantId: string }) => {
    const validated = ReadFileInputSchema.parse(input);
    return readFileHandler(validated, { tenantId: context.tenantId });
  },
};

export { ReadFileInputSchema, ReadFileOutputSchema, readFileHandler };
