/**
 * OpenClaw Tool Definition for AgentKey Workflows
 * 
 * This file defines how OpenClaw should call AgentKey to execute workflows.
 * Install this as a "skill" or "tool" in your OpenClaw instance.
 * 
 * OpenClaw acts as the McKinsey Partner (reasoning, decisions)
 * AgentKey acts as the Firm Infrastructure (execution, metering, durability)
 */

export interface AgentKeyToolConfig {
  apiUrl: string;       // e.g., "https://oneclaw.chat"
  apiKey: string;       // User's oneclaw_key
}

/**
 * Tool definition for OpenClaw's tool registry
 * 
 * This tells OpenClaw how to call AgentKey workflows
 */
export const AGENTKEY_TOOLS = {
  // ============================================
  // WEBSITE AUDIT TOOL
  // ============================================
  audit_website: {
    name: 'audit_website',
    description: 'Run a comprehensive website audit including SEO, AI visibility, schema analysis, and authority scoring. Use this when user asks to audit, analyze, or check a website.',
    parameters: {
      type: 'object',
      properties: {
        url: {
          type: 'string',
          description: 'The website URL to audit (e.g., "example.com" or "https://example.com")',
        },
        business_name: {
          type: 'string',
          description: 'Optional: The business name (extracted from URL if not provided)',
        },
        location: {
          type: 'string',
          description: 'Optional: Business location for local SEO analysis (e.g., "Denver, CO")',
        },
        industry: {
          type: 'string',
          description: 'Optional: Industry for tailored analysis. One of: hvac, plumbing, dental',
          enum: ['hvac', 'plumbing', 'dental'],
        },
      },
      required: ['url'],
    },
    // Example phrases that should trigger this tool
    triggers: [
      'audit',
      'analyze website',
      'check website',
      'site audit',
      'seo audit',
      'check my site',
      'analyze my website',
    ],
  },

  // ============================================
  // LEAD DISCOVERY TOOL
  // ============================================
  discover_leads: {
    name: 'discover_leads',
    description: 'Find businesses by industry niche and location. Use this when user asks to find, discover, or search for businesses.',
    parameters: {
      type: 'object',
      properties: {
        niche: {
          type: 'string',
          description: 'Business type/industry (e.g., "HVAC", "plumber", "dentist")',
        },
        location: {
          type: 'string',
          description: 'City and state (e.g., "Denver, CO" or "Austin, Texas")',
        },
        limit: {
          type: 'number',
          description: 'Maximum number of results (default: 50)',
        },
      },
      required: ['niche', 'location'],
    },
    triggers: [
      'find',
      'discover',
      'search for',
      'businesses in',
      'leads in',
      'companies in',
    ],
  },

  // ============================================
  // GOLF BOOKING TOOL (Coming Soon)
  // ============================================
  book_golf: {
    name: 'book_golf',
    description: 'Book a golf tee time. Use when user asks to book, reserve, or schedule golf.',
    parameters: {
      type: 'object',
      properties: {
        course: {
          type: 'string',
          description: 'Golf course name',
        },
        date: {
          type: 'string',
          description: 'Desired date (e.g., "Saturday", "March 15")',
        },
        time: {
          type: 'string',
          description: 'Preferred time (e.g., "8am", "morning", "afternoon")',
        },
        players: {
          type: 'number',
          description: 'Number of players (default: 1)',
        },
      },
      required: ['course', 'date'],
    },
    triggers: [
      'book golf',
      'tee time',
      'golf reservation',
      'schedule golf',
    ],
  },
};

/**
 * Execute an AgentKey workflow from OpenClaw
 * 
 * This is the function OpenClaw calls when it decides to use one of our tools.
 */
export async function executeAgentKeyTool(
  toolName: string,
  params: Record<string, unknown>,
  config: AgentKeyToolConfig
): Promise<{
  success: boolean;
  result?: unknown;
  error?: string;
  credits_used?: number;
}> {
  const workflowMap: Record<string, string> = {
    'audit_website': 'audit',
    'discover_leads': 'discovery',
    'book_golf': 'book-golf',
  };

  const workflow = workflowMap[toolName];
  if (!workflow) {
    return { success: false, error: `Unknown tool: ${toolName}` };
  }

  try {
    const response = await fetch(`${config.apiUrl}/api/v1/workflow`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        workflow,
        params,
        iclaw_key: config.apiKey,
      }),
    });

    const data = await response.json();

    if (data.status === 'error') {
      return { success: false, error: data.error };
    }

    return {
      success: true,
      result: data.result,
      credits_used: data.credits_used,
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Generate OpenClaw skill configuration
 * 
 * This returns the configuration that should be added to OpenClaw's skills.
 * Can be used for dynamic skill registration.
 */
export function generateOpenClawSkillConfig(apiUrl: string): object {
  return {
    id: 'agentkey',
    name: 'AgentKey Workflows',
    description: 'Execute durable workflows via AgentKey (audits, discovery, bookings)',
    version: '1.0.0',
    tools: Object.values(AGENTKEY_TOOLS),
    config: {
      apiUrl,
    },
    // System prompt addition for OpenClaw
    systemPromptAddition: `
You have access to AgentKey workflows for complex tasks:

1. **Website Audit** (audit_website): Comprehensive SEO, AI visibility, and authority analysis
   - Use when user says "audit", "analyze", "check" a website
   - Returns authority score, AI citation rate, SEO issues, recommendations

2. **Lead Discovery** (discover_leads): Find businesses by niche and location
   - Use when user says "find", "discover", "search for" businesses
   - Returns list of businesses with ratings, contact info

3. **Golf Booking** (book_golf): Reserve tee times
   - Use when user wants to book golf
   - Currently in development

These workflows run on AgentKey's durable infrastructure with metering and retry logic.
Always confirm workflow results with the user before taking further action.
`,
  };
}

/**
 * Example: How to integrate with OpenClaw
 * 
 * In your OpenClaw config or skills directory:
 * 
 * ```typescript
 * import { AGENTKEY_TOOLS, executeAgentKeyTool } from './openclaw-tool';
 * 
 * // Register tools with OpenClaw
 * openclaw.registerTools(Object.values(AGENTKEY_TOOLS));
 * 
 * // Handle tool execution
 * openclaw.onToolCall(async (toolName, params) => {
 *   const result = await executeAgentKeyTool(toolName, params, {
 *     apiUrl: process.env.AGENTKEY_API_URL,
 *     apiKey: process.env.AGENTKEY_API_KEY,
 *   });
 *   return result;
 * });
 * ```
 */
