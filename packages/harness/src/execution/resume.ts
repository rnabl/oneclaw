/**
 * Workflow Resume Logic
 * 
 * Allows resuming failed workflows from their last successful checkpoint.
 * Solves the problem: "Discovery found 100 businesses but step 2 failed → resume from step 2"
 */

import { checkpointStore } from './checkpoint-store';
import { runner } from './runner';
import type { ExecuteOptions } from './runner';

export interface ResumeOptions extends ExecuteOptions {
  runId: string;           // The failed workflow run to resume
  fromStep?: number;       // Optional: specific step to resume from (defaults to last failed)
}

/**
 * Resume a failed workflow from its last checkpoint
 */
export async function resumeWorkflow(options: ResumeOptions): Promise<any> {
  const { runId, fromStep } = options;
  
  console.log(`[Resume] Attempting to resume workflow: ${runId}`);
  
  // Check if checkpoint store is available
  if (!checkpointStore.isEnabled()) {
    throw new Error('Checkpoint store not available (Supabase not configured)');
  }
  
  // Get completed steps
  const completedSteps = await checkpointStore.getCompletedSteps(runId);
  
  if (completedSteps.length === 0) {
    throw new Error(`No completed steps found for run ${runId} - cannot resume`);
  }
  
  console.log(`[Resume] Found ${completedSteps.length} completed steps`);
  
  // Determine resume point
  const resumeFromStep = fromStep !== undefined 
    ? fromStep 
    : completedSteps[completedSteps.length - 1].stepIndex + 1;
  
  console.log(`[Resume] Resuming from step ${resumeFromStep}`);
  
  // Get saved artifacts (intermediate data)
  const rawBusinesses = await checkpointStore.getArtifact(runId, 'raw_businesses');
  const scanResults = await checkpointStore.getArtifact(runId, 'scan_results');
  const enrichedBusinesses = await checkpointStore.getArtifact(runId, 'enriched_businesses');
  
  // Log what we recovered
  if (rawBusinesses) {
    console.log(`[Resume] Recovered ${rawBusinesses.length} raw businesses from checkpoint`);
  }
  if (scanResults) {
    console.log(`[Resume] Recovered ${scanResults.length} scan results from checkpoint`);
  }
  if (enrichedBusinesses) {
    console.log(`[Resume] Recovered ${enrichedBusinesses.length} enriched businesses from checkpoint`);
  }
  
  // Build recovery message
  const recoveryMessage = [
    '🔄 **Workflow Resumed from Checkpoint**',
    '',
    `✅ Step 1: Discovery - ${rawBusinesses?.length || 0} businesses recovered`,
    scanResults ? `✅ Step 2: Enrichment - ${scanResults.length} scans recovered` : '⏭️ Step 2: Skipped (no checkpoint)',
    enrichedBusinesses ? `✅ Step 3: Processing - ${enrichedBusinesses.length} businesses recovered` : '⏭️ Step 3: To be completed',
    '',
    `📍 Resuming from step ${resumeFromStep}...`,
  ].join('\n');
  
  // Return the most recent artifact we have
  return {
    resumed: true,
    runId,
    fromStep: resumeFromStep,
    completedSteps: completedSteps.length,
    recoveredData: {
      rawBusinesses: rawBusinesses || [],
      scanResults: scanResults || [],
      enrichedBusinesses: enrichedBusinesses || [],
    },
    message: recoveryMessage,
  };
}

/**
 * Get resumable workflows for a node
 */
export async function getResumableWorkflows(nodeId?: string): Promise<any[]> {
  if (!checkpointStore.isEnabled()) {
    return [];
  }
  
  return await checkpointStore.getResumableWorkflows(nodeId);
}

/**
 * Check if a workflow can be resumed
 */
export async function canResumeWorkflow(runId: string): Promise<boolean> {
  if (!checkpointStore.isEnabled()) {
    return false;
  }
  
  const completedSteps = await checkpointStore.getCompletedSteps(runId);
  return completedSteps.length > 0;
}
