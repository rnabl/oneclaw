/**
 * Filter Leads with LLM Analysis
 * 
 * Analyzes each lead to determine if it's a LOCAL service business
 * suitable for AEO/GEO outreach (not manufacturers, suppliers, national chains, etc.)
 */

import * as dotenv from 'dotenv';
import * as path from 'path';
import * as fs from 'fs/promises';
import Anthropic from '@anthropic-ai/sdk';

// Load environment variables
dotenv.config({ path: path.resolve(process.cwd(), '.env.production') });
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });
dotenv.config({ path: path.resolve(process.cwd(), '.env') });

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

interface Lead {
  id: string;
  company_name: string;
  website?: string;
  city: string;
  state: string;
  industry: string;
  aeo_score: number;
  lead_score: number;
  is_hiring: boolean;
}

interface AnalysisResult {
  is_local_service_business: boolean;
  reason: string;
  confidence: 'high' | 'medium' | 'low';
}

async function analyzeCompany(company: Lead): Promise<AnalysisResult> {
  const prompt = `Analyze if this is a LOCAL HVAC/Plumbing SERVICE business suitable for AEO/GEO marketing:

Company: ${company.company_name}
Website: ${company.website || 'N/A'}
Location: ${company.city}, ${company.state}
Industry: ${company.industry}

REJECT if it's:
- National brand/chain (Bosch, Carrier, Lennox, Trane, etc.)
- Manufacturer or equipment supplier
- Wholesaler/distributor (Parts Town, Supply Co., etc.)
- Staffing agency
- PE-backed consolidator (Wrench Group, Neighborly, Authority Brands)
- National franchise HQ
- Large enterprise (>500 employees)

ACCEPT if it's:
- Local independent HVAC/Plumbing contractor
- Small regional service company (<50 locations)
- Local franchise location (not HQ)

Respond in JSON format:
{
  "is_local_service_business": true/false,
  "reason": "brief explanation",
  "confidence": "high/medium/low"
}`;

  try {
    const response = await anthropic.messages.create({
      model: 'claude-3-5-sonnet-20241022',
      max_tokens: 200,
      messages: [{
        role: 'user',
        content: prompt
      }]
    });

    const content = response.content[0];
    if (content.type === 'text') {
      const parsed = JSON.parse(content.text);
      return parsed;
    }
    
    throw new Error('Unexpected response format');
  } catch (error) {
    console.error(`   ⚠️  Analysis error: ${error instanceof Error ? error.message : error}`);
    // Default to accepting if analysis fails
    return {
      is_local_service_business: true,
      reason: 'Analysis failed, included by default',
      confidence: 'low'
    };
  }
}

async function filterLeads() {
  console.log('🔍 Starting LLM-based lead filtering...\n');

  // Load leads
  const leadsRaw = await fs.readFile('data/top-1000-aeo-leads.json', 'utf-8');
  const allLeads: Lead[] = JSON.parse(leadsRaw);

  console.log(`📊 Total leads to analyze: ${allLeads.length}\n`);

  const filtered: Lead[] = [];
  const rejected: Array<Lead & { reason: string }> = [];

  let processed = 0;

  for (const lead of allLeads) {
    processed++;
    console.log(`[${processed}/${allLeads.length}] Analyzing: ${lead.company_name}`);

    const analysis = await analyzeCompany(lead);

    if (analysis.is_local_service_business) {
      console.log(`   ✅ ACCEPT (${analysis.confidence}): ${analysis.reason}`);
      filtered.push(lead);
    } else {
      console.log(`   ❌ REJECT (${analysis.confidence}): ${analysis.reason}`);
      rejected.push({ ...lead, reason: analysis.reason });
    }

    // Rate limiting for Anthropic API
    await new Promise(resolve => setTimeout(resolve, 500));

    // Progress report every 50
    if (processed % 50 === 0) {
      console.log(`\n📊 Progress: ${processed}/${allLeads.length}`);
      console.log(`   ✅ Accepted: ${filtered.length}`);
      console.log(`   ❌ Rejected: ${rejected.length}`);
      console.log(`   Acceptance Rate: ${((filtered.length/processed)*100).toFixed(1)}%\n`);
    }
  }

  // Save results
  await fs.writeFile(
    'data/filtered-aeo-leads.json',
    JSON.stringify(filtered, null, 2)
  );

  await fs.writeFile(
    'data/rejected-leads.json',
    JSON.stringify(rejected, null, 2)
  );

  console.log('\n✅ FILTERING COMPLETE!\n');
  console.log(`📊 Final Stats:`);
  console.log(`   Total Analyzed: ${processed}`);
  console.log(`   ✅ Accepted: ${filtered.length}`);
  console.log(`   ❌ Rejected: ${rejected.length}`);
  console.log(`   Acceptance Rate: ${((filtered.length/processed)*100).toFixed(1)}%`);
  console.log(`\n📁 Files saved:`);
  console.log(`   data/filtered-aeo-leads.json`);
  console.log(`   data/rejected-leads.json`);
}

filterLeads().catch(console.error);
