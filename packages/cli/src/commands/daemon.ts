import { serve } from '@hono/node-server';
import { createDaemonServer } from '@oneclaw/node-runtime';
import chalk from 'chalk';

/**
 * Start the OneClaw node daemon
 * - Loads config
 * - Starts HTTP server on port 8787
 * - Serves UI at localhost:8787
 * - Provides control API
 */
export async function daemonCommand() {
  console.log(chalk.cyan('🦞 Starting OneClaw Node Daemon...\n'));

  try {
    const app = createDaemonServer();
    const port = 8787;

    serve({
      fetch: app.fetch,
      port,
    });

    console.log(chalk.green(`✅ Daemon running on http://localhost:${port}`));
    console.log(chalk.gray(`   UI: http://localhost:${port}`));
    console.log(chalk.gray(`   Health: http://localhost:${port}/health`));
    console.log(chalk.gray(`   Config: http://localhost:${port}/config`));
    console.log(chalk.yellow('\nPress Ctrl+C to stop\n'));
  } catch (error) {
    console.error(chalk.red('❌ Failed to start daemon:'));
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  }
}
