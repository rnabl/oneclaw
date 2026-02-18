// OneClaw Node Control Plane Routes
// Node registration, pairing, heartbeat, and dispatch

import { Context } from 'hono';
import { createClient, SupabaseClient } from '@supabase/supabase-js';

let supabase: SupabaseClient | null = null;

function getSupabase(): SupabaseClient {
  if (supabase) return supabase;
  
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  
  if (!supabaseUrl || !supabaseKey) {
    throw new Error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  }
  
  supabase = createClient(supabaseUrl, supabaseKey);
  return supabase;
}

/**
 * Generate 9-character pairing code (ABC-DEF-GHI format)
 */
function generatePairingCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // Remove ambiguous chars
  const parts = [];
  
  for (let i = 0; i < 3; i++) {
    let part = '';
    for (let j = 0; j < 3; j++) {
      part += chars[Math.floor(Math.random() * chars.length)];
    }
    parts.push(part);
  }
  
  return parts.join('-');
}

/**
 * POST /api/v1/nodes/register
 * Register a new OneClaw node
 */
export async function registerNodeHandler(c: Context) {
  const { node_id, name, environment } = await c.req.json();
  
  // Create or update node record
  const { data, error } = await supabase
    .from('nodes')
    .upsert({
      id: node_id,
      name,
      environment,
      status: 'offline',
      last_heartbeat: new Date().toISOString(),
    })
    .select()
    .single();
  
  if (error) {
    return c.json({ error: error.message }, 500);
  }
  
  return c.json({ node: data });
}

/**
 * POST /api/v1/nodes/pair
 * Generate pairing code for a node
 */
export async function pairNodeHandler(c: Context) {
  const { node_id } = await c.req.json();
  
  // Generate 12-char pairing code
  const code = generatePairingCode();
  
  // Store in database with expiry (5 minutes)
  const { data, error } = await supabase
    .from('node_pairing_codes')
    .insert({
      code,
      node_id,
      expires_at: new Date(Date.now() + 5 * 60 * 1000).toISOString(),
    })
    .select()
    .single();
  
  if (error) {
    return c.json({ error: error.message }, 500);
  }
  
  return c.json({ code });
}

/**
 * POST /api/v1/nodes/heartbeat
 * Node sends heartbeat to show it's alive
 */
export async function heartbeatHandler(c: Context) {
  const { node_id } = await c.req.json();
  
  const { error } = await supabase
    .from('nodes')
    .update({
      status: 'online',
      last_heartbeat: new Date().toISOString(),
    })
    .eq('id', node_id);
  
  if (error) {
    return c.json({ error: error.message }, 500);
  }
  
  return c.json({ status: 'ok' });
}

/**
 * POST /api/v1/nodes/dispatch
 * Dispatch a workflow to a specific node
 */
export async function dispatchWorkflowHandler(c: Context) {
  const { node_id, workflow_id, inputs } = await c.req.json();
  
  // Find node
  const { data: node, error: nodeError } = await supabase
    .from('nodes')
    .select('*')
    .eq('id', node_id)
    .single();
  
  if (nodeError || !node) {
    return c.json({ error: 'Node not found' }, 404);
  }
  
  if (node.status !== 'online') {
    return c.json({ error: 'Node is offline' }, 503);
  }
  
  // Create workflow run record
  const { data: run, error: runError } = await supabase
    .from('workflow_runs')
    .insert({
      node_id,
      workflow_id,
      status: 'pending',
      inputs,
    })
    .select()
    .single();
  
  if (runError) {
    return c.json({ error: runError.message }, 500);
  }
  
  // TODO: Push to node via webhook or polling queue
  // For now, node will poll /api/v1/nodes/poll
  
  return c.json({ run_id: run.id });
}

/**
 * GET /api/v1/nodes/poll
 * Node polls for pending workflows
 */
export async function pollWorkflowsHandler(c: Context) {
  const nodeId = c.req.query('node_id');
  
  if (!nodeId) {
    return c.json({ error: 'Missing node_id' }, 400);
  }
  
  // Get pending workflows for this node
  const { data: runs, error } = await supabase
    .from('workflow_runs')
    .select('*')
    .eq('node_id', nodeId)
    .eq('status', 'pending')
    .order('created_at', { ascending: true })
    .limit(10);
  
  if (error) {
    return c.json({ error: error.message }, 500);
  }
  
  return c.json({ runs: runs || [] });
}

/**
 * POST /api/v1/nodes/complete
 * Node reports workflow completion
 */
export async function completeWorkflowHandler(c: Context) {
  const { run_id, status, receipt } = await c.req.json();
  
  const { error } = await supabase
    .from('workflow_runs')
    .update({
      status,
      completed_at: new Date().toISOString(),
      receipt,
    })
    .eq('id', run_id);
  
  if (error) {
    return c.json({ error: error.message }, 500);
  }
  
  return c.json({ status: 'ok' });
}

/**
 * GET /api/v1/nodes/runs/:run_id
 * Get workflow run status
 */
export async function getRunStatusHandler(c: Context) {
  const runId = c.req.param('run_id');
  
  const { data: run, error } = await supabase
    .from('workflow_runs')
    .select('*')
    .eq('id', runId)
    .single();
  
  if (error || !run) {
    return c.json({ error: 'Run not found' }, 404);
  }
  
  return c.json({ run });
}

/**
 * GET /api/v1/nodes
 * List nodes (optionally filter by status)
 */
export async function listNodesHandler(c: Context) {
  const status = c.req.query('status');
  
  let query = getSupabase().from('nodes').select('*');
  
  if (status) {
    query = query.eq('status', status);
  }
  
  const { data: nodes, error } = await query;
  
  if (error) {
    return c.json({ error: error.message }, 500);
  }
  
  return c.json({ nodes: nodes || [] });
}
