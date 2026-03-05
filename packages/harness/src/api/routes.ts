/**
 * Harness API Routes
 * 
 * HTTP API for executing workflows, managing secrets, and viewing jobs.
 */

import { Hono } from 'hono';
import { registry } from '../registry';
import { vault, deriveKey, tenantSalt } from '../secrets';
import { policyEngine } from '../policy';
import { runner } from '../execution';
import { meteringTracker } from '../metering';
import { artifactStore } from '../artifacts';
import { redactSecrets } from '../utils/redact';
import { workflowExecutor } from '../workflows/templates/executor';
import { scheduleStore, parseSchedule } from '../scheduler';
import { schedulerHeartbeat } from '../scheduler/heartbeat';
import { agentMonitor } from '../agents/log-monitor';
import { spawn, execSync } from 'child_process';
import { join, resolve } from 'path';
import { createGmailClient } from '../gmail/client';
import { getHarnessUrl, getOAuthRedirectUri, isProduction, getEnvironment } from '../utils/env';

// Import workflows to register them
import '../workflows';

const app = new Hono();

// Simple in-memory session store for ephemeral tokens
const sessionStore = new Map<string, { tenantId: string; expiresAt: number; purpose: string }>();

// =============================================================================
// HEALTH & INFO
// =============================================================================

app.get('/', (c) => {
  return c.json({
    name: 'OneClaw Harness',
    version: '0.1.0',
    description: 'Durable, policy-enforced execution runtime for AI agent workflows',
  });
});

app.get('/health', (c) => {
  return c.json({ 
    status: 'healthy',
    timestamp: new Date().toISOString(),
    scheduler: {
      running: schedulerHeartbeat.isRunning(),
      activeWorkflows: schedulerHeartbeat.getActiveCount(),
    },
    environment: process.env.NODE_ENV || 'development',
  });
});

// =============================================================================
// TOOL REGISTRY
// =============================================================================

app.get('/tools', (c) => {
  const tools = registry.list().map(t => {
    // Convert Zod schema to JSON Schema for LLM consumption
    let paramsSchema;
    try {
      // For Zod schemas, we can use zodToJsonSchema or manual conversion
      // For now, we'll use a simplified manual approach
      paramsSchema = t.inputSchema && typeof t.inputSchema.shape === 'object' 
        ? zodShapeToJsonSchema(t.inputSchema.shape)
        : undefined;
    } catch (e) {
      paramsSchema = undefined;
    }
    
    return {
      id: t.id,
      name: t.name,
      description: t.description,
      version: t.version,
      costClass: t.costClass,
      estimatedCostUsd: t.estimatedCostUsd,
      requiredSecrets: t.requiredSecrets,
      tags: t.tags,
      paramsSchema, // NEW: JSON Schema for LLM structured output
    };
  });
  
  return c.json({ tools });
});

// =============================================================================
// WORKFLOW REGISTRY (NEW - For LLM Discovery)
// =============================================================================

app.get('/workflows', (c) => {
  const { WORKFLOW_REGISTRY, suggestWorkflows } = require('../workflows/registry');
  
  // Get query param for intent-based filtering
  const intent = c.req.query('intent');
  
  let workflows = Object.values(WORKFLOW_REGISTRY);
  
  // Filter by intent if provided
  if (intent) {
    workflows = suggestWorkflows(intent);
  }
  
  // Filter by category if provided
  const category = c.req.query('category');
  if (category) {
    workflows = workflows.filter((w: any) => w.category === category);
  }
  
  return c.json({ 
    workflows,
    count: workflows.length,
    help: {
      intent: 'Use ?intent=<query> to get workflow suggestions (e.g., ?intent=hiring)',
      category: 'Use ?category=<type> to filter by category (discovery, enrichment, outreach, analysis)',
    },
  });
});

// Get specific workflow details
app.get('/workflows/:id', (c) => {
  const { WORKFLOW_REGISTRY } = require('../workflows/registry');
  const workflowId = c.req.param('id');
  const workflow = WORKFLOW_REGISTRY[workflowId];
  
  if (!workflow) {
    return c.json({ error: 'Workflow not found' }, 404);
  }
  
  return c.json({ workflow });
});

// Helper to convert Zod shape to simple JSON Schema
function zodShapeToJsonSchema(shape: any): any {
  if (!shape) return {};
  
  const properties: any = {};
  const required: string[] = [];
  
  for (const [key, zodType] of Object.entries(shape as any)) {
    const type = zodType as any;
    
    // Basic type inference
    let jsonType = 'string';
    let description = type._def?.description;
    
    if (type._def?.typeName === 'ZodString') jsonType = 'string';
    else if (type._def?.typeName === 'ZodNumber') jsonType = 'number';
    else if (type._def?.typeName === 'ZodBoolean') jsonType = 'boolean';
    else if (type._def?.typeName === 'ZodArray') jsonType = 'array';
    else if (type._def?.typeName === 'ZodObject') jsonType = 'object';
    else if (type._def?.typeName === 'ZodEnum') {
      jsonType = 'string';
      properties[key] = {
        type: jsonType,
        enum: type._def?.values || [],
        description,
      };
      continue;
    }
    
    properties[key] = { type: jsonType };
    if (description) properties[key].description = description;
    
    // Check if required (not optional)
    if (!type.isOptional?.() && !type._def?.defaultValue) {
      required.push(key);
    }
  }
  
  return {
    type: 'object',
    properties,
    required: required.length > 0 ? required : undefined,
  };
}

app.get('/tools/:id', (c) => {
  const tool = registry.get(c.req.param('id'));
  if (!tool) {
    return c.json({ error: 'Tool not found' }, 404);
  }
  return c.json({ tool });
});

/**
 * Execute a tool directly
 * POST /tools/:id/execute
 * Body: { input, tenantId }
 * 
 * If tool has a handler, use it directly.
 * If tool has no handler but is a registered workflow, run it through the runner.
 */
app.post('/tools/:id/execute', async (c) => {
  try {
    const toolId = c.req.param('id');
    const tool = registry.get(toolId);
    
    if (!tool) {
      return c.json({ error: `Tool not found: ${toolId}` }, 404);
    }
    
    const body = await c.req.json();
    const { input, tenantId = 'default' } = body;
    
    // Validate input against tool schema if validation exists
    let validatedInput = input || {};
    try {
      const validation = registry.validateInput(toolId, input);
      if (validation.success) {
        validatedInput = validation.data;
      }
    } catch (e) {
      // Skip validation if schema doesn't match input structure
      console.log(`[Tool Execute] Skipping validation for ${toolId}:`, e);
    }
    
    // Option 1: Tool has a direct handler - use it
    if (tool.handler) {
      const result = await tool.handler(validatedInput, { tenantId });
      return c.json({ 
        success: true,
        result 
      });
    }
    
    // Option 2: Tool is a registered workflow - run through runner
    const { runner } = await import('../execution/runner');
    const hasWorkflow = runner.hasWorkflow(toolId);
    
    if (hasWorkflow) {
      console.log(`[Tool Execute] Running ${toolId} as workflow`);
      const job = await runner.execute(toolId, validatedInput, {
        tenantId,
        tier: 'pro', // Allow access to all tools
        secrets: {},
      });
      
      if (job.status === 'completed') {
        return c.json({
          success: true,
          result: job.output,
          steps_completed: job.logs
            ?.filter((log: any) => log.level === 'info' && log.step)
            ?.map((log: any) => `${log.step}: ${log.message}`),
        });
      } else if (job.error) {
        return c.json({ error: job.error }, 500);
      }
      
      return c.json({ success: true, result: job });
    }
    
    // Option 3: Neither handler nor workflow - error
    return c.json({ 
      error: `Tool ${toolId} has no handler and no registered workflow` 
    }, 500);
    
  } catch (error) {
    console.error('Tool execution error:', error);
    return c.json({ 
      error: error instanceof Error ? error.message : 'Unknown error' 
    }, 500);
  }
});

// =============================================================================
// SECRETS MANAGEMENT
// =============================================================================

/**
 * Store a secret
 * POST /secrets
 * Body: { tenantId, password, provider, secret, scopes?, expiresInMs? }
 */
app.post('/secrets', async (c) => {
  try {
    const body = await c.req.json();
    const { tenantId, password, provider, secret, scopes, expiresInMs } = body;
    
    if (!tenantId || !password || !provider || !secret) {
      return c.json({ error: 'Missing required fields' }, 400);
    }
    
    // Derive key from password
    const salt = tenantSalt(tenantId, process.env.HARNESS_PEPPER || 'iclaw-harness');
    const masterKey = deriveKey(password, salt);
    
    // Store secret
    await vault.store(tenantId, masterKey, {
      provider,
      plaintext: secret,
      scopes,
      expiresAt: expiresInMs ? new Date(Date.now() + expiresInMs) : undefined,
    });
    
    return c.json({ success: true });
    
  } catch (error) {
    return c.json({ error: redactSecrets(String(error)) }, 500);
  }
});

/**
 * Create session key (unlock vault for time period)
 * POST /secrets/session
 * Body: { tenantId, password, expiresInMs? }
 */
app.post('/secrets/session', async (c) => {
  try {
    const body = await c.req.json();
    const { tenantId, password, expiresInMs = 3600000 } = body;
    
    if (!tenantId || !password) {
      return c.json({ error: 'Missing required fields' }, 400);
    }
    
    const { sessionKey, expiresAt } = await vault.createSessionKey(
      tenantId,
      password,
      expiresInMs
    );
    
    return c.json({ sessionKey, expiresAt });
    
  } catch (error) {
    return c.json({ error: redactSecrets(String(error)) }, 500);
  }
});

/**
 * List secrets (metadata only)
 * GET /secrets?tenantId=xxx
 */
app.get('/secrets', async (c) => {
  const tenantId = c.req.query('tenantId');
  if (!tenantId) {
    return c.json({ error: 'Missing tenantId' }, 400);
  }
  
  const secrets = await vault.list(tenantId);
  return c.json({ secrets });
});

// =============================================================================
// JOB EXECUTION
// =============================================================================

/**
 * Execute a workflow or tool
 * POST /execute
 * Body (workflow): { workflowId, input, tenantId, tier?, sessionKey?, dryRun?, webhookUrl? }
 * Body (tool): { tool, params, context? }
 */
app.post('/execute', async (c) => {
  try {
    const body = await c.req.json();
    
    // Check if this is a direct tool call (from sub-agent)
    if (body.tool) {
      const { tool, params } = body;
      const authHeader = c.req.header('Authorization');
      const tenantId = c.req.header('X-Tenant-Id');
      
      // Validate ephemeral token
      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return c.json({ error: 'Missing or invalid authorization' }, 401);
      }
      
      const token = authHeader.substring(7);
      const session = sessionStore.get(token);
      
      if (!session) {
        return c.json({ error: 'Invalid or expired token' }, 401);
      }
      
      if (session.expiresAt < Date.now()) {
        sessionStore.delete(token);
        return c.json({ error: 'Token expired' }, 401);
      }
      
      // Execute the tool
      const toolInstance = registry.get(tool);
      if (!toolInstance) {
        return c.json({ error: `Tool not found: ${tool}` }, 404);
      }

      // Check if tool has a direct handler (like send-gmail)
      if ('handler' in toolInstance && typeof toolInstance.handler === 'function') {
        // Direct tool execution
        try {
          const result = await (toolInstance as any).handler(params, {
            tenantId: tenantId || session.tenantId,
            sessionKey: token,
          });
          return c.json(result);
        } catch (error) {
          return c.json({ error: String(error) }, 500);
        }
      }

      // Otherwise, execute via workflow runner (for workflows like discover-businesses)
      try {
        const job = await runner.execute(tool, params, {
          tenantId: tenantId || session.tenantId,
          sessionKey: token,
          tier: 'free'
        });

        if (job.status === 'completed') {
          return c.json(job.output);
        } else if (job.error) {
          return c.json({ error: job.error }, 500);
        } else {
          return c.json({ error: `Workflow failed with status: ${job.status}` }, 500);
        }
      } catch (error) {
        return c.json({ error: String(error) }, 500);
      }
    }
    
    // Original workflow execution logic
    const { workflowId, input, tenantId, tier, sessionKey, dryRun, webhookUrl } = body;

    if (!workflowId || !input || !tenantId) {
      return c.json({ error: 'Missing required fields: workflowId, input, tenantId' }, 400);
    }

    const job = await runner.execute(workflowId, input, {
      tenantId,
      tier: tier || 'free',
      sessionKey,
      dryRun,
      webhookUrl,
    });

    return c.json({
      jobId: job.id,
      status: job.status,
      output: job.output,
      error: job.error,
      cost: job.actualCostUsd,
      // NEW: Include execution summary
      steps_completed: job.logs
        .filter(log => log.level === 'info' && log.step)
        .map(log => `${log.step}: ${log.message}`),
      total_steps: job.totalSteps,
      elapsed_ms: job.completedAt && job.startedAt 
        ? job.completedAt.getTime() - job.startedAt.getTime() 
        : 0,
    });

  } catch (error) {
    return c.json({ error: redactSecrets(String(error)) }, 500);
  }
});

/**
 * Get job status
 * GET /jobs/:id?tenantId=xxx
 */
app.get('/jobs/:id', (c) => {
  const jobId = c.req.param('id');
  const requestedTenantId = c.req.query('tenantId');
  
  const job = runner.getJob(jobId);
  if (!job) {
    return c.json({ error: 'Job not found' }, 404);
  }
  
  // Tenant validation: Ensure the requester owns this job
  if (requestedTenantId && job.tenantId !== requestedTenantId) {
    return c.json({ error: 'Unauthorized: Job belongs to different tenant' }, 403);
  }
  
  return c.json({ job });
});

/**
 * Get job status (lightweight for polling)
 * GET /jobs/:id/status
 */
app.get('/jobs/:id/status', (c) => {
  const jobId = c.req.param('id');
  const job = runner.getJob(jobId);
  
  if (!job) {
    return c.json({ error: 'Job not found' }, 404);
  }
  
  return c.json({
    jobId: job.id,
    workflowId: job.workflowId,
    status: job.status,
    currentStep: job.currentStep,
    totalSteps: job.totalSteps,
    stepName: job.stepName,
    progress: job.totalSteps > 0 ? Math.round((job.currentStep / job.totalSteps) * 100) : 0,
    output: job.status === 'completed' ? job.output : undefined,
    error: job.status === 'failed' ? job.error : undefined,
    elapsedMs: job.startedAt ? Date.now() - job.startedAt.getTime() : 0,
    // Include last 3 log entries for context
    recentLogs: job.logs.slice(-3).map(log => ({
      timestamp: log.timestamp,
      level: log.level,
      message: log.message,
    })),
  });
});

/**
 * List jobs for tenant
 * GET /jobs?tenantId=xxx&limit=50
 */
app.get('/jobs', (c) => {
  const tenantId = c.req.query('tenantId');
  const limit = parseInt(c.req.query('limit') || '50');
  
  if (!tenantId) {
    return c.json({ error: 'Missing tenantId' }, 400);
  }
  
  const jobs = runner.listJobs(tenantId, limit);
  return c.json({ jobs });
});

/**
 * Cancel a job
 * POST /jobs/:id/cancel
 * Body: { tenantId }
 */
app.post('/jobs/:id/cancel', async (c) => {
  const jobId = c.req.param('id');
  const body = await c.req.json();
  const requestedTenantId = body?.tenantId;
  
  const job = runner.getJob(jobId);
  if (!job) {
    return c.json({ error: 'Job not found' }, 404);
  }
  
  // Tenant validation
  if (requestedTenantId && job.tenantId !== requestedTenantId) {
    return c.json({ error: 'Unauthorized: Job belongs to different tenant' }, 403);
  }
  
  const success = runner.cancelJob(jobId);
  return c.json({ success });
});

// =============================================================================
// AUTONOMOUS JOB SYSTEM
// =============================================================================

/**
 * Create and execute a multi-step autonomous job
 * POST /jobs/execute
 * Body: { userId, description, plan: JobStep[] }
 */
app.post('/jobs/execute', async (c) => {
  try {
    const { getDatabase } = await import('../database');
    const db = getDatabase();
    const body = await c.req.json();
    const { userId, description, plan } = body;

    if (!userId || !description || !plan || !Array.isArray(plan)) {
      return c.json({ error: 'Missing required fields: userId, description, plan' }, 400);
    }

    // Create job in SQLite
    const job = db.createJob({ userId, description, plan });

    // Start async execution (don't block response)
    executeJobAsync(job.id, db);

    return c.json({
      jobId: job.id,
      status: job.status,
      totalSteps: job.totalSteps,
    });
  } catch (error) {
    return c.json({ error: redactSecrets(String(error)) }, 500);
  }
});

/**
 * Get autonomous job status (lightweight for polling)
 * GET /autonomous-jobs/:id/status
 */
app.get('/autonomous-jobs/:id/status', async (c) => {
  try {
    const { getDatabase } = await import('../database');
    const db = getDatabase();
    const jobId = c.req.param('id');

    const job = db.getJob(jobId);
    if (!job) {
      return c.json({ error: 'Job not found' }, 404);
    }

    return c.json({
      jobId: job.id,
      status: job.status,
      currentStep: job.currentStep,
      totalSteps: job.totalSteps,
      steps: job.plan.map(step => ({
        id: step.id,
        order: step.order,
        action: step.action,
        status: step.status,
        result: step.result,
      })),
      error: job.error,
      elapsedMs: Date.now() - job.startedAt.getTime(),
    });
  } catch (error) {
    return c.json({ error: redactSecrets(String(error)) }, 500);
  }
});

/**
 * Get autonomous job results
 * GET /autonomous-jobs/:id/results
 */
app.get('/autonomous-jobs/:id/results', async (c) => {
  try {
    const { getDatabase } = await import('../database');
    const db = getDatabase();
    const jobId = c.req.param('id');

    const job = db.getJob(jobId);
    if (!job) {
      return c.json({ error: 'Job not found' }, 404);
    }

    const businesses = db.getBusinessesByJob(jobId);
    const contacts = db.getContactsByJob(jobId);
    const logs = db.getLogsByJob(jobId, 50);

    return c.json({
      job: {
        id: job.id,
        description: job.description,
        status: job.status,
        startedAt: job.startedAt,
        completedAt: job.completedAt,
      },
      businesses,
      contacts,
      logs,
    });
  } catch (error) {
    return c.json({ error: redactSecrets(String(error)) }, 500);
  }
});

/**
 * List autonomous jobs for user
 * GET /autonomous-jobs?userId=xxx&limit=50
 */
app.get('/autonomous-jobs', async (c) => {
  try {
    const { getDatabase } = await import('../database');
    const db = getDatabase();
    const userId = c.req.query('userId');
    const limit = parseInt(c.req.query('limit') || '50');

    if (!userId) {
      return c.json({ error: 'Missing userId' }, 400);
    }

    const jobs = db.getJobsByUser(userId, limit);
    return c.json({ jobs });
  } catch (error) {
    return c.json({ error: redactSecrets(String(error)) }, 500);
  }
});

/**
 * Search businesses across all jobs
 * GET /autonomous-jobs/search/businesses?userId=xxx&query=xxx
 */
app.get('/autonomous-jobs/search/businesses', async (c) => {
  try {
    const { getDatabase } = await import('../database');
    const db = getDatabase();
    const userId = c.req.query('userId');
    const query = c.req.query('query');
    const limit = parseInt(c.req.query('limit') || '50');

    if (!userId || !query) {
      return c.json({ error: 'Missing userId or query' }, 400);
    }

    const businesses = db.searchBusinesses(userId, query, limit);
    return c.json({ businesses });
  } catch (error) {
    return c.json({ error: redactSecrets(String(error)) }, 500);
  }
});

/**
 * Cancel an autonomous job
 * POST /autonomous-jobs/:id/cancel
 */
app.post('/autonomous-jobs/:id/cancel', async (c) => {
  try {
    const { getDatabase } = await import('../database');
    const db = getDatabase();
    const jobId = c.req.param('id');

    const job = db.updateJobStatus(jobId, 'cancelled');
    if (!job) {
      return c.json({ error: 'Job not found' }, 404);
    }

    return c.json({ success: true, job });
  } catch (error) {
    return c.json({ error: redactSecrets(String(error)) }, 500);
  }
});

// =============================================================================
// AUTONOMOUS JOB HISTORY QUERY TOOLS
// =============================================================================

/**
 * Query tool: Get a specific job's results
 * This is callable by the LLM via the tool registry
 */
async function tool_get_job(params: { jobId: string; userId: string }) {
  const { getDatabase } = await import('../database');
  const db = getDatabase();
  
  const job = db.getJob(params.jobId);
  if (!job || job.userId !== params.userId) {
    return { error: 'Job not found or access denied' };
  }
  
  const businesses = db.getBusinessesByJob(params.jobId);
  const contacts = db.getContactsByJob(params.jobId);
  
  return {
    job: {
      id: job.id,
      description: job.description,
      status: job.status,
      startedAt: job.startedAt,
      completedAt: job.completedAt,
    },
    businesses: businesses.slice(0, 20), // Limit for LLM context
    contacts: contacts.slice(0, 20),
    totalBusinesses: businesses.length,
    totalContacts: contacts.length,
  };
}

/**
 * Query tool: List user's job history
 */
async function tool_list_jobs(params: { userId: string; limit?: number }) {
  const { getDatabase } = await import('../database');
  const db = getDatabase();
  
  const jobs = db.getJobsByUser(params.userId, params.limit || 20);
  
  return {
    jobs: jobs.map(j => ({
      id: j.id,
      description: j.description,
      status: j.status,
      totalSteps: j.totalSteps,
      startedAt: j.startedAt,
      completedAt: j.completedAt,
    })),
  };
}

/**
 * Query tool: Search businesses across all jobs
 */
async function tool_search_businesses(params: { userId: string; query: string; limit?: number }) {
  const { getDatabase } = await import('../database');
  const db = getDatabase();
  
  const businesses = db.searchBusinesses(params.userId, params.query, params.limit || 50);
  
  return {
    businesses: businesses.map(b => ({
      name: b.name,
      address: b.address,
      city: b.city,
      state: b.state,
      phone: b.phone,
      website: b.website,
      rating: b.rating,
      reviewCount: b.reviewCount,
    })),
    total: businesses.length,
  };
}

// Register these as callable tools (daemon will fetch via /tools endpoint)
// Note: These are exported for the daemon to discover and use

/**
 * Helper function to execute job asynchronously
 * This runs in the background and updates the database as it progresses
 */
async function executeJobAsync(jobId: string, db: any) {
  try {
    // Mark job as running
    db.updateJobStatus(jobId, 'running');
    db.addLog({
      jobId,
      level: 'info',
      message: 'Job execution started',
    });

    const job = db.getJob(jobId);
    if (!job) {
      throw new Error('Job not found');
    }

    // Execute each step in the plan
    const stepResults: any[] = []; // Store results from previous steps
    
    for (let i = 0; i < job.plan.length; i++) {
      const step = job.plan[i];

      // Update step status
      step.status = 'running';
      step.startedAt = new Date();
      db.updateJob(jobId, { plan: job.plan });
      db.addLog({
        jobId,
        level: 'info',
        step: step.order,
        message: `Executing step ${step.order}: ${step.action}`,
      });

      try {
        // Resolve any placeholders in params (e.g., "{{from_step_1}}")
        const resolvedParams = resolveStepParams(step.params, stepResults);
        
        // Execute the step based on action type
        const result = await executeStep(step, db, jobId, resolvedParams, stepResults);
        
        // Store result for next steps
        stepResults.push(result);
        
        // Update step as completed
        step.status = 'completed';
        step.completedAt = new Date();
        step.result = result;
        db.updateJob(jobId, { plan: job.plan });
        db.advanceJobStep(jobId);
        
        db.addLog({
          jobId,
          level: 'info',
          step: step.order,
          message: `Step ${step.order} completed successfully`,
        });

      } catch (error) {
        // Step failed
        step.status = 'failed';
        step.error = String(error);
        step.completedAt = new Date();
        db.updateJob(jobId, { plan: job.plan });
        
        db.addLog({
          jobId,
          level: 'error',
          step: step.order,
          message: `Step ${step.order} failed: ${error}`,
        });

        throw error; // Stop execution on first error
      }
    }

    // All steps completed successfully
    db.updateJobStatus(jobId, 'completed');
    db.addLog({
      jobId,
      level: 'info',
      message: 'Job completed successfully',
    });

  } catch (error) {
    // Job failed
    db.updateJobStatus(jobId, 'failed', String(error));
    db.addLog({
      jobId,
      level: 'error',
      message: `Job failed: ${error}`,
    });
  }
}

/**
 * Resolve placeholder references in step params
 * e.g., "{{from_step_1}}" -> actual data from previous step
 */
function resolveStepParams(params: any, previousResults: any[]): any {
  const resolved = JSON.parse(JSON.stringify(params)); // Deep clone
  
  // Look for placeholder patterns like "{{from_step_N}}"
  function resolvePlaceholders(obj: any): any {
    if (typeof obj === 'string') {
      const match = obj.match(/\{\{from_step_(\d+)\}\}/);
      if (match) {
        const stepIndex = parseInt(match[1]) - 1;
        if (stepIndex >= 0 && stepIndex < previousResults.length) {
          return previousResults[stepIndex];
        }
      }
      return obj;
    }
    
    if (Array.isArray(obj)) {
      return obj.map(resolvePlaceholders);
    }
    
    if (obj && typeof obj === 'object') {
      const result: any = {};
      for (const key in obj) {
        result[key] = resolvePlaceholders(obj[key]);
      }
      return result;
    }
    
    return obj;
  }
  
  return resolvePlaceholders(resolved);
}

/**
 * Execute a single job step
 * Maps step actions to actual workflow execution
 */
async function executeStep(
  step: any, 
  db: any, 
  jobId: string, 
  resolvedParams: any,
  previousResults: any[] = []
) {
  const { action } = step;

  // Map actions to workflow IDs
  const workflowMap: Record<string, string> = {
    discover: 'discover-businesses',
    enrich: 'enrich-contact',
    audit: 'audit-website',
    analyze: 'analyze-business',
  };

  const workflowId = workflowMap[action];
  if (!workflowId) {
    throw new Error(`Unknown action: ${action}`);
  }

  // Special handling for enrich action with businesses from previous step
  if (action === 'enrich' && resolvedParams?.businesses) {
    // Get businesses from database that were stored in previous discover step
    const businesses = db.getBusinessesByJob(jobId);
    
    if (!businesses || businesses.length === 0) {
      throw new Error('No businesses found to enrich');
    }
    
    const enrichResults = [];
    
    // Enrich each business with contact info
    for (const business of businesses) {
      if (!business.website) {
        db.addLog({
          jobId,
          level: 'warn',
          message: `Skipping ${business.name} - no website`,
        });
        continue;
      }
      
      try {
        const enrichJob = await runner.execute(workflowId, {
          url: business.website,
          businessName: business.name,
          city: business.city,
          state: business.state,
        }, {
          tenantId: 'autonomous-system',
          tier: 'free',
        });
        
        if (enrichJob.status === 'completed' && enrichJob.output) {
          enrichResults.push({
            businessId: business.id,
            businessName: business.name,
            ...enrichJob.output,
          });
          
          // Store contact in database
          if (enrichJob.output.owner_name || enrichJob.output.owner_email) {
            db.createContacts([{
              businessId: business.id,
              name: enrichJob.output.owner_name || 'Unknown',
              email: enrichJob.output.owner_email || null,
              phone: enrichJob.output.owner_phone || business.phone,
              role: 'Owner/Decision Maker',
              source: enrichJob.output.source || 'unknown',
              confidence: enrichJob.output.confidence || 50,
              metadata: enrichJob.output,
            }]);
          }
        }
      } catch (error) {
        db.addLog({
          jobId,
          level: 'warn',
          message: `Failed to enrich ${business.name}: ${error}`,
        });
      }
    }
    
    return { 
      contacts: enrichResults, 
      businessCount: businesses.length,
      enrichedCount: enrichResults.length,
    };
  }

  // Execute via existing runner (for standard single-execution workflows)
  const job = await runner.execute(workflowId, resolvedParams, {
    tenantId: 'autonomous-system',
    tier: 'free',
  });

  if (job.status === 'completed') {
    // Store businesses if this is a discovery step
    if (action === 'discover' && job.output?.businesses) {
      const businesses = (job.output.businesses as any[]).map((b: any) => ({
        jobId,
        name: b.title || b.name,
        address: b.address,
        city: b.city,
        state: b.state,
        zipCode: b.zip_code,
        phone: b.phone,
        website: b.website,
        rating: b.rating,
        reviewCount: b.review_count,
        googleMapsUrl: b.url,
        placeId: b.place_id,
        metadata: b,
      }));
      
      db.createBusinesses(businesses);
    }

    return job.output;
  } else {
    throw new Error(job.error || `Workflow ${workflowId} failed`);
  }
}

/**
 * Switch execution method for a running job
 * POST /jobs/:id/switch-method
 * Body: { method, reason }
 */
app.post('/jobs/:id/switch-method', async (c) => {
  try {
    const jobId = c.req.param('id');
    const body = await c.req.json();
    const { method, reason } = body;
    
    if (!method) {
      return c.json({ error: 'Missing method' }, 400);
    }
    
    const success = runner.switchMethod(jobId, method, reason || 'External request');
    return c.json({ success, method });
  } catch (error) {
    return c.json({ error: redactSecrets(String(error)) }, 500);
  }
});

/**
 * Get job logs (polling endpoint)
 * GET /jobs/:id/logs?since=ISO_DATE&tenantId=xxx
 */
app.get('/jobs/:id/logs', (c) => {
  const jobId = c.req.param('id');
  const sinceParam = c.req.query('since');
  const requestedTenantId = c.req.query('tenantId');
  const since = sinceParam ? new Date(sinceParam) : new Date(0);
  
  const job = runner.getJob(jobId);
  if (!job) {
    return c.json({ error: 'Job not found' }, 404);
  }
  
  // Tenant validation
  if (requestedTenantId && job.tenantId !== requestedTenantId) {
    return c.json({ error: 'Unauthorized: Job belongs to different tenant' }, 403);
  }
  
  const logs = runner.getLogsSince(jobId, since);

  // Short, user-friendly progress summaries for UI.
  const milestones = logs
    .filter(l => l.level !== 'debug')
    .map(l => ({
      timestamp: l.timestamp,
      level: l.level,
      step: l.step,
      summary: l.message,
    }));
  
  return c.json({ 
    logs,
    milestones,
    status: job?.status,
    currentStep: job?.stepName,
    progress: job ? (job.currentStep / job.totalSteps) : 0,
  });
});

/**
 * Stream job logs (SSE endpoint)
 * GET /jobs/:id/stream?tenantId=xxx
 */
app.get('/jobs/:id/stream', async (c) => {
  const jobId = c.req.param('id');
  const requestedTenantId = c.req.query('tenantId');
  const job = runner.getJob(jobId);
  
  if (!job) {
    return c.json({ error: 'Job not found' }, 404);
  }
  
  // Tenant validation
  if (requestedTenantId && job.tenantId !== requestedTenantId) {
    return c.json({ error: 'Unauthorized: Job belongs to different tenant' }, 403);
  }
  
  // Set SSE headers
  c.header('Content-Type', 'text/event-stream');
  c.header('Cache-Control', 'no-cache');
  c.header('Connection', 'keep-alive');
  
  // Create a readable stream for SSE
  const stream = new ReadableStream({
    async start(controller) {
      let lastCheck = new Date(0);
      let iteration = 0;
      const maxIterations = 600; // 10 minutes at 1s intervals
      
      const sendEvent = (data: unknown) => {
        controller.enqueue(new TextEncoder().encode(`data: ${JSON.stringify(data)}\n\n`));
      };
      
      // Initial status
      sendEvent({
        type: 'status',
        status: job.status,
        stepName: job.stepName,
        progress: job.currentStep / job.totalSteps,
      });
      
      // Poll for updates
      while (iteration < maxIterations) {
        const currentJob = runner.getJob(jobId);
        if (!currentJob) break;
        
        // Send new logs
        const newLogs = runner.getLogsSince(jobId, lastCheck);
        for (const log of newLogs) {
          sendEvent({
            type: 'log',
            ...log,
            timestamp: log.timestamp.toISOString(),
          });
        }
        
        if (newLogs.length > 0) {
          lastCheck = newLogs[newLogs.length - 1].timestamp;
        }
        
        // Check for completion
        if (['completed', 'failed', 'cancelled'].includes(currentJob.status)) {
          sendEvent({
            type: 'complete',
            status: currentJob.status,
            output: currentJob.output,
            error: currentJob.error,
            cost: currentJob.actualCostUsd,
          });
          break;
        }
        
        // Wait before next poll
        await new Promise(resolve => setTimeout(resolve, 1000));
        iteration++;
      }
      
      controller.close();
    },
  });
  
  return new Response(stream);
});

// =============================================================================
// METERING & USAGE
// =============================================================================

/**
 * Get job cost breakdown
 * GET /jobs/:id/cost
 */
app.get('/jobs/:id/cost', (c) => {
  const jobId = c.req.param('id');
  const summary = meteringTracker.getJobCostSummary(jobId);
  const steps = meteringTracker.getStepCosts(jobId);
  
  if (!summary) {
    return c.json({ error: 'Job not found or no metering data' }, 404);
  }
  
  return c.json({ summary, steps });
});

/**
 * Get tenant usage
 * GET /usage?tenantId=xxx
 */
app.get('/usage', (c) => {
  const tenantId = c.req.query('tenantId');
  if (!tenantId) {
    return c.json({ error: 'Missing tenantId' }, 400);
  }
  
  const usage = policyEngine.getUsage(tenantId);
  return c.json({ usage });
});

// =============================================================================
// ARTIFACTS & REPLAY
// =============================================================================

/**
 * Get job artifacts
 * GET /jobs/:id/artifacts
 */
app.get('/jobs/:id/artifacts', (c) => {
  const jobId = c.req.param('id');
  const artifacts = artifactStore.getJobArtifacts(jobId).map(a => ({
    id: a.id,
    stepIndex: a.stepIndex,
    stepName: a.stepName,
    type: a.type,
    contentType: a.contentType,
    sizeBytes: a.sizeBytes,
    createdAt: a.createdAt,
    hasContent: !!a.content || !!a.filePath,
  }));
  
  return c.json({ artifacts });
});

/**
 * Get artifact content
 * GET /artifacts/:id
 */
app.get('/artifacts/:id', async (c) => {
  const artifactId = c.req.param('id');
  
  // Find artifact across all jobs (not ideal, but works for demo)
  // In production, you'd look up by artifact ID in a database
  
  return c.json({ error: 'Not implemented - use job artifacts endpoint' }, 501);
});

/**
 * Replay job from step
 * POST /jobs/:id/replay
 * Body: { fromStep, tenantId, sessionKey? }
 */
app.post('/jobs/:id/replay', async (c) => {
  try {
    const jobId = c.req.param('id');
    const body = await c.req.json();
    const { fromStep, tenantId, sessionKey } = body;
    
    if (typeof fromStep !== 'number' || !tenantId) {
      return c.json({ error: 'Missing required fields: fromStep, tenantId' }, 400);
    }
    
    const job = await runner.replay(jobId, fromStep, { tenantId, sessionKey });
    
    return c.json({
      newJobId: job.id,
      status: job.status,
      replayedFrom: fromStep,
    });
    
  } catch (error) {
    return c.json({ error: redactSecrets(String(error)) }, 500);
  }
});

// =============================================================================
// EXPORT
// =============================================================================
// WORKFLOW TEMPLATES (PHASE 2)
// =============================================================================

/**
 * Execute state-level discovery workflow
 * POST /workflows/state-discovery
 * Body: { niche, state, cities?, limit?, tenantId? }
 */
app.post('/workflows/state-discovery', async (c) => {
  try {
    const body = await c.req.json();
    const { niche, state, cities, limit, tenantId } = body;

    if (!niche || !state) {
      return c.json({ error: 'Missing required fields: niche, state' }, 400);
    }

    const result = await workflowExecutor.executeStateLevelDiscovery({
      niche,
      state,
      cities,
      limit,
      tenantId
    });

    return c.json(result);
  } catch (error) {
    return c.json({ error: redactSecrets(String(error)) }, 500);
  }
});

// =============================================================================
// SCHEDULER & AUTOMATION (PHASE 3)
// =============================================================================

/**
 * Create a new schedule
 * POST /schedules
 * Body: { name, description?, workflow, params, schedule, tenantId }
 */
app.post('/schedules', async (c) => {
  try {
    const body = await c.req.json();
    const { name, description, workflow, params, schedule: scheduleInput, tenantId } = body;

    if (!name || !workflow || !params || !scheduleInput || !tenantId) {
      return c.json({ error: 'Missing required fields' }, 400);
    }

    // Parse natural language schedule
    const parsedSchedule = parseSchedule(scheduleInput);

    // Create schedule using the parsed schedule (already has correct types from Zod)
    const schedule = scheduleStore.create({
      ...parsedSchedule,
      name,
      description,
      workflow,
      params,
      tenantId,
      enabled: true,
    } as any);

    return c.json({ schedule });
  } catch (error) {
    return c.json({ error: redactSecrets(String(error)) }, 500);
  }
});

/**
 * List schedules
 * GET /schedules?tenantId=xxx
 */
app.get('/schedules', async (c) => {
  try {
    const tenantId = c.req.query('tenantId');
    const schedules = scheduleStore.list(tenantId);
    return c.json({ schedules });
  } catch (error) {
    return c.json({ error: redactSecrets(String(error)) }, 500);
  }
});

/**
 * Get schedule details
 * GET /schedules/:id
 */
app.get('/schedules/:id', async (c) => {
  try {
    const id = c.req.param('id');
    const schedule = scheduleStore.get(id);
    
    if (!schedule) {
      return c.json({ error: 'Schedule not found' }, 404);
    }
    
    return c.json({ schedule });
  } catch (error) {
    return c.json({ error: redactSecrets(String(error)) }, 500);
  }
});

/**
 * Update schedule
 * PATCH /schedules/:id
 */
app.patch('/schedules/:id', async (c) => {
  try {
    const id = c.req.param('id');
    const updates = await c.req.json();
    
    const schedule = scheduleStore.update(id, updates);
    
    if (!schedule) {
      return c.json({ error: 'Schedule not found' }, 404);
    }
    
    return c.json({ schedule });
  } catch (error) {
    return c.json({ error: redactSecrets(String(error)) }, 500);
  }
});

/**
 * Delete schedule
 * DELETE /schedules/:id
 */
app.delete('/schedules/:id', async (c) => {
  try {
    const id = c.req.param('id');
    const deleted = scheduleStore.delete(id);
    
    if (!deleted) {
      return c.json({ error: 'Schedule not found' }, 404);
    }
    
    return c.json({ success: true });
  } catch (error) {
    return c.json({ error: redactSecrets(String(error)) }, 500);
  }
});

/**
 * Heartbeat control
 * POST /scheduler/start
 * POST /scheduler/stop
 */
app.post('/scheduler/start', async (c) => {
  try {
    schedulerHeartbeat.start();
    return c.json({ status: 'started' });
  } catch (error) {
    return c.json({ error: redactSecrets(String(error)) }, 500);
  }
});

app.post('/scheduler/stop', async (c) => {
  try {
    schedulerHeartbeat.stop();
    return c.json({ status: 'stopped' });
  } catch (error) {
    return c.json({ error: redactSecrets(String(error)) }, 500);
  }
});

/**
 * Get email queue status with detailed sending window info
 * GET /scheduler/email-queue
 */
app.get('/scheduler/email-queue', async (c) => {
  try {
    const { getEmailQueueStats } = await import('../scheduler/email-sender');
    const stats = await getEmailQueueStats();
    
    // Calculate sending window status
    const now = new Date();
    const utcHour = now.getUTCHours();
    const inSendingWindow = utcHour >= 19 || utcHour < 2; // 3 PM - 9 PM EST
    
    // Calculate time until window opens/closes
    let windowStatus: string;
    let nextWindowChange: string;
    
    if (inSendingWindow) {
      windowStatus = 'ACTIVE - Sending emails';
      // Calculate when window closes (2:00 UTC)
      const closesAt = new Date(now);
      if (utcHour >= 19) {
        closesAt.setUTCDate(closesAt.getUTCDate() + 1);
      }
      closesAt.setUTCHours(2, 0, 0, 0);
      const hoursUntilClose = Math.round((closesAt.getTime() - now.getTime()) / (1000 * 60 * 60) * 10) / 10;
      nextWindowChange = `Closes in ${hoursUntilClose} hours`;
    } else {
      windowStatus = 'PAUSED - Outside sending hours';
      // Calculate when window opens (19:00 UTC)
      const opensAt = new Date(now);
      if (utcHour >= 2) {
        opensAt.setUTCHours(19, 0, 0, 0);
      } else {
        opensAt.setUTCDate(opensAt.getUTCDate() - 1);
        opensAt.setUTCHours(19, 0, 0, 0);
      }
      if (opensAt < now) {
        opensAt.setUTCDate(opensAt.getUTCDate() + 1);
      }
      const hoursUntilOpen = Math.round((opensAt.getTime() - now.getTime()) / (1000 * 60 * 60) * 10) / 10;
      nextWindowChange = `Opens in ${hoursUntilOpen} hours`;
    }
    
    return c.json({
      status: 'ok',
      sendingWindow: {
        active: inSendingWindow,
        status: windowStatus,
        nextChange: nextWindowChange,
        hours: '3 PM - 9 PM EST',
        currentTimeUTC: now.toISOString(),
      },
      queue: stats,
      schedulerRunning: schedulerHeartbeat.isRunning(),
    });
  } catch (error) {
    return c.json({ error: redactSecrets(String(error)) }, 500);
  }
});

/**
 * Test Telegram notification
 * POST /scheduler/telegram-test
 */
app.post('/scheduler/telegram-test', async (c) => {
  try {
    const { sendTelegramNotification, getEmailQueueStats } = await import('../scheduler/email-sender');
    
    const stats = await getEmailQueueStats();
    
    const message = `🧪 <b>Telegram Test</b>

This is a test notification from OneClaw.
If you see this, Telegram is working!

📊 Queue Status:
• Ready to send: ${stats.approved}
• Sent today: ${stats.sentToday}
• Total sent: ${stats.totalSent}`;

    await sendTelegramNotification(message);
    
    return c.json({
      status: 'ok',
      message: 'Telegram notification sent. Check your Telegram app!',
    });
  } catch (error) {
    return c.json({ error: redactSecrets(String(error)) }, 500);
  }
});

/**
 * GET /scheduler/reply-checker
 * Get reply checker status
 */
app.get('/scheduler/reply-checker', async (c) => {
  try {
    const { getReplyCheckerStatus } = await import('../scheduler/reply-checker');
    const status = getReplyCheckerStatus();
    return c.json(status);
  } catch (error) {
    return c.json({ error: redactSecrets(String(error)) }, 500);
  }
});

/**
 * POST /scheduler/check-replies
 * Manually trigger a reply check
 */
app.post('/scheduler/check-replies', async (c) => {
  try {
    const { triggerReplyCheck } = await import('../scheduler/reply-checker');
    const result = await triggerReplyCheck();
    return c.json({
      status: 'ok',
      ...result,
    });
  } catch (error) {
    return c.json({ error: redactSecrets(String(error)) }, 500);
  }
});

// =============================================================================
// SUB-AGENTS (PHASE 4)
// =============================================================================

/**
 * Launch outreach sub-agent
 * POST /agents/outreach/launch
 * Body: { niche, location, senderName, senderEmail, maxEmails?, dryRun?, tenantId }
 */
app.post('/agents/outreach/launch', async (c) => {
  try {
    const body = await c.req.json();
    const { niche, location, senderName, senderEmail, maxEmails, dryRun, tenantId, minReviews, maxReviews } = body;

    if (!niche || !location || !senderName || !senderEmail || !tenantId) {
      return c.json({ error: 'Missing required fields: niche, location, senderName, senderEmail, tenantId' }, 400);
    }

    // For Docker: spawn container
    // For local dev: spawn process directly
    const isDocker = process.env.USE_DOCKER_AGENTS === 'true';

    if (isDocker) {
      // Docker approach
      const env = [
        `NICHE=${niche}`,
        `LOCATION=${location}`,
        `SENDER_NAME=${senderName}`,
        `SENDER_EMAIL=${senderEmail}`,
        `MAX_EMAILS=${maxEmails || 5}`,
        `DRY_RUN=${dryRun !== false}`,
        `TENANT_ID=${tenantId}`,
        `HARNESS_URL=http://host.docker.internal:9000`,
        `LOG_DIR=/workspace/logs`,
      ];

      const dockerArgs = [
        'run', '--rm',
        '--network', 'host',
        '-v', 'oneclaw_agent-logs:/workspace/logs',
        ...env.flatMap(e => ['-e', e]),
        'oneclaw-outreach-agent:latest'
      ];

      const proc = spawn('docker', dockerArgs, { detached: true, stdio: 'ignore' });
      proc.unref();

      return c.json({ 
        launched: true, 
        mode: 'docker',
        pid: proc.pid,
        config: { niche, location, maxEmails, dryRun }
      });
    } else {
      // Local process approach (for dev)
      // Get the workspace root (2 levels up from packages/harness)
      const workspaceRoot = resolve(__dirname, '..', '..', '..', '..');
      const subAgentDir = join(workspaceRoot, 'sub-agents', 'outreach');
      const logDir = join(workspaceRoot, 'logs', 'agents');
      
      // Create ephemeral session token for the sub-agent (1 hour TTL)
      const crypto = await import('crypto');
      const ephemeralToken = crypto.randomBytes(32).toString('hex');
      const expiresAt = Date.now() + 60 * 60 * 1000; // 1 hour
      
      // Store the session token
      sessionStore.set(ephemeralToken, {
        tenantId,
        expiresAt,
        purpose: 'outreach-agent'
      });
      
      // Use node directly with tsx as ESM loader
      const isWindows = process.platform === 'win32';
      const npxCmd = isWindows ? 'npx.cmd' : 'npx';
      
      const proc = spawn(npxCmd, ['tsx', 'src/index.ts'], {
        cwd: subAgentDir,
        detached: !isWindows, // detached doesn't work well on Windows
        stdio: 'ignore',
        shell: isWindows, // Use shell on Windows for better path resolution
        env: {
          ...process.env,
          NICHE: niche,
          LOCATION: location,
          SENDER_NAME: senderName,
          SENDER_EMAIL: senderEmail,
          MAX_EMAILS: String(maxEmails || 5),
          MIN_REVIEWS: String(minReviews || 10),
          MAX_REVIEWS: String(maxReviews || 500),
          DRY_RUN: String(dryRun !== false),
          TENANT_ID: tenantId,
          EPHEMERAL_TOKEN: ephemeralToken,
          HARNESS_URL: getHarnessUrl(),
          LOG_DIR: logDir,
        }
      });
      
      if (!isWindows) {
        proc.unref();
      }

      return c.json({ 
        launched: true, 
        mode: 'local',
        pid: proc.pid,
        config: { niche, location, maxEmails, dryRun },
        paths: { subAgentDir, logDir }
      });
    }
  } catch (error) {
    return c.json({ error: redactSecrets(String(error)) }, 500);
  }
});

/**
 * Get sub-agent status
 * GET /agents/status?agentId=outreach
 */
app.get('/agents/status', async (c) => {
  try {
    const agentId = c.req.query('agentId');
    const statuses = agentMonitor.getStatus(agentId);
    return c.json({ agents: statuses });
  } catch (error) {
    return c.json({ error: redactSecrets(String(error)) }, 500);
  }
});

/**
 * Get sub-agent logs
 * GET /agents/:agentId/:runId/logs?limit=50
 */
app.get('/agents/:agentId/:runId/logs', async (c) => {
  try {
    const agentId = c.req.param('agentId');
    const runId = c.req.param('runId');
    const limit = parseInt(c.req.query('limit') || '50');
    
    const logs = agentMonitor.getRecentLogs(agentId, runId, limit);
    return c.json({ logs });
  } catch (error) {
    return c.json({ error: redactSecrets(String(error)) }, 500);
  }
});

/**
 * Get agent summary (for LLM context)
 * GET /agents/summary
 */
app.get('/agents/summary', async (c) => {
  try {
    const summary = agentMonitor.generateSummary();
    return c.json({ summary });
  } catch (error) {
    return c.json({ error: redactSecrets(String(error)) }, 500);
  }
});

/**
 * Start agent monitoring
 * POST /agents/monitor/start
 */
app.post('/agents/monitor/start', async (c) => {
  try {
    agentMonitor.start();
    return c.json({ status: 'monitoring' });
  } catch (error) {
    return c.json({ error: redactSecrets(String(error)) }, 500);
  }
});

/**
 * Stop agent monitoring
 * POST /agents/monitor/stop
 */
app.post('/agents/monitor/stop', async (c) => {
  try {
    agentMonitor.stop();
    return c.json({ status: 'stopped' });
  } catch (error) {
    return c.json({ error: redactSecrets(String(error)) }, 500);
  }
});

// =============================================================================
// GMAIL OAUTH (PHASE 5)
// =============================================================================

// Helper to get OAuth config at runtime (after dotenv loads)
function getGoogleOAuthConfig() {
  return {
    clientId: process.env.GOOGLE_CLIENT_ID || '',
    clientSecret: process.env.GOOGLE_CLIENT_SECRET || '',
    redirectUri: getOAuthRedirectUri(),
  };
}

/**
 * Initiate Gmail OAuth flow
 * GET /oauth/google?tenantId=xxx OR ?user=xxx (for OneClaw Node compatibility)
 */
app.get('/oauth/google', async (c) => {
  // Support both 'tenantId' (harness) and 'user' (OneClaw Node)
  const tenantId = c.req.query('tenantId') || c.req.query('user') || 'default';
  const { clientId, clientSecret } = getGoogleOAuthConfig();
  
  if (!clientId || !clientSecret) {
    return c.html(`
      <html>
        <body style="font-family: -apple-system, sans-serif; padding: 40px; text-align: center;">
          <h1>⚠️ OAuth Not Configured</h1>
          <p>Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET environment variables.</p>
          <p>Get credentials from <a href="https://console.cloud.google.com/apis/credentials">Google Cloud Console</a></p>
        </body>
      </html>
    `, 503);
  }
  
  const scopes = [
    'https://www.googleapis.com/auth/gmail.send',
    'https://www.googleapis.com/auth/gmail.readonly',
  ];
  
  const { clientId: googleClientId, redirectUri } = getGoogleOAuthConfig();
  
  const params = new URLSearchParams({
    client_id: googleClientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: scopes.join(' '),
    access_type: 'offline',
    prompt: 'consent',
    state: tenantId,
  });
  
  return c.redirect(`https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`);
});

/**
 * Gmail OAuth callback
 * GET /oauth/google/callback
 */
app.get('/oauth/google/callback', async (c) => {
  const code = c.req.query('code');
  const tenantId = c.req.query('state') || 'default';
  const error = c.req.query('error');
  const { clientId, clientSecret, redirectUri } = getGoogleOAuthConfig();
  
  if (error) {
    return c.html(`
      <html>
        <body style="font-family: -apple-system, sans-serif; padding: 40px; text-align: center;">
          <h1>❌ Authentication Failed</h1>
          <p>Error: ${error}</p>
        </body>
      </html>
    `, 400);
  }
  
  if (!code) {
    return c.html(`
      <html>
        <body style="font-family: -apple-system, sans-serif; padding: 40px; text-align: center;">
          <h1>❌ Missing Code</h1>
          <p>No authorization code received from Google.</p>
        </body>
      </html>
    `, 400);
  }
  
  try {
    // Exchange code for tokens
    const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        code,
        grant_type: 'authorization_code',
        redirect_uri: redirectUri,
      }),
    });
    
    if (!tokenResponse.ok) {
      const errorData = await tokenResponse.text();
      console.error('[OAuth] Token exchange failed:', errorData);
      throw new Error('Token exchange failed');
    }
    
    const tokens = await tokenResponse.json() as {
      access_token: string;
      refresh_token?: string;
      expires_in: number;
    };
    
    // Get user's email
    const gmailClient = createGmailClient();
    const profile = await gmailClient.getUserProfile(tokens.access_token);
    
    // Save integration to database
    const { saveNodeIntegration } = await import('@oneclaw/database');
    await saveNodeIntegration(tenantId, 'google', {
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token || '',
      expiresAt: new Date(Date.now() + tokens.expires_in * 1000),
      scopes: ['https://www.googleapis.com/auth/gmail.send', 'https://www.googleapis.com/auth/gmail.readonly'],
      email: profile.email,
    });
    
    console.log(`[OAuth] Gmail connected: ${profile.email} for tenant ${tenantId}`);
    
    return c.html(`
      <!DOCTYPE html>
      <html>
        <head>
          <meta name="viewport" content="width=device-width, initial-scale=1">
          <title>Gmail Connected - OneClaw Harness</title>
          <style>
            body {
              font-family: -apple-system, sans-serif;
              background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
              min-height: 100vh;
              display: flex;
              align-items: center;
              justify-content: center;
              margin: 0;
            }
            .card {
              background: white;
              border-radius: 16px;
              padding: 40px;
              max-width: 400px;
              text-align: center;
              box-shadow: 0 10px 40px rgba(0,0,0,0.2);
            }
            h1 { color: #333; margin-bottom: 16px; }
            .email { background: #f5f5f5; padding: 12px; border-radius: 8px; margin: 16px 0; }
            .success { color: #10b981; font-size: 48px; margin-bottom: 16px; }
          </style>
        </head>
        <body>
          <div class="card">
            <div class="success">✅</div>
            <h1>Gmail Connected!</h1>
            <div class="email">${profile.email}</div>
            <p>Your Gmail account is now connected to OneClaw Harness.</p>
            <p style="margin-top: 24px; color: #666;">
              Tenant: <code>${tenantId}</code>
            </p>
            <p style="margin-top: 24px; color: #999; font-size: 14px;">
              You can close this window.
            </p>
          </div>
        </body>
      </html>
    `);
    
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[OAuth] Error:', message);
    return c.html(`
      <html>
        <body style="font-family: -apple-system, sans-serif; padding: 40px; text-align: center;">
          <h1>❌ Error</h1>
          <p>${redactSecrets(message)}</p>
        </body>
      </html>
    `, 500);
  }
});

/**
 * Check Gmail connection status
 * GET /oauth/status?tenantId=xxx
 */
app.get('/oauth/status', async (c) => {
  const tenantId = c.req.query('tenantId') || 'default';
  const { clientId, clientSecret } = getGoogleOAuthConfig();
  
  // Check if we have Google OAuth configured
  const configured = !!(clientId && clientSecret);
  
  // Check if this tenant has a connected account
  // For now, check environment variables as fallback
  const hasTestAccount = !!(process.env.GMAIL_TEST_EMAIL && process.env.GMAIL_TEST_ACCESS_TOKEN);
  
  return c.json({
    configured,
    connected: hasTestAccount, // Would check database in production
    authUrl: configured ? `/oauth/google?tenantId=${tenantId}` : null,
    testEmail: hasTestAccount ? process.env.GMAIL_TEST_EMAIL : null,
  });
});

/**
 * OneClaw Node compatibility endpoints
 * These match the format expected by the Rust integration.rs
 */

// GET /api/v1/oauth/google/status - Check if Gmail is connected (OneClaw Node format)
app.get('/api/v1/oauth/google/status', async (c) => {
  const userId = c.req.query('user_id') || c.req.query('tenantId') || 'default';
  
  // In production, would check database for this user's Gmail connection
  // For now, return based on in-memory state
  const hasTestAccount = !!(process.env.GMAIL_TEST_EMAIL && process.env.GMAIL_TEST_ACCESS_TOKEN);
  
  if (hasTestAccount) {
    return c.json({ connected: true, email: process.env.GMAIL_TEST_EMAIL });
  }
  
  return c.json({ connected: false });
});

// GET /api/v1/oauth/google/account - Get connected Gmail account info
app.get('/api/v1/oauth/google/account', async (c) => {
  const userId = c.req.query('user_id') || c.req.query('tenantId') || 'default';
  
  const hasTestAccount = !!(process.env.GMAIL_TEST_EMAIL && process.env.GMAIL_TEST_ACCESS_TOKEN);
  
  if (hasTestAccount) {
    return c.json({
      email: process.env.GMAIL_TEST_EMAIL,
      connected_at: new Date().toISOString(),
      user_id: userId,
    });
  }
  
  return c.json({ error: 'No Gmail account connected' }, 404);
});

// =============================================================================
// GMAIL SENDER MANAGEMENT UI
// =============================================================================

/**
 * Gmail Sender Management Page
 * GET /gmail/senders - UI to manage email sender accounts
 */
app.get('/gmail/senders', async (c) => {
  const { createClient } = await import('@supabase/supabase-js');
  const supabase = createClient(
    process.env.SUPABASE_URL || '',
    process.env.SUPABASE_SERVICE_ROLE_KEY || ''
  );
  
  // Get all Gmail integrations
  const { data: integrations } = await supabase
    .from('node_integrations')
    .select('node_id, provider, email, created_at')
    .eq('provider', 'google')
    .order('created_at', { ascending: false });
  
  // Dedupe by node_id (keep most recent)
  const uniqueIntegrations = new Map<string, any>();
  for (const int of integrations || []) {
    if (!uniqueIntegrations.has(int.node_id)) {
      uniqueIntegrations.set(int.node_id, int);
    }
  }
  
  const senders = Array.from(uniqueIntegrations.values()).map(int => ({
    nodeId: int.node_id,
    email: int.email || 'Unknown',
    connectedAt: new Date(int.created_at).toLocaleDateString(),
  }));
  
  const baseUrl = getHarnessUrl();
  
  return c.html(`
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1">
        <title>Gmail Sender Management - OneClaw</title>
        <style>
          * { margin: 0; padding: 0; box-sizing: border-box; }
          body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            background: #0a0a0a;
            color: #e0e0e0;
            min-height: 100vh;
            padding: 40px 20px;
          }
          .container { max-width: 800px; margin: 0 auto; }
          h1 {
            font-size: 32px;
            margin-bottom: 8px;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            -webkit-background-clip: text;
            -webkit-text-fill-color: transparent;
          }
          .subtitle { color: #888; margin-bottom: 40px; }
          .card {
            background: #111;
            border: 1px solid #222;
            border-radius: 12px;
            padding: 24px;
            margin-bottom: 24px;
          }
          .card h2 { font-size: 18px; margin-bottom: 16px; color: #fff; }
          .sender-list { display: flex; flex-direction: column; gap: 12px; }
          .sender-item {
            display: flex;
            justify-content: space-between;
            align-items: center;
            padding: 16px;
            background: #1a1a1a;
            border-radius: 8px;
            border: 1px solid #333;
          }
          .sender-item:hover { border-color: #667eea; }
          .sender-info { flex: 1; }
          .sender-email { font-size: 16px; font-weight: 600; color: #fff; }
          .sender-meta { font-size: 13px; color: #888; margin-top: 4px; }
          .status-badge {
            padding: 6px 12px;
            border-radius: 20px;
            font-size: 12px;
            font-weight: 600;
          }
          .status-connected { background: #1a3d1a; color: #4ade80; }
          .add-section { margin-top: 32px; }
          .form-group { margin-bottom: 16px; }
          .form-group label { display: block; margin-bottom: 8px; color: #888; font-size: 14px; }
          .form-group input {
            width: 100%;
            padding: 12px 16px;
            border-radius: 8px;
            border: 1px solid #333;
            background: #0a0a0a;
            color: #fff;
            font-size: 15px;
          }
          .form-group input:focus { outline: none; border-color: #667eea; }
          .form-group small { display: block; margin-top: 6px; color: #666; font-size: 12px; }
          .btn {
            display: inline-block;
            padding: 12px 24px;
            border-radius: 8px;
            font-size: 15px;
            font-weight: 600;
            text-decoration: none;
            cursor: pointer;
            border: none;
          }
          .btn-primary {
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: #fff;
          }
          .btn-primary:hover { opacity: 0.9; }
          .instructions {
            background: #1a1a2e;
            border: 1px solid #2d2d5a;
            border-radius: 8px;
            padding: 16px;
            margin-top: 24px;
          }
          .instructions h3 { font-size: 14px; color: #a0a0ff; margin-bottom: 12px; }
          .instructions ol { padding-left: 20px; color: #888; font-size: 14px; line-height: 1.8; }
          .instructions code { background: #0a0a0a; padding: 2px 6px; border-radius: 4px; color: #667eea; }
          .empty-state { text-align: center; padding: 40px; color: #666; }
        </style>
      </head>
      <body>
        <div class="container">
          <h1>📧 Gmail Sender Management</h1>
          <p class="subtitle">Connect Gmail accounts for cold email campaigns</p>
          
          <div class="card">
            <h2>Connected Accounts</h2>
            ${senders.length > 0 ? `
              <div class="sender-list">
                ${senders.map(s => `
                  <div class="sender-item">
                    <div class="sender-info">
                      <div class="sender-email">${s.email}</div>
                      <div class="sender-meta">ID: ${s.nodeId} • Connected ${s.connectedAt}</div>
                    </div>
                    <span class="status-badge status-connected">✓ Connected</span>
                  </div>
                `).join('')}
              </div>
            ` : `
              <div class="empty-state">
                <p>No Gmail accounts connected yet.</p>
              </div>
            `}
          </div>
          
          <div class="card add-section">
            <h2>Connect New Sender</h2>
            <form id="connectForm" onsubmit="connectAccount(event)">
              <div class="form-group">
                <label for="senderId">Sender ID</label>
                <input type="text" id="senderId" placeholder="e.g., riley, bailey, madison" required>
                <small>This will be used as the node_id (prefixed with "sender-")</small>
              </div>
              <button type="submit" class="btn btn-primary">Connect Gmail Account →</button>
            </form>
            
            <div class="instructions">
              <h3>📋 How to connect multiple senders:</h3>
              <ol>
                <li>Enter the sender's name (e.g., <code>riley</code>)</li>
                <li>Click "Connect Gmail Account"</li>
                <li>Sign in with that sender's Gmail (<code>riley@closelanepro.com</code>)</li>
                <li>Authorize the app</li>
                <li>Repeat for each sender (bailey, madison, etc.)</li>
              </ol>
            </div>
          </div>
        </div>
        
        <script>
          function connectAccount(e) {
            e.preventDefault();
            const senderId = document.getElementById('senderId').value.trim().toLowerCase();
            if (!senderId) return;
            
            const nodeId = 'sender-' + senderId;
            window.location.href = '/oauth/google?tenantId=' + encodeURIComponent(nodeId);
          }
        </script>
      </body>
    </html>
  `);
});

/**
 * API: List connected Gmail senders
 * GET /api/gmail/senders
 */
app.get('/api/gmail/senders', async (c) => {
  const { createClient } = await import('@supabase/supabase-js');
  
  const url = process.env.SUPABASE_URL || '';
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
  
  console.log('[gmail/senders] SUPABASE_URL:', url ? 'SET' : 'MISSING');
  console.log('[gmail/senders] SUPABASE_SERVICE_ROLE_KEY:', key ? 'SET' : 'MISSING');
  
  if (!url || !key) {
    return c.json({ senders: [], error: 'Supabase not configured' });
  }
  
  const supabase = createClient(url, key);
  
  const { data: integrations, error } = await supabase
    .from('node_integrations')
    .select('node_id, email, created_at')
    .eq('provider', 'google')
    .order('created_at', { ascending: false });
  
  console.log('[gmail/senders] Query result:', { count: integrations?.length, error });
  
  if (error) {
    console.error('[gmail/senders] Supabase error:', error);
    return c.json({ senders: [], error: error.message });
  }
  
  // Dedupe by node_id
  const uniqueIntegrations = new Map<string, any>();
  for (const int of integrations || []) {
    if (!uniqueIntegrations.has(int.node_id)) {
      uniqueIntegrations.set(int.node_id, int);
    }
  }
  
  const senders = Array.from(uniqueIntegrations.values()).map(int => ({
    nodeId: int.node_id,
    email: int.email || 'Unknown',
    connectedAt: int.created_at,
  }));
  
  console.log('[gmail/senders] Returning', senders.length, 'senders');
  
  return c.json({ senders });
});

// =============================================================================
// EXPORT
// =============================================================================

// Test endpoint for Gmail (temporary, for debugging)
app.post('/test/send-email', async (c) => {
  try {
    const body = await c.req.json();
    const { to, subject, body: emailBody } = body;
    
    const { sendGmailHandler } = await import('../tools/send-gmail');
    
    const result = await sendGmailHandler({
      to: to || 'ryan@nabl.ai',
      subject: subject || 'Test from OneClaw',
      body: emailBody || 'This is a test email!',
      fromName: 'OneClaw Test'
    }, { tenantId: 'default' });
    
    return c.json(result);
  } catch (error) {
    return c.json({ error: String(error) }, 500);
  }
});

export default app;
export { app as harnessApi };
