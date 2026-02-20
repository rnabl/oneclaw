/**
 * Tool Registry Schemas
 * 
 * Defines the structure of tools, their inputs/outputs, policies, and costs.
 * Uses Zod for runtime validation.
 */

import { z } from 'zod';

// =============================================================================
// CORE TYPES
// =============================================================================

/**
 * Secret providers that tools can require
 */
export const SecretProvider = z.enum([
  'anthropic',
  'openai',
  'perplexity',
  'dataforseo',
  'apify',
  'google',
  'proxy',
  'supabase',
  'custom',
]);
export type SecretProvider = z.infer<typeof SecretProvider>;

/**
 * Cost classes for quota management
 */
export const CostClass = z.enum([
  'free',       // No cost (internal operations)
  'cheap',      // < $0.01 per call
  'medium',     // $0.01 - $0.10 per call
  'expensive',  // > $0.10 per call
]);
export type CostClass = z.infer<typeof CostClass>;

/**
 * Error types that can be retried
 */
export const RetryableError = z.enum([
  'TIMEOUT',
  'RATE_LIMITED',
  'NETWORK_ERROR',
  'SERVICE_UNAVAILABLE',
  'INTERNAL_ERROR',
]);
export type RetryableError = z.infer<typeof RetryableError>;

/**
 * Retry policy for a tool
 */
export const RetryPolicy = z.object({
  maxAttempts: z.number().min(1).max(10).default(3),
  backoffMs: z.number().min(100).max(60000).default(1000),
  backoffMultiplier: z.number().min(1).max(4).default(2),
  retryableErrors: z.array(RetryableError).default(['TIMEOUT', 'RATE_LIMITED', 'NETWORK_ERROR']),
});
export type RetryPolicy = z.infer<typeof RetryPolicy>;

/**
 * Network policy - domains the tool is allowed to call
 */
export const NetworkPolicy = z.object({
  allowedDomains: z.array(z.string()).default(['*']),  // '*' = any
  blockedDomains: z.array(z.string()).default([]),
  allowLocalhost: z.boolean().default(false),
});
export type NetworkPolicy = z.infer<typeof NetworkPolicy>;

// =============================================================================
// TOOL DEFINITION
// =============================================================================

/**
 * Complete tool definition
 */
export const ToolDefinition = z.object({
  // Identity
  id: z.string().regex(/^[a-z0-9-]+$/),  // kebab-case
  name: z.string().min(1).max(100),
  description: z.string().max(500),
  version: z.string().regex(/^\d+\.\d+\.\d+$/),  // semver
  
  // Schemas (Zod schemas serialized as JSON Schema for storage)
  // At runtime, we use actual Zod schemas
  inputSchema: z.any(),   // z.ZodType at runtime
  outputSchema: z.any(),  // z.ZodType at runtime
  
  // Security
  requiredSecrets: z.array(SecretProvider).default([]),
  networkPolicy: NetworkPolicy.default({}),
  
  // Cost & Quotas
  costClass: CostClass.default('medium'),
  estimatedCostUsd: z.number().min(0).default(0),
  
  // Reliability
  retryPolicy: RetryPolicy.default({}),
  timeoutMs: z.number().min(1000).max(600000).default(60000),  // 1s - 10min
  idempotent: z.boolean().default(false),
  
  // Marketplace (optional)
  creatorId: z.string().optional(),
  pricePerCallUsd: z.number().min(0).optional(),
  isPublic: z.boolean().default(false),
  
  // Metadata
  tags: z.array(z.string()).default([]),
  createdAt: z.date().default(() => new Date()),
  updatedAt: z.date().default(() => new Date()),
});
export type ToolDefinition = z.infer<typeof ToolDefinition>;

// =============================================================================
// COMMON TOOL SCHEMAS (reusable)
// =============================================================================

/**
 * Location schema used across multiple tools
 */
export const LocationSchema = z.object({
  city: z.string().min(1),
  state: z.string().min(1),
  serviceArea: z.string().min(1),
  country: z.string().default('US'),
});
export type Location = z.infer<typeof LocationSchema>;

/**
 * Business schema
 */
export const BusinessSchema = z.object({
  name: z.string().min(1),
  website: z.string().url().optional(),
  phone: z.string().optional(),
  address: z.string().optional(),
  city: z.string().optional(),
  state: z.string().optional(),
  zipCode: z.string().optional(),
  rating: z.number().min(0).max(5).optional(),
  reviewCount: z.number().min(0).optional(),
  placeId: z.string().optional(),
  category: z.string().optional(),
  googleMapsUrl: z.string().url().optional(),
  latitude: z.number().optional(),
  longitude: z.number().optional(),
  imageUrl: z.string().url().optional(),
  // Enrichment fields (added later via separate enrichment workflow)
  enriched: z.boolean().optional(),
  ownerName: z.string().optional(),
  ownerEmail: z.string().optional(),
  ownerPhone: z.string().optional(),
  seoOptimized: z.boolean().optional(),
  hasAds: z.boolean().optional(),
  hasSocials: z.boolean().optional(),
  hasBooking: z.boolean().optional(),
  hasChatbot: z.boolean().optional(),
  aiReadable: z.boolean().optional(),
});
export type Business = z.infer<typeof BusinessSchema>;

/**
 * Audit issue schema
 */
export const AuditIssueSchema = z.object({
  type: z.enum(['critical', 'warning', 'info']),
  category: z.string(),
  message: z.string(),
  recommendation: z.string().optional(),
});
export type AuditIssue = z.infer<typeof AuditIssueSchema>;

// =============================================================================
// BUILT-IN TOOL DEFINITIONS
// =============================================================================

/**
 * Website Audit Tool
 */
export const AuditToolInput = z.object({
  url: z.string().url(),
  businessName: z.string().min(1),
  locations: z.array(LocationSchema).min(1).max(5),
});
export type AuditToolInput = z.infer<typeof AuditToolInput>;

export const AuditToolOutput = z.object({
  score: z.number().min(0).max(100),
  citationsFound: z.number().min(0),
  totalQueries: z.number().min(0),
  issues: z.array(AuditIssueSchema),
  categoryScores: z.object({
    seo: z.number(),
    aiVisibility: z.number(),
    localPresence: z.number(),
    technical: z.number(),
  }),
  htmlReport: z.string(),
  analyzedAt: z.string().datetime(),
});
export type AuditToolOutput = z.infer<typeof AuditToolOutput>;

export const AUDIT_TOOL: ToolDefinition = {
  id: 'audit-website',
  name: 'Website Audit',
  description: 'Comprehensive website audit including SEO, AI visibility, local presence, and technical analysis',
  version: '1.0.0',
  inputSchema: AuditToolInput,
  outputSchema: AuditToolOutput,
  requiredSecrets: ['dataforseo', 'perplexity'],
  networkPolicy: {
    allowedDomains: [
      'api.dataforseo.com',
      'api.perplexity.ai',
      '*.supabase.co',
    ],
    blockedDomains: [],
    allowLocalhost: false,
  },
  costClass: 'expensive',
  estimatedCostUsd: 0.15,
  retryPolicy: {
    maxAttempts: 3,
    backoffMs: 2000,
    backoffMultiplier: 2,
    retryableErrors: ['TIMEOUT', 'RATE_LIMITED', 'NETWORK_ERROR'],
  },
  timeoutMs: 120000,  // 2 minutes
  idempotent: true,   // Same URL + params = same result
  isPublic: false,
  tags: ['audit', 'seo', 'ai-visibility'],
  createdAt: new Date(),
  updatedAt: new Date(),
};

/**
 * Business Discovery Tool
 */
export const DiscoveryToolInput = z.object({
  niche: z.string().min(1).describe('Business type or niche (e.g., "dentist", "roofing contractor")'),
  location: z.string().min(1).describe('Location string (e.g., "Austin, TX" or "Fort Worth, Texas")'),
  limit: z.number().min(1).max(100).default(50).describe('Maximum number of results to return'),
});
export type DiscoveryToolInput = z.infer<typeof DiscoveryToolInput>;

export const DiscoveryToolOutput = z.object({
  businesses: z.array(BusinessSchema),
  totalFound: z.number(),
  searchTimeMs: z.number(),
});
export type DiscoveryToolOutput = z.infer<typeof DiscoveryToolOutput>;

export const DISCOVERY_TOOL: ToolDefinition = {
  id: 'discover-businesses',
  name: 'Business Discovery',
  description: 'Find businesses by niche and location using Google Maps',
  version: '1.0.0',
  inputSchema: DiscoveryToolInput,
  outputSchema: DiscoveryToolOutput,
  requiredSecrets: ['apify'],
  networkPolicy: {
    allowedDomains: ['api.apify.com'],
    blockedDomains: [],
    allowLocalhost: false,
  },
  costClass: 'medium',
  estimatedCostUsd: 0.05,  // ~$0.004/result * avg 12 results
  retryPolicy: {
    maxAttempts: 3,
    backoffMs: 5000,
    backoffMultiplier: 2,
    retryableErrors: ['TIMEOUT', 'RATE_LIMITED', 'SERVICE_UNAVAILABLE'],
  },
  timeoutMs: 90000,  // 90 seconds
  idempotent: false,  // Results may vary
  isPublic: false,
  tags: ['discovery', 'leads', 'google-maps'],
  createdAt: new Date(),
  updatedAt: new Date(),
};

/**
 * Citation Check Tool (sub-tool used by audit)
 */
export const CitationCheckInput = z.object({
  query: z.string().min(1),
  businessName: z.string().min(1),
});

export const CitationCheckOutput = z.object({
  query: z.string(),
  cited: z.boolean(),
  source: z.string().optional(),
  snippets: z.array(z.string()).optional(),
});

export const CITATION_CHECK_TOOL: ToolDefinition = {
  id: 'check-citation',
  name: 'AI Citation Check',
  description: 'Check if a business is cited in AI search results for a query',
  version: '1.0.0',
  inputSchema: CitationCheckInput,
  outputSchema: CitationCheckOutput,
  requiredSecrets: ['perplexity'],
  networkPolicy: {
    allowedDomains: ['api.perplexity.ai'],
    blockedDomains: [],
    allowLocalhost: false,
  },
  costClass: 'cheap',
  estimatedCostUsd: 0.005,
  retryPolicy: {
    maxAttempts: 3,
    backoffMs: 1000,
    backoffMultiplier: 2,
    retryableErrors: ['TIMEOUT', 'RATE_LIMITED'],
  },
  timeoutMs: 30000,
  idempotent: true,
  isPublic: false,
  tags: ['citation', 'ai-search', 'perplexity'],
  createdAt: new Date(),
  updatedAt: new Date(),
};

/**
 * HVAC Contact Discovery Tool
 */
export const HVACContactInput = z.object({
  location: z.string().min(1),
  limit: z.number().default(100),
  extractOwners: z.boolean().default(true),
  method: z.enum(['brave_website_scrape', 'apify_website_scrape', 'linkedin_enrichment', 'apify_only', 'auto']).default('auto'),
});

export const HVACContactOutput = z.object({
  businesses: z.array(z.object({
    name: z.string(),
    phone: z.string().optional(),
    website: z.string().optional(),
    address: z.string().optional(),
    city: z.string().optional(),
    state: z.string().optional(),
    zipCode: z.string().optional(),
    rating: z.number().optional(),
    reviewCount: z.number().optional(),
    owner: z.object({
      name: z.string(),
      title: z.string().optional(),
      source: z.enum(['website', 'inference', 'linkedin']),
    }).optional(),
  })),
  stats: z.object({
    total: z.number(),
    withOwners: z.number(),
    withoutOwners: z.number(),
    method: z.string(),
    timeMs: z.number(),
    cost: z.number(),
  }),
  toolsUsed: z.array(z.string()),
  missingTools: z.array(z.string()).optional(),
  fallbackUsed: z.boolean().optional(),
});

export type HVACContactInput = z.infer<typeof HVACContactInput>;
export type HVACContactOutput = z.infer<typeof HVACContactOutput>;

export const HVAC_CONTACT_TOOL: ToolDefinition = {
  id: 'hvac-contact-discovery',
  name: 'HVAC Contact Discovery',
  description: 'Find HVAC businesses with owner/decision-maker extraction via website scraping',
  version: '1.0.0',
  inputSchema: HVACContactInput,
  outputSchema: HVACContactOutput,
  requiredSecrets: [],
  networkPolicy: {
    allowedDomains: ['*'],
    blockedDomains: [],
    allowLocalhost: false,
  },
  costClass: 'medium',
  estimatedCostUsd: 0.18,
  retryPolicy: {
    maxAttempts: 2,
    backoffMs: 2000,
    backoffMultiplier: 2,
    retryableErrors: ['TIMEOUT', 'NETWORK_ERROR'],
  },
  timeoutMs: 120000,
  idempotent: false,
  isPublic: true,
  tags: ['discovery', 'hvac', 'contacts', 'owners'],
  createdAt: new Date(),
  updatedAt: new Date(),
};

/**
 * Golf Tee Time Booking Tool
 */
export const GolfBookingInput = z.object({
  location: z.string().min(1),
  date: z.string(),
  timeRange: z.string(),
  partySize: z.number().default(4),
  maxCourses: z.number().default(10),
  method: z.enum(['golfnow_api', 'brave_playwright_hybrid', 'brave_playwright_sequential', 'auto']).default('auto'),
  executionPolicy: z.object({
    scopeMode: z.enum(['single_target', 'multi_target']).default('multi_target'),
    allowExpansion: z.boolean().default(true),
    maxTargets: z.number().min(1).max(50).default(10),
    targetHint: z.string().optional(),
  }).optional(),
});

export const GolfBookingOutput = z.object({
  availableTimes: z.array(z.object({
    course: z.object({
      name: z.string(),
      website: z.string(),
      phone: z.string().optional(),
      address: z.string().optional(),
      rating: z.number().optional(),
      source: z.enum(['golfnow', 'brave_search', 'apify']),
    }),
    time: z.string(),
    date: z.string(),
    players: z.number(),
    price: z.number().optional(),
    bookingUrl: z.string().optional(),
    availability: z.enum(['confirmed', 'likely', 'unknown']),
  })),
  stats: z.object({
    coursesChecked: z.number(),
    timesFound: z.number(),
    method: z.string(),
    timeMs: z.number(),
    cost: z.number(),
  }),
  toolsUsed: z.array(z.string()),
  missingTools: z.array(z.string()).optional(),
  fallbackUsed: z.boolean().optional(),
});

export type GolfBookingInput = z.infer<typeof GolfBookingInput>;
export type GolfBookingOutput = z.infer<typeof GolfBookingOutput>;

export const GOLF_BOOKING_TOOL: ToolDefinition = {
  id: 'golf-tee-time-booking',
  name: 'Golf Tee Time Booking',
  description: 'Find available golf tee times by searching courses and scraping booking pages',
  version: '1.0.0',
  inputSchema: GolfBookingInput,
  outputSchema: GolfBookingOutput,
  requiredSecrets: [],
  networkPolicy: {
    allowedDomains: ['*'],
    blockedDomains: [],
    allowLocalhost: false,
  },
  costClass: 'medium',
  estimatedCostUsd: 0.16,
  retryPolicy: {
    maxAttempts: 2,
    backoffMs: 3000,
    backoffMultiplier: 2,
    retryableErrors: ['TIMEOUT', 'NETWORK_ERROR'],
  },
  timeoutMs: 180000,
  idempotent: false,
  isPublic: true,
  tags: ['golf', 'booking', 'tee-times', 'reservations'],
  createdAt: new Date(),
  updatedAt: new Date(),
};
