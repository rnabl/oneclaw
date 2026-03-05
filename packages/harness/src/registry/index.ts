/**
 * Tool Registry
 * 
 * Central registry for all tools. Handles registration, lookup, and validation.
 */

import { z } from 'zod';
import { 
  ToolDefinition, 
  AUDIT_TOOL, 
  DISCOVERY_TOOL, 
  CITATION_CHECK_TOOL,
  HVAC_CONTACT_TOOL,
  GOLF_BOOKING_TOOL,
  ENRICH_CONTACT_TOOL,
  GET_JOB_TOOL,
  LIST_JOBS_TOOL,
  SEARCH_BUSINESSES_TOOL,
  RESUME_WORKFLOW_TOOL,
  LIST_RESUMABLE_WORKFLOWS_TOOL,
  GET_PENDING_EMAILS_TOOL,
  APPROVE_EMAIL_TOOL,
  REJECT_EMAIL_TOOL,
} from './schemas';

// =============================================================================
// REGISTRY
// =============================================================================

class ToolRegistry {
  private tools: Map<string, ToolDefinition> = new Map();

  /**
   * Register a tool
   */
  register(tool: ToolDefinition): void {
    if (this.tools.has(tool.id)) {
      throw new Error(`Tool already registered: ${tool.id}`);
    }
    this.tools.set(tool.id, tool);
    console.log(`[Registry] Registered tool: ${tool.id} v${tool.version}`);
  }

  /**
   * Get a tool by ID
   */
  get(toolId: string): ToolDefinition | undefined {
    return this.tools.get(toolId);
  }

  /**
   * Get a tool, throw if not found
   */
  getOrThrow(toolId: string): ToolDefinition {
    const tool = this.tools.get(toolId);
    if (!tool) {
      throw new Error(`Tool not found: ${toolId}`);
    }
    return tool;
  }

  /**
   * List all registered tools
   */
  list(): ToolDefinition[] {
    return Array.from(this.tools.values());
  }

  /**
   * List tools by tag
   */
  listByTag(tag: string): ToolDefinition[] {
    return this.list().filter(t => t.tags.includes(tag));
  }

  /**
   * List public tools (for marketplace)
   */
  listPublic(): ToolDefinition[] {
    return this.list().filter(t => t.isPublic);
  }

  /**
   * Validate input against tool's schema
   */
  validateInput(toolId: string, input: unknown): { success: true; data: unknown } | { success: false; errors: z.ZodError } {
    const tool = this.getOrThrow(toolId);
    const schema = tool.inputSchema as z.ZodType;
    
    const result = schema.safeParse(input);
    if (result.success) {
      return { success: true, data: result.data };
    }
    return { success: false, errors: result.error };
  }

  /**
   * Validate output against tool's schema
   */
  validateOutput(toolId: string, output: unknown): { success: true; data: unknown } | { success: false; errors: z.ZodError } {
    const tool = this.getOrThrow(toolId);
    const schema = tool.outputSchema as z.ZodType;
    
    const result = schema.safeParse(output);
    if (result.success) {
      return { success: true, data: result.data };
    }
    return { success: false, errors: result.error };
  }

  /**
   * Get required secrets for a tool
   */
  getRequiredSecrets(toolId: string): string[] {
    const tool = this.getOrThrow(toolId);
    return tool.requiredSecrets;
  }

  /**
   * Check if domain is allowed for a tool
   */
  isDomainAllowed(toolId: string, domain: string): boolean {
    const tool = this.getOrThrow(toolId);
    const policy = tool.networkPolicy;
    
    // Check blocked first
    if (policy.blockedDomains.some(d => matchDomain(domain, d))) {
      return false;
    }
    
    // Check localhost
    if (isLocalhost(domain) && !policy.allowLocalhost) {
      return false;
    }
    
    // Check allowed (wildcard '*' allows all)
    if (policy.allowedDomains.includes('*')) {
      return true;
    }
    
    return policy.allowedDomains.some(d => matchDomain(domain, d));
  }
}

// Helper: Match domain with wildcard support
function matchDomain(domain: string, pattern: string): boolean {
  if (pattern.startsWith('*.')) {
    const suffix = pattern.slice(1);  // '.example.com'
    return domain.endsWith(suffix) || domain === pattern.slice(2);
  }
  return domain === pattern;
}

// Helper: Check if localhost
function isLocalhost(domain: string): boolean {
  return ['localhost', '127.0.0.1', '0.0.0.0', '::1'].includes(domain);
}

// =============================================================================
// SINGLETON INSTANCE
// =============================================================================

export const registry = new ToolRegistry();

// Register built-in tools
registry.register(AUDIT_TOOL);
registry.register(DISCOVERY_TOOL);  // discover-businesses
registry.register(CITATION_CHECK_TOOL);
// registry.register(HVAC_CONTACT_TOOL);  // DISABLED - use discover-businesses instead
registry.register(GOLF_BOOKING_TOOL);
registry.register(ENRICH_CONTACT_TOOL);  // Contact enrichment

// Job history query tools
registry.register(GET_JOB_TOOL);
registry.register(LIST_JOBS_TOOL);
registry.register(SEARCH_BUSINESSES_TOOL);

// Workflow checkpoint tools (with actual handlers)
registry.register(RESUME_WORKFLOW_IMPL as any);
registry.register(LIST_RESUMABLE_WORKFLOWS_IMPL as any);

// Email approval tools (with actual handlers)
registry.register(GET_PENDING_EMAILS_IMPL as any);
registry.register(APPROVE_EMAIL_IMPL as any);
registry.register(REJECT_EMAIL_IMPL as any);

// Self-improvement tools (import and register)
import { EXECUTE_CODE_TOOL } from '../tools/execute-code';
import { WRITE_FILE_TOOL } from '../tools/write-file';
import { READ_FILE_TOOL } from '../tools/read-file';
import { DATABASE_TOOL } from '../tools/database';
import { INIT_DATABASE_TOOL } from '../tools/init-database';
import { SUPABASE_DATABASE_TOOL } from '../tools/supabase-database';
import { SUPABASE_STORAGE_TOOL } from '../tools/supabase-storage';
import { CHECK_AI_RANKINGS_TOOL } from '../tools/check-ai-rankings';
import { DISCOVER_HIRING_BUSINESSES_TOOL } from '../tools/discover-hiring-businesses';

// Import actual tool implementations (with handlers)
import {
  RESUME_WORKFLOW_TOOL as RESUME_WORKFLOW_IMPL,
  LIST_RESUMABLE_WORKFLOWS_TOOL as LIST_RESUMABLE_WORKFLOWS_IMPL,
} from '../tools/workflow-checkpoint';

import {
  GET_PENDING_EMAILS_TOOL as GET_PENDING_EMAILS_IMPL,
  APPROVE_EMAIL_TOOL as APPROVE_EMAIL_IMPL,
  REJECT_EMAIL_TOOL as REJECT_EMAIL_IMPL,
} from '../tools/email-approval';

registry.register(EXECUTE_CODE_TOOL as any);
registry.register(WRITE_FILE_TOOL as any);
registry.register(READ_FILE_TOOL as any);
registry.register(DATABASE_TOOL as any);
registry.register(INIT_DATABASE_TOOL as any);
registry.register(SUPABASE_DATABASE_TOOL as any);
registry.register(SUPABASE_STORAGE_TOOL as any);
registry.register(CHECK_AI_RANKINGS_TOOL as any);
registry.register(DISCOVER_HIRING_BUSINESSES_TOOL as any);

// =============================================================================
// EXPORTS
// =============================================================================

export * from './schemas';
export { ToolRegistry };
