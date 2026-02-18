/**
 * Engine Types
 * 
 * Abstractions for workflow execution that can work with
 * different backends (Restate, Temporal, etc.)
 */

import { z } from 'zod';

/**
 * Workflow definition metadata
 */
export interface WorkflowDefinition<TInput = unknown, TOutput = unknown> {
  id: string;
  name: string;
  version: string;
  description?: string;
  
  // Schema validation
  inputSchema: z.ZodType<TInput>;
  outputSchema: z.ZodType<TOutput>;
  
  // Execution config
  timeoutMs?: number;
  retryPolicy?: RetryPolicy;
  
  // Tags for organization
  tags?: string[];
}

/**
 * Retry policy configuration
 */
export interface RetryPolicy {
  maxAttempts: number;
  initialDelayMs: number;
  maxDelayMs: number;
  backoffMultiplier: number;
}

/**
 * Workflow execution status
 */
export type WorkflowStatus = 
  | 'pending'
  | 'running'
  | 'completed'
  | 'failed'
  | 'cancelled'
  | 'suspended';

/**
 * Workflow execution record
 */
export interface WorkflowExecution<TInput = unknown, TOutput = unknown> {
  id: string;
  workflowId: string;
  status: WorkflowStatus;
  input: TInput;
  output?: TOutput;
  error?: string;
  startedAt: Date;
  completedAt?: Date;
  
  // Checkpoints for resume
  lastCheckpoint?: string;
  checkpointData?: Record<string, unknown>;
}

/**
 * Step definition within a workflow
 */
export interface StepDefinition<TInput = unknown, TOutput = unknown> {
  id: string;
  name: string;
  description?: string;
  
  // Execution
  execute: (input: TInput, ctx: StepContext) => Promise<TOutput>;
  
  // Retry policy (overrides workflow default)
  retryPolicy?: RetryPolicy;
  timeoutMs?: number;
}

/**
 * Context available to steps during execution
 */
export interface StepContext {
  // Execution metadata
  executionId: string;
  workflowId: string;
  stepId: string;
  attempt: number;
  
  // Tenant context
  tenantId?: string;
  userId?: string;
  
  // Durable operations (checkpoint-safe)
  run<T>(name: string, fn: () => Promise<T>): Promise<T>;
  sleep(name: string, ms: number): Promise<void>;
  
  // Logging
  log: (message: string, data?: Record<string, unknown>) => void;
}

/**
 * Engine capabilities
 */
export interface EngineCapabilities {
  durableExecution: boolean;
  checkpointing: boolean;
  retries: boolean;
  timeouts: boolean;
  suspendResume: boolean;
  signaling: boolean;
}
