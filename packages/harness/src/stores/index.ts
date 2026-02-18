/**
 * Store Registry
 * 
 * Host application injects store implementations on startup.
 * Harness code uses getStores() to access them.
 */

import type { Stores } from './types';
import { createInMemoryStores } from './memory';

// =============================================================================
// STORE REGISTRY
// =============================================================================

let _stores: Stores | null = null;
let _initialized = false;

/**
 * Initialize stores with implementations
 * Call this once on application startup
 */
export function initStores(stores: Stores): void {
  if (_initialized) {
    console.warn('[stores] Already initialized, reinitializing...');
  }
  _stores = stores;
  _initialized = true;
  console.log('[stores] Initialized with provided implementations');
}

/**
 * Initialize with in-memory stores (for testing/dev)
 */
export function initInMemoryStores(): Stores {
  const stores = createInMemoryStores();
  initStores(stores);
  console.log('[stores] Initialized with in-memory stores');
  return stores;
}

/**
 * Get the store registry
 * @throws if not initialized
 */
export function getStores(): Stores {
  if (!_stores) {
    throw new Error(
      '[stores] Not initialized. Call initStores() or initInMemoryStores() on startup.'
    );
  }
  return _stores;
}

/**
 * Check if stores are initialized
 */
export function isStoresInitialized(): boolean {
  return _initialized;
}

/**
 * Reset stores (for testing)
 */
export function resetStores(): void {
  _stores = null;
  _initialized = false;
}

// =============================================================================
// EXPORTS
// =============================================================================

export * from './types';
export * from './memory';
