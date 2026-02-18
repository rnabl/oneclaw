/**
 * @oneclaw/harness
 * 
 * Core infrastructure for OneClaw - the operational runtime that wraps workflows.
 * 
 * This package provides:
 * - Schemas: Zod schemas for all data types (source of truth)
 * - Stores: Database-agnostic interfaces + in-memory implementations
 * - Identity: User resolution across providers (Discord, Telegram, phone, etc.)
 * - Tool Registry: Define tools with schemas, policies, costs
 * - Secrets Vault: Encrypted per-tenant credential storage
 * - Policy Engine: Rate limits, quotas, permissions
 * - Execution Runner: Workflow execution coordination
 * - Metering: Per-step cost tracking
 * - Artifacts: Log, screenshot, HTML capture for replay
 * 
 * The Harness is DATABASE-AGNOSTIC. Implementations are injected on startup.
 * - OneClaw Cloud: Uses Supabase implementations
 * - Self-Hosted: Uses SQLite/Turso implementations
 * - Enterprise: Uses Postgres implementations
 * - Testing: Uses in-memory implementations
 */

// =============================================================================
// SCHEMAS (Source of Truth) - New architecture
// =============================================================================
// Note: Exporting with namespace to avoid conflicts with legacy billing exports
export * as schemas from './schemas';

// =============================================================================
// STORES (Database-agnostic interfaces)
// =============================================================================
export {
  initStores,
  initInMemoryStores,
  getStores,
  isStoresInitialized,
  resetStores,
} from './stores';
export type {
  Stores,
  UserStore,
  IdentityStore,
  WalletStore,
  TransactionStore,
} from './stores';
export {
  StoreError,
  NotFoundError,
  DuplicateError,
  InsufficientBalanceError,
} from './stores';
export {
  InMemoryUserStore,
  InMemoryIdentityStore,
  InMemoryWalletStore,
  InMemoryTransactionStore,
  createInMemoryStores,
} from './stores';

// =============================================================================
// IDENTITY (User resolution)
// =============================================================================
export { resolveUser, linkProvider, getLinkedProviders } from './identity';

// =============================================================================
// LEGACY EXPORTS (keeping for backwards compatibility - will migrate)
// =============================================================================

// Registry
export { registry, ToolRegistry } from './registry';
export * from './registry/schemas';

// Secrets
export { vault, SecretsVault, deriveKey, tenantSalt, encrypt, decrypt } from './secrets';

// Policy
export { policyEngine, PolicyEngine, DEFAULT_POLICIES } from './policy';
export type { TenantTier, TenantPolicy, PolicyCheckResult } from './policy';

// Execution
export { runner, ExecutionRunner } from './execution';
export type { Job, JobStatus, StepContext, ExecuteOptions, WorkflowHandler } from './execution/runner';

// Metering
export { meteringTracker, MeteringTracker, API_COSTS } from './metering';
export type { MeteringEvent, JobCostSummary, StepCost } from './metering/tracker';

// Artifacts
export { artifactStore, ArtifactStore } from './artifacts';
export type { Artifact, ArtifactType } from './artifacts/store';

// API
export { harnessApi } from './api';

// Billing & Pricing
export * from './billing';
export * from './pricing';
