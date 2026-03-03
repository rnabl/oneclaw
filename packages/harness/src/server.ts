/**
 * Harness Standalone Server
 * 
 * Run with: pnpm dev
 */

import { config } from 'dotenv';
import { resolve } from 'path';
import { serve } from '@hono/node-server';
import { harnessApi } from './api';
import { schedulerHeartbeat } from './scheduler/heartbeat';
import { logEnvironmentInfo, isProduction, validateProductionConfig, getHarnessUrl } from './utils/env';

// SINGLE SOURCE OF TRUTH - HARDCODED PORTS
const PORTS = {
  HARNESS: 8787,
  DAEMON: 9000,
  API: 3000,
} as const;

// Load .env.production from project root (three directories up from src/)
const envPath = resolve(__dirname, '../../../.env.production');
const result = config({ path: envPath });

if (result.error) {
  console.error(`❌ Failed to load .env.production from ${envPath}:`, result.error);
} else {
  console.log(`✅ Loaded .env.production from ${envPath}`);
  console.log(`   APIFY_API_TOKEN: ${process.env.APIFY_API_TOKEN ? '✅ Present' : '❌ Missing'}`);
  console.log(`   PERPLEXITY_API_KEY: ${process.env.PERPLEXITY_API_KEY ? '✅ Present' : '❌ Missing'}`);
  console.log(`   BRAVE_API_KEY: ${process.env.BRAVE_API_KEY ? '✅ Present' : '❌ Missing'}`);
}

const port = PORTS.HARNESS;

console.log(`
╔═══════════════════════════════════════════════════════════════╗
║                    OneClaw Harness                             ║
║                                                               ║
║  Durable, policy-enforced execution runtime for AI agents    ║
╚═══════════════════════════════════════════════════════════════╝
`);

// Log environment detection
logEnvironmentInfo();

// Validate production config
const configIssues = validateProductionConfig();
if (configIssues.length > 0) {
  console.warn('⚠️  Configuration issues detected:');
  configIssues.forEach(issue => console.warn(`   - ${issue}`));
}

serve({
  fetch: harnessApi.fetch,
  port,
});

const serverUrl = isProduction() ? getHarnessUrl() : `http://localhost:${port}`;
console.log(`✅ Harness server running on ${serverUrl}`);

// Auto-start scheduler in production (or if explicitly enabled)
const autoStartScheduler = isProduction() || process.env.AUTO_START_SCHEDULER === 'true';
if (autoStartScheduler) {
  schedulerHeartbeat.start();
  console.log('✅ Scheduler auto-started (production mode)');
} else {
  console.log('ℹ️  Scheduler not auto-started (start with POST /scheduler/start)');
}

console.log(`
Endpoints:
  GET  /              - Info
  GET  /health        - Health check (includes scheduler status)
  GET  /tools         - List registered tools
  POST /secrets       - Store a secret
  POST /secrets/session - Create session key
  POST /execute       - Execute a workflow
  GET  /jobs/:id      - Get job status
  GET  /jobs/:id/cost - Get job cost breakdown
  GET  /jobs/:id/artifacts - Get job artifacts
  
Scheduler:
  POST /scheduler/start  - Start scheduler heartbeat
  POST /scheduler/stop   - Stop scheduler heartbeat
  POST /schedules        - Create a schedule
  GET  /schedules        - List schedules
  PATCH /schedules/:id   - Update/toggle schedule

Sub-Agents:
  POST /agents/outreach/launch - Launch outreach sub-agent
  GET  /agents/status          - Get active agent status
  GET  /agents/summary         - Get agent activity summary
`);
