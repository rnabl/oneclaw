/**
 * Industry Taxonomy Types
 * 
 * Defines the structure for industry-specific configurations.
 * Used by workflows to understand service categories, keywords, job values, etc.
 */

import { z } from 'zod';

/**
 * A service category within an industry
 */
export const ServiceCategorySchema = z.object({
  id: z.string(),
  name: z.string(),
  avgJobValue: z.number(),
  keywords: z.array(z.string()),
});
export type ServiceCategory = z.infer<typeof ServiceCategorySchema>;

/**
 * Complete industry taxonomy
 */
export const IndustryTaxonomySchema = z.object({
  id: z.string(),
  name: z.string(),
  displayName: z.string(),
  
  // Service categories with job values
  services: z.array(ServiceCategorySchema),
  
  // AI questions for citation checks (with {city}, {state} placeholders)
  aiQuestions: z.array(z.string()),
  
  // Keywords to look for when scanning websites
  serviceScanKeywords: z.array(z.string()),
  
  // Trust signals to extract (pattern → display name)
  trustSignalKeywords: z.record(z.string(), z.string()),
  
  // Financial defaults
  defaultAvgJobValue: z.number(),
  conversionRate: z.number(),
});
export type IndustryTaxonomy = z.infer<typeof IndustryTaxonomySchema>;

/**
 * Industry detection result
 */
export interface IndustryDetection {
  industry: string;
  industryName: string;
  matches: number;
  confidence: number;
  keywords: string[];
}
