/**
 * Artifact Store
 * 
 * Captures and stores execution artifacts for debugging and replay:
 * - Structured logs
 * - Screenshots (if browser)
 * - HTML snapshots
 * - API responses
 * - LLM conversation history
 */

import { nanoid } from 'nanoid';
import * as fs from 'fs/promises';
import * as path from 'path';

// =============================================================================
// TYPES
// =============================================================================

export type ArtifactType = 
  | 'log'
  | 'screenshot' 
  | 'html_snapshot'
  | 'api_response'
  | 'api_request'
  | 'llm_conversation'
  | 'error'
  | 'output';

export interface Artifact {
  id: string;
  jobId: string;
  stepIndex: number;
  stepName: string;
  type: ArtifactType;
  
  // Content
  contentType: string;      // 'application/json', 'text/html', 'image/png', etc
  content?: string;         // Inline content (for small text/JSON)
  filePath?: string;        // Path to stored file (for large/binary)
  
  // Metadata
  sizeBytes: number;
  createdAt: Date;
  metadata?: Record<string, unknown>;
  
  // Redaction
  redacted?: boolean;
  redactionRules?: string[];
}

export interface ArtifactStoreConfig {
  // Storage backend
  storage: 'memory' | 'filesystem' | 's3';
  
  // For filesystem
  basePath?: string;
  
  // For S3
  s3Bucket?: string;
  s3Region?: string;
  
  // Limits
  maxInlineBytes: number;   // Store inline if smaller than this
  maxStoragePerJobMb: number;
  
  // Retention
  retentionDays: number;
}

const DEFAULT_CONFIG: ArtifactStoreConfig = {
  storage: 'memory',
  maxInlineBytes: 100 * 1024,        // 100KB inline
  maxStoragePerJobMb: 50,            // 50MB per job
  retentionDays: 30,
};

// =============================================================================
// REDACTION
// =============================================================================

const REDACTION_PATTERNS: Record<string, RegExp> = {
  api_key: /(?:api[_-]?key|apikey|secret|token|password|auth)['":\s]*['"=]?\s*['"]*([a-zA-Z0-9_-]{20,})['"]*$/gim,
  email: /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g,
  phone: /\b\d{3}[-.]?\d{3}[-.]?\d{4}\b/g,
  ssn: /\b\d{3}-\d{2}-\d{4}\b/g,
  credit_card: /\b\d{4}[-\s]?\d{4}[-\s]?\d{4}[-\s]?\d{4}\b/g,
};

function redactContent(content: string, rules: string[] = ['api_key']): string {
  let redacted = content;
  
  for (const rule of rules) {
    const pattern = REDACTION_PATTERNS[rule];
    if (pattern) {
      redacted = redacted.replace(pattern, '[REDACTED]');
    }
  }
  
  return redacted;
}

// =============================================================================
// ARTIFACT STORE
// =============================================================================

export class ArtifactStore {
  private config: ArtifactStoreConfig;
  private artifacts: Map<string, Artifact[]> = new Map();  // jobId -> artifacts
  private jobSizes: Map<string, number> = new Map();       // jobId -> total bytes

  constructor(config: Partial<ArtifactStoreConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Store an artifact
   */
  async store(
    jobId: string,
    stepIndex: number,
    stepName: string,
    type: ArtifactType,
    content: string | Buffer,
    contentType: string = 'application/json',
    metadata?: Record<string, unknown>,
    redactionRules?: string[]
  ): Promise<Artifact> {
    // Convert to string if needed
    let contentStr = typeof content === 'string' ? content : content.toString('base64');
    const sizeBytes = typeof content === 'string' ? Buffer.byteLength(content) : content.length;
    
    // Check job storage limit
    const currentSize = this.jobSizes.get(jobId) || 0;
    const maxBytes = this.config.maxStoragePerJobMb * 1024 * 1024;
    if (currentSize + sizeBytes > maxBytes) {
      console.warn(`[Artifacts] Job ${jobId} storage limit exceeded, skipping artifact`);
      throw new Error('Job storage limit exceeded');
    }
    
    // Apply redaction
    let redacted = false;
    if (redactionRules && redactionRules.length > 0 && typeof content === 'string') {
      contentStr = redactContent(contentStr, redactionRules);
      redacted = true;
    }
    
    // Create artifact
    const artifact: Artifact = {
      id: nanoid(),
      jobId,
      stepIndex,
      stepName,
      type,
      contentType,
      sizeBytes,
      createdAt: new Date(),
      metadata,
      redacted,
      redactionRules,
    };
    
    // Store inline or to file
    if (sizeBytes <= this.config.maxInlineBytes) {
      artifact.content = contentStr;
    } else {
      artifact.filePath = await this.writeToStorage(jobId, artifact.id, contentStr, contentType);
    }
    
    // Add to collection
    const jobArtifacts = this.artifacts.get(jobId) || [];
    jobArtifacts.push(artifact);
    this.artifacts.set(jobId, jobArtifacts);
    this.jobSizes.set(jobId, currentSize + sizeBytes);
    
    // Avoid terminal spam for per-log artifact writes unless explicitly enabled.
    const verboseArtifacts = process.env.ARTIFACT_VERBOSE === 'true';
    if (type !== 'log' || verboseArtifacts) {
      console.log(`[Artifacts] Stored ${type} for step ${stepIndex}: ${sizeBytes} bytes`);
    }
    return artifact;
  }

  /**
   * Store a log entry
   */
  async storeLog(
    jobId: string,
    stepIndex: number,
    stepName: string,
    level: 'debug' | 'info' | 'warn' | 'error',
    message: string,
    data?: Record<string, unknown>
  ): Promise<Artifact> {
    const logEntry = JSON.stringify({
      timestamp: new Date().toISOString(),
      level,
      message,
      data,
    });
    
    return this.store(jobId, stepIndex, stepName, 'log', logEntry, 'application/json');
  }

  /**
   * Store an API request/response
   */
  async storeApiCall(
    jobId: string,
    stepIndex: number,
    stepName: string,
    direction: 'request' | 'response',
    url: string,
    method: string,
    headers: Record<string, string>,
    body: string | object,
    statusCode?: number
  ): Promise<Artifact> {
    const content = JSON.stringify({
      url,
      method,
      headers,
      body: typeof body === 'string' ? body : JSON.stringify(body),
      statusCode,
      timestamp: new Date().toISOString(),
    });
    
    return this.store(
      jobId,
      stepIndex,
      stepName,
      direction === 'request' ? 'api_request' : 'api_response',
      content,
      'application/json',
      { url, method, statusCode },
      ['api_key']  // Redact API keys
    );
  }

  /**
   * Store a screenshot
   */
  async storeScreenshot(
    jobId: string,
    stepIndex: number,
    stepName: string,
    imageBuffer: Buffer,
    format: 'png' | 'jpeg' = 'png'
  ): Promise<Artifact> {
    return this.store(
      jobId,
      stepIndex,
      stepName,
      'screenshot',
      imageBuffer,
      `image/${format}`,
      { format }
    );
  }

  /**
   * Store HTML snapshot
   */
  async storeHtmlSnapshot(
    jobId: string,
    stepIndex: number,
    stepName: string,
    html: string,
    url?: string
  ): Promise<Artifact> {
    return this.store(
      jobId,
      stepIndex,
      stepName,
      'html_snapshot',
      html,
      'text/html',
      { url }
    );
  }

  /**
   * Store error
   */
  async storeError(
    jobId: string,
    stepIndex: number,
    stepName: string,
    error: Error | string,
    stack?: string
  ): Promise<Artifact> {
    const content = JSON.stringify({
      message: typeof error === 'string' ? error : error.message,
      stack: stack || (error instanceof Error ? error.stack : undefined),
      timestamp: new Date().toISOString(),
    });
    
    return this.store(jobId, stepIndex, stepName, 'error', content, 'application/json');
  }

  /**
   * Get all artifacts for a job
   */
  getJobArtifacts(jobId: string): Artifact[] {
    return this.artifacts.get(jobId) || [];
  }

  /**
   * Get artifacts for a specific step
   */
  getStepArtifacts(jobId: string, stepIndex: number): Artifact[] {
    return this.getJobArtifacts(jobId).filter(a => a.stepIndex === stepIndex);
  }

  /**
   * Get artifact content
   */
  async getContent(artifact: Artifact): Promise<string> {
    if (artifact.content) {
      return artifact.content;
    }
    
    if (artifact.filePath) {
      return this.readFromStorage(artifact.filePath);
    }
    
    throw new Error('Artifact has no content');
  }

  /**
   * Write to storage backend
   */
  private async writeToStorage(jobId: string, artifactId: string, content: string, contentType: string): Promise<string> {
    switch (this.config.storage) {
      case 'filesystem': {
        const dir = path.join(this.config.basePath || './artifacts', jobId);
        await fs.mkdir(dir, { recursive: true });
        
        const ext = contentType.split('/')[1] || 'bin';
        const filePath = path.join(dir, `${artifactId}.${ext}`);
        await fs.writeFile(filePath, content);
        
        return filePath;
      }
      
      case 's3': {
        // TODO: Implement S3 storage
        throw new Error('S3 storage not implemented');
      }
      
      case 'memory':
      default:
        // For memory storage, just return a virtual path
        return `memory://${jobId}/${artifactId}`;
    }
  }

  /**
   * Read from storage backend
   */
  private async readFromStorage(filePath: string): Promise<string> {
    if (filePath.startsWith('memory://')) {
      throw new Error('Memory storage does not support file paths');
    }
    
    return fs.readFile(filePath, 'utf-8');
  }

  /**
   * Clear job artifacts
   */
  async clearJob(jobId: string): Promise<void> {
    // Delete files if filesystem storage
    if (this.config.storage === 'filesystem') {
      const dir = path.join(this.config.basePath || './artifacts', jobId);
      try {
        await fs.rm(dir, { recursive: true });
      } catch {
        // Ignore if doesn't exist
      }
    }
    
    this.artifacts.delete(jobId);
    this.jobSizes.delete(jobId);
  }

  /**
   * Get total storage used by a job
   */
  getJobStorageBytes(jobId: string): number {
    return this.jobSizes.get(jobId) || 0;
  }
}

// =============================================================================
// SINGLETON
// =============================================================================

export const artifactStore = new ArtifactStore();
