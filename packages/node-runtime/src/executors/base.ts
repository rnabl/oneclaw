import type { z } from 'zod';

/**
 * Executor Request - What the LLM/workflow asks for
 */
export interface ExecutorRequest {
  executor: string;
  input: Record<string, unknown>;
}

/**
 * Executor Response - What actually happened
 * CRITICAL: Only the runtime can set status and denial_reason
 * The LLM cannot fake these fields
 */
export interface ExecutorResponse {
  status: 'executed' | 'denied' | 'failed';
  result?: unknown;
  error?: string;
  
  // Structured denial reason - only set by runtime
  denial_reason?: {
    rule: string;       // e.g., "http.allowed_domains"
    attempted: string;  // What was attempted
    policy: string;     // Policy that blocked it
  };
  
  duration_ms: number;
  stdout?: string;
  stderr?: string;
}

/**
 * Base class for all executors
 * Enforces contract-based execution
 */
export abstract class ExecutorBase {
  abstract readonly name: string;
  abstract readonly schema: z.ZodObject<any>;
  
  /**
   * Execute the request
   * Must return structured response (no exceptions for execution errors)
   */
  abstract execute(input: unknown): Promise<ExecutorResponse>;
  
  /**
   * Helper to create denial responses
   * This ensures consistent denial format across all executors
   */
  protected deny(rule: string, attempted: string, policy: string): ExecutorResponse {
    return {
      status: 'denied',
      denial_reason: {
        rule,
        attempted,
        policy,
      },
      duration_ms: 0,
    };
  }
  
  /**
   * Helper to create success responses
   */
  protected success(result: unknown, duration_ms: number, stdout?: string): ExecutorResponse {
    return {
      status: 'executed',
      result,
      duration_ms,
      stdout,
    };
  }
  
  /**
   * Helper to create failure responses
   */
  protected fail(error: string, duration_ms: number, stderr?: string): ExecutorResponse {
    return {
      status: 'failed',
      error,
      duration_ms,
      stderr,
    };
  }
}
