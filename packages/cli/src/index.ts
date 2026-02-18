#!/usr/bin/env node
import { Command } from 'commander';
import { onboardCommand } from './commands/onboard';
import { runCommand } from './commands/run';
import { daemonCommand } from './commands/daemon';

const program = new Command();

program
  .name('oneclaw')
  .description('OneClaw Node Runtime CLI')
  .version('0.1.0');

program
  .command('onboard')
  .description('Set up a new OneClaw node (interactive setup wizard)')
  .action(onboardCommand);

program
  .command('run <workflow>')
  .description('Run a workflow on the local node')
  .option('-i, --input <json>', 'Workflow inputs as JSON')
  .action(runCommand);

program
  .command('daemon')
  .description('Start the OneClaw node daemon (HTTP server on port 8787)')
  .action(daemonCommand);

program.parse();
