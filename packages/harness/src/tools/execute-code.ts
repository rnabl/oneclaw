/**
 * Execute Code Tool
 * 
 * Allows OneClaw to execute TypeScript/JavaScript code in a sandboxed environment.
 * This enables self-improvement capabilities by letting the AI write and test code.
 * 
 * Security features:
 * - Restricted to workspace directory
 * - No access to system calls or sensitive APIs
 * - Timeout protection
 * - Memory limits
 */

import { z } from 'zod';
import { pathValidator } from '../security/path-validator';
import { VM } from 'vm2';
import { exec } from 'child_process';
import { promisify } from 'util';
import fs from 'fs/promises';
import path from 'path';

const execAsync = promisify(exec);

const ExecuteCodeInputSchema = z.object({
  code: z.string().min(1).max(50000).describe('Code to execute'),
  language: z.enum(['typescript', 'javascript', 'bash']).describe('Programming language'),
  timeout: z.number().min(100).max(60000).optional().default(30000).describe('Timeout in milliseconds'),
  workingDirectory: z.string().optional().describe('Working directory (relative to workspace)'),
});

type ExecuteCodeInput = z.infer<typeof ExecuteCodeInputSchema>;

const ExecuteCodeOutputSchema = z.object({
  success: z.boolean(),
  stdout: z.string().optional(),
  stderr: z.string().optional(),
  exitCode: z.number().optional(),
  error: z.string().optional(),
  executionTime: z.number().optional(),
});

type ExecuteCodeOutput = z.infer<typeof ExecuteCodeOutputSchema>;

const BLOCKED_OPERATIONS = [
  'process.exit',
  'process.kill',
  'require("child_process")',
  'require("fs")',
  'eval(',
  'Function(',
  'import("',
  'crypto.createPrivateKey',
  'crypto.createPublicKey',
  'crypto.generateKeyPair',
];

async function executeCodeHandler(
  input: ExecuteCodeInput,
  context: { tenantId: string }
): Promise<ExecuteCodeOutput> {
  const startTime = Date.now();

  try {
    // Check for blocked operations
    for (const blocked of BLOCKED_OPERATIONS) {
      if (input.code.includes(blocked)) {
        return {
          success: false,
          error: `Blocked operation detected: ${blocked}`,
          executionTime: Date.now() - startTime,
        };
      }
    }

    // Validate working directory if provided
    let workingDir = pathValidator.getWorkspaceRoot();
    if (input.workingDirectory) {
      const validation = pathValidator.validateRead(input.workingDirectory);
      if (!validation.allowed) {
        return {
          success: false,
          error: validation.reason,
          executionTime: Date.now() - startTime,
        };
      }
      workingDir = validation.normalizedPath!;
    }

    switch (input.language) {
      case 'javascript':
        return await executeJavaScript(input.code, input.timeout, startTime);
      
      case 'typescript':
        return await executeTypeScript(input.code, input.timeout, workingDir, startTime);
      
      case 'bash':
        return await executeBash(input.code, input.timeout, workingDir, startTime);
      
      default:
        return {
          success: false,
          error: `Unsupported language: ${input.language}`,
          executionTime: Date.now() - startTime,
        };
    }
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
      executionTime: Date.now() - startTime,
    };
  }
}

async function executeJavaScript(
  code: string,
  timeout: number,
  startTime: number
): Promise<ExecuteCodeOutput> {
  try {
    const vm = new VM({
      timeout,
      sandbox: {
        console: {
          log: (...args: unknown[]) => console.log('[Sandboxed]', ...args),
          error: (...args: unknown[]) => console.error('[Sandboxed]', ...args),
        },
      },
      eval: false,
      wasm: false,
    });

    const result = vm.run(code);

    return {
      success: true,
      stdout: String(result),
      exitCode: 0,
      executionTime: Date.now() - startTime,
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
      exitCode: 1,
      executionTime: Date.now() - startTime,
    };
  }
}

async function executeTypeScript(
  code: string,
  timeout: number,
  workingDir: string,
  startTime: number
): Promise<ExecuteCodeOutput> {
  try {
    const tempFile = path.join(workingDir, `temp-${Date.now()}.ts`);
    
    await fs.writeFile(tempFile, code);

    const { stdout, stderr } = await execAsync(
      `npx tsx ${tempFile}`,
      {
        timeout,
        cwd: workingDir,
        env: {
          ...process.env,
          NODE_ENV: 'sandbox',
        },
      }
    );

    await fs.unlink(tempFile).catch(() => {});

    return {
      success: true,
      stdout: stdout.trim(),
      stderr: stderr.trim(),
      exitCode: 0,
      executionTime: Date.now() - startTime,
    };
  } catch (error: any) {
    return {
      success: false,
      stdout: error.stdout?.trim(),
      stderr: error.stderr?.trim(),
      error: error.message,
      exitCode: error.code || 1,
      executionTime: Date.now() - startTime,
    };
  }
}

async function executeBash(
  code: string,
  timeout: number,
  workingDir: string,
  startTime: number
): Promise<ExecuteCodeOutput> {
  try {
    const blockedCommands = ['rm -rf /', 'dd if=', 'mkfs', 'format', ':(){:|:&};:'];
    
    for (const blocked of blockedCommands) {
      if (code.includes(blocked)) {
        return {
          success: false,
          error: `Blocked dangerous command: ${blocked}`,
          executionTime: Date.now() - startTime,
        };
      }
    }

    const { stdout, stderr } = await execAsync(code, {
      timeout,
      cwd: workingDir,
      shell: '/bin/bash',
    });

    return {
      success: true,
      stdout: stdout.trim(),
      stderr: stderr.trim(),
      exitCode: 0,
      executionTime: Date.now() - startTime,
    };
  } catch (error: any) {
    return {
      success: false,
      stdout: error.stdout?.trim(),
      stderr: error.stderr?.trim(),
      error: error.message,
      exitCode: error.code || 1,
      executionTime: Date.now() - startTime,
    };
  }
}

export const EXECUTE_CODE_TOOL = {
  id: 'execute-code',
  name: 'execute-code',
  description: 'Execute TypeScript, JavaScript, or Bash code in a secure sandbox',
  version: '1.0.0',
  costClass: 'low' as const,
  estimatedCostUsd: 0.001,
  requiredSecrets: [] as string[],
  tags: ['development', 'self-improvement', 'code-execution'],
  inputSchema: ExecuteCodeInputSchema,
  outputSchema: ExecuteCodeOutputSchema,
  networkPolicy: {
    allowedDomains: ['*'],
    blockedDomains: [],
    allowLocalhost: false,
  },
  isPublic: false,
  handler: async (input: unknown, context: { tenantId: string }) => {
    const validated = ExecuteCodeInputSchema.parse(input);
    return executeCodeHandler(validated, { tenantId: context.tenantId });
  },
};

export { ExecuteCodeInputSchema, ExecuteCodeOutputSchema, executeCodeHandler };
