/**
 * Restate Adapter
 * 
 * Wraps Restate SDK to provide the engine interface.
 * This is the default production backend.
 */

import * as restate from '@restatedev/restate-sdk';
import {
  WorkflowDefinition,
  WorkflowExecution,
  StepContext,
  EngineCapabilities,
} from './types';

/**
 * Restate-backed workflow engine
 */
export class RestateEngine {
  private endpoint: restate.RestateEndpoint;
  private workflows: Map<string, WorkflowDefinition> = new Map();

  constructor() {
    this.endpoint = restate.endpoint();
  }

  /**
   * Engine capabilities
   */
  get capabilities(): EngineCapabilities {
    return {
      durableExecution: true,
      checkpointing: true,
      retries: true,
      timeouts: true,
      suspendResume: true,
      signaling: true,
    };
  }

  /**
   * Register a workflow with its handler
   */
  registerWorkflow<TInput, TOutput>(
    definition: WorkflowDefinition<TInput, TOutput>,
    handler: (ctx: restate.Context, input: TInput) => Promise<TOutput>
  ): void {
    // Validate definition
    if (this.workflows.has(definition.id)) {
      throw new Error(`Workflow ${definition.id} already registered`);
    }

    this.workflows.set(definition.id, definition);

    // Create Restate service
    const service = restate.service({
      name: definition.id,
      handlers: {
        run: async (ctx: restate.Context, input: TInput): Promise<TOutput> => {
          // Validate input
          const parsed = definition.inputSchema.safeParse(input);
          if (!parsed.success) {
            throw new Error(`Invalid input: ${parsed.error.message}`);
          }

          // Execute handler
          const result = await handler(ctx, parsed.data);

          // Validate output
          const outputParsed = definition.outputSchema.safeParse(result);
          if (!outputParsed.success) {
            throw new Error(`Invalid output: ${outputParsed.error.message}`);
          }

          return outputParsed.data;
        },
      },
    });

    this.endpoint.bind(service);
  }

  /**
   * Bind a raw Restate service (for advanced use cases)
   */
  bindService(service: restate.ServiceDefinition<string, object>): void {
    this.endpoint.bind(service);
  }

  /**
   * Start the HTTP server
   */
  listen(port: number = 9080): void {
    this.endpoint.listen(port);
    console.log(`[Engine] Restate server listening on port ${port}`);
    console.log(`[Engine] Registered workflows: ${Array.from(this.workflows.keys()).join(', ')}`);
  }

  /**
   * Create step context from Restate context
   */
  static createStepContext(
    ctx: restate.Context,
    meta: { executionId: string; workflowId: string; stepId: string }
  ): StepContext {
    return {
      executionId: meta.executionId,
      workflowId: meta.workflowId,
      stepId: meta.stepId,
      attempt: 1, // Restate handles retries transparently

      run: async <T>(name: string, fn: () => Promise<T>): Promise<T> => {
        return ctx.run(name, fn);
      },

      sleep: async (name: string, ms: number): Promise<void> => {
        await ctx.sleep(ms);
      },

      log: (message: string, data?: Record<string, unknown>): void => {
        console.log(`[${meta.workflowId}/${meta.stepId}] ${message}`, data ?? '');
      },
    };
  }

  /**
   * Invoke a workflow programmatically
   * (Requires Restate ingress to be running)
   */
  static async invokeWorkflow<TInput, TOutput>(
    workflowId: string,
    input: TInput,
    options?: {
      ingressUrl?: string;
      idempotencyKey?: string;
    }
  ): Promise<TOutput> {
    const ingressUrl = options?.ingressUrl ?? process.env.RESTATE_INGRESS_URL ?? 'http://localhost:8080';
    
    const response = await fetch(`${ingressUrl}/${workflowId}/run`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(options?.idempotencyKey && {
          'idempotency-key': options.idempotencyKey,
        }),
      },
      body: JSON.stringify(input),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Workflow invocation failed: ${error}`);
    }

    return response.json() as Promise<TOutput>;
  }
}

/**
 * Singleton instance
 */
let _engine: RestateEngine | null = null;

export function getEngine(): RestateEngine {
  if (!_engine) {
    _engine = new RestateEngine();
  }
  return _engine;
}

/**
 * Helper to wrap a function as a durable checkpoint
 */
export function checkpoint<T>(
  ctx: restate.Context,
  name: string,
  fn: () => Promise<T>
): Promise<T> {
  return ctx.run(name, fn);
}
