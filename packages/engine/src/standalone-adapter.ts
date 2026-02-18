/**
 * Standalone Adapter
 * 
 * Runs workflows without Restate - useful for:
 * - Local development
 * - Testing
 * - Simple deployments without durability requirements
 */

import {
  WorkflowDefinition,
  WorkflowExecution,
  StepContext,
  EngineCapabilities,
  WorkflowStatus,
} from './types';

/**
 * In-memory workflow execution for development
 */
export class StandaloneEngine {
  private workflows: Map<string, WorkflowDefinition> = new Map();
  private executions: Map<string, WorkflowExecution> = new Map();

  /**
   * Engine capabilities (limited compared to Restate)
   */
  get capabilities(): EngineCapabilities {
    return {
      durableExecution: false,
      checkpointing: false,
      retries: true, // Basic retry support
      timeouts: true,
      suspendResume: false,
      signaling: false,
    };
  }

  /**
   * Register a workflow
   */
  registerWorkflow<TInput, TOutput>(
    definition: WorkflowDefinition<TInput, TOutput>,
    handler: (input: TInput, ctx: StepContext) => Promise<TOutput>
  ): void {
    if (this.workflows.has(definition.id)) {
      throw new Error(`Workflow ${definition.id} already registered`);
    }

    // Store with handler attached
    const withHandler = {
      ...definition,
      _handler: handler,
    };
    this.workflows.set(definition.id, withHandler as WorkflowDefinition);
  }

  /**
   * Execute a workflow
   */
  async execute<TInput, TOutput>(
    workflowId: string,
    input: TInput,
    options?: {
      executionId?: string;
      tenantId?: string;
      userId?: string;
    }
  ): Promise<WorkflowExecution<TInput, TOutput>> {
    const workflow = this.workflows.get(workflowId) as WorkflowDefinition<TInput, TOutput> & {
      _handler: (input: TInput, ctx: StepContext) => Promise<TOutput>;
    };

    if (!workflow) {
      throw new Error(`Workflow ${workflowId} not found`);
    }

    // Validate input
    const parsed = workflow.inputSchema.safeParse(input);
    if (!parsed.success) {
      throw new Error(`Invalid input: ${parsed.error.message}`);
    }

    const executionId = options?.executionId ?? `exec_${Date.now()}_${Math.random().toString(36).slice(2)}`;
    
    const execution: WorkflowExecution<TInput, TOutput> = {
      id: executionId,
      workflowId,
      status: 'running',
      input: parsed.data,
      startedAt: new Date(),
    };

    this.executions.set(executionId, execution as WorkflowExecution);

    // Create step context
    const ctx = this.createStepContext(executionId, workflowId, options?.tenantId, options?.userId);

    try {
      // Execute with timeout if specified
      let result: TOutput;
      
      if (workflow.timeoutMs) {
        result = await this.withTimeout(
          workflow._handler(parsed.data, ctx),
          workflow.timeoutMs
        );
      } else {
        result = await workflow._handler(parsed.data, ctx);
      }

      // Validate output
      const outputParsed = workflow.outputSchema.safeParse(result);
      if (!outputParsed.success) {
        throw new Error(`Invalid output: ${outputParsed.error.message}`);
      }

      execution.status = 'completed';
      execution.output = outputParsed.data;
      execution.completedAt = new Date();
    } catch (error) {
      execution.status = 'failed';
      execution.error = error instanceof Error ? error.message : String(error);
      execution.completedAt = new Date();
    }

    return execution;
  }

  /**
   * Get execution status
   */
  getExecution<TInput, TOutput>(executionId: string): WorkflowExecution<TInput, TOutput> | undefined {
    return this.executions.get(executionId) as WorkflowExecution<TInput, TOutput> | undefined;
  }

  /**
   * List all executions
   */
  listExecutions(filter?: { workflowId?: string; status?: WorkflowStatus }): WorkflowExecution[] {
    let results = Array.from(this.executions.values());

    if (filter?.workflowId) {
      results = results.filter(e => e.workflowId === filter.workflowId);
    }

    if (filter?.status) {
      results = results.filter(e => e.status === filter.status);
    }

    return results;
  }

  private createStepContext(
    executionId: string,
    workflowId: string,
    tenantId?: string,
    userId?: string
  ): StepContext {
    let stepCounter = 0;

    return {
      executionId,
      workflowId,
      stepId: 'main',
      attempt: 1,
      tenantId,
      userId,

      run: async <T>(name: string, fn: () => Promise<T>): Promise<T> => {
        stepCounter++;
        console.log(`[Standalone] Step ${stepCounter}: ${name}`);
        return fn();
      },

      sleep: async (name: string, ms: number): Promise<void> => {
        console.log(`[Standalone] Sleep ${name}: ${ms}ms`);
        await new Promise(resolve => setTimeout(resolve, ms));
      },

      log: (message: string, data?: Record<string, unknown>): void => {
        console.log(`[${workflowId}] ${message}`, data ?? '');
      },
    };
  }

  private withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
    return Promise.race([
      promise,
      new Promise<T>((_, reject) =>
        setTimeout(() => reject(new Error(`Timeout after ${ms}ms`)), ms)
      ),
    ]);
  }
}

/**
 * Singleton instance
 */
let _engine: StandaloneEngine | null = null;

export function getStandaloneEngine(): StandaloneEngine {
  if (!_engine) {
    _engine = new StandaloneEngine();
  }
  return _engine;
}
