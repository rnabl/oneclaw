/**
 * Write File Tool
 * 
 * Allows OneClaw to create and modify files within the sandboxed workspace.
 * All paths are validated for security before any write operation.
 */

import { z } from 'zod';
import { pathValidator } from '../security/path-validator';
import fs from 'fs/promises';
import path from 'path';

const WriteFileInputSchema = z.object({
  path: z.string().min(1).max(500).describe('File path (relative to workspace or absolute within workspace)'),
  content: z.string().max(1000000).describe('File content to write'),
  overwrite: z.boolean().optional().default(true).describe('Whether to overwrite existing file'),
  createDirectories: z.boolean().optional().default(true).describe('Create parent directories if they don\'t exist'),
});

type WriteFileInput = z.infer<typeof WriteFileInputSchema>;

const WriteFileOutputSchema = z.object({
  success: z.boolean(),
  path: z.string().optional(),
  bytesWritten: z.number().optional(),
  error: z.string().optional(),
});

type WriteFileOutput = z.infer<typeof WriteFileOutputSchema>;

async function writeFileHandler(
  input: WriteFileInput,
  context: { tenantId: string }
): Promise<WriteFileOutput> {
  try {
    const validation = pathValidator.validateWrite(input.path);
    
    if (!validation.allowed) {
      return {
        success: false,
        error: validation.reason,
      };
    }

    const targetPath = validation.normalizedPath!;

    if (!input.overwrite) {
      try {
        await fs.access(targetPath);
        return {
          success: false,
          error: 'File already exists and overwrite is false',
        };
      } catch {
        // File doesn't exist, continue
      }
    }

    if (input.createDirectories) {
      const directory = path.dirname(targetPath);
      await fs.mkdir(directory, { recursive: true });
    }

    await fs.writeFile(targetPath, input.content, 'utf-8');
    
    const stats = await fs.stat(targetPath);

    console.log(`[WriteFile] Successfully wrote ${stats.size} bytes to ${targetPath}`);

    return {
      success: true,
      path: targetPath,
      bytesWritten: stats.size,
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

export const WRITE_FILE_TOOL = {
  id: 'write-file',
  name: 'write-file',
  description: 'Write or create a file in the OneClaw workspace',
  version: '1.0.0',
  costClass: 'low' as const,
  estimatedCostUsd: 0,
  requiredSecrets: [] as string[],
  tags: ['filesystem', 'self-improvement', 'development'],
  inputSchema: WriteFileInputSchema,
  outputSchema: WriteFileOutputSchema,
  networkPolicy: {
    allowedDomains: [],
    blockedDomains: [],
    allowLocalhost: false,
  },
  isPublic: false,
  handler: async (input: unknown, context: { tenantId: string }) => {
    const validated = WriteFileInputSchema.parse(input);
    return writeFileHandler(validated, { tenantId: context.tenantId });
  },
};

export { WriteFileInputSchema, WriteFileOutputSchema, writeFileHandler };
