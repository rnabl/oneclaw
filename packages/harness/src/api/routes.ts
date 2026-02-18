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
