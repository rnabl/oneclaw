/**
 * @oneclaw/engine
 * 
 * Workflow engine abstraction layer.
 * Supports multiple backends: Restate (production) and Standalone (development).
 */

// Types
export * from './types';

// Restate adapter (production)
export {
  RestateEngine,
  getEngine,
  checkpoint,
} from './restate-adapter';

// Standalone adapter (development/testing)
export {
  StandaloneEngine,
  getStandaloneEngine,
} from './standalone-adapter';

// Re-export Restate types for convenience
export type { Context as RestateContext } from '@restatedev/restate-sdk';
export * as restate from '@restatedev/restate-sdk';
