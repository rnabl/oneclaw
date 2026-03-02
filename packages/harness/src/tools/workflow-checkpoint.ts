/**
 * Workflow Checkpoint Tools
 * 
 * Handles workflow resume and checkpoint management
 */

import { z } from 'zod';
import { createClient } from '@supabase/supabase-js';
import { resumeWorkflow, getResumableWorkflows } from '../execution/resume';

// =============================================================================
// SCHEMAS
// =============================================================================

const ResumeWorkflowInput = z.object({
  userId: z.string(),
  runId: z.string(),
});

const ResumeWorkflowOutput = z.object({
  success: z.boolean(),
  runId: z.string(),
  status: z.string(),
  message: z.string(),
});

const ListResumableWorkflowsInput = z.object({
  userId: z.string(),
  limit: z.number().optional().default(20),
});

const ListResumableWorkflowsOutput = z.object({
  workflows: z.array(z.object({
    runId: z.string(),
    workflowId: z.string(),
    status: z.string(),
    currentStep: z.number(),
    totalSteps: z.number(),
    failedAt: z.string(),
    errorMessage: z.string().nullable(),
  })),
  total: z.number(),
});

// =============================================================================
// HANDLERS
// =============================================================================

export async function resumeWorkflowHandler(
  input: z.infer<typeof ResumeWorkflowInput>,
  context: { tenantId: string }
): Promise<z.infer<typeof ResumeWorkflowOutput>> {
  const { userId, runId } = input;

  // Validate environment
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_KEY;
  
  if (!supabaseUrl || !supabaseKey) {
    throw new Error('Missing Supabase credentials (SUPABASE_URL, SUPABASE_SERVICE_KEY)');
  }

  const supabase = createClient(supabaseUrl, supabaseKey);

  try {
    // Resume the workflow
    const result = await resumeWorkflow(runId, supabase);

    return {
      success: true,
      runId: result.runId,
      status: result.status,
      message: `Workflow resumed successfully from step ${result.resumedFromStep}`,
    };
  } catch (error) {
    return {
      success: false,
      runId,
      status: 'failed',
      message: `Failed to resume workflow: ${error instanceof Error ? error.message : 'Unknown error'}`,
    };
  }
}

export async function listResumableWorkflowsHandler(
  input: z.infer<typeof ListResumableWorkflowsInput>,
  context: { tenantId: string }
): Promise<z.infer<typeof ListResumableWorkflowsOutput>> {
  const { userId, limit } = input;

  // Validate environment
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_KEY;
  
  if (!supabaseUrl || !supabaseKey) {
    throw new Error('Missing Supabase credentials (SUPABASE_URL, SUPABASE_SERVICE_KEY)');
  }

  const supabase = createClient(supabaseUrl, supabaseKey);

  try {
    // Get resumable workflows
    const workflows = await getResumableWorkflows(supabase, userId);

    // Limit results
    const limitedWorkflows = workflows.slice(0, limit);

    return {
      workflows: limitedWorkflows.map((wf) => ({
        runId: wf.run_id,
        workflowId: wf.workflow_id,
        status: wf.status,
        currentStep: wf.current_step || 0,
        totalSteps: wf.total_steps || 0,
        failedAt: wf.updated_at,
        errorMessage: wf.error_message || null,
      })),
      total: workflows.length,
    };
  } catch (error) {
    throw new Error(
      `Failed to list resumable workflows: ${error instanceof Error ? error.message : 'Unknown error'}`
    );
  }
}

// =============================================================================
// TOOL DEFINITIONS
// =============================================================================

export const RESUME_WORKFLOW_TOOL = {
  id: 'resume-workflow',
  name: 'resume-workflow',
  description: 'Resume a failed workflow from its last checkpoint',
  version: '1.0.0',
  costClass: 'cheap' as const,
  estimatedCostUsd: 0.001,
  requiredSecrets: ['supabase'] as string[],
  tags: ['workflow', 'checkpoint', 'recovery', 'resume'],
  inputSchema: ResumeWorkflowInput,
  outputSchema: ResumeWorkflowOutput,
  networkPolicy: {
    allowedDomains: ['*.supabase.co'],
    blockedDomains: [],
    allowLocalhost: false,
  },
  isPublic: true,
  handler: async (input: unknown, context: { tenantId: string }) => {
    const validated = ResumeWorkflowInput.parse(input);
    return resumeWorkflowHandler(validated, context);
  },
};

export const LIST_RESUMABLE_WORKFLOWS_TOOL = {
  id: 'list-resumable-workflows',
  name: 'list-resumable-workflows',
  description: 'List all workflows that can be resumed from checkpoints',
  version: '1.0.0',
  costClass: 'free' as const,
  estimatedCostUsd: 0,
  requiredSecrets: ['supabase'] as string[],
  tags: ['workflow', 'checkpoint', 'list'],
  inputSchema: ListResumableWorkflowsInput,
  outputSchema: ListResumableWorkflowsOutput,
  networkPolicy: {
    allowedDomains: ['*.supabase.co'],
    blockedDomains: [],
    allowLocalhost: false,
  },
  isPublic: true,
  handler: async (input: unknown, context: { tenantId: string }) => {
    const validated = ListResumableWorkflowsInput.parse(input);
    return listResumableWorkflowsHandler(validated, context);
  },
};

export { ResumeWorkflowInput, ResumeWorkflowOutput, ListResumableWorkflowsInput, ListResumableWorkflowsOutput };
