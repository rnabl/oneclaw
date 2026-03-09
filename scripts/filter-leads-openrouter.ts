/**
 * Filter Leads with OpenRouter Batch Analysis
 * 
 * Analyzes multiple leads at once using OpenRouter (cheaper & faster)
 */

import * as dotenv from 'dotenv';
import * as path from 'path';
import * as fs from 'fs/promises';

dotenv.config({ path: path.resolve(process.cwd(), '.env.production') });
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });
dotenv.config({ path: path.resolve(process.cwd(), '.env') });

interface Lead {
  id: string;
  company_name: string;
  website?: string;
  city: string;
  state: string;
  industry: string;
}

async function analyzeLeadsBatch(leads: Lead[]): Promise<boolean[]> {
  const prompt = `Analyze which companies are LOCAL HVAC/Plumbing SERVICE businesses suitable for AEO/GEO marketing.

REJECT if:
- National brand/chain (Bosch, Carrier, Lennox, Trane, Dyson, etc.)
- Manufacturer or equipment supplier
- Wholesaler/distributor (Parts Town, Supply Co., Ferguson, etc.)
- Staffing agency (Liberty Personnel, Aerotek, etc.)
- PE-backed consolidator (Wrench Group, Neighborly, Authority Brands, etc.)
- National franchise HQ (not local location)
- Large enterprise (>500 employees)
- Technology/software companies

ACCEPT if:
- Local independent HVAC/Plumbing contractor
- Small regional service company (<50 locations)
- Local franchise location (not HQ)

Companies to analyze:
${leads.map((l, i) => `${i + 1}. ${l.company_name} (${l.city}, ${l.state}) - ${l.website || 'no website'}`).join('\n')}

Respond with ONLY a JSON array of true/false values (one per company, in order):
[true, false, true, ...]`;

  try {
    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.OPENROUTER_API_KEY}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'https://oneclaw.com',
        'X-Title': 'OneClaw Lead Filter',
      },
      body: JSON.stringify({
        model: 'deepseek/deepseek-chat',
        messages: [{
          role: 'user',
          content: prompt
        }],
        max_tokens: 500,
      })
    });

    const data = await response.json();
    const content = data.choices[0].message.content;
    
    // Parse the JSON array from response
    const match = content.match(/\[[\s\S]*?\]/);
    if (match) {
      return JSON.parse(match[0]);
    }
    
    // Default to accepting all if parsing fails
    console.warn('   ⚠️  Failed to parse batch response, accepting all');
    return leads.map(() => true);
    
  } catch (error) {
    console.error(`   ❌ Batch analysis error:`, error);
    return leads.map(() => true);
  }
}

async function filterLeads() {
  console.log('🔍 Starting OpenRouter batch filtering...\n');

  const leadsRaw = await fs.readFile('data/top-1000-aeo-leads.json', 'utf-8');
  const allLeads: Lead[] = JSON.parse(leadsRaw);

  console.log(`📊 Total leads: ${allLeads.length}`);
  console.log(`📦 Processing in batches of 20...\n`);

  const filtered: Lead[] = [];
  const rejected: Array<Lead & { reason: string }> = [];

  const BATCH_SIZE = 20;
  
  for (let i = 0; i < allLeads.length; i += BATCH_SIZE) {
    const batch = allLeads.slice(i, Math.min(i + BATCH_SIZE, allLeads.length));
    const batchNum = Math.floor(i / BATCH_SIZE) + 1;
    const totalBatches = Math.ceil(allLeads.length / BATCH_SIZE);
    
    console.log(`[Batch ${batchNum}/${totalBatches}] Analyzing leads ${i + 1}-${i + batch.length}...`);
    
    const results = await analyzeLeadsBatch(batch);
    
    batch.forEach((lead, idx) => {
      if (results[idx]) {
        console.log(`   ✅ ${lead.company_name}`);
        filtered.push(lead);
      } else {
        console.log(`   ❌ ${lead.company_name}`);
        rejected.push({ ...lead, reason: 'Not a local service business' });
      }
    });
    
    console.log(`   Progress: ${filtered.length} accepted, ${rejected.length} rejected\n`);
    
    // Rate limiting
    await new Promise(resolve => setTimeout(resolve, 2000));
  }

  // Save results
  await fs.writeFile('data/filtered-aeo-leads.json', JSON.stringify(filtered, null, 2));
  await fs.writeFile('data/rejected-leads.json', JSON.stringify(rejected, null, 2));

  console.log('✅ FILTERING COMPLETE!\n');
  console.log(`📊 Final Stats:`);
  console.log(`   Total: ${allLeads.length}`);
  console.log(`   ✅ Accepted: ${filtered.length} (${((filtered.length/allLeads.length)*100).toFixed(1)}%)`);
  console.log(`   ❌ Rejected: ${rejected.length}`);
  console.log(`\n📁 Saved: data/filtered-aeo-leads.json`);
}

filterLeads().catch(console.error);
