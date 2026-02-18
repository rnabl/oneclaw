/**
 * Policy Engine
 * 
 * Enforces rate limits, quotas, and permissions before tool execution.
 */

import { z } from 'zod';

// =============================================================================
// TYPES
// =============================================================================

export const TenantTier = z.enum(['free', 'starter', 'pro', 'enterprise']);
export type TenantTier = z.infer<typeof TenantTier>;

export interface TenantPolicy {
  tier: TenantTier;
  
  // Rate limits (requests per window)
  rateLimits: {
    requestsPerMinute: number;
    requestsPerHour: number;
    requestsPerDay: number;
  };
  
  // Cost quotas
  quotas: {
    maxCostPerJobUsd: number;
    maxCostPerDayUsd: number;
    maxCostPerMonthUsd: number;
  };
  
  // Concurrency
  maxConcurrentJobs: number;
  
  // Time limits
  maxJobDurationMs: number;
  
  // Tool restrictions
  allowedTools: string[] | '*';
  blockedTools: string[];
}

export interface RateLimitState {
  tenantId: string;
  minuteCount: number;
  minuteResetAt: Date;
  hourCount: number;
  hourResetAt: Date;
  dayCount: number;
  dayResetAt: Date;
}

export interface UsageState {
  tenantId: string;
  dayCostUsd: number;
  dayResetAt: Date;
  monthCostUsd: number;
  monthResetAt: Date;
  currentJobs: number;
}

export interface PolicyCheckResult {
  allowed: boolean;
  reason?: string;
  retryAfterMs?: number;
}

// =============================================================================
// DEFAULT POLICIES BY TIER
// =============================================================================

export const DEFAULT_POLICIES: Record<TenantTier, TenantPolicy> = {
  free: {
    tier: 'free',
    rateLimits: {
      requestsPerMinute: 5,
      requestsPerHour: 20,
      requestsPerDay: 50,
    },
    quotas: {
      maxCostPerJobUsd: 0.50,
      maxCostPerDayUsd: 2.00,
      maxCostPerMonthUsd: 10.00,
    },
    maxConcurrentJobs: 1,
    maxJobDurationMs: 60000,  // 1 minute
    allowedTools: ['audit-website', 'discover-businesses'],
    blockedTools: [],
  },
  starter: {
    tier: 'starter',
    rateLimits: {
      requestsPerMinute: 20,
      requestsPerHour: 100,
      requestsPerDay: 500,
    },
    quotas: {
      maxCostPerJobUsd: 2.00,
      maxCostPerDayUsd: 20.00,
      maxCostPerMonthUsd: 100.00,
    },
    maxConcurrentJobs: 3,
    maxJobDurationMs: 300000,  // 5 minutes
    allowedTools: '*',
    blockedTools: [],
  },
  pro: {
    tier: 'pro',
    rateLimits: {
      requestsPerMinute: 60,
      requestsPerHour: 500,
      requestsPerDay: 2000,
    },
    quotas: {
      maxCostPerJobUsd: 10.00,
      maxCostPerDayUsd: 100.00,
      maxCostPerMonthUsd: 500.00,
    },
    maxConcurrentJobs: 10,
    maxJobDurationMs: 600000,  // 10 minutes
    allowedTools: '*',
    blockedTools: [],
  },
  enterprise: {
    tier: 'enterprise',
    rateLimits: {
      requestsPerMinute: 200,
      requestsPerHour: 2000,
      requestsPerDay: 10000,
    },
    quotas: {
      maxCostPerJobUsd: 100.00,
      maxCostPerDayUsd: 1000.00,
      maxCostPerMonthUsd: 10000.00,
    },
    maxConcurrentJobs: 50,
    maxJobDurationMs: 1800000,  // 30 minutes
    allowedTools: '*',
    blockedTools: [],
  },
};

// =============================================================================
// POLICY ENGINE
// =============================================================================

export class PolicyEngine {
  private rateLimitState: Map<string, RateLimitState> = new Map();
  private usageState: Map<string, UsageState> = new Map();
  private tenantPolicies: Map<string, TenantPolicy> = new Map();

  /**
   * Set policy for a tenant (custom override)
   */
  setPolicy(tenantId: string, policy: TenantPolicy): void {
    this.tenantPolicies.set(tenantId, policy);
  }

  /**
   * Get policy for a tenant (defaults to tier-based)
   */
  getPolicy(tenantId: string, tier: TenantTier = 'free'): TenantPolicy {
    return this.tenantPolicies.get(tenantId) || DEFAULT_POLICIES[tier];
  }

  /**
   * Check if a request is allowed
   */
  async checkRequest(
    tenantId: string,
    toolId: string,
    estimatedCostUsd: number,
    tier: TenantTier = 'free'
  ): Promise<PolicyCheckResult> {
    const policy = this.getPolicy(tenantId, tier);
    
    // Check tool allowed
    const toolCheck = this.checkToolAllowed(policy, toolId);
    if (!toolCheck.allowed) return toolCheck;
    
    // Check rate limits
    const rateCheck = this.checkRateLimits(tenantId, policy);
    if (!rateCheck.allowed) return rateCheck;
    
    // Check cost quotas
    const quotaCheck = this.checkQuotas(tenantId, policy, estimatedCostUsd);
    if (!quotaCheck.allowed) return quotaCheck;
    
    // Check concurrency
    const concurrencyCheck = this.checkConcurrency(tenantId, policy);
    if (!concurrencyCheck.allowed) return concurrencyCheck;
    
    // All checks passed - increment counters
    this.incrementRateLimit(tenantId);
    
    return { allowed: true };
  }

  /**
   * Check if tool is allowed for tenant
   */
  private checkToolAllowed(policy: TenantPolicy, toolId: string): PolicyCheckResult {
    // Check blocked
    if (policy.blockedTools.includes(toolId)) {
      return { allowed: false, reason: `Tool '${toolId}' is blocked for your tier` };
    }
    
    // Check allowed
    if (policy.allowedTools === '*') {
      return { allowed: true };
    }
    
    if (!policy.allowedTools.includes(toolId)) {
      return { allowed: false, reason: `Tool '${toolId}' is not available for your tier` };
    }
    
    return { allowed: true };
  }

  /**
   * Check rate limits
   */
  private checkRateLimits(tenantId: string, policy: TenantPolicy): PolicyCheckResult {
    const state = this.getRateLimitState(tenantId);
    const now = new Date();
    
    // Reset expired windows
    if (now >= state.minuteResetAt) {
      state.minuteCount = 0;
      state.minuteResetAt = new Date(now.getTime() + 60000);
    }
    if (now >= state.hourResetAt) {
      state.hourCount = 0;
      state.hourResetAt = new Date(now.getTime() + 3600000);
    }
    if (now >= state.dayResetAt) {
      state.dayCount = 0;
      state.dayResetAt = new Date(now.getTime() + 86400000);
    }
    
    // Check limits
    if (state.minuteCount >= policy.rateLimits.requestsPerMinute) {
      return {
        allowed: false,
        reason: 'Rate limit exceeded (per minute)',
        retryAfterMs: state.minuteResetAt.getTime() - now.getTime(),
      };
    }
    
    if (state.hourCount >= policy.rateLimits.requestsPerHour) {
      return {
        allowed: false,
        reason: 'Rate limit exceeded (per hour)',
        retryAfterMs: state.hourResetAt.getTime() - now.getTime(),
      };
    }
    
    if (state.dayCount >= policy.rateLimits.requestsPerDay) {
      return {
        allowed: false,
        reason: 'Rate limit exceeded (per day)',
        retryAfterMs: state.dayResetAt.getTime() - now.getTime(),
      };
    }
    
    return { allowed: true };
  }

  /**
   * Check cost quotas
   */
  private checkQuotas(tenantId: string, policy: TenantPolicy, estimatedCostUsd: number): PolicyCheckResult {
    const state = this.getUsageState(tenantId);
    const now = new Date();
    
    // Reset expired windows
    if (now >= state.dayResetAt) {
      state.dayCostUsd = 0;
      state.dayResetAt = new Date(now.getTime() + 86400000);
    }
    if (now >= state.monthResetAt) {
      state.monthCostUsd = 0;
      const nextMonth = new Date(now);
      nextMonth.setMonth(nextMonth.getMonth() + 1);
      state.monthResetAt = nextMonth;
    }
    
    // Check job cost
    if (estimatedCostUsd > policy.quotas.maxCostPerJobUsd) {
      return {
        allowed: false,
        reason: `Job cost ($${estimatedCostUsd.toFixed(2)}) exceeds limit ($${policy.quotas.maxCostPerJobUsd.toFixed(2)})`,
      };
    }
    
    // Check daily cost
    if (state.dayCostUsd + estimatedCostUsd > policy.quotas.maxCostPerDayUsd) {
      return {
        allowed: false,
        reason: `Daily quota exceeded ($${state.dayCostUsd.toFixed(2)} / $${policy.quotas.maxCostPerDayUsd.toFixed(2)})`,
        retryAfterMs: state.dayResetAt.getTime() - now.getTime(),
      };
    }
    
    // Check monthly cost
    if (state.monthCostUsd + estimatedCostUsd > policy.quotas.maxCostPerMonthUsd) {
      return {
        allowed: false,
        reason: `Monthly quota exceeded ($${state.monthCostUsd.toFixed(2)} / $${policy.quotas.maxCostPerMonthUsd.toFixed(2)})`,
      };
    }
    
    return { allowed: true };
  }

  /**
   * Check concurrency limit
   */
  private checkConcurrency(tenantId: string, policy: TenantPolicy): PolicyCheckResult {
    const state = this.getUsageState(tenantId);
    
    if (state.currentJobs >= policy.maxConcurrentJobs) {
      return {
        allowed: false,
        reason: `Concurrency limit reached (${state.currentJobs} / ${policy.maxConcurrentJobs})`,
      };
    }
    
    return { allowed: true };
  }

  /**
   * Get or create rate limit state
   */
  private getRateLimitState(tenantId: string): RateLimitState {
    let state = this.rateLimitState.get(tenantId);
    if (!state) {
      const now = new Date();
      state = {
        tenantId,
        minuteCount: 0,
        minuteResetAt: new Date(now.getTime() + 60000),
        hourCount: 0,
        hourResetAt: new Date(now.getTime() + 3600000),
        dayCount: 0,
        dayResetAt: new Date(now.getTime() + 86400000),
      };
      this.rateLimitState.set(tenantId, state);
    }
    return state;
  }

  /**
   * Get or create usage state
   */
  private getUsageState(tenantId: string): UsageState {
    let state = this.usageState.get(tenantId);
    if (!state) {
      const now = new Date();
      const nextMonth = new Date(now);
      nextMonth.setMonth(nextMonth.getMonth() + 1);
      
      state = {
        tenantId,
        dayCostUsd: 0,
        dayResetAt: new Date(now.getTime() + 86400000),
        monthCostUsd: 0,
        monthResetAt: nextMonth,
        currentJobs: 0,
      };
      this.usageState.set(tenantId, state);
    }
    return state;
  }

  /**
   * Increment rate limit counters (called after checkRequest passes)
   */
  private incrementRateLimit(tenantId: string): void {
    const state = this.getRateLimitState(tenantId);
    state.minuteCount++;
    state.hourCount++;
    state.dayCount++;
  }

  /**
   * Record job started (for concurrency tracking)
   */
  jobStarted(tenantId: string): void {
    const state = this.getUsageState(tenantId);
    state.currentJobs++;
  }

  /**
   * Record job completed
   */
  jobCompleted(tenantId: string, actualCostUsd: number): void {
    const state = this.getUsageState(tenantId);
    state.currentJobs = Math.max(0, state.currentJobs - 1);
    state.dayCostUsd += actualCostUsd;
    state.monthCostUsd += actualCostUsd;
  }

  /**
   * Get current usage for a tenant
   */
  getUsage(tenantId: string): {
    rateLimits: { minute: number; hour: number; day: number };
    costs: { day: number; month: number };
    concurrentJobs: number;
  } {
    const rateState = this.getRateLimitState(tenantId);
    const usageState = this.getUsageState(tenantId);
    
    return {
      rateLimits: {
        minute: rateState.minuteCount,
        hour: rateState.hourCount,
        day: rateState.dayCount,
      },
      costs: {
        day: usageState.dayCostUsd,
        month: usageState.monthCostUsd,
      },
      concurrentJobs: usageState.currentJobs,
    };
  }
}

// =============================================================================
// SINGLETON
// =============================================================================

export const policyEngine = new PolicyEngine();
