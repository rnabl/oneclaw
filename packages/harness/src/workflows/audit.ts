/**
 * Audit Workflow
 * 
 * Calls the existing nabl Python audit service on Digital Ocean.
 * The Harness wraps it with policy enforcement, secrets injection, and metering.
 * 
 * YOUR ARCHITECTURE:
 * - Discovery: TypeScript (Vercel) → Apify
 * - Audit: Python (Digital Ocean FastAPI) → DataForSEO, Perplexity
 * 
 * The Harness doesn't replace your audit code - it orchestrates it with:
 * - Rate limiting per tenant
 * - Secret injection (if tenant brings their own keys)
 * - Cost metering per step
 * - Artifact capture for replay
 */

import type { StepContext } from '../execution/runner';
import { runner } from '../execution/runner';
import { artifactStore } from '../artifacts';
import { AuditToolInput, AuditToolOutput } from '../registry/schemas';

// =============================================================================
// CONFIGURATION
// =============================================================================

/**
 * Your nabl Python audit service URL
 * This is your existing FastAPI service on Digital Ocean
 */
const NABL_AUDIT_URL = process.env.NABL_AUDIT_URL || 'http://localhost:8001';
const NABL_API_SECRET = process.env.NABL_API_SECRET || process.env.API_SECRET || '';

// =============================================================================
// AUDIT WORKFLOW HANDLER
// =============================================================================

/**
 * Audit workflow that calls your existing Python service
 * 
 * Flow:
 * 1. Validate input via Harness
 * 2. Check rate limits via Harness
 * 3. Call your Python audit service
 * 4. Capture artifacts (the HTML report, scores)
 * 5. Record costs
 * 6. Return structured result
 */
async function auditWorkflowHandler(
  ctx: StepContext,
  input: Record<string, unknown>
): Promise<AuditToolOutput> {
  const params = input as AuditToolInput;
  const { url, businessName, locations } = params;
  
  await ctx.log('info', `Starting audit for ${url}`, { businessName, locationCount: locations.length });
  
  // ==========================================================================
  // STEP 1: Prepare audit request for nabl Python service
  // ==========================================================================
  runner.updateStep(ctx.jobId, 1, 'Preparing audit request', 5);
  
  // Build the request payload that your Python service expects
  // Based on your public_audit_runner_v3.py structure
  const auditPayload = {
    website_url: url,
    business_name: businessName,
    locations: locations.map(loc => ({
      city: loc.city,
      state: loc.state,
      service_area: loc.serviceArea,
    })),
    // Optional: pass tenant's own API keys if they provided them
    // This enables "bring your own keys" for enterprise tenants
    api_keys: {
      dataforseo_login: ctx.secrets['dataforseo_login'] || undefined,
      dataforseo_password: ctx.secrets['dataforseo'] || undefined,
      perplexity_key: ctx.secrets['perplexity'] || undefined,
    },
  };
  
  // Store the request as an artifact
  await artifactStore.storeApiCall(
    ctx.jobId,
    1,
    'Prepare request',
    'request',
    `${NABL_AUDIT_URL}/api/public-audit`,
    'POST',
    { 'Content-Type': 'application/json' },
    auditPayload
  );
  
  // ==========================================================================
  // STEP 2: Call your Python audit service
  // ==========================================================================
  runner.updateStep(ctx.jobId, 2, 'Running audit analysis', 5);
  
  await ctx.log('info', 'Calling nabl audit service', { url: NABL_AUDIT_URL });
  
  const startTime = Date.now();
  
  let auditResponse: Response;
  let auditResult: any;
  
  try {
    auditResponse = await fetch(`${NABL_AUDIT_URL}/api/public-audit`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${NABL_API_SECRET}`,
      },
      body: JSON.stringify(auditPayload),
    });
    
    if (!auditResponse.ok) {
      const errorText = await auditResponse.text();
      throw new Error(`Audit service error: ${auditResponse.status} - ${errorText}`);
    }
    
    auditResult = await auditResponse.json();
    
  } catch (error) {
    await ctx.log('error', 'Audit service call failed', { error: String(error) });
    
    // If nabl service is unavailable, use mock data for development
    if (NABL_AUDIT_URL.includes('localhost') || !NABL_API_SECRET) {
      await ctx.log('warn', 'Using mock audit result (nabl service unavailable)');
      auditResult = generateMockAuditResult(url, businessName, locations);
    } else {
      throw error;
    }
  }
  
  const duration = Date.now() - startTime;
  await ctx.log('info', `Audit completed in ${duration}ms`);
  
  // ==========================================================================
  // STEP 3: Record costs from the audit
  // ==========================================================================
  runner.updateStep(ctx.jobId, 3, 'Recording costs', 5);
  
  // Based on your cost structure from the nabl analysis:
  // - DataForSEO Google Maps: $0.002/SERP
  // - DataForSEO Keywords: $0.05/request
  // - Perplexity Sonar Pro: $0.005/search
  
  const locationCount = locations.length;
  const citationQueriesPerLocation = 4;  // From your runner: best X in city, top rated X, etc.
  
  // Record DataForSEO costs
  ctx.recordApiCall('dataforseo', 'google_maps_serp', locationCount);  // GBP lookup
  ctx.recordApiCall('dataforseo', 'keywords_data', 1);  // Volume lookup
  
  // Record Perplexity costs (4 queries per location)
  ctx.recordApiCall('perplexity', 'sonar_pro', locationCount * citationQueriesPerLocation);
  
  // ==========================================================================
  // STEP 4: Store the HTML report as an artifact
  // ==========================================================================
  runner.updateStep(ctx.jobId, 4, 'Storing artifacts', 5);
  
  if (auditResult.html_content) {
    await artifactStore.storeHtmlSnapshot(
      ctx.jobId,
      4,
      'HTML Report',
      auditResult.html_content,
      url
    );
  }
  
  // Store the full response
  await artifactStore.storeApiCall(
    ctx.jobId,
    4,
    'Audit response',
    'response',
    `${NABL_AUDIT_URL}/api/public-audit`,
    'POST',
    { 'Content-Type': 'application/json' },
    auditResult,
    200
  );
  
  // ==========================================================================
  // STEP 5: Transform to Harness output format
  // ==========================================================================
  runner.updateStep(ctx.jobId, 5, 'Finalizing', 5);
  
  // Map your Python response to Harness output schema
  const output: AuditToolOutput = {
    score: auditResult.overall_score || auditResult.ai_visibility_score || 0,
    citationsFound: auditResult.citations_found || auditResult.total_citations || 0,
    totalQueries: auditResult.total_queries || (locationCount * citationQueriesPerLocation),
    issues: transformIssues(auditResult.issues || auditResult.recommendations || []),
    categoryScores: {
      seo: auditResult.seo_score || auditResult.category_scores?.seo || 50,
      aiVisibility: auditResult.ai_visibility_score || auditResult.category_scores?.ai_visibility || 50,
      localPresence: auditResult.local_presence_score || auditResult.category_scores?.local_presence || 50,
      technical: auditResult.technical_score || auditResult.category_scores?.technical || 50,
    },
    htmlReport: auditResult.html_content || '<p>Report unavailable</p>',
    analyzedAt: new Date().toISOString(),
  };
  
  await ctx.log('info', `Audit complete. Score: ${output.score}/100, Citations: ${output.citationsFound}`);
  
  return output;
}

// =============================================================================
// HELPERS
// =============================================================================

/**
 * Transform issues from nabl format to Harness format
 */
function transformIssues(issues: any[]): AuditToolOutput['issues'] {
  return issues.map(issue => ({
    type: mapIssueType(issue.type || issue.severity || 'info'),
    category: issue.category || issue.dimension || 'general',
    message: issue.message || issue.title || issue.description || '',
    recommendation: issue.recommendation || issue.action || undefined,
  }));
}

function mapIssueType(type: string): 'critical' | 'warning' | 'info' {
  switch (type.toLowerCase()) {
    case 'critical':
    case 'high':
    case 'error':
      return 'critical';
    case 'warning':
    case 'medium':
      return 'warning';
    default:
      return 'info';
  }
}

/**
 * Generate mock audit result for development/testing
 * when nabl service is unavailable
 */
function generateMockAuditResult(url: string, businessName: string, locations: any[]) {
  const mockScore = Math.floor(Math.random() * 40) + 30;  // 30-70 range
  
  return {
    overall_score: mockScore,
    ai_visibility_score: mockScore,
    citations_found: Math.floor(Math.random() * 4),
    total_queries: locations.length * 4,
    seo_score: Math.floor(Math.random() * 30) + 50,
    local_presence_score: Math.floor(Math.random() * 30) + 40,
    technical_score: Math.floor(Math.random() * 30) + 45,
    issues: [
      {
        type: 'critical',
        category: 'ai-visibility',
        message: 'Not appearing in AI search results',
        recommendation: 'Improve structured data and content quality',
      },
      {
        type: 'warning',
        category: 'local-seo',
        message: 'Google Business Profile needs optimization',
        recommendation: 'Add more photos and respond to reviews',
      },
    ],
    html_content: `
      <!DOCTYPE html>
      <html>
      <head><title>Audit Report: ${businessName}</title></head>
      <body>
        <h1>Website Audit Report</h1>
        <h2>${businessName}</h2>
        <p>URL: ${url}</p>
        <h3>Overall Score: ${mockScore}/100</h3>
        <p><em>This is a mock report. Connect to nabl service for real analysis.</em></p>
      </body>
      </html>
    `.trim(),
  };
}

// =============================================================================
// REGISTER WORKFLOW
// =============================================================================

runner.registerWorkflow('audit-website', auditWorkflowHandler);

export { auditWorkflowHandler };
