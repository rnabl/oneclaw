import { z } from 'zod';

// Zod schema for Apify contact response
export const ApifyContactSchema = z.object({
  full_name: z.string(),
  first_name: z.string().optional(),
  last_name: z.string().optional(),
  email: z.string().email().optional(),
  mobile_number: z.string().optional(),
  personal_email: z.string().email().optional(),
  company_name: z.string().optional(),
  company_website: z.string().url().optional(),
  linkedin: z.string().url().optional(),
  job_title: z.string().optional(),
  industry: z.string().optional(),
  headline: z.string().optional(),
  seniority_level: z.string().optional(),
  company_linkedin: z.string().url().optional(),
  functional_level: z.string().optional(),
  company_size: z.number().optional(),
  city: z.string().optional(),
  state: z.string().optional(),
  country: z.string().optional(),
  company_phone: z.string().optional(),
  company_domain: z.string().optional(),
});

export type ApifyContact = z.infer<typeof ApifyContactSchema>;

// Zod schema for harness enrichment output
export const EnrichmentOutputSchema = z.object({
  url: z.string().url(),
  businessName: z.string().optional(),
  owner: z.object({
    name: z.string(),
    title: z.string().optional(),
    email: z.string().optional(),
    phone: z.string().optional(),
    linkedin: z.string().optional(),
    seniorityLevel: z.string().optional(),
  }).nullable(),
  contacts: z.array(z.object({
    name: z.string(),
    title: z.string().optional(),
    email: z.string().optional(),
    phone: z.string().optional(),
    linkedin: z.string().optional(),
    seniorityLevel: z.string().optional(),
  })).optional(),
  company: z.object({
    name: z.string().optional(),
    website: z.string().optional(),
    industry: z.string().optional(),
    companySize: z.string().optional(),
    linkedinUrl: z.string().optional(),
  }).nullable().optional(),
  method: z.string(),
  source: z.enum(['perplexity', 'dataforseo', 'linkedin', 'website_scrape']),
  timeMs: z.number(),
  cost: z.number(),
  fallbackUsed: z.boolean(),
});

export type EnrichmentOutput = z.infer<typeof EnrichmentOutputSchema>;
