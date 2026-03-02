/**
 * Checkpoint Store
 * 
 * Persists workflow state to Supabase for durability and resumability.
 * Solves the problem: "Discovery found 100 businesses, but step 2 failed → all data lost"
 * 
 * Features:
 * - Step-level checkpointing (save output after each step completes)
 * - Large artifact storage (businesses list, enriched data, etc.)
 * - Real-time log streaming
 * - Resume from last successful step
 */

import { createClient, SupabaseClient } from '@supabase/supabase-js';

// =============================================================================
// TYPES
// =============================================================================

export interface WorkflowCheckpoint {
  runId: string;
  stepIndex: number;
  stepName: string;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'skipped';
  input?: Record<string, unknown>;
  output?: Record<string, unknown>;
  errorMessage?: string;
  startedAt?: Date;
  completedAt?: Date;
  durationMs?: number;
  estimatedCostUsd?: number;
  actualCostUsd?: number;
  retryCount?: number;
}

export interface WorkflowArtifact {
  runId: string;
  artifactKey: string;
  artifactType: string;
  data?: Record<string, unknown> | any[];
  storagePath?: string;
  sizeBytes?: number;
  expiresAt?: Date;
}

export interface WorkflowLog {
  runId: string;
  stepId?: string;
  level: 'debug' | 'info' | 'warn' | 'error';
  message: string;
  stepName?: string;
  stepIndex?: number;
  data?: Record<string, unknown>;
  timestamp: Date;
}

export interface WorkflowRunUpdate {
  status?: 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';
  currentStep?: number;
  totalSteps?: number;
  errorMessage?: string;
  actualCostUsd?: number;
  completedAt?: Date;
}

// =============================================================================
// CHECKPOINT STORE
// =============================================================================

export class CheckpointStore {
  private client: SupabaseClient | null = null;
  private enabled: boolean = false;

  constructor() {
    // Initialize Supabase client if credentials available
    const url = process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;

    if (url && key) {
      this.client = createClient(url, key);
      this.enabled = true;
      console.log('[CheckpointStore] Enabled with Supabase');
    } else {
      console.log('[CheckpointStore] Disabled (no Supabase credentials)');
    }
  }

  /**
   * Check if checkpointing is enabled
   */
  isEnabled(): boolean {
    return this.enabled && this.client !== null;
  }

  /**
   * Save step checkpoint
   */
  async saveStep(checkpoint: WorkflowCheckpoint): Promise<void> {
    if (!this.isEnabled()) return;

    try {
      const { error } = await this.client!
        .from('workflow_steps')
        .upsert({
          run_id: checkpoint.runId,
          step_index: checkpoint.stepIndex,
          step_name: checkpoint.stepName,
          status: checkpoint.status,
          input: checkpoint.input || {},
          output: checkpoint.output || {},
          error_message: checkpoint.errorMessage,
          started_at: checkpoint.startedAt?.toISOString(),
          completed_at: checkpoint.completedAt?.toISOString(),
          duration_ms: checkpoint.durationMs,
          estimated_cost_usd: checkpoint.estimatedCostUsd,
          actual_cost_usd: checkpoint.actualCostUsd,
          retry_count: checkpoint.retryCount || 0,
        }, {
          onConflict: 'run_id,step_index',
        });

      if (error) {
        console.error('[CheckpointStore] Failed to save step:', error);
      }
    } catch (error) {
      console.error('[CheckpointStore] Save step error:', error);
    }
  }

  /**
   * Save large artifact (e.g., list of 100 businesses)
   */
  async saveArtifact(artifact: WorkflowArtifact): Promise<void> {
    if (!this.isEnabled()) return;

    try {
      // Calculate size
      const dataString = JSON.stringify(artifact.data || {});
      const sizeBytes = Buffer.byteLength(dataString, 'utf8');

      const { error } = await this.client!
        .from('workflow_artifacts')
        .insert({
          run_id: artifact.runId,
          artifact_type: artifact.artifactType,
          artifact_key: artifact.artifactKey,
          storage_type: 'json',
          data: artifact.data,
          size_bytes: sizeBytes,
          expires_at: artifact.expiresAt?.toISOString(),
        });

      if (error) {
        console.error('[CheckpointStore] Failed to save artifact:', error);
      } else {
        console.log(`[CheckpointStore] Saved artifact: ${artifact.artifactKey} (${(sizeBytes / 1024).toFixed(1)}KB)`);
      }
    } catch (error) {
      console.error('[CheckpointStore] Save artifact error:', error);
    }
  }

  /**
   * Get artifact by key
   */
  async getArtifact(runId: string, artifactKey: string): Promise<any | null> {
    if (!this.isEnabled()) return null;

    try {
      const { data, error } = await this.client!
        .from('workflow_artifacts')
        .select('data')
        .eq('run_id', runId)
        .eq('artifact_key', artifactKey)
        .eq('storage_type', 'json')
        .order('created_at', { ascending: false })
        .limit(1)
        .single();

      if (error || !data) {
        return null;
      }

      return data.data;
    } catch (error) {
      console.error('[CheckpointStore] Get artifact error:', error);
      return null;
    }
  }

  /**
   * Save log entry
   */
  async saveLog(log: WorkflowLog): Promise<void> {
    if (!this.isEnabled()) return;

    try {
      await this.client!
        .from('workflow_logs')
        .insert({
          run_id: log.runId,
          step_id: log.stepId,
          level: log.level,
          message: log.message,
          step_name: log.stepName,
          step_index: log.stepIndex,
          data: log.data || {},
          timestamp: log.timestamp.toISOString(),
        });
    } catch (error) {
      // Silently fail log writes (don't break workflow)
      if (log.level === 'error') {
        console.error('[CheckpointStore] Failed to save log:', error);
      }
    }
  }

  /**
   * Get all completed steps for a run
   */
  async getCompletedSteps(runId: string): Promise<WorkflowCheckpoint[]> {
    if (!this.isEnabled()) return [];

    try {
      const { data, error } = await this.client!
        .from('workflow_steps')
        .select('*')
        .eq('run_id', runId)
        .eq('status', 'completed')
        .order('step_index', { ascending: true });

      if (error || !data) {
        return [];
      }

      return data.map(row => ({
        runId: row.run_id,
        stepIndex: row.step_index,
        stepName: row.step_name,
        status: row.status,
        input: row.input,
        output: row.output,
        errorMessage: row.error_message,
        startedAt: row.started_at ? new Date(row.started_at) : undefined,
        completedAt: row.completed_at ? new Date(row.completed_at) : undefined,
        durationMs: row.duration_ms,
        estimatedCostUsd: row.estimated_cost_usd,
        actualCostUsd: row.actual_cost_usd,
        retryCount: row.retry_count,
      }));
    } catch (error) {
      console.error('[CheckpointStore] Get completed steps error:', error);
      return [];
    }
  }

  /**
   * Update workflow run status
   */
  async updateRun(runId: string, update: WorkflowRunUpdate): Promise<void> {
    if (!this.isEnabled()) return;

    try {
      const updateData: Record<string, any> = {};

      if (update.status) updateData.status = update.status;
      if (update.currentStep !== undefined) updateData.current_step = update.currentStep;
      if (update.totalSteps !== undefined) updateData.total_steps = update.totalSteps;
      if (update.errorMessage) updateData.error_message = update.errorMessage;
      if (update.actualCostUsd !== undefined) updateData.actual_cost_usd = update.actualCostUsd;
      if (update.completedAt) updateData.completed_at = update.completedAt.toISOString();

      const { error } = await this.client!
        .from('workflow_runs')
        .update(updateData)
        .eq('id', runId);

      if (error) {
        console.error('[CheckpointStore] Failed to update run:', error);
      }
    } catch (error) {
      console.error('[CheckpointStore] Update run error:', error);
    }
  }

  /**
   * Get resumable workflows
   */
  async getResumableWorkflows(nodeId?: string): Promise<any[]> {
    if (!this.isEnabled()) return [];

    try {
      let query = this.client!
        .from('resumable_workflows')
        .select('*')
        .order('created_at', { ascending: false });

      if (nodeId) {
        query = query.eq('node_id', nodeId);
      }

      const { data, error } = await query.limit(50);

      if (error) {
        console.error('[CheckpointStore] Get resumable workflows error:', error);
        return [];
      }

      return data || [];
    } catch (error) {
      console.error('[CheckpointStore] Get resumable workflows error:', error);
      return [];
    }
  }
}

// =============================================================================
// SINGLETON
// =============================================================================

export const checkpointStore = new CheckpointStore();
