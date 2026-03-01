/**
 * Proxy Manager
 * 
 * Manages residential proxy rotation for:
 * - Website scanning when blocked
 * - Avoiding rate limits
 * - Human-like behavior
 */

import { HttpsProxyAgent } from 'https-proxy-agent';

export interface ProxyConfig {
  host: string;
  port: number;
  username?: string;
  password?: string;
  type: 'residential' | 'datacenter';
}

export class ProxyManager {
  private proxies: ProxyConfig[] = [];
  private currentIndex: number = 0;

  constructor() {
    this.loadProxiesFromEnv();
  }

  /**
   * Load proxy configuration from environment
   */
  private loadProxiesFromEnv() {
    // Check for residential proxy
    const residentialProxy = process.env.RESIDENTIAL_PROXY_URL;
    
    if (residentialProxy) {
      // Format: http://username:password@proxy.provider.com:port
      try {
        const url = new URL(residentialProxy);
        
        this.proxies.push({
          host: url.hostname,
          port: parseInt(url.port) || 80,
          username: url.username || undefined,
          password: url.password || undefined,
          type: 'residential',
        });
        
        console.log('[ProxyManager] Loaded residential proxy:', url.hostname);
      } catch (error) {
        console.warn('[ProxyManager] Failed to parse RESIDENTIAL_PROXY_URL:', error);
      }
    }
  }

  /**
   * Check if proxy is available
   */
  hasProxy(): boolean {
    return this.proxies.length > 0;
  }

  /**
   * Get next proxy in rotation
   */
  getNextProxy(): ProxyConfig | null {
    if (this.proxies.length === 0) {
      return null;
    }

    const proxy = this.proxies[this.currentIndex];
    this.currentIndex = (this.currentIndex + 1) % this.proxies.length;
    
    return proxy;
  }

  /**
   * Create fetch agent for proxy
   */
  createProxyAgent(proxy?: ProxyConfig): any {
    const proxyToUse = proxy || this.getNextProxy();
    
    if (!proxyToUse) {
      return undefined;
    }

    const auth = proxyToUse.username && proxyToUse.password
      ? `${proxyToUse.username}:${proxyToUse.password}@`
      : '';
    
    const proxyUrl = `http://${auth}${proxyToUse.host}:${proxyToUse.port}`;
    
    return new HttpsProxyAgent(proxyUrl);
  }

  /**
   * Fetch with automatic proxy fallback
   */
  async fetchWithFallback(
    url: string,
    options: RequestInit = {},
    maxRetries: number = 2
  ): Promise<Response> {
    
    // Try without proxy first
    try {
      const response = await fetch(url, {
        ...options,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          ...options.headers,
        },
      });
      
      if (response.ok) {
        return response;
      }
      
      // If failed and proxy available, retry with proxy
      if (!this.hasProxy()) {
        return response;
      }
      
    } catch (error) {
      // Network error - try with proxy if available
      if (!this.hasProxy()) {
        throw error;
      }
    }

    // Retry with proxy
    console.log('[ProxyManager] Direct fetch failed, trying with residential proxy...');
    
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        const agent = this.createProxyAgent();
        
        const response = await fetch(url, {
          ...options,
          // @ts-ignore - agent type compatibility
          agent,
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
            ...options.headers,
          },
        });
        
        if (response.ok) {
          console.log('[ProxyManager] ✅ Proxy fetch successful');
          return response;
        }
        
      } catch (error) {
        if (attempt === maxRetries) {
          throw error;
        }
        
        // Wait before retry
        await new Promise(resolve => setTimeout(resolve, 1000 * attempt));
      }
    }

    throw new Error('All proxy attempts failed');
  }
}

export const proxyManager = new ProxyManager();
