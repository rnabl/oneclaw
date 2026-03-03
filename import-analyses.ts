import { createClient } from '@supabase/supabase-js';
import { readdir, readFile } from 'fs/promises';
import { join } from 'path';
import { config } from 'dotenv';

// Load .env
config();

const supabaseUrl = process.env.SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

if (!supabaseUrl || !supabaseKey) {
  console.error('❌ Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function importAnalyses() {
  const dataDir = join(process.cwd(), '.data-backup', 'website-analyses');
  
  console.log(`📂 Reading analyses from: ${dataDir}`);
  const files = await readdir(dataDir);
  const jsonFiles = files.filter(f => f.endsWith('.json'));
  
  console.log(`📊 Found ${jsonFiles.length} analysis files`);
  
  let imported = 0;
  let skipped = 0;
  let failed = 0;
  
  for (const file of jsonFiles) {
    try {
      const content = await readFile(join(dataDir, file), 'utf-8');
      const analysis = JSON.parse(content);
      
      // Extract business info
      const businessName = analysis.business_name || analysis.businessName || 'Unknown';
      const website = analysis.website || analysis.url;
      const location = analysis.location || '';
      
      // Parse location if it's a string like "Las Vegas, Nevada"
      let city = '';
      let state = '';
      if (location) {
        const parts = location.split(',').map((p: string) => p.trim());
        if (parts.length >= 2) {
          city = parts[0];
          state = parts[1];
        }
      }
      
      // Check if already exists
      const { data: existing } = await supabase
        .schema('crm')
        .from('leads')
        .select('id')
        .eq('website', website)
        .single();
      
      if (existing) {
        skipped++;
        continue;
      }
      
      // Create lead record
      const { error } = await supabase
        .schema('crm')
        .from('leads')
        .insert({
          company_name: businessName,
          website: website,
          industry: 'HVAC',
          city: city || null,
          state: state || null,
          audit_data: analysis,
          lead_score: analysis.overall_aeo_score || analysis.aeo_readiness?.score || 0,
          aeo_readiness_score: (analysis.aeo_readiness?.score || 0) / 10,
          geo_readiness_score: (analysis.gbp_analysis?.score || 0) / 10,
          stage: 'discovered',
        });
      
      if (error) {
        console.error(`❌ Error importing ${businessName}:`, error.message);
        failed++;
      } else {
        imported++;
        if (imported % 50 === 0) {
          console.log(`   ✅ Imported ${imported}/${jsonFiles.length}`);
        }
      }
      
    } catch (err) {
      console.error(`❌ Error processing ${file}:`, err);
      failed++;
    }
  }
  
  console.log(`\n✅ Import complete!`);
  console.log(`   Imported: ${imported}`);
  console.log(`   Skipped (duplicates): ${skipped}`);
  console.log(`   Failed: ${failed}`);
  
  // Show final stats
  const { count } = await supabase
    .schema('crm')
    .from('leads')
    .select('*', { count: 'exact', head: true })
    .eq('industry', 'HVAC');
  
  console.log(`\n📊 Total HVAC leads in database: ${count}`);
}

importAnalyses().catch(console.error);
