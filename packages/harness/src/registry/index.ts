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
  CITATION_CHECK_TOOL 
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
registry.register(DISCOVERY_TOOL);
registry.register(CITATION_CHECK_TOOL);

// =============================================================================
// EXPORTS
// =============================================================================

export * from './schemas';
export { ToolRegistry };
