/**
 * NAP Citation Checker Tool
 * 
 * Uses Apify's Citation God Mode actor to verify NAP consistency
 * across 50+ directories including Yelp, Yellow Pages, BBB, etc.
 */

import { z } from 'zod';
import { registry } from '../registry';

// Input schema
const CheckCitationsInputSchema = z.object({
  businessName: z.string().describe('Business name to check'),
  address: z.string().optional().describe('Street address'),
  city: z.string().describe('City'),
  state: z.string().describe('State (2-letter code)'),
  zipCode: z.string().optional().describe('ZIP code'),
  phone: z.string().optional().describe('Phone number'),
  website: z.string().optional().describe('Business website URL'),
});

type CheckCitationsInput = z.infer<typeof CheckCitationsInputSchema>;

// Output schema
const CheckCitationsOutputSchema = z.object({
  citationsFound: z.number().describe('Total citations found'),
  citationsChecked: z.number().describe('Total directories checked'),
  consistencyScore: z.number().min(0).max(100).describe('NAP consistency score'),
  issues: z.array(z.object({
    directory: z.string(),
    issue: z.string(),
    currentNap: z.object({
      name: z.string().optional(),
      address: z.string().optional(),
      phone: z.string().optional(),
    }).optional(),
  })),
  canonicalNap: z.object({
    name: z.string(),
    address: z.string(),
    phone: z.string(),
  }).optional(),
  recommendations: z.array(z.string()),
});

type CheckCitationsOutput = z.infer<typeof CheckCitationsOutputSchema>;

/**
 * Check NAP citations using Apify Citation God Mode
 */
export async function checkCitationsHandler(
  input: CheckCitationsInput,
  context: { tenantId: string }
): Promise<CheckCitationsOutput> {
  const apifyToken = process.env.APIFY_API_TOKEN || process.env.APIFY_TOKEN;
  
  if (!apifyToken) {
    throw new Error('APIFY_API_TOKEN not configured');
  }
  
  // Build search query for Citation God Mode
  const searchQuery = `${input.businessName} ${input.city} ${input.state}`.trim();
  
  console.log(`[Citation Check] Checking citations for: ${searchQuery}`);
  
  // Run Apify Citation God Mode actor
  const runUrl = 'https://api.apify.com/v2/acts/alizarin_refrigerator-owner~citation-god-mode/runs';
  
  const runInput = {
    businessName: input.businessName,
    address: input.address,
    city: input.city,
    state: input.state,
    zipCode: input.zipCode,
    phone: input.phone,
    website: input.website,
    // Options
    useMoz: true,           // Use Moz integration (50+ directories)
    directScrape: true,     // Direct scrape 60+ directories
    useAiExtraction: true,  // Claude AI for additional directories
    crossValidate: true,    // Find canonical NAP
  };
  
  const runResponse = await fetch(runUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apifyToken}`,
    },
    body: JSON.stringify(runInput),
  });
  
  if (!runResponse.ok) {
    const error = await runResponse.text();
    throw new Error(`Failed to start Apify actor: ${error}`);
  }
  
  const run = await runResponse.json();
  const runId = run.data.id;
  
  console.log(`[Citation Check] Started Apify run: ${runId}`);
  
  // Wait for completion (poll every 5 seconds, max 5 minutes)
  let status = 'RUNNING';
  let attempts = 0;
  const maxAttempts = 60; // 5 minutes
  
  while (status === 'RUNNING' && attempts < maxAttempts) {
    await new Promise(resolve => setTimeout(resolve, 5000));
    
    const statusResponse = await fetch(
      `https://api.apify.com/v2/acts/alizarin_refrigerator-owner~citation-god-mode/runs/${runId}`,
      {
        headers: { 'Authorization': `Bearer ${apifyToken}` },
      }
    );
    
    const statusData = await statusResponse.json();
    status = statusData.data.status;
    attempts++;
    
    console.log(`[Citation Check] Status: ${status} (${attempts}/${maxAttempts})`);
  }
  
  if (status !== 'SUCCEEDED') {
    throw new Error(`Citation check failed with status: ${status}`);
  }
  
  // Get results from default dataset
  const datasetUrl = `https://api.apify.com/v2/acts/alizarin_refrigerator-owner~citation-god-mode/runs/${runId}/dataset/items`;
  
  const datasetResponse = await fetch(datasetUrl, {
    headers: { 'Authorization': `Bearer ${apifyToken}` },
  });
  
  const results = await datasetResponse.json();
  
  console.log(`[Citation Check] Got ${results.length} results`);
  
  // Parse results from Citation God Mode
  const citationData = results[0] || {};
  
  // Extract citation information
  const citationsFound = citationData.totalCitationsFound || 0;
  const citationsChecked = citationData.totalDirectoriesChecked || 0;
  const consistencyScore = citationData.consistencyScore || 0;
  const issues = citationData.inconsistencies || [];
  const canonicalNap = citationData.canonicalNap;
  const recommendations = citationData.recommendations || [];
  
  // Transform issues to our format
  const formattedIssues = issues.map((issue: any) => ({
    directory: issue.directory || issue.source || 'Unknown',
    issue: issue.description || issue.issue || 'Inconsistent NAP',
    currentNap: {
      name: issue.foundName,
      address: issue.foundAddress,
      phone: issue.foundPhone,
    },
  }));
  
  return {
    citationsFound,
    citationsChecked,
    consistencyScore,
    issues: formattedIssues,
    canonicalNap,
    recommendations,
  };
}

// Register the tool
registry.register({
  id: 'check-citations',
  name: 'check-citations',
  description: 'Check NAP (Name, Address, Phone) consistency across 50+ business directories and citation sources',
  version: '1.0.0',
  costClass: 'medium',
  estimatedCostUsd: 0.50, // Apify actor cost
  requiredSecrets: ['apify'],
  tags: ['seo', 'local-seo', 'citations', 'nap'],
  inputSchema: CheckCitationsInputSchema,
  outputSchema: CheckCitationsOutputSchema,
  handler: checkCitationsHandler,
  networkPolicy: {
    allowedDomains: ['api.apify.com', 'apify.com'],
    blockedDomains: [],
    allowLocalhost: false,
  },
  retryPolicy: {
    maxAttempts: 2,
    backoffMs: 5000,
    backoffMultiplier: 2,
    retryableErrors: ['TIMEOUT', 'NETWORK_ERROR'],
  },
  timeoutMs: 300000, // 5 minutes
  idempotent: true,
  isPublic: false,
  createdAt: new Date(),
  updatedAt: new Date(),
});

export { CheckCitationsInputSchema, CheckCitationsOutputSchema };
