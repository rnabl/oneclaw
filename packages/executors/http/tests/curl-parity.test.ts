import { describe, it, expect, beforeAll } from 'vitest';
import { HttpExecutor } from '../src/index';
import { loadConfig } from '@oneclaw/node-runtime';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

/**
 * HTTP Executor Curl Parity Tests
 * 
 * THE TEST: If curl works, the executor MUST work.
 * This is the foundational principle of OneClaw Node Runtime.
 */
describe('HTTP Executor - Curl Parity', () => {
  let executor: HttpExecutor;
  
  beforeAll(() => {
    executor = new HttpExecutor();
  });
  
  it('should match curl for simple GET request', async () => {
    const url = 'https://httpbin.org/get';
    
    // Execute via curl
    const { stdout: curlOutput } = await execAsync(`curl -s "${url}"`);
    const curlResult = JSON.parse(curlOutput);
    
    // Execute via HttpExecutor
    const executorResult = await executor.execute({
      method: 'GET',
      url,
    });
    
    expect(executorResult.status).toBe('executed');
    
    const executorBody = JSON.parse(executorResult.result?.body || '{}');
    
    // Both should hit httpbin.org
    expect(executorBody.url).toBe(curlResult.url);
  });
  
  it('should match curl for POST with JSON body', async () => {
    const url = 'https://httpbin.org/post';
    const data = { test: 'value', number: 42 };
    
    // Execute via curl
    const { stdout: curlOutput } = await execAsync(
      `curl -s -X POST "${url}" -H "Content-Type: application/json" -d '${JSON.stringify(data)}'`
    );
    const curlResult = JSON.parse(curlOutput);
    
    // Execute via HttpExecutor
    const executorResult = await executor.execute({
      method: 'POST',
      url,
      headers: { 'Content-Type': 'application/json' },
      body: data,
    });
    
    expect(executorResult.status).toBe('executed');
    
    const executorBody = JSON.parse(executorResult.result?.body || '{}');
    
    // Both should receive the same JSON data
    expect(executorBody.json).toEqual(curlResult.json);
  });
  
  it('should match curl for request with custom headers', async () => {
    const url = 'https://httpbin.org/headers';
    const customHeader = 'OneClaw-Test-Value';
    
    // Execute via curl
    const { stdout: curlOutput } = await execAsync(
      `curl -s "${url}" -H "X-Custom-Header: ${customHeader}"`
    );
    const curlResult = JSON.parse(curlOutput);
    
    // Execute via HttpExecutor
    const executorResult = await executor.execute({
      method: 'GET',
      url,
      headers: { 'X-Custom-Header': customHeader },
    });
    
    expect(executorResult.status).toBe('executed');
    
    const executorBody = JSON.parse(executorResult.result?.body || '{}');
    
    // Both should send the custom header
    expect(executorBody.headers['X-Custom-Header']).toBe(customHeader);
  });
  
  it('should respect domain allowlist like curl respects network access', async () => {
    // Curl can access any public URL by default
    // Our executor should too, but respect the allowlist
    
    const blockedUrl = 'https://example.com';
    
    // Executor should deny if not in allowlist
    const result = await executor.execute({
      method: 'GET',
      url: blockedUrl,
    });
    
    // If config has wildcard (*), it should work
    // If config has specific domains, it should be denied
    const config = loadConfig();
    
    if (config.http.allowed_domains.includes('*')) {
      expect(result.status).toBe('executed');
    } else if (!config.http.allowed_domains.includes('example.com')) {
      expect(result.status).toBe('denied');
      expect(result.denial_reason?.rule).toBe('http.allowed_domains');
    }
  });
  
  it('should handle network errors like curl', async () => {
    const invalidUrl = 'https://this-domain-absolutely-does-not-exist-12345.com';
    
    // Both should fail with network error
    try {
      await execAsync(`curl -s --max-time 5 "${invalidUrl}"`);
    } catch (curlError) {
      // Curl failed as expected
    }
    
    const executorResult = await executor.execute({
      method: 'GET',
      url: invalidUrl,
      timeout_ms: 5000,
    });
    
    // Executor should fail too
    expect(executorResult.status).toBe('failed');
  });
  
  it('should handle timeouts like curl', async () => {
    const slowUrl = 'https://httpbin.org/delay/10';
    
    // Curl with 2 second timeout
    const curlStart = Date.now();
    try {
      await execAsync(`curl -s --max-time 2 "${slowUrl}"`);
    } catch (curlError) {
      const curlDuration = Date.now() - curlStart;
      expect(curlDuration).toBeLessThan(3000); // Should timeout around 2s
    }
    
    // Executor with 2 second timeout
    const executorStart = Date.now();
    const executorResult = await executor.execute({
      method: 'GET',
      url: slowUrl,
      timeout_ms: 2000,
    });
    const executorDuration = Date.now() - executorStart;
    
    expect(executorResult.status).toBe('failed');
    expect(executorResult.error).toContain('timeout');
    expect(executorDuration).toBeLessThan(3000);
  });
});
