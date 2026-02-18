/**
 * Step: Analyze Schema / SEO Fundamentals
 * 
 * Checks structured data, meta tags, and SEO setup.
 */

import * as cheerio from 'cheerio';
import type { SchemaItem } from '../types';

export async function analyzeSchema(url: string): Promise<{
  status: string;
  schemaList: SchemaItem[];
}> {
  try {
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; OneClawBot/1.0)',
      },
      signal: AbortSignal.timeout(10000),
    });

    if (!response.ok) {
      return { status: 'error', schemaList: [] };
    }

    const html = await response.text();
    const $ = cheerio.load(html);

    const schemaList: SchemaItem[] = [];

    // Check for JSON-LD schema
    const jsonLdScripts = $('script[type="application/ld+json"]');
    const hasJsonLd = jsonLdScripts.length > 0;
    
    let hasLocalBusiness = false;
    let hasOrganization = false;
    let hasFaq = false;
    let hasService = false;
    let hasReview = false;

    jsonLdScripts.each((_, el) => {
      try {
        const content = $(el).html();
        if (content) {
          const data = JSON.parse(content);
          const types = Array.isArray(data) ? data.map(d => d['@type']) : [data['@type']];
          
          for (const type of types) {
            if (type?.includes('LocalBusiness') || type?.includes('HVAC') || type?.includes('Plumber')) {
              hasLocalBusiness = true;
            }
            if (type?.includes('Organization')) hasOrganization = true;
            if (type?.includes('FAQ')) hasFaq = true;
            if (type?.includes('Service')) hasService = true;
            if (type?.includes('Review') || type?.includes('AggregateRating')) hasReview = true;
          }
        }
      } catch {
        // Invalid JSON-LD
      }
    });

    // Schema items
    schemaList.push({
      name: 'LocalBusiness Schema',
      status: hasLocalBusiness ? 'OPTIMIZED' : 'NOT_SETUP',
      description: hasLocalBusiness 
        ? 'LocalBusiness schema markup found' 
        : 'Add LocalBusiness schema for better local search visibility',
    });

    schemaList.push({
      name: 'Organization Schema',
      status: hasOrganization ? 'GOOD' : 'BASIC',
      description: hasOrganization
        ? 'Organization schema found'
        : 'Add Organization schema for brand visibility',
    });

    schemaList.push({
      name: 'FAQ Schema',
      status: hasFaq ? 'OPTIMIZED' : 'NOT_SETUP',
      description: hasFaq
        ? 'FAQ schema found - eligible for rich snippets'
        : 'Add FAQ schema for enhanced search results',
    });

    schemaList.push({
      name: 'Service Schema',
      status: hasService ? 'GOOD' : 'GROWING',
      description: hasService
        ? 'Service schema found'
        : 'Add Service schema to highlight your offerings',
    });

    schemaList.push({
      name: 'Review Schema',
      status: hasReview ? 'OPTIMIZED' : 'NOT_SETUP',
      description: hasReview
        ? 'Review/Rating schema found'
        : 'Add AggregateRating schema to show stars in search',
    });

    // Check meta tags
    const hasTitle = $('title').length > 0 && $('title').text().length > 10;
    const hasDescription = $('meta[name="description"]').attr('content')?.length ?? 0 > 50;
    const hasCanonical = $('link[rel="canonical"]').length > 0;
    const hasOgTags = $('meta[property^="og:"]').length >= 3;

    schemaList.push({
      name: 'Title Tag',
      status: hasTitle ? 'GOOD' : 'BASIC',
      description: hasTitle
        ? 'Title tag is set'
        : 'Add a descriptive title tag',
    });

    schemaList.push({
      name: 'Meta Description',
      status: hasDescription ? 'GOOD' : 'BASIC',
      description: hasDescription
        ? 'Meta description is set'
        : 'Add a compelling meta description',
    });

    schemaList.push({
      name: 'Canonical URL',
      status: hasCanonical ? 'GOOD' : 'NOT_SETUP',
      description: hasCanonical
        ? 'Canonical URL is set'
        : 'Add canonical tag to prevent duplicate content',
    });

    schemaList.push({
      name: 'Open Graph Tags',
      status: hasOgTags ? 'GOOD' : 'BASIC',
      description: hasOgTags
        ? 'Open Graph tags found for social sharing'
        : 'Add OG tags for better social media previews',
    });

    return {
      status: hasJsonLd ? 'found' : 'missing',
      schemaList,
    };
  } catch (error) {
    console.error('[AnalyzeSchema] Error:', error);
    return { status: 'error', schemaList: [] };
  }
}

/**
 * Calculate schema score from items
 */
export function calculateSchemaScore(schemaList: SchemaItem[]): number {
  if (schemaList.length === 0) return 0;

  const statusScores: Record<string, number> = {
    'OPTIMIZED': 100,
    'GOOD': 75,
    'BASIC': 50,
    'GROWING': 40,
    'NOT_SETUP': 0,
    'CHECK': 25,
  };

  const total = schemaList.reduce((sum, item) => {
    return sum + (statusScores[item.status] ?? 0);
  }, 0);

  return Math.round(total / schemaList.length);
}
