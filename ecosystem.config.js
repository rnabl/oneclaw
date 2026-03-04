/**
 * PM2 Ecosystem Config
 * 
 * PORTS ARE HARDCODED IN CODE - NOT HERE
 * - Harness: 8787 (packages/harness/src/server.ts)
 * - Daemon:  9000 (oneclaw-node/src/ports.rs)
 * - API:     3000 (apps/api/src/index.ts)
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
      wait_ready: false,
      kill_timeout: 5000,
      restart_delay: 2000,
      max_restarts: 10,
    },
    {
      name: 'daemon',
      cwd: '/opt/oneclaw/oneclaw-node',
      script: './target/release/oneclaw-node',
      args: 'daemon',
      env: {
        NODE_ENV: 'production',
      },
      restart_delay: 5000,
      max_restarts: 10,
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
      wait_ready: false,
      kill_timeout: 5000,
      restart_delay: 2000,
      max_restarts: 10,
    },
  ],
};

