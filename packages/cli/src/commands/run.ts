import { loadConfig } from '@oneclaw/node-runtime';

/**
 * Run a workflow command
 */
export async function runCommand(
  workflowId: string,
  options: { input?: string }
) {
  const config = loadConfig();
  
  // Parse inputs
  const inputs = options.input ? JSON.parse(options.input) : {};
  
  // Call local daemon
  const response = await fetch('http://localhost:8787/run', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ workflow_id: workflowId, inputs }),
  });
  
  if (!response.ok) {
    const error = await response.text();
    console.error('Workflow failed:', error);
    process.exit(1);
  }
  
  const { receipt } = await response.json();
  
  console.log('✅ Workflow completed!');
  console.log(`Run ID: ${receipt.run_id}`);
  console.log(`Status: ${receipt.status}`);
  console.log(`Duration: ${receipt.debug.total_duration_ms}ms`);
  console.log(`\nReceipt: ${config.artifacts.path}/${receipt.run_id}/receipt.json`);
}
