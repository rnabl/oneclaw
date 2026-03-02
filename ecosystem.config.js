module.exports = {
  apps: [
    {
      name: 'harness',
      cwd: '/opt/oneclaw/packages/harness',
      script: 'pnpm',
      args: 'start',
      env: {
        NODE_ENV: 'production',
        HARNESS_PORT: '8787',
      },
    },
    {
      name: 'daemon',
      cwd: '/opt/oneclaw/oneclaw-node',
      script: './target/release/oneclaw-node',
      args: 'daemon',
      env: {
        HARNESS_URL: 'http://localhost:8787',
      },
    },
  ],
};
