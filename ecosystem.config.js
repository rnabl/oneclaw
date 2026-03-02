module.exports = {
  apps: [
    {
      name: 'harness',
      cwd: '/opt/oneclaw/packages/harness',
      script: 'node',
      args: 'dist/server.js',
      env: {
        NODE_ENV: 'production',
        HARNESS_PORT: '8787',
      },
      wait_ready: true,
      listen_timeout: 10000,
      kill_timeout: 5000,
      restart_delay: 2000,
      max_restarts: 10,
    },
    {
      name: 'daemon',
      cwd: '/opt/oneclaw/oneclaw-node',
      script: './target/release/oneclaw-node',
      args: 'daemon --port 9000',
      env: {
        HARNESS_URL: 'http://localhost:8787',
      },
      restart_delay: 5000,
      max_restarts: 10,
      kill_timeout: 5000,
    },
  ],
};

