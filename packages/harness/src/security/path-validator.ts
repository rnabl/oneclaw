/**
 * Path Validation and Security
 * 
 * Provides security guardrails for file system operations to prevent:
 * - Access to system files and directories
 * - Reading secrets or sensitive configuration
 * - Deletion of core daemon code
 * - Path traversal attacks
 */

import path from 'path';
import fs from 'fs';

export interface PathValidationResult {
  allowed: boolean;
  reason?: string;
  normalizedPath?: string;
}

const WORKSPACE_ROOT = path.join(__dirname, '../../oneclaw-workspace');

const ALLOWED_PATHS = [
  WORKSPACE_ROOT,
];

const FORBIDDEN_PATHS = [
  '/daemon/secrets',
  '/daemon/.env',
  '/.env',
  '/daemon/node_modules',
  '/daemon/src/core',
  '/home',
  '/etc',
  '/var',
  '/usr',
  '/root',
  '/bin',
  '/sbin',
  '/sys',
  '/proc',
  '/boot',
];

const FORBIDDEN_PATTERNS = [
  /\.env$/,
  /\.env\./,
  /secrets/i,
  /password/i,
  /token/i,
  /\.key$/,
  /\.pem$/,
  /\.crt$/,
  /id_rsa/,
  /\.ssh/,
  /node_modules/,
  /\.git/,
];

const FORBIDDEN_OPERATIONS_ON_PATHS = [
  '/workspace/packages/harness/src/security',
  '/workspace/packages/harness/src/registry',
  '/workspace/packages/harness/src/execution',
  '/workspace/packages/core',
  '/workspace/packages/engine',
];

export class PathValidator {
  /**
   * Validate that a path is safe for reading
   */
  validateRead(inputPath: string): PathValidationResult {
    return this.validatePath(inputPath, 'read');
  }

  /**
   * Validate that a path is safe for writing
   */
  validateWrite(inputPath: string): PathValidationResult {
    return this.validatePath(inputPath, 'write');
  }

  /**
   * Validate that a path is safe for deletion
   */
  validateDelete(inputPath: string): PathValidationResult {
    const result = this.validatePath(inputPath, 'delete');
    
    if (!result.allowed) {
      return result;
    }

    // Extra checks for deletion
    for (const protectedPath of FORBIDDEN_OPERATIONS_ON_PATHS) {
      if (result.normalizedPath?.startsWith(protectedPath)) {
        return {
          allowed: false,
          reason: `Cannot delete protected system path: ${protectedPath}`,
        };
      }
    }

    return result;
  }

  /**
   * Core path validation logic
   */
  private validatePath(
    inputPath: string,
    operation: 'read' | 'write' | 'delete'
  ): PathValidationResult {
    try {
      // Normalize the path (resolve .., ., etc.)
      let normalizedPath = path.resolve(inputPath);

      // If path is relative, resolve it relative to workspace
      if (!path.isAbsolute(inputPath)) {
        normalizedPath = path.resolve(WORKSPACE_ROOT, inputPath);
      }

      // Check forbidden paths first (highest priority)
      for (const forbidden of FORBIDDEN_PATHS) {
        if (normalizedPath.startsWith(forbidden)) {
          return {
            allowed: false,
            reason: `Access denied: Path is in forbidden directory ${forbidden}`,
          };
        }
      }

      // Check forbidden patterns
      for (const pattern of FORBIDDEN_PATTERNS) {
        if (pattern.test(normalizedPath)) {
          return {
            allowed: false,
            reason: `Access denied: Path matches forbidden pattern ${pattern}`,
          };
        }
      }

      // For write/delete operations, check if it's a protected core path
      if (operation !== 'read') {
        for (const protectedPath of FORBIDDEN_OPERATIONS_ON_PATHS) {
          if (normalizedPath.startsWith(protectedPath)) {
            return {
              allowed: false,
              reason: `Cannot ${operation} protected system path: ${protectedPath}`,
            };
          }
        }
      }

      // Check if path is within allowed workspace
      const isInWorkspace = ALLOWED_PATHS.some(allowed =>
        normalizedPath.startsWith(allowed)
      );

      if (!isInWorkspace) {
        return {
          allowed: false,
          reason: `Access denied: Path must be within workspace (${WORKSPACE_ROOT})`,
        };
      }

      // All checks passed
      return {
        allowed: true,
        normalizedPath,
      };
    } catch (error) {
      return {
        allowed: false,
        reason: `Path validation error: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
  }

  /**
   * Ensure workspace directories exist
   */
  ensureWorkspace(): void {
    const dirs = [
      path.join(WORKSPACE_ROOT, 'code'),
      path.join(WORKSPACE_ROOT, 'data'),
      path.join(WORKSPACE_ROOT, 'logs'),
      path.join(WORKSPACE_ROOT, 'tools'),
    ];

    for (const dir of dirs) {
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
        console.log(`[Security] Created workspace directory: ${dir}`);
      }
    }
  }

  /**
   * Get workspace root path
   */
  getWorkspaceRoot(): string {
    return WORKSPACE_ROOT;
  }
}

export const pathValidator = new PathValidator();
