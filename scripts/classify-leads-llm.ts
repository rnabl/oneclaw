/**
 * LLM-based lead classification script
 * Reviews all pending leads and identifies large corporations to skip
 */

import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';

dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

interface Lead {
  id: string;
  company_name: string;
  website: string;
  city?: string;
  state?: string;
  industry?: string;
}

/**
 * Use Perplexity to determine if this is a large corporation
 */
async function isLargeCorporation(lead: Lead): Promise<{ isLarge: boolean; reason: string }> {
  const prompt = `Is "${lead.company_name}" (website: ${lead.website}) a large corporation or a small local business?

Context:
- Location: ${lead.city}, ${lead.state}
- Industry: ${lead.industry || 'Home Services'}

Respond with ONLY a JSON object in this format:
{
  "is_large_corporation": true/false,
  "reason": "brief explanation (max 100 chars)"
}

Criteria for LARGE corporation:
- Publicly traded (Inc., Corp.)
- Multi-state franchise or chain
- 100+ employees
- Acquired by private equity
- National brand

Small local business:
- Single location or 2-3 locations
- Family-owned
- Local brand
- Under 50 employees`;

  try {
    const response = await fetch('https://api.perplexity.ai/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.PERPLEXITY_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: 'sonar',
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.1,
        max_tokens: 200
      })
    });

    const data = await response.json();
    const content = data.choices[0].message.content;
    
    // Parse JSON response
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const result = JSON.parse(jsonMatch[0]);
      return {
        isLarge: result.is_large_corporation,
        reason: result.reason
      };
    }
    
    // Fallback if JSON parsing fails
    return {
      isLarge: content.toLowerCase().includes('large') || content.toLowerCase().includes('corporation'),
      reason: 'Parse failed, heuristic guess'
    };
    
  } catch (error: any) {
    console.error(`   ⚠️  Classification failed: ${error.message}`);
    return { isLarge: false, reason: 'Error, defaulting to small' };
  }
}

/**
 * Main execution
 */
async function main() {
  console.log('🔍 LLM-Based Lead Classification\n');
  console.log('='.repeat(60));

  // Get all pending leads
  const { data: leads, error } = await supabase
    .schema('crm')
    .from('leads')
    .select('id, company_name, website, city, state, industry')
    .eq('enrichment_status', 'pending')
    .not('website', 'is', null)
    .limit(100); // Start with 100 to test

  if (error) {
    console.error('❌ Error fetching leads:', error);
    return;
  }

  if (!leads || leads.length === 0) {
    console.log('\n✅ No pending leads to classify!');
    return;
  }

  console.log(`\n📊 Classifying ${leads.length} leads...\n`);

  let markedLarge = 0;
  let keptSmall = 0;

  for (const lead of leads) {
    console.log(`🔍 ${lead.company_name}`);
    
    const classification = await isLargeCorporation(lead);
    
    if (classification.isLarge) {
      console.log(`   ❌ LARGE CORP: ${classification.reason}`);
      
      // Mark as skipped
      await supabase
        .schema('crm')
        .from('leads')
        .update({
          enrichment_status: 'cancelled',
          enrichment_tier: 'skipped_corporation'
        })
        .eq('id', lead.id);
      
      markedLarge++;
    } else {
      console.log(`   ✅ Small business: ${classification.reason}`);
      keptSmall++;
    }
    
    // Rate limit: 1 second between calls
    await new Promise(resolve => setTimeout(resolve, 1000));
  }

  console.log('\n' + '='.repeat(60));
  console.log('📊 Classification Summary');
  console.log('='.repeat(60));
  console.log(`Large corporations marked: ${markedLarge}`);
  console.log(`Small businesses kept: ${keptSmall}`);
  console.log('='.repeat(60));
}

main().catch(console.error);
