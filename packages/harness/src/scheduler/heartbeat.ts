/**
 * Scheduler Heartbeat
 * 
 * Checks for due schedules and executes them automatically.
 * Runs every minute to check for pending work.
 * 
 * Supported workflows:
 * - state-level-discovery: Discover businesses in a state
 * - outreach: Full outreach workflow (discover + email)
 * - discovery: Simple business discovery
 */

import { spawn, type ChildProcess } from 'child_process';
import { resolve, join } from 'path';
import { nanoid } from 'nanoid';
import { scheduleStore, calculateNextRun, type Schedule } from './index';
import { workflowExecutor } from '../workflows/templates/executor';
import { getHarnessUrl, isProduction } from '../utils/env';

interface OutreachParams {
  niche: string;
  location: string;
  senderName: string;
  senderEmail: string;
  maxEmails?: number;
  dryRun?: boolean;
  minReviews?: number;
  maxReviews?: number;
}

export class SchedulerHeartbeat {
  private interval: NodeJS.Timeout | null = null;
  private running: boolean = false;
  private activeProcesses: Map<string, ChildProcess> = new Map();
  
  /**
   * Check if heartbeat is currently running
   */
  isRunning(): boolean {
    return this.running;
  }
  
  /**
   * Get count of active workflow processes
   */
  getActiveCount(): number {
    return this.activeProcesses.size;
  }
  
  /**
   * Start the heartbeat (check every minute)
   */
  start() {
    if (this.running) {
      console.log('[Scheduler] Heartbeat already running');
      return;
    }
    
    this.running = true;
    console.log('[Scheduler] ❤️  Heartbeat started (checking every 60s)');
    
    // Check immediately
    this.tick();
    
    // Then check every minute
    this.interval = setInterval(() => this.tick(), 60000);
  }
  
  /**
   * Stop the heartbeat
   */
  stop() {
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
    }
    this.running = false;
    console.log('[Scheduler] Heartbeat stopped');
  }
  
  /**
   * Check for due schedules and execute them
   */
  private async tick() {
    const due = scheduleStore.getDue();
    
    if (due.length === 0) {
      return;  // Nothing to do
    }
    
    console.log(`[Scheduler] Found ${due.length} due schedule(s)`);
    
    for (const schedule of due) {
      await this.executeSchedule(schedule);
    }
  }
  
  /**
   * Execute a scheduled workflow
   */
  private async executeSchedule(schedule: Schedule) {
    console.log(`[Scheduler] Executing schedule: ${schedule.name} (${schedule.id})`);
    
    try {
      // Mark as running
      scheduleStore.update(schedule.id, {
        lastRun: new Date()
      });
      
      // Execute based on workflow type
      let result: any;
      
      switch (schedule.workflow) {
        case 'state-level-discovery':
          result = await workflowExecutor.executeStateLevelDiscovery(schedule.params as any);
          break;
          
        case 'outreach':
          result = await this.executeOutreachWorkflow(schedule);
          break;
          
        case 'discovery':
          result = await this.executeDiscoveryWorkflow(schedule);
          break;
          
        default:
          throw new Error(`Unknown workflow: ${schedule.workflow}`);
      }
      
      // Update schedule with success
      const nextRun = calculateNextRun(schedule.cron!, new Date());
      
      scheduleStore.update(schedule.id, {
        lastResult: {
          success: true,
          executionId: result.executionId || result.runId
        },
        nextRun
      });
      
      console.log(`[Scheduler] ✅ Schedule ${schedule.name} completed. Next run: ${nextRun.toISOString()}`);
      
    } catch (error) {
      console.error(`[Scheduler] ❌ Schedule ${schedule.name} failed:`, error);
      
      // Update schedule with failure
      const nextRun = calculateNextRun(schedule.cron!, new Date());
      
      scheduleStore.update(schedule.id, {
        lastResult: {
          success: false,
          error: String(error)
        },
        nextRun
      });
    }
  }
  
  /**
   * Execute outreach workflow via sub-agent
   */
  private async executeOutreachWorkflow(schedule: Schedule): Promise<{ runId: string; status: string }> {
    const params = schedule.params as any as OutreachParams;
    const runId = `scheduled-${nanoid(8)}`;
    
    console.log(`[Scheduler] Launching outreach sub-agent: ${runId}`);
    console.log(`[Scheduler]   Niche: ${params.niche}`);
    console.log(`[Scheduler]   Location: ${params.location}`);
    console.log(`[Scheduler]   Max Emails: ${params.maxEmails || 10}`);
    console.log(`[Scheduler]   Dry Run: ${params.dryRun !== false}`);
    
    // Resolve paths
    const workspaceRoot = resolve(__dirname, '..', '..', '..', '..');
    const subAgentDir = join(workspaceRoot, 'sub-agents', 'outreach');
    const logDir = join(workspaceRoot, 'logs', 'agents');
    
    // Windows compatibility
    const isWindows = process.platform === 'win32';
    const npxCmd = isWindows ? 'npx.cmd' : 'npx';
    
    // Environment variables for sub-agent
    const env = {
      ...process.env,
      NICHE: params.niche,
      LOCATION: params.location,
      SENDER_NAME: params.senderName,
      SENDER_EMAIL: params.senderEmail,
      MAX_EMAILS: String(params.maxEmails || 10),
      DRY_RUN: String(params.dryRun !== false),
      MIN_REVIEWS: String(params.minReviews || 50),
      MAX_REVIEWS: String(params.maxReviews || 300),
      TENANT_ID: schedule.tenantId,
      RUN_ID: runId,
      HARNESS_URL: getHarnessUrl(),
      LOG_DIR: logDir,
    };
    
    return new Promise((resolve, reject) => {
      try {
        const proc = spawn(npxCmd, ['tsx', 'src/index.ts'], {
          cwd: subAgentDir,
          detached: !isWindows,
          stdio: 'pipe',
          shell: isWindows,
          env
        });
        
        // Track the process
        this.activeProcesses.set(runId, proc);
        
        let stdout = '';
        let stderr = '';
        
        proc.stdout?.on('data', (data) => {
          stdout += data.toString();
          console.log(`[Scheduler:${runId}] ${data.toString().trim()}`);
        });
        
        proc.stderr?.on('data', (data) => {
          stderr += data.toString();
          console.error(`[Scheduler:${runId}] ${data.toString().trim()}`);
        });
        
        proc.on('close', (code) => {
          this.activeProcesses.delete(runId);
          
          if (code === 0) {
            console.log(`[Scheduler] Sub-agent ${runId} completed successfully`);
            resolve({ runId, status: 'completed' });
          } else {
            console.error(`[Scheduler] Sub-agent ${runId} exited with code ${code}`);
            reject(new Error(`Sub-agent exited with code ${code}: ${stderr}`));
          }
        });
        
        proc.on('error', (error) => {
          this.activeProcesses.delete(runId);
          console.error(`[Scheduler] Sub-agent ${runId} error:`, error);
          reject(error);
        });
        
        // Don't unref - we want to track completion
        console.log(`[Scheduler] Sub-agent ${runId} spawned (PID: ${proc.pid})`);
        
      } catch (error) {
        reject(error);
      }
    });
  }
  
  /**
   * Execute simple discovery workflow
   */
  private async executeDiscoveryWorkflow(schedule: Schedule): Promise<{ executionId: string }> {
    const params = schedule.params as any;
    
    console.log(`[Scheduler] Running discovery: ${params.niche} in ${params.location}`);
    
    // Use the workflow executor directly
    const result = await workflowExecutor.executeStateLevelDiscovery({
      state: params.location,
      niche: params.niche,
      limit: params.limit || 10,
      tenantId: schedule.tenantId
    } as any);
    
    return { executionId: result.executionId };
  }
}

// Singleton instance
export const schedulerHeartbeat = new SchedulerHeartbeat();
