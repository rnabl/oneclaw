/**
 * SINGLE SOURCE OF TRUTH FOR ALL PORTS
 * 
 * DO NOT use environment variables for ports.
 * DO NOT use CLI arguments for ports.
 * DO NOT use config files for ports.
 * 
 * If you need to change a port, change it HERE and rebuild.
 */

export const PORTS = {
  /** Harness - workflow execution engine */
  HARNESS: 8787,
  
  /** Daemon - Rust gateway/proxy */
  DAEMON: 9000,
  
  /** API - REST API server */
  API: 3000,
} as const;

export const INTERNAL_URLS = {
  HARNESS: `http://localhost:${PORTS.HARNESS}`,
  DAEMON: `http://localhost:${PORTS.DAEMON}`,
  API: `http://localhost:${PORTS.API}`,
} as const;
