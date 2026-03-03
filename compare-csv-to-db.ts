import { config } from 'dotenv';
import { createClient } from '@supabase/supabase-js';
import { createReadStream } from 'fs';
import { parse } from 'csv-parse';

config();

const supabaseUrl = process.env.SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

async function compareData() {
  console.log('🔍 Comparing CSV data to Supabase...\n');
  
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
  
  console.log(`📊 CSV Stats:`);
  console.log(`   Total rows: ${records.length}`);
  
  // Filter to records with emails
  const withEmails = records.filter(r => 
    (r.owner_email && r.owner_email.trim()) || 
    (r.owner_email_secondary && r.owner_email_secondary.trim())
  );
  console.log(`   With emails: ${withEmails.length}\n`);
  
  // Get all HVAC leads from Supabase
  const { data: dbLeads, error } = await supabase
    .schema('crm')
    .from('leads')
    .select('id, company_name, website, email, contact_data')
    .eq('industry', 'HVAC');
  
  if (error) {
    console.error('❌ Error fetching from Supabase:', error);
    return;
  }
  
  console.log(`📊 Supabase Stats:`);
  console.log(`   Total HVAC leads: ${dbLeads?.length || 0}`);
  console.log(`   With emails: ${dbLeads?.filter(l => l.email).length || 0}\n`);
  
  // Create website lookup maps
  const dbWebsiteMap = new Map(dbLeads?.map(l => [l.website, l]) || []);
  const csvWebsiteMap = new Map(withEmails.map(r => [r.website?.trim(), r]));
  
  console.log('=' .repeat(80));
  console.log('📋 COMPARISON RESULTS\n');
  
  // 1. CSV records that matched DB (have emails)
  const matched: any[] = [];
  const notInDb: any[] = [];
  
  for (const record of withEmails) {
    const website = record.website?.trim();
    if (dbWebsiteMap.has(website)) {
      matched.push({
        csv: record,
        db: dbWebsiteMap.get(website)
      });
    } else {
      notInDb.push(record);
    }
  }
  
  console.log(`✅ CSV records MATCHED to DB (${matched.length}):`);
  console.log(`   These have emails in CSV and exist in Supabase\n`);
  
  console.log(`⚠️  CSV records NOT IN DB (${notInDb.length}):`);
  if (notInDb.length > 0) {
    console.log(`   These have emails in CSV but don't exist in Supabase:\n`);
    notInDb.slice(0, 20).forEach(r => {
      const email = r.owner_email?.trim() || r.owner_email_secondary?.trim();
      console.log(`   - ${r.name.padEnd(50)} ${email}`);
      console.log(`     ${r.website}`);
    });
    if (notInDb.length > 20) {
      console.log(`   ... and ${notInDb.length - 20} more\n`);
    }
  }
  
  // 2. DB records that don't have CSV email data
  const dbWithoutCsvEmails: any[] = [];
  
  for (const dbLead of dbLeads || []) {
    const csvRecord = csvWebsiteMap.get(dbLead.website);
    if (!csvRecord || (!csvRecord.owner_email?.trim() && !csvRecord.owner_email_secondary?.trim())) {
      dbWithoutCsvEmails.push(dbLead);
    }
  }
  
  console.log('\n' + '='.repeat(80));
  console.log(`\n📊 DB records WITHOUT CSV email data (${dbWithoutCsvEmails.length}):`);
  console.log(`   These are in Supabase but missing from enriched CSV:\n`);
  
  const dbWithoutEmails = dbWithoutCsvEmails.filter(l => !l.email);
  const dbAlreadyHaveEmails = dbWithoutCsvEmails.filter(l => l.email);
  
  console.log(`   - ${dbWithoutEmails.length} have NO email in DB`);
  console.log(`   - ${dbAlreadyHaveEmails.length} already have email in DB (from other source)`);
  
  if (dbWithoutEmails.length > 0) {
    console.log(`\n   Sample businesses without emails (first 20):\n`);
    dbWithoutEmails.slice(0, 20).forEach(l => {
      console.log(`   - ${l.company_name.padEnd(50)}`);
      console.log(`     ${l.website || '(no website)'}`);
    });
    if (dbWithoutEmails.length > 20) {
      console.log(`   ... and ${dbWithoutEmails.length - 20} more\n`);
    }
  }
  
  console.log('\n' + '='.repeat(80));
  console.log('\n📈 SUMMARY:\n');
  console.log(`   CSV Total:              ${records.length}`);
  console.log(`   CSV with emails:        ${withEmails.length}`);
  console.log(`   ├─ ✅ Matched to DB:    ${matched.length}`);
  console.log(`   └─ ⚠️  Not in DB:        ${notInDb.length}`);
  console.log();
  console.log(`   Supabase Total:         ${dbLeads?.length || 0}`);
  console.log(`   ├─ ✅ Have emails:      ${dbLeads?.filter(l => l.email).length || 0}`);
  console.log(`   └─ ⚠️  Missing emails:  ${dbWithoutEmails.length}`);
  console.log('\n' + '='.repeat(80));
  
  // Check for potential fuzzy matches for the "not in DB" records
  console.log('\n🔎 Checking for potential fuzzy matches...\n');
  
  let potentialMatches = 0;
  for (const csvRecord of notInDb.slice(0, 10)) {
    const csvWebsite = csvRecord.website?.trim().toLowerCase();
    const csvDomain = csvWebsite?.replace(/^https?:\/\/(www\.)?/, '').split('/')[0];
    
    // Look for similar domains in DB
    const similar = dbLeads?.filter(db => {
      const dbWebsite = db.website?.toLowerCase();
      const dbDomain = dbWebsite?.replace(/^https?:\/\/(www\.)?/, '').split('/')[0];
      return dbDomain && csvDomain && (
        dbDomain.includes(csvDomain) || 
        csvDomain.includes(dbDomain) ||
        db.company_name?.toLowerCase().includes(csvRecord.name?.toLowerCase())
      );
    });
    
    if (similar && similar.length > 0) {
      potentialMatches++;
      console.log(`   📍 Potential match found:`);
      console.log(`      CSV: ${csvRecord.name}`);
      console.log(`           ${csvWebsite}`);
      console.log(`      DB:  ${similar[0].company_name}`);
      console.log(`           ${similar[0].website}\n`);
    }
  }
  
  if (potentialMatches > 0) {
    console.log(`   Found ${potentialMatches} potential fuzzy matches (checked first 10 unmatched)`);
  } else {
    console.log(`   No obvious fuzzy matches found (checked first 10 unmatched)`);
  }
  
  console.log('\n' + '='.repeat(80) + '\n');
}

compareData().catch(console.error);
