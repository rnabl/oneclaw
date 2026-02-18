import { writeFileSync, mkdirSync, existsSync, readFileSync, readdirSync } from 'fs';
import { join } from 'path';
import type { WorkflowReceipt } from './types';
import { loadConfig } from '../config';
import { createHash } from 'crypto';

/**
 * Receipt Writer - Persists execution traces
 * Every run MUST produce a receipt
 */
export class ReceiptWriter {
  private artifactsPath: string;
  
  constructor() {
    const config = loadConfig();
    this.artifactsPath = config.artifacts.path;
  }
  
  /**
   * Write a receipt to disk
   * Storage: ./artifacts/{run_id}/receipt.json
   */
  write(receipt: WorkflowReceipt): void {
    const receiptDir = join(this.artifactsPath, receipt.run_id);
    
    // Create directory if doesn't exist
    if (!existsSync(receiptDir)) {
      mkdirSync(receiptDir, { recursive: true });
    }
    
    // Write receipt as JSON
    const receiptPath = join(receiptDir, 'receipt.json');
    writeFileSync(receiptPath, JSON.stringify(receipt, null, 2), 'utf-8');
  }
  
  /**
   * Read a receipt from disk
   */
  read(runId: string): WorkflowReceipt | null {
    const receiptPath = join(this.artifactsPath, runId, 'receipt.json');
    
    if (!existsSync(receiptPath)) {
      return null;
    }
    
    const content = readFileSync(receiptPath, 'utf-8');
    return JSON.parse(content) as WorkflowReceipt;
  }
  
  /**
   * List all receipts
   */
  list(): string[] {
    if (!existsSync(this.artifactsPath)) {
      return [];
    }
    
    return readdirSync(this.artifactsPath);
  }
}

/**
 * Generate config snapshot hash for debugging
 */
export function getConfigSnapshot(): string {
  const config = loadConfig();
  const configStr = JSON.stringify(config, null, 0);
  return createHash('sha256').update(configStr).digest('hex').slice(0, 8);
}
