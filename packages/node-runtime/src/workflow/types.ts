// Workflow Specification Format
// Versioned YAML format for OneClaw workflows

/**
 * Workflow definition - top level
 */
export interface WorkflowSpec {
  version: '1.0';
  id: string;
  name: string;
  description: string;
  
  inputs: Record<string, InputSpec>;
  outputs: Record<string, OutputSpec>;
  
  steps: StepSpec[];
  
  // Metadata
  metadata: {
    author?: string;
    tags?: string[];
    category?: string;
  };
}

/**
 * Input specification
 */
export interface InputSpec {
  type: 'string' | 'number' | 'boolean' | 'object' | 'array';
  description: string;
  required: boolean;
  default?: unknown;
  validation?: {
    min?: number;
    max?: number;
    pattern?: string;
  };
}

/**
 * Output specification
 */
export interface OutputSpec {
  type: 'string' | 'number' | 'boolean' | 'object' | 'array';
  description: string;
}

/**
 * Step specification - what to execute
 */
export interface StepSpec {
  id: string;
  name: string;
  executor: string;
  
  input: Record<string, unknown>;
  
  // References to previous step outputs
  uses?: Record<string, string>;
  
  // Continue on error?
  continue_on_error?: boolean;
  
  // Retry configuration
  retry?: {
    max_attempts: number;
    backoff_ms: number;
  };
}
