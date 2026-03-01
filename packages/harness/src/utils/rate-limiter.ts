/**
 * Rate Limiter & Human-like Delays
 * 
 * Implements:
 * - Rate limiting for API calls
 * - Random human-like delays
 * - Retry with exponential backoff
 */

export class RateLimiter {
  private lastCallTime: Map<string, number> = new Map();
  private callCounts: Map<string, number[]> = new Map();

  /**
   * Wait with human-like delay (randomized)
   */
  async humanDelay(minMs: number = 1000, maxMs: number = 3000): Promise<void> {
    const delay = Math.random() * (maxMs - minMs) + minMs;
    await new Promise(resolve => setTimeout(resolve, delay));
  }

  /**
   * Check if we can make a call (rate limiting)
   */
  canCall(key: string, maxPerMinute: number = 60): boolean {
    const now = Date.now();
    const calls = this.callCounts.get(key) || [];
    
    // Remove calls older than 1 minute
    const recentCalls = calls.filter(t => now - t < 60000);
    this.callCounts.set(key, recentCalls);
    
    return recentCalls.length < maxPerMinute;
  }

  /**
   * Wait until we can make a call
   */
  async waitForSlot(key: string, maxPerMinute: number = 60): Promise<void> {
    while (!this.canCall(key, maxPerMinute)) {
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
    
    // Record this call
    const calls = this.callCounts.get(key) || [];
    calls.push(Date.now());
    this.callCounts.set(key, calls);
  }

  /**
   * Enforce minimum delay between calls
   */
  async throttle(key: string, minDelayMs: number = 1000): Promise<void> {
    const lastCall = this.lastCallTime.get(key) || 0;
    const timeSince = Date.now() - lastCall;
    
    if (timeSince < minDelayMs) {
      const waitTime = minDelayMs - timeSince;
      await new Promise(resolve => setTimeout(resolve, waitTime));
    }
    
    this.lastCallTime.set(key, Date.now());
  }

  /**
   * Batch processor with rate limiting
   */
  async *processBatch<T, R>(
    items: T[],
    processor: (item: T) => Promise<R>,
    options: {
      batchSize?: number;
      delayBetweenBatches?: number;
      delayBetweenItems?: number;
      maxConcurrent?: number;
    } = {}
  ): AsyncGenerator<R[]> {
    const {
      batchSize = 10,
      delayBetweenBatches = 2000,
      delayBetweenItems = 500,
      maxConcurrent = 5,
    } = options;

    for (let i = 0; i < items.length; i += batchSize) {
      const batch = items.slice(i, i + batchSize);
      const results: R[] = [];
      
      // Process batch with concurrency control
      for (let j = 0; j < batch.length; j += maxConcurrent) {
        const concurrent = batch.slice(j, j + maxConcurrent);
        
        const batchResults = await Promise.allSettled(
          concurrent.map(async (item) => {
            const result = await processor(item);
            
            // Random delay between items
            if (delayBetweenItems > 0) {
              await this.humanDelay(delayBetweenItems * 0.8, delayBetweenItems * 1.2);
            }
            
            return result;
          })
        );
        
        for (const result of batchResults) {
          if (result.status === 'fulfilled') {
            results.push(result.value);
          }
        }
      }
      
      yield results;
      
      // Delay between batches (human-like)
      if (i + batchSize < items.length && delayBetweenBatches > 0) {
        await this.humanDelay(delayBetweenBatches * 0.9, delayBetweenBatches * 1.1);
      }
    }
  }
}

export const rateLimiter = new RateLimiter();

/**
 * Utility: Sleep with jitter
 */
export async function sleep(ms: number, jitter: number = 0.2): Promise<void> {
  const jitterAmount = ms * jitter;
  const actualDelay = ms + (Math.random() * jitterAmount * 2 - jitterAmount);
  await new Promise(resolve => setTimeout(resolve, actualDelay));
}

/**
 * Utility: Retry with exponential backoff
 */
export async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  options: {
    maxAttempts?: number;
    baseDelayMs?: number;
    maxDelayMs?: number;
    onRetry?: (attempt: number, error: any) => void;
  } = {}
): Promise<T> {
  const {
    maxAttempts = 3,
    baseDelayMs = 1000,
    maxDelayMs = 30000,
    onRetry,
  } = options;

  let lastError: any;
  
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      
      if (attempt === maxAttempts) {
        break;
      }
      
      // Calculate delay with exponential backoff and jitter
      const exponentialDelay = Math.min(baseDelayMs * Math.pow(2, attempt - 1), maxDelayMs);
      const jitter = Math.random() * 1000;
      const delay = exponentialDelay + jitter;
      
      if (onRetry) {
        onRetry(attempt, error);
      }
      
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
  
  throw lastError;
}
