/**
 * PM2 Ecosystem Config - FIXED FOR PERSISTENCE
 * 
 * PORTS ARE HARDCODED IN CODE - NOT HERE
 * - Harness: 8787 (packages/harness/src/server.ts)
 * - Daemon:  9000 (oneclaw-node/src/ports.rs)
 * - API:     3000 (apps/api/src/index.ts)
 * 
 * PERSISTENCE: Unlimited restarts + auto-start on boot
 */
module.exports = {
  apps: [
    {
      name: 'harness',
      cwd: '/opt/oneclaw/packages/harness',
      script: 'node',
      args: 'dist/server.js',
      env_file: '/opt/oneclaw/.env.production',
      env: {
        NODE_ENV: 'production',
      },
      
      // PERSISTENCE SETTINGS
      autorestart: true,           // Always restart on crash
      max_restarts: 999999,        // Unlimited restarts (was: 10)
      min_uptime: '10s',           // Must stay up 10s to be "stable"
      max_memory_restart: '1G',    // Restart if memory exceeds 1GB
      restart_delay: 2000,         // Wait 2s between restarts
      
      // ERROR HANDLING
      error_file: '/opt/oneclaw/logs/harness-error.log',
      out_file: '/opt/oneclaw/logs/harness-out.log',
      merge_logs: true,
      
      // GRACEFUL SHUTDOWN
      kill_timeout: 5000,
      wait_ready: false,
    },
    {
      name: 'daemon',
      cwd: '/opt/oneclaw/oneclaw-node',
      script: './target/release/oneclaw-node',
      args: 'daemon',
      env: {
        NODE_ENV: 'production',
      },
      autorestart: true,
      max_restarts: 999999,
      restart_delay: 5000,
      kill_timeout: 5000,
    },
    {
      name: 'api',
      cwd: '/opt/oneclaw/apps/api',
      script: 'npx',
      args: 'tsx src/index.ts',
      env: {
        NODE_ENV: 'production',
      },
      autorestart: true,
      max_restarts: 999999,
      restart_delay: 2000,
      kill_timeout: 5000,
    },
  ],
};

