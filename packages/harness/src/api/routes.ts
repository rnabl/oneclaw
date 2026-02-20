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

// Import workflows to register them
import '../workflows';

const app = new Hono();

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
  return c.json({ status: 'healthy' });
});

// =============================================================================
// TOOL REGISTRY
// =============================================================================

app.get('/tools', (c) => {
  const tools = registry.list().map(t => ({
    id: t.id,
    name: t.name,
    description: t.description,
    version: t.version,
    costClass: t.costClass,
    estimatedCostUsd: t.estimatedCostUsd,
    requiredSecrets: t.requiredSecrets,
    tags: t.tags,
  }));
  
  return c.json({ tools });
});

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
    return c.json({ error: String(error) }, 500);
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
    return c.json({ error: String(error) }, 500);
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
 * Execute a workflow
 * POST /execute
 * Body: { workflowId, input, tenantId, tier?, sessionKey?, dryRun?, webhookUrl? }
 */
app.post('/execute', async (c) => {
  try {
    const body = await c.req.json();
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
    });
    
  } catch (error) {
    return c.json({ error: String(error) }, 500);
  }
});

/**
 * Get job status
 * GET /jobs/:id
 */
app.get('/jobs/:id', (c) => {
  const job = runner.getJob(c.req.param('id'));
  if (!job) {
    return c.json({ error: 'Job not found' }, 404);
  }
  return c.json({ job });
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
 */
app.post('/jobs/:id/cancel', (c) => {
  const success = runner.cancelJob(c.req.param('id'));
  return c.json({ success });
});

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
    return c.json({ error: String(error) }, 500);
  }
});

/**
 * Get job logs (polling endpoint)
 * GET /jobs/:id/logs?since=ISO_DATE
 */
app.get('/jobs/:id/logs', (c) => {
  const jobId = c.req.param('id');
  const sinceParam = c.req.query('since');
  const since = sinceParam ? new Date(sinceParam) : new Date(0);
  
  const logs = runner.getLogsSince(jobId, since);
  const job = runner.getJob(jobId);

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
 * GET /jobs/:id/stream
 */
app.get('/jobs/:id/stream', async (c) => {
  const jobId = c.req.param('id');
  const job = runner.getJob(jobId);
  
  if (!job) {
    return c.json({ error: 'Job not found' }, 404);
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
    return c.json({ error: String(error) }, 500);
  }
});

// =============================================================================
// EXPORT
// =============================================================================

export default app;
export { app as harnessApi };
