// Audit Workflow Handler
// Uses the TypeScript @oneclaw/workflows audit implementation
// Performs comprehensive website SEO and AI visibility audits

import { runAuditStandalone } from '@oneclaw/workflows';
import type { AuditInput, AuditResult as FullAuditResult } from '@oneclaw/workflows';

export interface AuditParams {
  url: string;
  businessName?: string;
  location?: string;
  industry?: string;
}

// Simplified result for chat display
export interface AuditResult {
  url: string;
  score: number;
  critical_issues: number;
  warnings: number;
  passed: number;
  categories: {
    seo: { score: number; issues: AuditIssue[] };
    performance: { score: number; issues: AuditIssue[] };
    accessibility: { score: number; issues: AuditIssue[] };
    mobile: { score: number; issues: AuditIssue[] };
  };
  report_url?: string;
  analyzed_at: string;
  // Extended fields from full audit
  citation_rate?: number;
  competitors?: string[];
  authority_level?: string;
  strengths?: string[];
  gaps?: string[];
}

export interface AuditIssue {
  type: 'critical' | 'warning' | 'info';
  title: string;
  description: string;
  recommendation?: string;
}

/**
 * Normalize URL to ensure it has a protocol
 */
function normalizeUrl(url: string): string {
  let normalized = url.trim();
  if (!normalized.startsWith('http://') && !normalized.startsWith('https://')) {
    normalized = 'https://' + normalized;
  }
  return normalized;
}

/**
 * Validate URL format
 */
function isValidUrl(url: string): boolean {
  try {
    new URL(url);
    return true;
  } catch {
    return false;
  }
}

/**
 * Extract business name from URL
 */
function extractBusinessName(url: string): string {
  try {
    const hostname = new URL(url).hostname;
    // Remove www. and TLD
    const name = hostname.replace(/^www\./, '').split('.')[0];
    // Capitalize
    return name.charAt(0).toUpperCase() + name.slice(1);
  } catch {
    return 'Unknown Business';
  }
}

/**
 * Parse location string into city/state
 */
function parseLocation(locationStr?: string): { city: string; state: string } {
  if (!locationStr) {
    return { city: 'Denver', state: 'Colorado' }; // Default
  }
  
  const parts = locationStr.split(',').map(p => p.trim());
  return {
    city: parts[0] || 'Denver',
    state: parts[1] || 'Colorado',
  };
}

/**
 * Handle audit workflow using TypeScript implementation
 */
export async function handleAuditWorkflow(params: Record<string, unknown>): Promise<AuditResult> {
  const { url, businessName, location, industry } = params as AuditParams;
  
  if (!url) {
    throw new Error('Missing required parameter: url');
  }
  
  const normalizedUrl = normalizeUrl(url);
  
  if (!isValidUrl(normalizedUrl)) {
    throw new Error(`Invalid URL: ${url}`);
  }
  
  console.log(`[audit] Starting TypeScript audit for: ${normalizedUrl}`);
  
  // Build audit input
  const auditInput: AuditInput = {
    url: normalizedUrl,
    businessName: businessName || extractBusinessName(normalizedUrl),
    location: parseLocation(location),
    industry: industry || 'hvac',
    skipKeywords: false,
    skipCitations: false,
  };
  
  try {
    // Run the full TypeScript audit workflow
    const fullResult = await runAuditStandalone(auditInput);
    
    console.log(`[audit] Completed audit for: ${normalizedUrl} (score: ${fullResult.authorityScore})`);
    
    // Convert to simplified chat-friendly format
    const result: AuditResult = {
      url: fullResult.url,
      score: fullResult.authorityScore,
      critical_issues: fullResult.gaps.length,
      warnings: fullResult.schemaItems.filter(s => s.status === 'BASIC' || s.status === 'GROWING').length,
      passed: fullResult.schemaItems.filter(s => s.status === 'OPTIMIZED' || s.status === 'GOOD').length,
      categories: {
        seo: {
          score: fullResult.schemaScore,
          issues: fullResult.schemaItems
            .filter(s => s.status === 'NOT_SETUP' || s.status === 'BASIC')
            .map(s => ({
              type: s.status === 'NOT_SETUP' ? 'critical' as const : 'warning' as const,
              title: s.name,
              description: s.description,
            })),
        },
        performance: {
          score: fullResult.loadTimeMs < 2000 ? 90 : fullResult.loadTimeMs < 4000 ? 70 : 50,
          issues: fullResult.loadTimeMs > 2500 ? [{
            type: 'warning' as const,
            title: 'Slow page load',
            description: `Page loaded in ${fullResult.loadTimeMs}ms`,
            recommendation: 'Optimize images and reduce JavaScript bundle size',
          }] : [],
        },
        accessibility: {
          score: fullResult.hasContactForm && fullResult.hasOnlineBooking ? 85 : 65,
          issues: [],
        },
        mobile: {
          score: fullResult.hasSSL ? 80 : 50,
          issues: !fullResult.hasSSL ? [{
            type: 'critical' as const,
            title: 'No SSL certificate',
            description: 'Site is not using HTTPS',
            recommendation: 'Install an SSL certificate',
          }] : [],
        },
      },
      report_url: `https://oneclaw.chat/reports/${Date.now()}`,
      analyzed_at: fullResult.auditedAt,
      // Extended fields
      citation_rate: fullResult.citationRate,
      competitors: fullResult.competitorsCitedInstead,
      authority_level: fullResult.authorityLevel,
      strengths: fullResult.strengths,
      gaps: fullResult.gaps,
    };
    
    return result;
  } catch (error) {
    console.error('[audit] Error running TypeScript audit:', error);
    throw error;
  }
}

/**
 * Format audit result for chat display
 */
export function formatAuditForChat(result: AuditResult): string {
  const emoji = result.score >= 80 ? '🟢' : result.score >= 60 ? '🟡' : '🔴';
  const levelEmoji = {
    'excellent': '🏆',
    'high': '✅',
    'medium': '⚡',
    'low': '⚠️',
  }[result.authority_level || 'medium'] || '📊';
  
  let message = `${emoji} **Audit Complete: ${result.url}**\n\n`;
  message += `${levelEmoji} **Authority Score: ${result.score}/100** (${result.authority_level || 'medium'})\n\n`;
  
  // AI Visibility section
  if (result.citation_rate !== undefined) {
    const citationEmoji = result.citation_rate >= 50 ? '✅' : result.citation_rate >= 25 ? '⚡' : '❌';
    message += `**AI Visibility:** ${citationEmoji} ${result.citation_rate.toFixed(0)}% citation rate\n`;
    
    if (result.competitors && result.competitors.length > 0) {
      message += `_Competitors being cited: ${result.competitors.slice(0, 3).join(', ')}_\n`;
    }
    message += '\n';
  }
  
  // Issues summary
  message += `**Issues Found:**\n`;
  message += `• 🔴 Critical: ${result.critical_issues}\n`;
  message += `• 🟡 Warnings: ${result.warnings}\n`;
  message += `• 🟢 Passed: ${result.passed}\n\n`;
  
  // Strengths
  if (result.strengths && result.strengths.length > 0) {
    message += `**Strengths:**\n`;
    result.strengths.slice(0, 3).forEach(s => {
      message += `✓ ${s}\n`;
    });
    message += '\n';
  }
  
  // Priority gaps
  if (result.gaps && result.gaps.length > 0) {
    message += `**Priority Fixes:**\n`;
    result.gaps.slice(0, 3).forEach(g => {
      message += `→ ${g}\n`;
    });
    message += '\n';
  }
  
  // Category scores (compact)
  message += `**Scores:** SEO ${result.categories.seo.score} | Perf ${result.categories.performance.score} | Mobile ${result.categories.mobile.score}\n`;
  
  if (result.report_url) {
    message += `\n📄 [View Full Report](${result.report_url})`;
  }
  
  return message;
}
