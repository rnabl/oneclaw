import { input, select, confirm } from '@inquirer/prompts';
import { writeFileSync, existsSync, mkdirSync } from 'fs';
import { join } from 'path';
import { stringify as stringifyYaml } from 'yaml';
import { nanoid } from 'nanoid';
import chalk from 'chalk';
import open from 'open';
import type { NodeConfig } from '@oneclaw/node-runtime';

/**
 * Interactive onboarding command
 * Creates node.yaml and starts local setup UI
 */
export async function onboardCommand() {
  console.log(chalk.bold.cyan('🦞 OneClaw Node Setup\n'));
  
  // 1. Check if already configured
  const configDir = join(process.env.HOME || process.env.USERPROFILE || '', '.oneclaw');
  const configPath = join(configDir, 'node.yaml');
  
  if (existsSync(configPath)) {
    const proceed = await confirm({
      message: 'Node already configured. Reconfigure?',
      default: false,
    });
    
    if (!proceed) {
      console.log(chalk.yellow('Exiting. Run "oneclaw run <workflow>" to use existing node.'));
      return;
    }
  }
  
  // 2. Generate node identity
  const nodeId = nanoid();
  console.log(chalk.dim(`Generated node ID: ${nodeId}\n`));
  
  // 3. Gather configuration
  const name = await input({
    message: 'Node name:',
    default: 'My OneClaw Node',
  });
  
  const environment = await select({
    message: 'Execution mode:',
    choices: [
      { name: 'Private - Run everything locally (most secure)', value: 'private' },
      { name: 'Managed - Run in OneClaw cloud', value: 'managed' },
      { name: 'Hybrid - Run sensitive steps locally, burst to cloud', value: 'hybrid' },
    ],
  });
  
  const provider = await select({
    message: 'LLM provider:',
    choices: [
      { name: 'Anthropic (Claude)', value: 'anthropic' },
      { name: 'OpenRouter', value: 'openrouter' },
      { name: 'OpenAI', value: 'openai' },
    ],
  });
  
  const model = await input({
    message: 'Model name:',
    default: provider === 'anthropic' ? 'claude-3-5-sonnet-20241022' : 
             provider === 'openrouter' ? 'anthropic/claude-3.5-sonnet' :
             'gpt-4-turbo',
  });
  
  const apiKeyEnv = await input({
    message: 'Environment variable for API key:',
    default: provider === 'anthropic' ? 'ANTHROPIC_API_KEY' :
             provider === 'openrouter' ? 'OPENROUTER_API_KEY' :
             'OPENAI_API_KEY',
  });
  
  // 4. Build config object
  const config: NodeConfig = {
    node: {
      id: nodeId,
      name,
      environment: environment as 'private' | 'managed' | 'hybrid',
    },
    llm: {
      provider: provider as 'anthropic' | 'openai' | 'openrouter',
      api_key_env: apiKeyEnv,
      model,
    },
    security: {
      mode: 'strict',
      allowed_executors: [
        'http.request',
        'browser.playwright',
        'llm.generate',
        'data.transform',
      ],
    },
    http: {
      allowed_domains: ['*'], // Allow all by default (can be restricted later)
    },
    executors: {
      browser: {
        mode: 'local',
        headless: true,
      },
    },
    artifacts: {
      storage: 'local',
      path: join(configDir, 'artifacts'),
    },
    logging: {
      level: 'info',
      path: join(configDir, 'logs'),
    },
    control_plane: {
      url: 'http://104.131.111.116:3000',
      token: null,
    },
  };
  
  // 5. Write config file
  if (!existsSync(configDir)) {
    mkdirSync(configDir, { recursive: true });
  }
  
  writeFileSync(configPath, stringifyYaml(config), 'utf-8');
  
  console.log(chalk.green(`\n✅ Config created at: ${configPath}\n`));
  
  // 6. Create artifacts and logs directories
  mkdirSync(config.artifacts.path, { recursive: true });
  mkdirSync(config.logging.path, { recursive: true });
  
  // 7. Prompt to start daemon
  const startDaemon = await confirm({
    message: 'Start OneClaw daemon now?',
    default: true,
  });
  
  if (startDaemon) {
    console.log(chalk.cyan('\n🚀 Starting OneClaw daemon...\n'));
    
    // TODO: Start daemon as background process
    // For now, just show instructions
    console.log(chalk.yellow('Daemon start not yet implemented.'));
    console.log(chalk.dim('Run: oneclaw daemon (coming soon)\n'));
  }
  
  // 8. Open local UI
  const openUI = await confirm({
    message: 'Open setup wizard in browser?',
    default: true,
  });
  
  if (openUI) {
    console.log(chalk.cyan('Opening http://localhost:8787/setup...\n'));
    await open('http://localhost:8787/setup');
  }
  
  console.log(chalk.bold.green('🎉 OneClaw node is ready!\n'));
  console.log(chalk.dim('Next steps:'));
  console.log(chalk.dim('  1. Start daemon: oneclaw daemon'));
  console.log(chalk.dim('  2. Pair with cloud: http://localhost:8787/setup'));
  console.log(chalk.dim('  3. Run workflow: oneclaw run <workflow-id>'));
}
