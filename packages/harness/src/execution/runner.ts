/**
 * Execution Runner
 * 
 * Orchestrates workflow execution with:
 * - Restate for durable checkpointing
 * - Policy enforcement
 * - Secret injection
 * - Artifact capture
 * - Cost metering
 */

import { nanoid } from 'nanoid';
import { registry } from '../registry';
import { vault, SecretsVault } from '../secrets';
import { policyEngine, TenantTier } from '../policy';
import { meteringTracker } from '../metering';
import { artifactStore } from '../artifacts';

// =============================================================================
// TYPES
// =============================================================================

export type JobStatus = 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';

export interface JobLog {
  timestamp: Date;
  level: 'debug' | 'info' | 'warn' | 'error';
  message: string;
  step?: string;
  data?: Record<string, unknown>;
}

export interface Job {
  id: string;
  tenantId: string;
  workflowId: string;       // e.g., 'audit-website'
  status: JobStatus;
  
  // Input/Output
  input: Record<string, unknown>;
  output?: Record<string, unknown>;
  error?: string;
  
  // Progress
  currentStep: number;
  totalSteps: number;
  stepName?: string;
  
  // Real-time logging
  logs: JobLog[];
  
  // Method switching
  currentMethod?: string;
  
  // Timing
  createdAt: Date;
  startedAt?: Date;
  completedAt?: Date;
  
  // Cost
  estimatedCostUsd: number;
  actualCostUsd: number;
  
  // Restate (for durable execution)
  restateInvocationId?: string;
  
  // Replay
  parentJobId?: string;     // If this is a replay
  replayFromStep?: number;
}

export interface ExecuteOptions {
  tenantId: string;
  tier?: TenantTier;
  masterKey?: Buffer;       // For secret decryption
  sessionKey?: string;      // Alternative to masterKey
  dryRun?: boolean;         // Validate only, don't execute
  webhookUrl?: string;      // Callback on completion
}

export interface StepContext {
  jobId: string;
  tenantId: string;
  stepIndex: number;
  stepName: string;
  toolId: string;
  secrets: Record<string, string>;   // Decrypted secrets for this step
  log: (level: 'debug' | 'info' | 'warn' | 'error', message: string, data?: Record<string, unknown>) => Promise<void>;
  recordApiCall: (provider: string, operation: string, quantity: number) => void;
}

export type WorkflowHandler = (
  ctx: StepContext,
  input: Record<string, unknown>
) => Promise<Record<string, unknown>>;

// =============================================================================
// EXECUTION RUNNER
// =============================================================================

export class ExecutionRunner {
  private jobs: Map<string, Job> = new Map();
  private workflows: Map<string, WorkflowHandler> = new Map();
  private secretsVault: SecretsVault;

  constructor(secretsVault?: SecretsVault) {
    this.secretsVault = secretsVault || vault;
  }

  /**
   * Register a workflow handler
   */
  registerWorkflow(workflowId: string, handler: WorkflowHandler): void {
    this.workflows.set(workflowId, handler);
    console.log(`[Runner] Registered workflow: ${workflowId}`);
  }

  /**
   * Execute a workflow
   */
  async execute(
    workflowId: string,
    input: Record<string, unknown>,
    options: ExecuteOptions
  ): Promise<Job> {
    const { tenantId, tier = 'free', dryRun = false } = options;
    
    // Get tool/workflow definition
    const tool = registry.get(workflowId);
    if (!tool) {
      throw new Error(`Unknown workflow: ${workflowId}`);
    }
    
    // Validate input
    const validationResult = registry.validateInput(workflowId, input);
    if (!validationResult.success) {
      throw new Error(`Invalid input: ${JSON.stringify(validationResult.errors)}`);
    }
    
    // Check policy
    const policyCheck = await policyEngine.checkRequest(
      tenantId,
      workflowId,
      tool.estimatedCostUsd,
      tier
    );
    
    if (!policyCheck.allowed) {
      throw new Error(`Policy denied: ${policyCheck.reason}`);
    }
    
    // Create job
    const job: Job = {
      id: nanoid(),
      tenantId,
      workflowId,
      status: 'pending',
      input: validationResult.data as Record<string, unknown>,
      currentStep: 0,
      totalSteps: 1,  // Will be updated by workflow
      logs: [],
      createdAt: new Date(),
      estimatedCostUsd: tool.estimatedCostUsd,
      actualCostUsd: 0,
    };
    
    this.jobs.set(job.id, job);
    
    // Dry run - just validate
    if (dryRun) {
      job.status = 'completed';
      job.output = { dryRun: true, validated: true };
      return job;
    }
    
    // Get master key for secrets
    let masterKey: Buffer | null = null;
    if (options.masterKey) {
      masterKey = options.masterKey;
    } else if (options.sessionKey) {
      masterKey = await this.secretsVault.unlockWithSession(tenantId, options.sessionKey);
    }
    
    // Get required secrets
    const secrets: Record<string, string> = {};
    for (const provider of tool.requiredSecrets) {
      if (masterKey) {
        const secret = await this.secretsVault.retrieve(tenantId, provider, masterKey, workflowId);
        if (secret) {
          secrets[provider] = secret;
        }
      }
      
      // Fallback to env vars (for platform-provided keys)
      if (!secrets[provider]) {
        const envKey = `${provider.toUpperCase()}_API_KEY`;
        const envValue = process.env[envKey];
        if (envValue) {
          secrets[provider] = envValue;
        }
      }
    }
    
    // Check we have all required secrets
    // Allow execution if env vars exist (platform-provided keys)
    const missingSecrets = tool.requiredSecrets.filter(p => !secrets[p]);
    if (missingSecrets.length > 0) {
      // Only fail if this is NOT a development/mock scenario
      const hasMasterKey = !!masterKey;
      const isDevMode = !process.env.NABL_API_SECRET;
      
      if (hasMasterKey && !isDevMode) {
        // Tenant tried to provide keys but some are missing
        throw new Error(`Missing required secrets: ${missingSecrets.join(', ')}`);
      }
      // Otherwise, allow execution with platform keys or mock mode
      console.log(`[Runner] Proceeding without tenant secrets (using platform keys): ${missingSecrets.join(', ')}`);
    }
    
    // Start execution
    job.status = 'running';
    job.startedAt = new Date();
    policyEngine.jobStarted(tenantId);
    meteringTracker.startJob(job.id, tenantId);
    
    try {
      // Get workflow handler
      const handler = this.workflows.get(workflowId);
      if (!handler) {
        throw new Error(`No handler registered for workflow: ${workflowId}`);
      }
      
      // Create step context
      const ctx = this.createStepContext(job, secrets);
      
      // Execute workflow
      const output = await handler(ctx, job.input);
      
      // Validate output
      const outputValidation = registry.validateOutput(workflowId, output);
      if (!outputValidation.success) {
        console.warn(`[Runner] Output validation failed:`, outputValidation.errors);
        // Don't fail the job, just log
      }
      
      // Complete job
      job.status = 'completed';
      job.output = output;
      job.completedAt = new Date();
      
      // Get final cost
      const costSummary = meteringTracker.completeJob(job.id);
      job.actualCostUsd = costSummary?.totalCostUsd || 0;
      
      // Record usage
      policyEngine.jobCompleted(tenantId, job.actualCostUsd);
      
      // Webhook callback
      if (options.webhookUrl) {
        this.sendWebhook(options.webhookUrl, job).catch(console.error);
      }
      
      console.log(`[Runner] Job ${job.id} completed. Cost: $${job.actualCostUsd.toFixed(4)}`);
      return job;
      
    } catch (error) {
      // Handle failure
      job.status = 'failed';
      job.error = error instanceof Error ? error.message : String(error);
      job.completedAt = new Date();
      
      // Store error artifact
      await artifactStore.storeError(
        job.id,
        job.currentStep,
        job.stepName || 'unknown',
        error instanceof Error ? error : new Error(String(error))
      );
      
      // Record partial cost
      const costSummary = meteringTracker.completeJob(job.id);
      job.actualCostUsd = costSummary?.totalCostUsd || 0;
      policyEngine.jobCompleted(tenantId, job.actualCostUsd);
      
      console.error(`[Runner] Job ${job.id} failed:`, error);
      throw error;
    }
  }

  /**
   * Create step context for workflow execution
   */
  private createStepContext(job: Job, secrets: Record<string, string>): StepContext {
    return {
      jobId: job.id,
      tenantId: job.tenantId,
      stepIndex: 0,
      stepName: 'init',
      toolId: job.workflowId,
      secrets,
      
      log: async (level, message, data) => {
        // Keep an in-memory stream of progress logs for API/SSE consumers.
        this.addLog(job.id, level, message, job.stepName, data);
        
        // Human-readable progress in terminal (avoid debug flood).
        if (level !== 'debug') {
          const step = job.stepName || `step-${job.currentStep}`;
          console.log(`[Progress][${job.id}][${step}] ${level.toUpperCase()}: ${message}`);
        }

        await artifactStore.storeLog(
          job.id,
          job.currentStep,
          job.stepName || 'unknown',
          level,
          message,
          data
        );
      },
      
      recordApiCall: (provider, operation, quantity) => {
        const now = new Date();
        meteringTracker.recordToolCall(
          job.id,
          job.tenantId,
          job.currentStep,
          job.stepName || 'unknown',
          job.workflowId,
          provider,
          operation,
          quantity,
          now,
          now
        );
      },
    };
  }

  /**
   * Update step progress
   */
  updateStep(jobId: string, stepIndex: number, stepName: string, totalSteps?: number): void {
    const job = this.jobs.get(jobId);
    if (job) {
      job.currentStep = stepIndex;
      job.stepName = stepName;
      if (totalSteps) job.totalSteps = totalSteps;
    }
  }

  /**
   * Add log entry to job (for real-time monitoring)
   */
  addLog(jobId: string, level: 'debug' | 'info' | 'warn' | 'error', message: string, step?: string, data?: Record<string, unknown>): void {
    const job = this.jobs.get(jobId);
    if (job) {
      job.logs.push({
        timestamp: new Date(),
        level,
        message,
        step,
        data,
      });
      
      // Keep logs bounded (last 500 entries)
      if (job.logs.length > 500) {
        job.logs = job.logs.slice(-500);
      }
    }
  }

  /**
   * Get logs since a timestamp (for SSE streaming)
   */
  getLogsSince(jobId: string, since: Date): JobLog[] {
    const job = this.jobs.get(jobId);
    if (!job) return [];
    return job.logs.filter(log => log.timestamp > since);
  }

  /**
   * Switch method for a running job
   */
  switchMethod(jobId: string, newMethod: string, reason: string): boolean {
    const job = this.jobs.get(jobId);
    if (job && job.status === 'running') {
      job.currentMethod = newMethod;
      this.addLog(jobId, 'warn', `Switching method: ${reason}`, job.stepName, { newMethod });
      return true;
    }
    return false;
  }

  /**
   * Get current method for a job
   */
  getCurrentMethod(jobId: string): string | undefined {
    const job = this.jobs.get(jobId);
    return job?.currentMethod;
  }

  /**
   * Get job status
   */
  getJob(jobId: string): Job | undefined {
    return this.jobs.get(jobId);
  }

  /**
   * List jobs for a tenant
   */
  listJobs(tenantId: string, limit: number = 50): Job[] {
    return Array.from(this.jobs.values())
      .filter(j => j.tenantId === tenantId)
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
      .slice(0, limit);
  }

  /**
   * Cancel a running job
   */
  cancelJob(jobId: string): boolean {
    const job = this.jobs.get(jobId);
    if (job && job.status === 'running') {
      job.status = 'cancelled';
      job.completedAt = new Date();
      
      const costSummary = meteringTracker.completeJob(jobId);
      job.actualCostUsd = costSummary?.totalCostUsd || 0;
      policyEngine.jobCompleted(job.tenantId, job.actualCostUsd);
      
      return true;
    }
    return false;
  }

  /**
   * Replay a job from a specific step
   */
  async replay(
    jobId: string,
    fromStep: number,
    options: ExecuteOptions
  ): Promise<Job> {
    const originalJob = this.jobs.get(jobId);
    if (!originalJob) {
      throw new Error(`Job not found: ${jobId}`);
    }
    
    // Create new job as replay
    const newJob = await this.execute(originalJob.workflowId, originalJob.input, {
      ...options,
      // TODO: Implement step skipping based on fromStep
    });
    
    newJob.parentJobId = jobId;
    newJob.replayFromStep = fromStep;
    
    return newJob;
  }

  /**
   * Send webhook callback
   */
  private async sendWebhook(url: string, job: Job): Promise<void> {
    try {
      await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          event: 'job.completed',
          jobId: job.id,
          status: job.status,
          output: job.output,
          error: job.error,
          cost: job.actualCostUsd,
        }),
      });
    } catch (error) {
      console.error(`[Runner] Webhook failed for ${url}:`, error);
    }
  }
}

// =============================================================================
// SINGLETON
// =============================================================================

export const runner = new ExecutionRunner();
