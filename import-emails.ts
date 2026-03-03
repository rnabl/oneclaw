import { config } from 'dotenv';
import { createClient } from '@supabase/supabase-js';
import { createReadStream } from 'fs';
import { parse } from 'csv-parse';

config();

const supabaseUrl = process.env.SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

async function importEmails() {
  console.log('📧 Importing emails from CSV to Supabase...\n');
  
  const csvPath = '.data-backup/hvac-leads-enriched.csv';
  const records: any[] = [];
  
  // Parse CSV
  const parser = createReadStream(csvPath).pipe(
    parse({
      columns: true,
      skip_empty_lines: true,
    })
  );
  
  for await (const record of parser) {
    records.push(record);
  }
  
  console.log(`📊 Loaded ${records.length} rows from CSV\n`);
  
  // Filter to only records with emails
  const withEmails = records.filter(r => 
    (r.owner_email && r.owner_email.trim()) || 
    (r.owner_email_secondary && r.owner_email_secondary.trim())
  );
  
  console.log(`📧 Found ${withEmails.length} businesses with emails\n`);
  
  let updated = 0;
  let notFound = 0;
  let failed = 0;
  
  // Update in batches
  for (const record of withEmails) {
    const email = record.owner_email?.trim() || record.owner_email_secondary?.trim();
    const businessName = record.name;
    const websiteUrl = record.website?.trim();
    
    if (!email || !websiteUrl) {
      console.log(`  ⚠️  Skipping ${businessName}: missing email or website`);
      continue;
    }
    
    try {
      // Find the lead in Supabase by website URL (much more reliable)
      const { data: leads, error: searchError } = await supabase
        .schema('crm')
        .from('leads')
        .select('id, company_name, website, audit_data')
        .eq('industry', 'HVAC')
        .eq('website', websiteUrl);
      
      if (searchError || !leads || leads.length === 0) {
        console.log(`  ⚠️  Not found: ${businessName.padEnd(50)} (${websiteUrl})`);
        notFound++;
        continue;
      }
      
      const lead = leads[0];
      
      // Prepare contact data
      const contactData = {
        owner_name: record.owner_name?.trim() || null,
        owner_email: email,
        owner_phone: record.owner_phone?.trim() || null,
        owner_role: record.owner_role?.trim() || null,
        owner_linkedin: record.owner_linkedin?.trim() || null,
        enrichment_status: record.enrichment_status || 'imported_from_csv',
        enrichment_date: record.enrichment_date || new Date().toISOString(),
      };
      
      // Update the lead
      const { error: updateError } = await supabase
        .schema('crm')
        .from('leads')
        .update({
          email: email,
          contact_data: contactData,
        })
        .eq('id', lead.id);
      
      if (updateError) {
        console.error(`  ❌ Failed to update ${businessName}:`, updateError.message);
        failed++;
      } else {
        console.log(`  ✅ ${businessName.padEnd(50)} ${email}`);
        updated++;
      }
      
    } catch (error) {
      console.error(`  ❌ Error processing ${businessName}:`, error);
      failed++;
    }
  }
  
  console.log('\n' + '='.repeat(70));
  console.log('✅ Email import complete!\n');
  console.log(`   Total in CSV: ${withEmails.length}`);
  console.log(`   ✅ Updated: ${updated}`);
  console.log(`   ⚠️  Not found in DB: ${notFound}`);
  console.log(`   ❌ Failed: ${failed}`);
  console.log('='.repeat(70) + '\n');
  
  // Verify in database
  const { data: stats } = await supabase
    .schema('crm')
    .from('leads')
    .select('id')
    .eq('industry', 'HVAC')
    .not('email', 'is', null);
  
  console.log(`📊 Total HVAC leads with email in database: ${stats?.length || 0}`);
}

importEmails().catch(console.error);
