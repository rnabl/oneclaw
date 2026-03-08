/**
 * SINGLE SOURCE OF TRUTH FOR ALL PORTS
 * 
 * MUST MATCH: oneclaw-node/src/ports.rs (Rust is authoritative)
 * 
 * DO NOT use environment variables for ports.
 * DO NOT use CLI arguments for ports (except daemon --port for testing).
 * DO NOT use config files for ports.
 * 
 * If you need to change a port, change it in BOTH places:
 *   1. oneclaw-node/src/ports.rs (Rust)
 *   2. packages/shared/ports.ts (TypeScript)
 */

export const PORTS = {
  /** Harness - workflow execution engine */
  HARNESS: 9000,  // ✅ Matches ports.rs HARNESS_PORT
  
  /** Daemon - Rust gateway/proxy */
  DAEMON: 8787,   // ✅ Matches ports.rs DAEMON_PORT
  
  /** API - REST API server */
  API: 3000,      // ✅ Matches ports.rs API_PORT
} as const;

export const INTERNAL_URLS = {
  HARNESS: `http://localhost:${PORTS.HARNESS}`,
  DAEMON: `http://localhost:${PORTS.DAEMON}`,
  API: `http://localhost:${PORTS.API}`,
} as const;
