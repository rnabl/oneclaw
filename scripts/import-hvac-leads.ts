/**
 * Import HVAC leads from CSV into Supabase crm.leads table
 * 
 * Usage: 
 *   npx tsx scripts/import-hvac-leads.ts <path-to-csv>
 * 
 * Make sure SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are set in environment
 */

import { createClient } from '@supabase/supabase-js';
import { parse } from 'csv-parse/sync';
import * as fs from 'fs';
import * as path from 'path';
import * as dotenv from 'dotenv';

// Load environment variables
dotenv.config({ path: path.resolve(__dirname, '../.env.production') });
dotenv.config({ path: path.resolve(__dirname, '../.env') });

interface LeadRecord {
  id?: string;
  company_name: string;
  website: string | null;
  phone: string | null;
  email: string | null;
  industry: string;
  city: string | null;
  state: string | null;
  google_rating: number | null;
  google_reviews: number | null;
  owner_name: string | null;
  owner_title: string | null;
  owner_linkedin: string | null;
  lead_score: number | null;
  stage: string;
  website_signals: Record<string, unknown>;
  contact_data: Record<string, unknown>;
  discovered_at: string | null;
}

function mapCSVToLead(row: Record<string, string>): LeadRecord {
  const websiteSignals: Record<string, unknown> = {
    has_website: row.has_website === 'yes',
    cms: row.cms || null,
    chat_widget: row.chat_widget || null,
    booking_system: row.booking_system || null,
    has_analytics: row.has_analytics === 'yes',
    has_meta_pixel: row.has_meta_pixel === 'yes',
    has_google_ads: row.has_google_ads === 'yes',
    has_facebook: row.facebook === 'yes',
    has_instagram: row.instagram === 'yes',
    has_linkedin: row.linkedin === 'yes',
    gap_score: row.gap_score ? parseInt(row.gap_score) : null,
    metro: row.metro || null,
    suburb: row.suburb || null,
  };

  const contactData: Record<string, unknown> = {
    owner_email: row.owner_email || null,
    owner_phone: row.owner_phone || null,
    owner_email_secondary: row.owner_email_secondary || null,
    enrichment_status: row.enrichment_status || null,
    enrichment_date: row.enrichment_date || null,
    outreach_status: row.outreach_status || null,
  };

  return {
    id: row.id || undefined,
    company_name: row.name,
    website: row.website || null,
    phone: row.phone || null,
    email: row.owner_email || null,
    industry: 'HVAC',
    city: row.city || null,
    state: row.state || null,
    google_rating: row.google_rating ? parseFloat(row.google_rating) : null,
    google_reviews: row.google_review_count ? parseInt(row.google_review_count) : null,
    owner_name: row.owner_name || null,
    owner_title: row.owner_role || null,
    owner_linkedin: row.owner_linkedin || null,
    lead_score: row.opportunity_score ? parseInt(row.opportunity_score) : null,
    stage: 'discovered',
    website_signals: websiteSignals,
    contact_data: contactData,
    discovered_at: row.discovered_at || null,
  };
}

async function importLeads(csvPath: string) {
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !supabaseKey) {
    console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY environment variables');
    console.error('Set these in .env.production or as environment variables');
    process.exit(1);
  }

  console.log(`Connecting to Supabase: ${supabaseUrl}`);
  const supabase = createClient(supabaseUrl, supabaseKey);

  console.log(`Reading CSV from: ${csvPath}`);
  const csvContent = fs.readFileSync(csvPath, 'utf-8');
  
  const records: Record<string, string>[] = parse(csvContent, {
    columns: true,
    skip_empty_lines: true,
    trim: true,
    relax_quotes: true,
  });
  
  console.log(`Parsed ${records.length} records from CSV`);

  const leads = records.map(mapCSVToLead).filter(lead => lead.company_name);
  console.log(`Mapped ${leads.length} valid leads`);

  const batchSize = 100;
  let inserted = 0;
  let errors = 0;

  for (let i = 0; i < leads.length; i += batchSize) {
    const batch = leads.slice(i, i + batchSize);
    
    const { data, error } = await supabase
      .schema('crm')
      .from('leads')
      .upsert(batch, { onConflict: 'id' })
      .select('id');

    if (error) {
      console.error(`Batch ${Math.floor(i / batchSize) + 1} error:`, error.message);
      errors += batch.length;
    } else {
      inserted += data?.length || 0;
      console.log(`Inserted batch ${Math.floor(i / batchSize) + 1}: ${data?.length || 0} records`);
    }
  }

  console.log('\n=== Import Summary ===');
  console.log(`Total records: ${leads.length}`);
  console.log(`Successfully inserted: ${inserted}`);
  console.log(`Errors: ${errors}`);
}

const csvPath = process.argv[2];
if (!csvPath) {
  console.error('Usage: npx ts-node scripts/import-hvac-leads.ts <path-to-csv>');
  process.exit(1);
}

importLeads(path.resolve(csvPath)).catch(console.error);
