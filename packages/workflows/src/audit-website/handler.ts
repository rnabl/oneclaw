/**
 * Audit Website Workflow Handler
 * 
 * Main execution logic for the audit workflow.
 * Designed to work with both Restate (durable) and Standalone (simple) engines.
 */

import type { RestateContext } from '@oneclaw/engine';
import { checkpoint } from '@oneclaw/engine';
import type { AuditInput, AuditResult, WebsiteScanResult, SchemaItem } from './types';
import {
  scanWebsite,
  analyzeSchema,
  calculateSchemaScore,
  checkCitations,
  fetchKeywordVolumes,
  fetchReviews,
  calculateAuthority,
} from './steps';

/**
 * Execute audit with Restate durable checkpoints
 */
export async function runAuditWithRestate(
  ctx: RestateContext,
  input: AuditInput
): Promise<AuditResult> {
  const startTime = Date.now();
  console.log(`[Audit] Starting audit for ${input.businessName} (${input.url})`);

  // Step 1: Scan website (checkpoint)
  const websiteData = await checkpoint(ctx, 'scan-website', () =>
    scanWebsite(input.url, input.industry)
  );

  // Step 2: Analyze schema (checkpoint)
  const schemaResult = await checkpoint(ctx, 'analyze-schema', () =>
    analyzeSchema(input.url)
  );
  const schemaScore = calculateSchemaScore(schemaResult.schemaList);

  // Step 3: Fetch reviews (checkpoint)
  const reviewData = await checkpoint(ctx, 'fetch-reviews', () =>
    fetchReviews(input.url, input.businessName, input.location)
  );

  // Step 4: Fetch keywords (optional, checkpoint)
  const keywordData = input.skipKeywords
    ? { keywords: [], estimatedMonthlySearches: 0 }
    : await checkpoint(ctx, 'fetch-keywords', () =>
        fetchKeywordVolumes(input.location, input.industry)
      );

  // Step 5: Check citations (optional, checkpoint)
  const citationData = input.skipCitations
    ? { results: [], citationRate: 0, competitorsCitedInstead: [] }
    : await checkpoint(ctx, 'check-citations', () =>
        checkCitations(input.businessName, input.location, input.industry)
      );

  // Step 6: Calculate authority (pure computation, no checkpoint needed)
  const authority = calculateAuthority(
    websiteData,
    schemaResult.schemaList,
    citationData.results,
    reviewData.reviewCount,
    reviewData.rating,
    keywordData.estimatedMonthlySearches,
    input.industry
  );

  const durationMs = Date.now() - startTime;
  console.log(`[Audit] Completed in ${durationMs}ms, score: ${authority.authorityScore}`);

  return buildResult(input, websiteData, schemaResult.schemaList, schemaScore,
    citationData, keywordData, reviewData, authority, durationMs);
}

/**
 * Execute audit standalone (no durable checkpoints)
 */
export async function runAuditStandalone(input: AuditInput): Promise<AuditResult> {
  const startTime = Date.now();
  console.log(`[Audit] Starting standalone audit for ${input.businessName} (${input.url})`);

  // Execute all steps sequentially
  const websiteData = await scanWebsite(input.url, input.industry);
  const schemaResult = await analyzeSchema(input.url);
  const schemaScore = calculateSchemaScore(schemaResult.schemaList);
  const reviewData = await fetchReviews(input.url, input.businessName, input.location);
  
  const keywordData = input.skipKeywords
    ? { keywords: [], estimatedMonthlySearches: 0 }
    : await fetchKeywordVolumes(input.location, input.industry);

  const citationData = input.skipCitations
    ? { results: [], citationRate: 0, competitorsCitedInstead: [] }
    : await checkCitations(input.businessName, input.location, input.industry);

  const authority = calculateAuthority(
    websiteData,
    schemaResult.schemaList,
    citationData.results,
    reviewData.reviewCount,
    reviewData.rating,
    keywordData.estimatedMonthlySearches,
    input.industry
  );

  const durationMs = Date.now() - startTime;
  console.log(`[Audit] Completed in ${durationMs}ms, score: ${authority.authorityScore}`);

  return buildResult(input, websiteData, schemaResult.schemaList, schemaScore,
    citationData, keywordData, reviewData, authority, durationMs);
}

/**
 * Build the final result object
 */
function buildResult(
  input: AuditInput,
  websiteData: WebsiteScanResult,
  schemaList: SchemaItem[],
  schemaScore: number,
  citationData: { results: any[]; citationRate: number; competitorsCitedInstead: string[] },
  keywordData: { keywords: any[]; estimatedMonthlySearches: number },
  reviewData: { reviewCount: number; rating: number },
  authority: ReturnType<typeof calculateAuthority>,
  durationMs: number
): AuditResult {
  return {
    // Identity
    businessName: input.businessName,
    url: input.url,
    location: input.location,
    industry: input.industry,

    // Website scan results
    websiteStatus: websiteData.status,
    loadTimeMs: websiteData.loadTimeMs,
    hasSSL: websiteData.hasSSL,

    // Content analysis
    servicesFound: websiteData.servicesFound,
    trustSignals: websiteData.trustSignals,
    hasOnlineBooking: websiteData.hasOnlineBooking,
    hasContactForm: websiteData.hasContactForm,
    hasLiveChat: websiteData.hasLiveChat,
    hasPricing: websiteData.hasPricing,

    // Schema/SEO
    schemaItems: schemaList,
    schemaScore,

    // AI visibility
    citationResults: citationData.results,
    citationRate: citationData.citationRate,
    competitorsCitedInstead: citationData.competitorsCitedInstead,

    // Reviews
    reviewCount: reviewData.reviewCount,
    rating: reviewData.rating,

    // Keywords
    topKeywords: keywordData.keywords,
    estimatedMonthlySearches: keywordData.estimatedMonthlySearches,

    // Authority score
    authorityScore: authority.authorityScore,
    authorityLevel: authority.authorityLevel,

    // Recommendations
    strengths: authority.strengths,
    gaps: authority.gaps,
    priorityActions: authority.priorityActions,

    // Financial estimate
    estimatedMonthlyValue: authority.estimatedMonthlyValue,

    // Metadata
    auditedAt: new Date().toISOString(),
    durationMs,
  };
}
