/**
 * Audit Website Workflow Types
 * 
 * Input/output schemas and intermediate data types for the audit workflow.
 */

import { z } from 'zod';

// ============ INPUT SCHEMAS ============

export const LocationInputSchema = z.object({
  city: z.string(),
  state: z.string(),
  stateCode: z.string().optional(),
});
export type LocationInput = z.infer<typeof LocationInputSchema>;

export const AuditInputSchema = z.object({
  // Target
  url: z.string().url(),
  businessName: z.string(),
  
  // Location
  location: LocationInputSchema,
  
  // Options
  industry: z.string().default('hvac'),
  skipKeywords: z.boolean().default(false),
  skipCitations: z.boolean().default(false),
  
  // Tenant context (optional, for multi-tenant)
  tenantId: z.string().optional(),
  userId: z.string().optional(),
});
export type AuditInput = z.infer<typeof AuditInputSchema>;

// ============ INTERMEDIATE DATA ============

export interface WebsiteScanResult {
  status: 'live' | 'dead' | 'error';
  title: string;
  description: string;
  headings: string[];
  bodyText: string;
  hasSSL: boolean;
  loadTimeMs: number;
  servicesFound: string[];
  trustSignals: string[];
  hasOnlineBooking: boolean;
  hasContactForm: boolean;
  hasLiveChat: boolean;
  hasPricing: boolean;
  socialProfiles: string[];
  techStack: string[];
}

export const SchemaItemSchema = z.object({
  name: z.string(),
  status: z.enum(['OPTIMIZED', 'GOOD', 'BASIC', 'GROWING', 'NOT_SETUP', 'CHECK']),
  description: z.string(),
  score: z.number().optional(),
});
export type SchemaItem = z.infer<typeof SchemaItemSchema>;

export const CitationResultSchema = z.object({
  query: z.string(),
  isCited: z.boolean(),
  competitors: z.array(z.string()),
  response: z.string().optional(),
});
export type CitationResult = z.infer<typeof CitationResultSchema>;

export const KeywordVolumeSchema = z.object({
  keyword: z.string(),
  volume: z.number(),
  cpc: z.number().nullable(),
  difficulty: z.number().nullable(),
});
export type KeywordVolume = z.infer<typeof KeywordVolumeSchema>;

// ============ OUTPUT SCHEMA ============

export const AuditResultSchema = z.object({
  // Identity
  businessName: z.string(),
  url: z.string(),
  location: LocationInputSchema,
  industry: z.string(),
  
  // Website scan results
  websiteStatus: z.enum(['live', 'dead', 'error']),
  loadTimeMs: z.number(),
  hasSSL: z.boolean(),
  
  // Content analysis
  servicesFound: z.array(z.string()),
  trustSignals: z.array(z.string()),
  hasOnlineBooking: z.boolean(),
  hasContactForm: z.boolean(),
  hasLiveChat: z.boolean(),
  hasPricing: z.boolean(),
  
  // Schema/SEO
  schemaItems: z.array(SchemaItemSchema),
  schemaScore: z.number(),
  
  // AI visibility
  citationResults: z.array(CitationResultSchema),
  citationRate: z.number(),
  competitorsCitedInstead: z.array(z.string()),
  
  // Reviews
  reviewCount: z.number(),
  rating: z.number(),
  
  // Keywords
  topKeywords: z.array(KeywordVolumeSchema),
  estimatedMonthlySearches: z.number(),
  
  // Authority score
  authorityScore: z.number(),
  authorityLevel: z.enum(['low', 'medium', 'high', 'excellent']),
  
  // Recommendations
  strengths: z.array(z.string()),
  gaps: z.array(z.string()),
  priorityActions: z.array(z.string()),
  
  // Financial estimate
  estimatedMonthlyValue: z.number(),
  
  // Metadata
  auditedAt: z.string(),
  durationMs: z.number(),
});
export type AuditResult = z.infer<typeof AuditResultSchema>;
