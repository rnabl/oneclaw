import { ExecutorBase, type ExecutorResponse } from '@oneclaw/node-runtime';
import { z } from 'zod';
import { loadConfig } from '@oneclaw/node-runtime';

const HttpRequestSchema = z.object({
  method: z.enum(['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'HEAD', 'OPTIONS']),
  url: z.string().url(),
  headers: z.record(z.string()).optional(),
  body: z.unknown().optional(),
  timeout_ms: z.number().optional().default(30000),
});

type HttpRequest = z.infer<typeof HttpRequestSchema>;

/**
 * HTTP Executor - The test case for "if curl works, executor works"
 * 
 * This is THE most critical executor because it validates our
 * core principle: deterministic, predictable execution
 */
export class HttpExecutor extends ExecutorBase {
  readonly name = 'http.request';
  readonly schema = HttpRequestSchema;
  
  async execute(input: unknown): Promise<ExecutorResponse> {
    const start = Date.now();
    
    // Validate input
    let validated: HttpRequest;
    try {
      validated = this.schema.parse(input);
    } catch (error) {
      return this.fail(
        `Invalid input: ${error instanceof Error ? error.message : 'Unknown'}`,
        Date.now() - start
      );
    }
    
    // Check domain allowlist from config
    const url = new URL(validated.url);
    if (!this.isAllowedDomain(url.hostname)) {
      return this.deny(
        'http.allowed_domains',
        validated.url,
        `Domain "${url.hostname}" is not in allowed_domains list. Add it to node.yaml under http.allowed_domains`
      );
    }
    
    // Execute the actual HTTP request
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), validated.timeout_ms);
      
      const response = await fetch(validated.url, {
        method: validated.method,
        headers: validated.headers,
        body: validated.body ? JSON.stringify(validated.body) : undefined,
        signal: controller.signal,
      });
      
      clearTimeout(timeoutId);
      
      const body = await response.text();
      
      return this.success(
        {
          status: response.status,
          statusText: response.statusText,
          headers: Object.fromEntries(response.headers.entries()),
          body: body,
        },
        Date.now() - start
      );
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        return this.fail(
          `Request timeout after ${validated.timeout_ms}ms`,
          Date.now() - start
        );
      }
      
      return this.fail(
        error instanceof Error ? error.message : 'Unknown error',
        Date.now() - start,
        error instanceof Error ? error.stack : undefined
      );
    }
  }
  
  /**
   * Check if domain is allowed
   * Supports:
   * - Exact match: "api.stripe.com"
   * - Wildcard: "*"
   * - Pattern: "*.stripe.com" (future)
   */
  private isAllowedDomain(hostname: string): boolean {
    const config = loadConfig();
    const allowed = config.http.allowed_domains || [];
    
    // Wildcard allows everything
    if (allowed.includes('*')) {
      return true;
    }
    
    // Exact match
    if (allowed.includes(hostname)) {
      return true;
    }
    
    // Pattern match (simple wildcard support)
    for (const pattern of allowed) {
      if (pattern.startsWith('*.')) {
        const domain = pattern.slice(2);
        if (hostname.endsWith(domain)) {
          return true;
        }
      }
    }
    
    return false;
  }
}
