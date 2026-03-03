import { config } from 'dotenv';
import { createClient } from '@supabase/supabase-js';
import { createReadStream } from 'fs';
import { parse } from 'csv-parse';

config();

const supabaseUrl = process.env.SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

// Clean and normalize URLs
function cleanUrl(url: string): string {
  if (!url) return '';
  
  let cleaned = url.trim();
  
  // 1. Extract from Google redirect URLs
  if (cleaned.includes('/url?q=')) {
    const match = cleaned.match(/[?&]q=([^&]+)/);
    if (match) {
      cleaned = decodeURIComponent(match[1]);
    }
  }
  
  // 2. Remove tracking parameters (optional - keeping for now to preserve specificity)
  // const urlObj = new URL(cleaned);
  // urlObj.search = ''; // Remove all query params
  // cleaned = urlObj.toString();
  
  // 3. Ensure proper protocol
  if (!cleaned.startsWith('http://') && !cleaned.startsWith('https://')) {
    cleaned = 'https://' + cleaned;
  }
  
  return cleaned;
}

async function importMissingBusinesses() {
  console.log('📥 Step 1: Import Missing Businesses from CSV\n');
  console.log('=' .repeat(80) + '\n');
  
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
  
  // Filter to records with emails
  const withEmails = records.filter(r => 
    (r.owner_email && r.owner_email.trim()) || 
    (r.owner_email_secondary && r.owner_email_secondary.trim())
  );
  
  console.log(`📊 CSV has ${withEmails.length} businesses with emails\n`);
  
  // Get all HVAC leads from Supabase
  const { data: dbLeads, error } = await supabase
    .schema('crm')
    .from('leads')
    .select('website')
    .eq('industry', 'HVAC');
  
  if (error) {
    console.error('❌ Error fetching from Supabase:', error);
    return;
  }
  
  console.log(`📊 Supabase has ${dbLeads?.length || 0} HVAC businesses\n`);
  
  // Create website lookup set
  const dbWebsites = new Set(dbLeads?.map(l => l.website) || []);
  
  // Find missing records
  const missingRecords: any[] = [];
  
  for (const record of withEmails) {
    const website = record.website?.trim();
    if (!dbWebsites.has(website)) {
      missingRecords.push(record);
    }
  }
  
  console.log(`⚠️  Found ${missingRecords.length} businesses NOT in Supabase\n`);
  console.log('=' .repeat(80) + '\n');
  
  if (missingRecords.length === 0) {
    console.log('✅ No missing records to import!\n');
    return;
  }
  
  // Clean and prepare records for import
  console.log('🧹 Cleaning URLs and preparing data...\n');
  
  const toImport: any[] = [];
  const urlIssues: any[] = [];
  
  for (const record of missingRecords) {
    const originalUrl = record.website?.trim();
    const cleanedUrl = cleanUrl(originalUrl);
    
    // Track if URL was changed
    if (originalUrl !== cleanedUrl) {
      urlIssues.push({
        name: record.name,
        original: originalUrl,
        cleaned: cleanedUrl
      });
    }
    
    const email = record.owner_email?.trim() || record.owner_email_secondary?.trim();
    
    // Parse city and state from CSV
    const city = record.city?.trim() || null;
    const state = record.state?.trim() || null;
    
    toImport.push({
      company_name: record.name?.trim(),
      website: cleanedUrl,
      phone: record.phone?.trim() || null,
      email: email,
      industry: 'HVAC',
      city: city,
      state: state,
      contact_data: {
        owner_name: record.owner_name?.trim() || null,
        owner_email: email,
        owner_phone: record.owner_phone?.trim() || null,
        owner_role: record.owner_role?.trim() || null,
        owner_linkedin: record.owner_linkedin?.trim() || null,
        enrichment_status: 'imported_from_csv',
        enrichment_date: record.enrichment_date || new Date().toISOString(),
      },
      audit_data: {
        gap_score: record.gap_score ? parseInt(record.gap_score) : null,
        has_website: record.has_website === 'yes',
        cms: record.cms?.trim() || null,
        chat_widget: record.chat_widget === 'yes',
        booking_system: record.booking_system === 'yes',
        has_analytics: record.has_analytics === 'yes',
        has_meta_pixel: record.has_meta_pixel === 'yes',
        has_google_ads: record.has_google_ads === 'yes',
        google_rating: record.google_rating ? parseFloat(record.google_rating) : null,
        google_review_count: record.google_review_count ? parseInt(record.google_review_count) : null,
        opportunity_score: record.opportunity_score ? parseInt(record.opportunity_score) : null,
      }
    });
  }
  
  console.log(`✅ Prepared ${toImport.length} records for import\n`);
  
  if (urlIssues.length > 0) {
    console.log(`🔧 Fixed ${urlIssues.length} malformed URLs:\n`);
    urlIssues.slice(0, 10).forEach(issue => {
      console.log(`   ${issue.name}`);
      console.log(`   ❌ ${issue.original}`);
      console.log(`   ✅ ${issue.cleaned}\n`);
    });
    if (urlIssues.length > 10) {
      console.log(`   ... and ${urlIssues.length - 10} more\n`);
    }
  }
  
  console.log('=' .repeat(80) + '\n');
  console.log('📤 Importing to Supabase...\n');
  
  let imported = 0;
  let failed = 0;
  const errors: any[] = [];
  
  // Import in batches of 50
  const batchSize = 50;
  for (let i = 0; i < toImport.length; i += batchSize) {
    const batch = toImport.slice(i, i + batchSize);
    
    const { data, error: insertError } = await supabase
      .schema('crm')
      .from('leads')
      .insert(batch)
      .select('id, company_name, website');
    
    if (insertError) {
      console.error(`   ❌ Batch ${Math.floor(i / batchSize) + 1} failed:`, insertError.message);
      failed += batch.length;
      errors.push({ batch: i, error: insertError.message });
    } else {
      imported += batch.length;
      console.log(`   ✅ Batch ${Math.floor(i / batchSize) + 1}: Imported ${batch.length} businesses`);
    }
  }
  
  console.log('\n' + '=' .repeat(80));
  console.log('✅ Import Complete!\n');
  console.log(`   Total to import:    ${toImport.length}`);
  console.log(`   ✅ Imported:        ${imported}`);
  console.log(`   ❌ Failed:          ${failed}`);
  console.log('=' .repeat(80) + '\n');
  
  // Verify final count
  const { data: finalCount } = await supabase
    .schema('crm')
    .from('leads')
    .select('id', { count: 'exact', head: true })
    .eq('industry', 'HVAC');
  
  console.log(`📊 Final Supabase Stats:`);
  console.log(`   Total HVAC leads: ${finalCount ? (dbLeads?.length || 0) + imported : 'unknown'}`);
  
  const { data: withEmailCount } = await supabase
    .schema('crm')
    .from('leads')
    .select('id', { count: 'exact', head: true })
    .eq('industry', 'HVAC')
    .not('email', 'is', null);
  
  console.log(`   With emails: ${withEmailCount?.length || 'unknown'}\n`);
  
  if (errors.length > 0) {
    console.log('⚠️  Errors encountered:');
    errors.forEach(e => console.log(`   Batch starting at ${e.batch}: ${e.error}`));
  }
}

importMissingBusinesses().catch(console.error);
