// OneClaw Node Workflow Integration
// Dispatch workflows to local OneClaw nodes

import { registry, type ToolDefinition } from '@oneclaw/harness';
import { z } from 'zod';

/**
 * Register OneClaw Node workflows in the harness registry
 */
export function registerNodeWorkflows() {
  // Wallet Check Workflow
  registry.register({
    id: 'oneclaw.node.wallet_check',
    name: 'Check Wallet Balance',
    description: 'Check OneClaw wallet balance via node runtime',
    version: '1.0.0',
    inputSchema: z.object({
      user_id: z.string().describe('Discord user ID'),
    }),
    outputSchema: z.object({
      balance: z.number().describe('Wallet balance in credits'),
      status: z.string().describe('Wallet status'),
    }),
    requiredSecrets: [],
    costCredits: 1,
    tags: ['wallet', 'oneclaw-node'],
    isPublic: false,
    author: 'OneClaw',
    execute: async (input, context) => {
      // Dispatch to node via control plane
      const nodeId = await selectAvailableNode();
      
      const response = await fetch('http://104.131.111.116:3000/api/v1/nodes/dispatch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          node_id: nodeId,
          workflow_id: 'wallet_check',
          inputs: input,
        }),
      });
      
      if (!response.ok) {
        throw new Error('Node dispatch failed');
      }
      
      const { run_id } = await response.json();
      
      // Poll for completion
      const result = await pollForCompletion(run_id);
      
      return result.outputs;
    },
  });
  
  // HVAC Search Workflow
  registry.register({
    id: 'oneclaw.node.hvac_search',
    name: 'Find Local HVAC Services',
    description: 'Search for HVAC contractors in user area',
    version: '1.0.0',
    inputSchema: z.object({
      zip_code: z.string().regex(/^\d{5}$/).describe('ZIP code'),
      service_type: z.enum(['repair', 'installation', 'maintenance']).default('repair'),
    }),
    outputSchema: z.object({
      contractors: z.array(z.object({
        name: z.string(),
        phone: z.string(),
        address: z.string(),
        rating: z.number(),
      })),
      search_url: z.string(),
    }),
    requiredSecrets: [],
    costCredits: 5,
    tags: ['hvac', 'local-search', 'home-services', 'oneclaw-node'],
    isPublic: true,
    author: 'OneClaw',
    execute: async (input, context) => {
      const nodeId = await selectAvailableNode();
      
      const response = await fetch('http://104.131.111.116:3000/api/v1/nodes/dispatch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          node_id: nodeId,
          workflow_id: 'hvac_search_local',
          inputs: input,
        }),
      });
      
      if (!response.ok) {
        throw new Error('Node dispatch failed');
      }
      
      const { run_id } = await response.json();
      const result = await pollForCompletion(run_id);
      
      return result.outputs;
    },
  });
}

/**
 * Select an available node for execution
 * TODO: Implement load balancing, affinity, etc.
 */
async function selectAvailableNode(): Promise<string> {
  // For now, just get the first online node
  const response = await fetch('http://104.131.111.116:3000/api/v1/nodes?status=online');
  const { nodes } = await response.json();
  
  if (!nodes || nodes.length === 0) {
    throw new Error('No online nodes available');
  }
  
  return nodes[0].id;
}

/**
 * Poll for workflow completion
 */
async function pollForCompletion(runId: string, maxAttempts = 30): Promise<any> {
  for (let i = 0; i < maxAttempts; i++) {
    const response = await fetch(`http://104.131.111.116:3000/api/v1/nodes/runs/${runId}`);
    const { run } = await response.json();
    
    if (run.status === 'success') {
      return run.receipt;
    }
    
    if (run.status === 'failed') {
      throw new Error(`Workflow failed: ${run.receipt?.error || 'Unknown error'}`);
    }
    
    // Wait 2 seconds before next poll
    await new Promise(resolve => setTimeout(resolve, 2000));
  }
  
  throw new Error('Workflow timeout - node did not complete in time');
}
