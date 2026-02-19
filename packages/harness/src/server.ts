/**
 * Harness Standalone Server
 * 
 * Run with: pnpm dev
 */

import { config } from 'dotenv';
import { resolve } from 'path';
import { serve } from '@hono/node-server';
import { harnessApi } from './api';

// Load .env.local from project root (three directories up from src/)
config({ path: resolve(__dirname, '../../../.env.local') });

const port = parseInt(process.env.HARNESS_PORT || '9000');

console.log(`
╔═══════════════════════════════════════════════════════════════╗
║                    OneClaw Harness                             ║
║                                                               ║
║  Durable, policy-enforced execution runtime for AI agents    ║
╚═══════════════════════════════════════════════════════════════╝
`);

serve({
  fetch: harnessApi.fetch,
  port,
});

console.log(`✅ Harness server running on http://localhost:${port}`);
console.log(`
Endpoints:
  GET  /              - Info
  GET  /health        - Health check
  GET  /tools         - List registered tools
  POST /secrets       - Store a secret
  POST /secrets/session - Create session key
  POST /execute       - Execute a workflow
  GET  /jobs/:id      - Get job status
  GET  /jobs/:id/cost - Get job cost breakdown
  GET  /jobs/:id/artifacts - Get job artifacts
`);
