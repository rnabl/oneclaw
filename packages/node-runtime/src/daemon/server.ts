import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { logger } from 'hono/logger';
import { serveStatic } from '@hono/node-server/serve-static';
import { loadConfig } from '../config';
import { ExecutorRegistry } from '../executors';
import { ReceiptWriter, getConfigSnapshot } from '../receipts';
import type { WorkflowReceipt, StepReceipt } from '../receipts';
import { nanoid } from 'nanoid';

/**
 * Node Daemon HTTP Server
 * Responsibilities:
 * 1. Load config (once)
 * 2. Accept workflow run requests
 * 3. Dispatch to executors
 * 4. Write receipts
 * 5. Provide local control API
 */
export function createDaemonServer() {
  const app = new Hono();
  
  app.use('*', cors());
  app.use('*', logger());
  
  // Serve static files from node-ui/public
  app.use('/static/*', serveStatic({ root: './packages/node-ui/public' }));
  app.use('/*', serveStatic({ root: './packages/node-ui/public' }));
  
  const config = loadConfig();
  const receiptWriter = new ReceiptWriter();
  
  // Health check
  app.get('/health', (c) => {
    return c.json({
      status: 'ok',
      node_id: config.node.id,
      node_name: config.node.name,
      uptime: process.uptime(),
      executors: ExecutorRegistry.list(),
    });
  });
  
  // Execute workflow
  app.post('/run', async (c) => {
    const { workflow_id, inputs } = await c.req.json();
    
    try {
      const receipt = await executeWorkflow(workflow_id, inputs);
      receiptWriter.write(receipt);
      
      return c.json({ receipt });
    } catch (error) {
      return c.json({
        error: error instanceof Error ? error.message : 'Unknown error',
      }, 500);
    }
  });
  
  // Get receipt
  app.get('/receipts/:run_id', (c) => {
    const runId = c.req.param('run_id');
    const receipt = receiptWriter.read(runId);
    
    if (!receipt) {
      return c.json({ error: 'Receipt not found' }, 404);
    }
    
    return c.json({ receipt });
  });
  
  // List receipts
  app.get('/receipts', (c) => {
    const receipts = receiptWriter.list();
    return c.json({ receipts });
  });
  
  // Get config (read-only view)
  app.get('/config', (c) => {
    return c.json({ config });
  });
  
  // Live logs (SSE) - TODO
  app.get('/logs/:run_id', (c) => {
    return c.text('SSE logs coming soon', 501);
  });
  
  return app;
}

/**
 * Execute workflow with full receipt tracking
 */
async function executeWorkflow(
  workflowId: string,
  inputs: Record<string, unknown>
): Promise<WorkflowReceipt> {
  const config = loadConfig();
  const runId = nanoid();
  const startTime = new Date();
  
  // TODO: Load workflow spec from registry
  // For now, hardcode a simple test workflow
  const steps: StepReceipt[] = [];
  
  // Example: Call wallet API to test HTTP executor
  const httpExecutor = ExecutorRegistry.get('http.request');
  
  if (httpExecutor) {
    const stepStart = Date.now();
    const response = await httpExecutor.execute({
      method: 'GET',
      url: `${config.control_plane.url}/api/v1/workflows`,
    });
    
    steps.push({
      step_id: 'test_http',
      executor: 'http.request',
      status: response.status,
      request: {
        executor: 'http.request',
        input: { method: 'GET', url: `${config.control_plane.url}/api/v1/workflows` },
      },
      response,
      duration_ms: Date.now() - stepStart,
      artifacts: [],
    });
  }
  
  const endTime = new Date();
  
  return {
    run_id: runId,
    workflow_id: workflowId,
    node_id: config.node.id,
    started_at: startTime.toISOString(),
    completed_at: endTime.toISOString(),
    status: steps.every(s => s.status === 'executed') ? 'success' : 'failed',
    mode: config.node.environment,
    steps,
    artifacts: [],
    billing: {
      credits_used: 1,
      breakdown: [{ step_id: 'test_http', credits: 1 }],
    },
    debug: {
      config_snapshot: getConfigSnapshot(),
      executor_versions: { 'http.request': '0.1.0' },
      total_duration_ms: endTime.getTime() - startTime.getTime(),
    },
    inputs,
    outputs: {},
  };
}
