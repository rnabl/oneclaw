/**
 * Metering Tracker
 * 
 * Tracks costs and usage per job, per step, per tenant.
 * Enables billing, analytics, and debugging.
 */

import { nanoid } from 'nanoid';

// =============================================================================
// TYPES
// =============================================================================

export interface MeteringEvent {
  id: string;
  jobId: string;
  tenantId: string;
  stepIndex: number;
  stepName: string;
  toolId: string;
  
  // Event details
  eventType: 'tool_call' | 'api_call' | 'llm_tokens' | 'bandwidth' | 'storage';
  provider?: string;       // External API provider
  
  // Quantities
  quantity: number;
  unit: string;            // 'calls', 'tokens', 'bytes', 'ms'
  
  // Costs
  costUsd: number;
  
  // Timing
  startedAt: Date;
  completedAt: Date;
  durationMs: number;
  
  // Metadata
  metadata?: Record<string, unknown>;
}

export interface JobCostSummary {
  jobId: string;
  tenantId: string;
  totalCostUsd: number;
  breakdown: {
    provider: string;
    eventType: string;
    quantity: number;
    costUsd: number;
  }[];
  totalDurationMs: number;
  stepsCompleted: number;
}

export interface StepCost {
  stepIndex: number;
  stepName: string;
  toolId: string;
  costUsd: number;
  durationMs: number;
  events: MeteringEvent[];
}

// =============================================================================
// KNOWN API COSTS (per unit)
// =============================================================================

export const API_COSTS: Record<string, Record<string, number>> = {
  dataforseo: {
    'google_maps_serp': 0.002,        // per SERP
    'google_ai_mode': 0.004,          // per query
    'keywords_data': 0.05,            // per request
  },
  perplexity: {
    'sonar_pro': 0.005,               // per search
    'sonar': 0.001,                   // per search
  },
  apify: {
    'google_maps_scraper': 0.004,     // per result
    'leads_finder': 0.003,            // per lookup
  },
  anthropic: {
    'claude_sonnet_input': 0.003,     // per 1K tokens
    'claude_sonnet_output': 0.015,    // per 1K tokens
    'claude_haiku_input': 0.00025,    // per 1K tokens
    'claude_haiku_output': 0.00125,   // per 1K tokens
  },
  openai: {
    'gpt4o_input': 0.005,             // per 1K tokens
    'gpt4o_output': 0.015,            // per 1K tokens
    'gpt4o_mini_input': 0.00015,      // per 1K tokens
    'gpt4o_mini_output': 0.0006,      // per 1K tokens
  },
};

// =============================================================================
// METERING TRACKER
// =============================================================================

export class MeteringTracker {
  private events: Map<string, MeteringEvent[]> = new Map();  // jobId -> events
  private jobTenants: Map<string, string> = new Map();       // jobId -> tenantId

  /**
   * Start tracking a job
   */
  startJob(jobId: string, tenantId: string): void {
    this.events.set(jobId, []);
    this.jobTenants.set(jobId, tenantId);
    console.log(`[Metering] Started tracking job: ${jobId}`);
  }

  /**
   * Record a metering event
   */
  recordEvent(event: Omit<MeteringEvent, 'id'>): MeteringEvent {
    const fullEvent: MeteringEvent = {
      ...event,
      id: nanoid(),
    };
    
    const jobEvents = this.events.get(event.jobId);
    if (jobEvents) {
      jobEvents.push(fullEvent);
    } else {
      this.events.set(event.jobId, [fullEvent]);
    }
    
    console.log(`[Metering] Recorded: ${event.eventType} ${event.provider || event.toolId} $${event.costUsd.toFixed(4)}`);
    return fullEvent;
  }

  /**
   * Record a tool call with automatic cost calculation
   */
  recordToolCall(
    jobId: string,
    tenantId: string,
    stepIndex: number,
    stepName: string,
    toolId: string,
    provider: string,
    operation: string,
    quantity: number,
    startedAt: Date,
    completedAt: Date,
    metadata?: Record<string, unknown>
  ): MeteringEvent {
    // Look up cost
    const providerCosts = API_COSTS[provider];
    const unitCost = providerCosts?.[operation] || 0;
    const costUsd = unitCost * quantity;
    
    return this.recordEvent({
      jobId,
      tenantId,
      stepIndex,
      stepName,
      toolId,
      eventType: 'api_call',
      provider,
      quantity,
      unit: 'calls',
      costUsd,
      startedAt,
      completedAt,
      durationMs: completedAt.getTime() - startedAt.getTime(),
      metadata: { ...metadata, operation },
    });
  }

  /**
   * Record LLM token usage
   */
  recordLlmTokens(
    jobId: string,
    tenantId: string,
    stepIndex: number,
    stepName: string,
    toolId: string,
    provider: string,
    model: string,
    inputTokens: number,
    outputTokens: number,
    startedAt: Date,
    completedAt: Date
  ): MeteringEvent[] {
    const events: MeteringEvent[] = [];
    
    // Input tokens
    const inputCostKey = `${model}_input`;
    const inputUnitCost = API_COSTS[provider]?.[inputCostKey] || 0;
    const inputCost = (inputUnitCost * inputTokens) / 1000;
    
    events.push(this.recordEvent({
      jobId,
      tenantId,
      stepIndex,
      stepName,
      toolId,
      eventType: 'llm_tokens',
      provider,
      quantity: inputTokens,
      unit: 'input_tokens',
      costUsd: inputCost,
      startedAt,
      completedAt,
      durationMs: completedAt.getTime() - startedAt.getTime(),
      metadata: { model, direction: 'input' },
    }));
    
    // Output tokens
    const outputCostKey = `${model}_output`;
    const outputUnitCost = API_COSTS[provider]?.[outputCostKey] || 0;
    const outputCost = (outputUnitCost * outputTokens) / 1000;
    
    events.push(this.recordEvent({
      jobId,
      tenantId,
      stepIndex,
      stepName,
      toolId,
      eventType: 'llm_tokens',
      provider,
      quantity: outputTokens,
      unit: 'output_tokens',
      costUsd: outputCost,
      startedAt,
      completedAt,
      durationMs: 0,  // Already counted in input
      metadata: { model, direction: 'output' },
    }));
    
    return events;
  }

  /**
   * Get all events for a job
   */
  getJobEvents(jobId: string): MeteringEvent[] {
    return this.events.get(jobId) || [];
  }

  /**
   * Get cost summary for a job
   */
  getJobCostSummary(jobId: string): JobCostSummary | null {
    const events = this.events.get(jobId);
    const tenantId = this.jobTenants.get(jobId);
    
    if (!events || !tenantId) return null;
    
    // Calculate totals
    let totalCostUsd = 0;
    let totalDurationMs = 0;
    const stepsCompleted = new Set<number>();
    const breakdownMap = new Map<string, { quantity: number; costUsd: number }>();
    
    for (const event of events) {
      totalCostUsd += event.costUsd;
      totalDurationMs += event.durationMs;
      stepsCompleted.add(event.stepIndex);
      
      const key = `${event.provider || 'internal'}:${event.eventType}`;
      const existing = breakdownMap.get(key) || { quantity: 0, costUsd: 0 };
      existing.quantity += event.quantity;
      existing.costUsd += event.costUsd;
      breakdownMap.set(key, existing);
    }
    
    // Convert breakdown
    const breakdown = Array.from(breakdownMap.entries()).map(([key, data]) => {
      const [provider, eventType] = key.split(':');
      return { provider, eventType, ...data };
    });
    
    return {
      jobId,
      tenantId,
      totalCostUsd,
      breakdown,
      totalDurationMs,
      stepsCompleted: stepsCompleted.size,
    };
  }

  /**
   * Get per-step cost breakdown
   */
  getStepCosts(jobId: string): StepCost[] {
    const events = this.events.get(jobId) || [];
    const stepMap = new Map<number, StepCost>();
    
    for (const event of events) {
      let step = stepMap.get(event.stepIndex);
      if (!step) {
        step = {
          stepIndex: event.stepIndex,
          stepName: event.stepName,
          toolId: event.toolId,
          costUsd: 0,
          durationMs: 0,
          events: [],
        };
        stepMap.set(event.stepIndex, step);
      }
      
      step.costUsd += event.costUsd;
      step.durationMs += event.durationMs;
      step.events.push(event);
    }
    
    return Array.from(stepMap.values()).sort((a, b) => a.stepIndex - b.stepIndex);
  }

  /**
   * Complete job tracking
   */
  completeJob(jobId: string): JobCostSummary | null {
    const summary = this.getJobCostSummary(jobId);
    console.log(`[Metering] Completed job ${jobId}: $${summary?.totalCostUsd.toFixed(4) || 0}`);
    return summary;
  }

  /**
   * Clear job data (after persisting)
   */
  clearJob(jobId: string): void {
    this.events.delete(jobId);
    this.jobTenants.delete(jobId);
  }
}

// =============================================================================
// SINGLETON
// =============================================================================

export const meteringTracker = new MeteringTracker();
