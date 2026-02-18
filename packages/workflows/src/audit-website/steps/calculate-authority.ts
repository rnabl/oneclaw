/**
 * Step: Calculate Authority Score
 * 
 * Combines all signals into an authority score with recommendations.
 */

import { getTaxonomy } from '@oneclaw/taxonomy';
import type { 
  WebsiteScanResult, 
  SchemaItem, 
  CitationResult 
} from '../types';

export interface AuthorityCalculation {
  authorityScore: number;
  authorityLevel: 'low' | 'medium' | 'high' | 'excellent';
  strengths: string[];
  gaps: string[];
  priorityActions: string[];
  estimatedMonthlyValue: number;
}

export function calculateAuthority(
  websiteData: WebsiteScanResult,
  schemaList: SchemaItem[],
  citationResults: CitationResult[],
  reviewCount: number,
  rating: number,
  estimatedSearches: number,
  industry: string
): AuthorityCalculation {
  const taxonomy = getTaxonomy(industry);
  
  let score = 0;
  const strengths: string[] = [];
  const gaps: string[] = [];
  const priorityActions: string[] = [];

  // === Website presence (0-20 points) ===
  if (websiteData.status === 'live') {
    score += 5;
    strengths.push('Website is live and accessible');
  } else {
    gaps.push('Website is not accessible');
    priorityActions.push('Fix website accessibility issues');
  }

  if (websiteData.hasSSL) {
    score += 3;
    strengths.push('SSL certificate active');
  } else {
    gaps.push('No SSL certificate');
    priorityActions.push('Install SSL certificate for security');
  }

  if (websiteData.loadTimeMs < 3000) {
    score += 5;
    strengths.push('Fast page load time');
  } else if (websiteData.loadTimeMs < 5000) {
    score += 2;
  } else {
    gaps.push('Slow page load time');
    priorityActions.push('Optimize website performance');
  }

  if (websiteData.hasOnlineBooking) {
    score += 4;
    strengths.push('Online booking available');
  } else {
    gaps.push('No online booking');
    priorityActions.push('Add online booking to increase conversions');
  }

  if (websiteData.hasContactForm) {
    score += 3;
    strengths.push('Contact form available');
  }

  // === Services coverage (0-15 points) ===
  const serviceCount = websiteData.servicesFound.length;
  if (serviceCount >= 5) {
    score += 15;
    strengths.push(`${serviceCount} services clearly listed`);
  } else if (serviceCount >= 3) {
    score += 10;
    strengths.push(`${serviceCount} services found`);
  } else if (serviceCount >= 1) {
    score += 5;
    gaps.push('Limited service coverage on website');
    priorityActions.push('Add more service pages with detailed content');
  } else {
    gaps.push('No services clearly listed');
    priorityActions.push('Create dedicated service pages');
  }

  // === Trust signals (0-15 points) ===
  const trustCount = websiteData.trustSignals.length;
  if (trustCount >= 5) {
    score += 15;
    strengths.push(`Strong trust signals: ${websiteData.trustSignals.slice(0, 3).join(', ')}`);
  } else if (trustCount >= 3) {
    score += 10;
    strengths.push('Good trust signals present');
  } else if (trustCount >= 1) {
    score += 5;
    gaps.push('Limited trust signals');
    priorityActions.push('Add certifications, guarantees, and trust badges');
  } else {
    gaps.push('No trust signals found');
    priorityActions.push('Highlight licenses, certifications, and guarantees');
  }

  // === Schema/SEO (0-15 points) ===
  const optimizedCount = schemaList.filter(s => s.status === 'OPTIMIZED').length;
  const goodCount = schemaList.filter(s => s.status === 'GOOD').length;
  
  if (optimizedCount >= 3) {
    score += 15;
    strengths.push('Excellent schema markup implementation');
  } else if (optimizedCount + goodCount >= 4) {
    score += 10;
    strengths.push('Good SEO fundamentals');
  } else if (optimizedCount + goodCount >= 2) {
    score += 5;
    gaps.push('Schema markup needs improvement');
    priorityActions.push('Add LocalBusiness and Service schema');
  } else {
    gaps.push('Missing schema markup');
    priorityActions.push('Implement structured data for search visibility');
  }

  // === AI visibility (0-20 points) ===
  const citationRate = citationResults.length > 0
    ? (citationResults.filter(c => c.isCited).length / citationResults.length) * 100
    : 0;
  
  if (citationRate >= 75) {
    score += 20;
    strengths.push('Excellent AI visibility - frequently cited');
  } else if (citationRate >= 50) {
    score += 15;
    strengths.push('Good AI visibility');
  } else if (citationRate >= 25) {
    score += 8;
    gaps.push('Moderate AI visibility');
    priorityActions.push('Build more online authority for AI citations');
  } else if (citationResults.length > 0) {
    score += 3;
    gaps.push('Low AI visibility');
    priorityActions.push('Create authoritative content and build citations');
  } else {
    gaps.push('Not visible in AI search results');
    priorityActions.push('Focus on building online authority and mentions');
  }

  // === Reviews (0-15 points) ===
  if (reviewCount >= 100 && rating >= 4.5) {
    score += 15;
    strengths.push(`Strong reputation: ${reviewCount} reviews, ${rating}★`);
  } else if (reviewCount >= 50 && rating >= 4.0) {
    score += 12;
    strengths.push(`Good reputation: ${reviewCount} reviews, ${rating}★`);
  } else if (reviewCount >= 20 && rating >= 4.0) {
    score += 8;
    strengths.push(`Building reputation: ${reviewCount} reviews`);
  } else if (reviewCount >= 10) {
    score += 5;
    gaps.push('Need more reviews');
    priorityActions.push('Implement review generation strategy');
  } else if (reviewCount > 0) {
    score += 2;
    gaps.push('Limited reviews');
    priorityActions.push('Focus on getting more customer reviews');
  } else {
    gaps.push('No reviews found');
    priorityActions.push('Set up review collection process');
  }

  // === Calculate level ===
  let authorityLevel: 'low' | 'medium' | 'high' | 'excellent';
  if (score >= 80) {
    authorityLevel = 'excellent';
  } else if (score >= 60) {
    authorityLevel = 'high';
  } else if (score >= 40) {
    authorityLevel = 'medium';
  } else {
    authorityLevel = 'low';
  }

  // === Calculate estimated value ===
  const avgJobValue = taxonomy.defaultAvgJobValue;
  const conversionRate = taxonomy.conversionRate;
  const estimatedLeads = Math.round(estimatedSearches * (score / 100) * 0.05);
  const estimatedMonthlyValue = Math.round(estimatedLeads * conversionRate * avgJobValue);

  return {
    authorityScore: Math.min(score, 100),
    authorityLevel,
    strengths: strengths.slice(0, 8),
    gaps: gaps.slice(0, 6),
    priorityActions: priorityActions.slice(0, 5),
    estimatedMonthlyValue,
  };
}
