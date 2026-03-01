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
import { encryptToken } from '../gmail/encryption';
import { registerGmailAccount } from '../tools/send-gmail';
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
        // Execute the step based on action type
        const result = await executeStep(step, db, jobId);
        
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
 * Execute a single job step
 * Maps step actions to actual workflow execution
 */
async function executeStep(step: any, db: any, jobId: string) {
  const { action, params } = step;

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

  // Execute via existing runner
  const job = await runner.execute(workflowId, params, {
    tenantId: 'autonomous-system', // Special tenant for autonomous jobs
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

    // Store contacts if this is an enrichment step
    if (action === 'enrich' && job.output?.contacts) {
      const contacts = (job.output.contacts as any[]).map((c: any) => ({
        businessId: c.businessId, // This needs to be mapped from step params
        name: c.name,
        email: c.email,
        phone: c.phone,
        role: c.role,
        linkedinUrl: c.linkedin_url,
        source: c.source || 'unknown',
        confidence: c.confidence || 50,
        metadata: c,
      }));
      
      db.createContacts(contacts);
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

    // Create schedule
    const schedule = scheduleStore.create({
      name,
      description,
      workflow,
      params,
      tenantId,
      enabled: true,
      ...parsedSchedule
    });

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
    
    // Encrypt tokens
    const encryptedAccess = encryptToken(tokens.access_token);
    const encryptedRefresh = tokens.refresh_token ? encryptToken(tokens.refresh_token) : '';
    
    // Register account for this tenant
    registerGmailAccount(tenantId, {
      id: `gml_${Date.now()}`,
      user_id: tenantId,
      email: profile.email,
      access_token: encryptedAccess,
      refresh_token: encryptedRefresh,
      token_expires_at: new Date(Date.now() + tokens.expires_in * 1000).toISOString(),
      is_active: true,
      daily_send_count: 0,
      daily_send_reset_at: new Date().toISOString(),
      last_sent_at: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
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
