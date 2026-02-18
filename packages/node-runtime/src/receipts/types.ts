import type { ExecutorRequest, ExecutorResponse } from '../executors';

/**
 * Step Receipt - What happened in a single step
 */
export interface StepReceipt {
  step_id: string;
  executor: string;
  status: 'executed' | 'denied' | 'failed';
  
  request: ExecutorRequest;
  response: ExecutorResponse;
  
  duration_ms: number;
  artifacts: string[];
}

/**
 * Workflow Receipt - Complete execution trace
 * This is the anti-insanity feature that tells you EXACTLY what happened
 */
export interface WorkflowReceipt {
  run_id: string;
  workflow_id: string;
  node_id: string;
  
  started_at: string;
  completed_at: string;
  status: 'success' | 'failed' | 'partial';
  mode: 'private' | 'managed' | 'hybrid';
  
  steps: StepReceipt[];
  artifacts: string[];
  
  billing: {
    credits_used: number;
    breakdown: Array<{
      step_id: string;
      credits: number;
    }>;
  };
  
  debug: {
    config_snapshot: string;        // Hash of config at run time
    executor_versions: Record<string, string>;
    total_duration_ms: number;
  };
  
  inputs: Record<string, unknown>;
  outputs: Record<string, unknown>;
}
