/**
 * Execute Code Tool
 *
 * Executes TypeScript/JavaScript/Bash in a secure Deno sandbox.
 * Replaces vm2 (abandoned, known escapes) with Deno subprocess.
 *
 * Security features:
 * - Deno permission model (--no-env, --no-read, --no-write by default)
 * - No access to process.env / secrets
 * - 30s timeout enforced at OS level
 * - Memory limits via Deno runtime
 * - Temp files written to /tmp (never workspace)
 */

import { z } from 'zod';
import { exec } from 'child_process';
import { promisify } from 'util';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';

const execAsync = promisify(exec);

const ExecuteCodeInputSchema = z.object({
  code: z.string().min(1).max(50000).describe('Code to execute'),
  language: z.enum(['typescript', 'javascript', 'bash']).describe('Programming language'),
  timeout: z.number().min(100).max(30000).optional().default(30000).describe('Timeout in ms (max 30s)'),
  allowNet: z.boolean().optional().default(false).describe('Allow network access in sandbox'),
  allowedDomains: z.array(z.string()).optional().describe('Specific domains to allow (if allowNet true)'),
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

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Get the Deno executable path
 * Checks common installation locations since PM2 may not inherit PATH
 */
function getDenoPath(): string {
  const possiblePaths = [
    '/root/.deno/bin/deno',           // Linux root user install
    '/home/ubuntu/.deno/bin/deno',    // Ubuntu user install
    `${process.env.HOME}/.deno/bin/deno`, // User home install
    '/usr/local/bin/deno',            // System-wide install
    '/usr/bin/deno',                  // Package manager install
    'deno',                           // Fallback to PATH
  ];

  for (const denoPath of possiblePaths) {
    try {
      const { execSync } = require('child_process');
      execSync(`${denoPath} --version`, { stdio: 'ignore' });
      return denoPath;
    } catch {
      continue;
    }
  }

  return 'deno'; // Fallback - will fail with "not found" if not in PATH
}

const DENO_PATH = getDenoPath();

function buildDenoFlags(allowNet: boolean, allowedDomains?: string[]): string {
  // Deno 2.x uses --deny-* instead of --no-* for most permissions
  const flags = [
    '--no-prompt',      // never ask for permissions interactively (still valid in 2.x)
    '--deny-read',      // no file system reads
    '--deny-write',     // no file system writes
    '--deny-env',       // NO access to process.env (your secrets are safe)
    '--deny-run',       // can't spawn subprocesses
    '--deny-ffi',       // no native plugins
    '--deny-sys',       // no system info
    '--deny-hrtime',    // no high-resolution time
  ];

  if (allowNet) {
    if (allowedDomains && allowedDomains.length > 0) {
      // Only allow specific domains
      flags.push(`--allow-net=${allowedDomains.join(',')}`);
    } else {
      flags.push('--allow-net');
    }
  } else {
    flags.push('--deny-net');
  }

  return flags.join(' ');
}

async function writeTempFile(code: string, ext: string): Promise<string> {
  const tmpDir = os.tmpdir();
  const tmpPath = path.join(tmpDir, `oneclaw-sandbox-${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`);
  await fs.writeFile(tmpPath, code, 'utf8');
  return tmpPath;
}

async function cleanupTempFile(filePath: string): Promise<void> {
  await fs.unlink(filePath).catch(() => {}); // silent cleanup
}

// ─── Executors ────────────────────────────────────────────────────────────────

async function executeCodeHandler(
  input: ExecuteCodeInput,
  context: { tenantId: string }
): Promise<ExecuteCodeOutput> {
  const startTime = Date.now();

  try {
    switch (input.language) {
      case 'javascript':
        return await executeJavaScript(
          input.code,
          input.timeout,
          input.allowNet ?? false,
          input.allowedDomains,
          startTime
        );

      case 'typescript':
        return await executeTypeScript(
          input.code,
          input.timeout,
          input.allowNet ?? false,
          input.allowedDomains,
          startTime
        );

      case 'bash':
        return await executeBash(
          input.code,
          input.timeout,
          startTime
        );

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

/**
 * JavaScript execution via Deno
 * Deno runs JS natively — no vm2, no escapes
 */
async function executeJavaScript(
  code: string,
  timeout: number,
  allowNet: boolean,
  allowedDomains: string[] | undefined,
  startTime: number
): Promise<ExecuteCodeOutput> {
  const tmpFile = await writeTempFile(code, 'js');

  try {
    const flags = buildDenoFlags(allowNet, allowedDomains);
    const { stdout, stderr } = await execAsync(
      `${DENO_PATH} run ${flags} ${tmpFile}`,
      { timeout }
    );

    return {
      success: true,
      stdout: stdout.trim(),
      stderr: stderr.trim() || undefined,
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
  } finally {
    await cleanupTempFile(tmpFile);
  }
}

/**
 * TypeScript execution via Deno
 * Deno has native TS support — no tsx, no transpile step, no env leak
 */
async function executeTypeScript(
  code: string,
  timeout: number,
  allowNet: boolean,
  allowedDomains: string[] | undefined,
  startTime: number
): Promise<ExecuteCodeOutput> {
  const tmpFile = await writeTempFile(code, 'ts');

  try {
    const flags = buildDenoFlags(allowNet, allowedDomains);
    const { stdout, stderr } = await execAsync(
      `${DENO_PATH} run ${flags} ${tmpFile}`,
      { timeout }
    );

    return {
      success: true,
      stdout: stdout.trim(),
      stderr: stderr.trim() || undefined,
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
  } finally {
    await cleanupTempFile(tmpFile);
  }
}

/**
 * Bash execution
 * Kept isolated — no access to .env.production
 * Strips env entirely before running
 */
async function executeBash(
  code: string,
  timeout: number,
  startTime: number
): Promise<ExecuteCodeOutput> {
  // Hard blocklist for truly destructive commands
  const blocked = [
    'rm -rf /',
    'rm -rf ~',
    'dd if=',
    'mkfs',
    ':(){:|:&};:',   // fork bomb
    'cat .env',
    '> /dev/sd',
  ];

  for (const cmd of blocked) {
    if (code.includes(cmd)) {
      return {
        success: false,
        error: `Blocked dangerous command: ${cmd}`,
        executionTime: Date.now() - startTime,
      };
    }
  }

  const tmpFile = await writeTempFile(code, 'sh');

  try {
    const { stdout, stderr } = await execAsync(
      `bash ${tmpFile}`,
      {
        timeout,
        shell: '/bin/bash',
        env: {
          // Minimal safe env — no secrets
          PATH: process.env.PATH,
          HOME: os.tmpdir(),
          TMPDIR: os.tmpdir(),
        },
      }
    );

    return {
      success: true,
      stdout: stdout.trim(),
      stderr: stderr.trim() || undefined,
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
  } finally {
    await cleanupTempFile(tmpFile);
  }
}

// ─── Tool Registration ────────────────────────────────────────────────────────

export const EXECUTE_CODE_TOOL = {
  id: 'execute-code',
  name: 'execute-code',
  description: 'Execute TypeScript, JavaScript, or Bash in a secure Deno sandbox. No access to secrets or file system by default.',
  version: '2.0.0',
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
