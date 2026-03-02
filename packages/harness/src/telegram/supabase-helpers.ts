/**
 * Telegram Bot Supabase Integration
 * 
 * Helper functions for Telegram bot to interact with Supabase:
 * - Check workflow status
 * - Resume failed workflows
 * - View saved businesses
 * - Query logs
 */

import { createClient } from '@supabase/supabase-js';
import { checkpointStore, resumeWorkflow, getResumableWorkflows } from '@oneclaw/harness';

const supabaseUrl = process.env.SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

// =============================================================================
// TELEGRAM COMMANDS
// =============================================================================

/**
 * Get user's recent workflow runs
 * Command: /jobs or /status
 */
export async function getUserWorkflows(userId: string, limit = 10) {
  const { data, error } = await supabase
    .from('workflow_runs')
    .select('id, workflow_id, status, current_step, total_steps, created_at')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) {
    return { success: false, error: error.message };
  }

  return { success: true, workflows: data || [] };
}

/**
 * Get specific workflow details
 * Command: /job <run_id>
 */
export async function getWorkflowDetails(runId: string) {
  // Get run info
  const { data: run, error: runError } = await supabase
    .from('workflow_runs')
    .select('*')
    .eq('id', runId)
    .single();

  if (runError || !run) {
    return { success: false, error: 'Workflow not found' };
  }

  // Get artifacts
  const { data: artifacts } = await supabase
    .from('workflow_artifacts')
    .select('artifact_key, size_bytes, created_at')
    .eq('run_id', runId);

  // Get recent logs
  const { data: logs } = await supabase
    .from('workflow_logs')
    .select('level, message, timestamp')
    .eq('run_id', runId)
    .order('timestamp', { ascending: false })
    .limit(20);

  return {
    success: true,
    run,
    artifacts: artifacts || [],
    logs: logs || [],
  };
}

/**
 * Get saved businesses from a workflow
 * Command: /businesses <run_id>
 */
export async function getSavedBusinesses(runId: string) {
  const { data, error } = await supabase
    .from('workflow_artifacts')
    .select('data')
    .eq('run_id', runId)
    .eq('artifact_key', 'enriched_businesses')
    .single();

  if (error || !data) {
    // Try raw_businesses if enriched not found
    const { data: rawData, error: rawError } = await supabase
      .from('workflow_artifacts')
      .select('data')
      .eq('run_id', runId)
      .eq('artifact_key', 'raw_businesses')
      .single();

    if (rawError || !rawData) {
      return { success: false, error: 'No businesses found for this workflow' };
    }

    return { success: true, businesses: rawData.data, type: 'raw' };
  }

  return { success: true, businesses: data.data, type: 'enriched' };
}

/**
 * List resumable workflows
 * Command: /resume
 */
export async function getResumableWorkflowsList(userId?: string) {
  let query = supabase
    .from('resumable_workflows')
    .select('*')
    .order('created_at', { ascending: false });

  if (userId) {
    // Filter by user if provided (requires user_id in workflow_runs)
    const { data: userRuns } = await supabase
      .from('workflow_runs')
      .select('id')
      .eq('user_id', userId);

    if (userRuns && userRuns.length > 0) {
      const runIds = userRuns.map(r => r.id);
      query = query.in('run_id', runIds);
    }
  }

  const { data, error } = await query.limit(10);

  if (error) {
    return { success: false, error: error.message };
  }

  return { success: true, workflows: data || [] };
}

/**
 * Resume a failed workflow
 * Command: /resume <run_id>
 */
export async function resumeWorkflowCommand(runId: string, userId: string) {
  try {
    const result = await resumeWorkflow({
      runId,
      tenantId: userId,
      tier: 'pro',
    });

    return {
      success: true,
      message: result.message,
      recoveredData: result.recoveredData,
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * Export businesses to CSV
 * Command: /export <run_id>
 */
export async function exportBusinessesToCSV(runId: string) {
  const result = await getSavedBusinesses(runId);

  if (!result.success || !result.businesses) {
    return { success: false, error: 'No businesses to export' };
  }

  const businesses = result.businesses as any[];

  // Generate CSV
  const headers = ['Name', 'Phone', 'Website', 'Address', 'City', 'State', 'Rating', 'Reviews'];
  const rows = businesses.map(b => [
    b.name || '',
    b.phone || '',
    b.website || '',
    b.address || '',
    b.city || '',
    b.state || '',
    b.rating || '',
    b.reviewCount || b.review_count || '',
  ]);

  const csv = [
    headers.join(','),
    ...rows.map(row => row.map(cell => `"${cell}"`).join(',')),
  ].join('\n');

  return {
    success: true,
    csv,
    filename: `businesses_${runId.slice(0, 8)}.csv`,
    count: businesses.length,
  };
}

// =============================================================================
// FORMAT HELPERS (For Telegram Messages)
// =============================================================================

export function formatWorkflowList(workflows: any[]): string {
  if (workflows.length === 0) {
    return '📋 No workflows found.';
  }

  let message = '📋 **Your Recent Workflows:**\n\n';

  for (const wf of workflows) {
    const statusEmoji = 
      wf.status === 'completed' ? '✅' :
      wf.status === 'running' ? '🔄' :
      wf.status === 'failed' ? '❌' :
      wf.status === 'pending' ? '⏳' : '📝';

    message += `${statusEmoji} **${wf.workflow_id}**\n`;
    message += `   Status: ${wf.status}\n`;
    message += `   Progress: ${wf.current_step}/${wf.total_steps}\n`;
    message += `   ID: \`${wf.id}\`\n\n`;
  }

  message += '\n💡 Use `/job <id>` for details';

  return message;
}

export function formatResumableWorkflows(workflows: any[]): string {
  if (workflows.length === 0) {
    return '✅ No failed workflows to resume.';
  }

  let message = '🔄 **Failed Workflows (Data Saved):**\n\n';

  for (const wf of workflows) {
    message += `**${wf.workflow_id}**\n`;
    message += `Failed at: Step ${wf.current_step}/${wf.total_steps}\n`;
    message += `Saved: ${wf.artifacts_count} artifacts\n`;
    message += `Command: \`/resume ${wf.run_id}\`\n\n`;
  }

  return message;
}

export function formatWorkflowDetails(details: any): string {
  const { run, artifacts, logs } = details;

  let message = `📊 **Workflow Details**\n\n`;
  message += `**ID:** \`${run.id}\`\n`;
  message += `**Type:** ${run.workflow_id}\n`;
  message += `**Status:** ${run.status}\n`;
  message += `**Progress:** ${run.current_step}/${run.total_steps}\n`;

  if (run.error_message) {
    message += `**Error:** ${run.error_message}\n`;
  }

  if (artifacts && artifacts.length > 0) {
    message += `\n💾 **Saved Data:**\n`;
    for (const artifact of artifacts) {
      const sizeMB = (artifact.size_bytes / 1024 / 1024).toFixed(2);
      message += `- ${artifact.artifact_key}: ${sizeMB}MB\n`;
    }
  }

  if (logs && logs.length > 0) {
    message += `\n📝 **Recent Logs:**\n`;
    for (const log of logs.slice(0, 5)) {
      const emoji = log.level === 'error' ? '❌' : log.level === 'warn' ? '⚠️' : '📍';
      message += `${emoji} ${log.message}\n`;
    }
  }

  message += `\n💡 Commands:\n`;
  message += `- \`/businesses ${run.id}\` - View saved businesses\n`;
  message += `- \`/export ${run.id}\` - Export to CSV\n`;
  if (run.status === 'failed') {
    message += `- \`/resume ${run.id}\` - Resume from checkpoint\n`;
  }

  return message;
}
