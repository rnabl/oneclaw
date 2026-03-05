/**
 * Zod Schemas for Agnostic Lead Storage
 * 
 * Type-safe validation for leads from any discovery source
 */

import { z } from 'zod';

// =============================================================================
// Source Type Enum
// =============================================================================

export const SourceType = z.enum([
  'geographic',
  'job_posting',
  'review',
  'referral',
  'manual',
  'other',
]);

export type SourceType = z.infer<typeof SourceType>;

// =============================================================================
// Base Lead Schema (Common Fields)
// =============================================================================

export const BaseLeadSchema = z.object({
  // Core business info
  name: z.string().min(1),
  website: z.string().url().nullable().optional(),
  phone: z.string().nullable().optional(),
  email: z.string().email().nullable().optional(),
  industry: z.string().nullable().optional(),
  
  // Location
  address: z.string().nullable().optional(),
  city: z.string().nullable().optional(),
  state: z.string().nullable().optional(),
  zipCode: z.string().nullable().optional(),
  country: z.string().default('US'),
  
  // Ratings
  rating: z.number().min(0).max(5).nullable().optional(),
  reviewCount: z.number().int().min(0).nullable().optional(),
  
  // Scores
  leadScore: z.number().int().min(0).max(100).default(50),
  geoReadinessScore: z.number().min(0).max(10).default(5),
  aeoReadinessScore: z.number().min(0).max(10).default(5),
  
  // Source tracking
  sourceJobId: z.string().optional(),
  sourceType: SourceType.default('geographic'),
});

export type BaseLead = z.infer<typeof BaseLeadSchema>;

// =============================================================================
// Website Signals Schema (Universal)
// =============================================================================

export const WebsiteSignalsSchema = z.object({
  // Website presence
  hasWebsite: z.boolean(),
  websiteAccessible: z.boolean(),
  
  // SEO
  seoOptimized: z.boolean(),
  hasSSL: z.boolean(),
  hasMetaDescription: z.boolean(),
  hasStructuredData: z.boolean(),
  
  // Marketing
  hasAds: z.boolean(),
  hasFacebookPixel: z.boolean(),
  hasGoogleAnalytics: z.boolean(),
  hasGoogleTagManager: z.boolean(),
  
  // Social
  hasSocials: z.boolean(),
  socialPlatforms: z.array(z.string()),
  
  // Conversion
  hasBooking: z.boolean(),
  bookingPlatforms: z.array(z.string()),
  hasChatbot: z.boolean(),
  chatbotPlatforms: z.array(z.string()),
  
  // AI Readability
  aiReadable: z.boolean(),
  aiReadabilityScore: z.number().min(0).max(100),
  
  // Tech stack
  techStack: z.object({
    cms: z.string().optional(),
    hasWordPress: z.boolean(),
    hasShopify: z.boolean(),
    hasWix: z.boolean(),
  }).optional(),
  
  // Review signals (if available)
  reviewCount: z.number().nullable().optional(),
  averageRating: z.number().nullable().optional(),
  reviewCountBand: z.enum(['none', 'few', 'some', 'many']).optional(),
  reviewRatingBand: z.enum(['none', 'low', 'medium', 'high']).nullable().optional(),
});

export type WebsiteSignals = z.infer<typeof WebsiteSignalsSchema>;

// =============================================================================
// Source-Specific Metadata Schemas
// =============================================================================

// Geographic Discovery Metadata
export const GeographicSourceMetadataSchema = z.object({
  discovery_method: z.literal('google_maps'),
  search_query: z.string().optional(),
  googlePlaceId: z.string().optional(),
  googleMapsUrl: z.string().url().optional(),
  imageUrl: z.string().url().optional(),
  gbp_claimed: z.boolean().optional(),
  category: z.string().optional(),
});

export type GeographicSourceMetadata = z.infer<typeof GeographicSourceMetadataSchema>;

// Job Posting Discovery Metadata
export const JobPostingSchema = z.object({
  role: z.string(),
  salary: z.string().nullable(),
  jobType: z.array(z.string()).default([]),
  posted_days_ago: z.number().int().min(0),
  url: z.string().url(),
  source: z.enum(['linkedin', 'indeed', 'glassdoor', 'other']).default('other'),
});

export const HiringSignalSchema = z.object({
  is_hiring: z.literal(true),
  total_postings: z.number().int().min(1),
  roles: z.array(z.string()).min(1),
  intensity: z.enum(['low', 'medium', 'high']),
  most_recent_days: z.number().int().min(0),
});

export const JobPostingSourceMetadataSchema = z.object({
  hiring_signal: HiringSignalSchema,
  business_type: z.enum(['residential', 'commercial', 'both', 'unknown']).optional(),
  business_type_confidence: z.number().min(0).max(1).optional(),
  job_postings: z.array(JobPostingSchema),
});

export type JobPostingSourceMetadata = z.infer<typeof JobPostingSourceMetadataSchema>;
export type HiringSignal = z.infer<typeof HiringSignalSchema>;
export type JobPosting = z.infer<typeof JobPostingSchema>;

// Review/Reputation Discovery Metadata (Future)
export const ReviewSourceMetadataSchema = z.object({
  discovery_method: z.literal('review_scraping'),
  review_platforms: z.array(z.string()),
  avg_rating: z.number().min(0).max(5),
  total_reviews: z.number().int().min(0),
  negative_review_keywords: z.array(z.string()).optional(),
  response_rate: z.number().min(0).max(1).optional(),
});

export type ReviewSourceMetadata = z.infer<typeof ReviewSourceMetadataSchema>;

// Union of all source metadata types
export const SourceMetadataSchema = z.union([
  GeographicSourceMetadataSchema,
  JobPostingSourceMetadataSchema,
  ReviewSourceMetadataSchema,
  z.object({}).passthrough(), // Allow empty or custom metadata
]);

export type SourceMetadata = z.infer<typeof SourceMetadataSchema>;

// =============================================================================
// Complete Lead Record Schema
// =============================================================================

export const LeadRecordSchema = BaseLeadSchema.extend({
  signals: WebsiteSignalsSchema.partial().optional(),
  sourceMetadata: SourceMetadataSchema.optional(),
});

export type LeadRecord = z.infer<typeof LeadRecordSchema>;

// =============================================================================
// Geographic Lead (Specific Type)
// =============================================================================

export const GeographicLeadSchema = BaseLeadSchema.extend({
  sourceType: z.literal('geographic'),
  googlePlaceId: z.string().optional(),
  googleMapsUrl: z.string().url().optional(),
  imageUrl: z.string().url().optional(),
  signals: WebsiteSignalsSchema.partial().optional(),
  sourceMetadata: GeographicSourceMetadataSchema.optional(),
});

export type GeographicLead = z.infer<typeof GeographicLeadSchema>;

// =============================================================================
// Job Posting Lead (Specific Type)
// =============================================================================

export const JobPostingLeadSchema = BaseLeadSchema.extend({
  sourceType: z.literal('job_posting'),
  signals: WebsiteSignalsSchema.partial()
    .extend({
      isHiring: z.literal(true),
      hiringRoles: z.array(z.string()),
      hiringIntensity: z.enum(['low', 'medium', 'high']),
      totalJobPostings: z.number().int().min(1),
      mostRecentJobDays: z.number().int().min(0),
    })
    .optional(),
  sourceMetadata: JobPostingSourceMetadataSchema,
});

export type JobPostingLead = z.infer<typeof JobPostingLeadSchema>;

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Validate a lead record
 */
export function validateLeadRecord(data: unknown): LeadRecord {
  return LeadRecordSchema.parse(data);
}

/**
 * Validate a geographic lead
 */
export function validateGeographicLead(data: unknown): GeographicLead {
  return GeographicLeadSchema.parse(data);
}

/**
 * Validate a job posting lead
 */
export function validateJobPostingLead(data: unknown): JobPostingLead {
  return JobPostingLeadSchema.parse(data);
}

/**
 * Safe parse (returns success/error instead of throwing)
 */
export function safeValidateLeadRecord(data: unknown) {
  return LeadRecordSchema.safeParse(data);
}

/**
 * Type guard for job posting leads
 */
export function isJobPostingLead(lead: LeadRecord): lead is JobPostingLead {
  return lead.sourceType === 'job_posting';
}

/**
 * Type guard for geographic leads
 */
export function isGeographicLead(lead: LeadRecord): lead is GeographicLead {
  return lead.sourceType === 'geographic';
}

// =============================================================================
// Example Usage
// =============================================================================

/*
// Geographic lead
const geoLead: GeographicLead = {
  name: "ABC HVAC",
  sourceType: "geographic",
  city: "Austin",
  state: "TX",
  signals: {
    hasWebsite: true,
    seoOptimized: false,
    aiReadable: false,
    // ... other signals
  },
  sourceMetadata: {
    discovery_method: "google_maps",
    googlePlaceId: "ChIJ...",
    gbp_claimed: true,
  },
};

// Job posting lead
const jobLead: JobPostingLead = {
  name: "XYZ HVAC",
  sourceType: "job_posting",
  city: "Dallas",
  state: "TX",
  signals: {
    hasWebsite: false,
    isHiring: true,
    hiringRoles: ["HVAC Tech", "Sales Manager"],
    hiringIntensity: "high",
    totalJobPostings: 3,
    mostRecentJobDays: 2,
  },
  sourceMetadata: {
    hiring_signal: {
      is_hiring: true,
      total_postings: 3,
      roles: ["HVAC Tech", "Sales Manager"],
      intensity: "high",
      most_recent_days: 2,
    },
    business_type: "residential",
    business_type_confidence: 0.85,
    job_postings: [
      {
        role: "HVAC Technician",
        salary: "$50k-70k",
        jobType: ["Full-time"],
        posted_days_ago: 2,
        url: "https://linkedin.com/...",
        source: "linkedin",
      },
    ],
  },
};
*/
