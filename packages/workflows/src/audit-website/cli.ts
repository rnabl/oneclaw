#!/usr/bin/env node
/**
 * Audit Website CLI
 * 
 * Run: pnpm --filter @oneclaw/workflows audit <url> <business-name> <city> <state>
 */

import { runAuditStandalone } from './handler';
import { AuditInput } from './types';
import * as fs from 'fs';

async function main() {
  const args = process.argv.slice(2);

  if (args.length < 4) {
    console.log(`
Usage: pnpm audit <url> <business-name> <city> <state> [industry]

Example:
  pnpm audit https://example-hvac.com "Example HVAC" Phoenix AZ hvac

Options:
  url           - Full URL of the website to audit
  business-name - Name of the business (use quotes for spaces)
  city          - City name
  state         - State abbreviation (e.g., AZ, TX, CA)
  industry      - Optional: hvac, plumbing, dental (default: hvac)
`);
    process.exit(1);
  }

  const [url, businessName, city, state, industry = 'hvac'] = args;

  console.log('╔══════════════════════════════════════════════════════════════╗');
  console.log('║                    OneClaw Website Audit                     ║');
  console.log('╠══════════════════════════════════════════════════════════════╣');
  console.log(`║  Business: ${businessName.padEnd(50)}║`);
  console.log(`║  URL: ${url.padEnd(55)}║`);
  console.log(`║  Location: ${city}, ${state}`.padEnd(63) + '║');
  console.log(`║  Industry: ${industry}`.padEnd(63) + '║');
  console.log('╚══════════════════════════════════════════════════════════════╝');
  console.log('');

  const input: AuditInput = {
    url,
    businessName,
    location: { city, state, stateCode: state },
    industry,
    skipKeywords: false,
    skipCitations: false,
  };

  try {
    const result = await runAuditStandalone(input);

    console.log('');
    console.log('═══════════════════════════════════════════════════════════════');
    console.log('                          AUDIT RESULTS');
    console.log('═══════════════════════════════════════════════════════════════');
    console.log('');
    console.log(`Authority Score: ${result.authorityScore}/100 (${result.authorityLevel.toUpperCase()})`);
    console.log(`Website Status: ${result.websiteStatus}`);
    console.log(`Load Time: ${result.loadTimeMs}ms`);
    console.log(`SSL: ${result.hasSSL ? '✓' : '✗'}`);
    console.log('');
    
    console.log('Services Found:');
    result.servicesFound.forEach(s => console.log(`  • ${s}`));
    console.log('');
    
    console.log('Trust Signals:');
    result.trustSignals.forEach(s => console.log(`  • ${s}`));
    console.log('');
    
    console.log('Schema Score: ' + result.schemaScore + '/100');
    console.log('Citation Rate: ' + result.citationRate.toFixed(0) + '%');
    console.log('Reviews: ' + result.reviewCount + ' (' + result.rating + '★)');
    console.log('');
    
    console.log('STRENGTHS:');
    result.strengths.forEach(s => console.log(`  ✓ ${s}`));
    console.log('');
    
    console.log('GAPS:');
    result.gaps.forEach(s => console.log(`  ✗ ${s}`));
    console.log('');
    
    console.log('PRIORITY ACTIONS:');
    result.priorityActions.forEach((s, i) => console.log(`  ${i + 1}. ${s}`));
    console.log('');
    
    console.log(`Estimated Monthly Value: $${result.estimatedMonthlyValue.toLocaleString()}`);
    console.log(`Audit Duration: ${result.durationMs}ms`);
    console.log('');

    // Save JSON result
    const outputPath = `audit-${Date.now()}.json`;
    fs.writeFileSync(outputPath, JSON.stringify(result, null, 2));
    console.log(`Full results saved to: ${outputPath}`);
  } catch (error) {
    console.error('Audit failed:', error);
    process.exit(1);
  }
}

main().catch(console.error);
