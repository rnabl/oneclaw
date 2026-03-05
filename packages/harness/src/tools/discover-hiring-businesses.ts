/**
 * Discover Hiring Businesses Tool
 * 
 * Find companies actively hiring via LinkedIn/Indeed job postings.
 * Returns businesses with hiring signals, job metadata, and contact info.
 * 
 * Use case: Target growth-stage companies with hiring budget
 */

import { z } from 'zod';
import { runner } from '../execution/runner';

const DiscoverHiringBusinessesInputSchema = z.object({
  keyword: z.string().describe('Job keyword (e.g., "HVAC technician", "plumber", "electrician")'),
  location: z.string().describe('Location (e.g., "Austin, TX" or "Texas")'),
  days: z.number().default(30).describe('Job posting recency in days'),
  maxResults: z.number().default(50).describe('Maximum number of companies to find'),
  enrich: z.boolean().default(true).describe('Whether to enrich with website data'),
});

type DiscoverHiringBusinessesInput = z.infer<typeof DiscoverHiringBusinessesInputSchema>;

const DiscoverHiringBusinessesOutputSchema = z.object({
  businesses: z.array(z.any()),
  totalFound: z.number(),
  stats: z.object({
    total: z.number(),
    withWebsites: z.number(),
    avgJobPostings: z.number(),
  }),
});

type DiscoverHiringBusinessesOutput = z.infer<typeof DiscoverHiringBusinessesOutputSchema>;

async function discoverHiringBusinessesHandler(
  input: DiscoverHiringBusinessesInput,
  context: { tenantId: string }
): Promise<DiscoverHiringBusinessesOutput> {
  
  // Execute the workflow via runner
  const job = await runner.execute('discover-hiring-businesses', input, {
    tenantId: context.tenantId,
    tier: 'pro',
  });
  
  if (job.status !== 'completed' || !job.output) {
    throw new Error('Hiring discovery workflow failed');
  }
  
  return job.output as DiscoverHiringBusinessesOutput;
}

export const DISCOVER_HIRING_BUSINESSES_TOOL = {
  id: 'discover-hiring-businesses',
  name: 'discover-hiring-businesses',
  description: 'Find companies actively hiring via LinkedIn/Indeed job postings. Returns businesses with hiring signals (roles, intensity, recency) and contact info. Best for targeting growth-stage companies.',
  version: '1.0.0',
  costClass: 'medium' as const,
  estimatedCostUsd: 1.00,
  requiredSecrets: ['notte'] as string[],
  tags: ['discovery', 'hiring', 'jobs', 'linkedin', 'indeed', 'b2b'],
  inputSchema: DiscoverHiringBusinessesInputSchema,
  outputSchema: DiscoverHiringBusinessesOutputSchema,
  networkPolicy: {
    allowedDomains: ['*.notte.cc', '*.linkedin.com', '*.indeed.com'],
    blockedDomains: [],
    allowLocalhost: false,
  },
  isPublic: true,
  handler: async (input: unknown, context: { tenantId: string }) => {
    const validated = DiscoverHiringBusinessesInputSchema.parse(input);
    return discoverHiringBusinessesHandler(validated, { tenantId: context.tenantId });
  },
};

export { DiscoverHiringBusinessesInputSchema, DiscoverHiringBusinessesOutputSchema, discoverHiringBusinessesHandler };
