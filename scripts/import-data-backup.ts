#!/usr/bin/env node
/**
 * Import .data-backup HVAC leads into Supabase
 * 
 * Imports:
 * 1. Enriched CSV → crm.leads
 * 2. Website analyses JSON → crm.leads (website_signals)
 * 3. Creates email drafts → crm.email_campaigns (pending approval)
 */

import { createClient } from '@supabase/supabase-js';
import { readFileSync, readdirSync } from 'fs';
import { parse } from 'csv-parse/sync';
import { join } from 'path';

const supabaseUrl = process.env.SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

async function importLeads() {
  console.log('📥 Importing HVAC leads from .data-backup\n');
  
  // ===========================================================================
  // STEP 1: Read CSV
  // ===========================================================================
  console.log('1️⃣ Reading hvac-leads-enriched.csv...');
  
  const csvPath = '.data-backup/hvac-leads-enriched.csv';
  const csvContent = readFileSync(csvPath, 'utf-8');
  const records = parse(csvContent, { columns: true, skip_empty_lines: true });
  
  console.log(`   Found ${records.length} leads in CSV`);
  
  // ===========================================================================
  // STEP 2: Read website analyses
  // ===========================================================================
  console.log('\n2️⃣ Reading website analyses...');
  
  const analysisFiles = readdirSync('.data-backup/website-analyses');
  const analyses = new Map();
  
  for (const file of analysisFiles) {
    try {
      const content = readFileSync(join('.data-backup/website-analyses', file), 'utf-8');
      const analysis = JSON.parse(content);
      if (analysis.lead_id && analysis.business_name) {
        analyses.set(analysis.lead_id, analysis);
      }
    } catch (error) {
      // Skip invalid JSON
    }
  }
  
  console.log(`   Found ${analyses.size} website analyses`);
  
  // ===========================================================================
  // STEP 3: Prepare leads for import
  // ===========================================================================
  console.log('\n3️⃣ Preparing leads...');
  
  const leadsToImport = [];
  const emailDraftsToCreate = [];
  let withEmails = 0;
  let withAnalysis = 0;
  
  for (const record of records) {
    const analysis = analyses.get(record.id);
    
    // Calculate lead score
    let score = 50;
    if (record.website) score += 20;
    if (record.owner_email) score += 15;
    if (parseFloat(record.google_rating) >= 4.5) score += 10;
    if (parseInt(record.google_review_count) > 20) score += 5;
    
    const lead = {
      // Use original ID to prevent duplicates
      id: record.id,
      company_name: record.name,
      website: record.website || null,
      phone: record.phone || null,
      email: record.owner_email || null,
      industry: 'HVAC',
      address: null,
      city: record.city,
      state: record.state,
      zip_code: null,
      google_place_id: null,
      google_rating: parseFloat(record.google_rating) || null,
      google_reviews: parseInt(record.google_review_count) || null,
      google_maps_url: null,
      image_url: null,
      owner_name: record.owner_name || null,
      owner_title: record.owner_role || null,
      owner_linkedin: record.owner_linkedin || null,
      website_signals: analysis ? {
        overall_aeo_score: analysis.overall_aeo_score,
        aeo_readiness: analysis.aeo_readiness?.score,
        gbp_score: analysis.gbp_analysis?.score,
        nap_score: analysis.nap_citations?.score,
        schema_gaps: analysis.schema_gaps,
        ai_visibility_gap: analysis.ai_visibility_gap,
      } : {},
      audit_data: analysis || null,
      lead_score: Math.min(score, 100),
      geo_readiness_score: analysis?.gbp_analysis?.score ? analysis.gbp_analysis.score / 10 : 5.0,
      aeo_readiness_score: analysis?.aeo_readiness?.score ? analysis.aeo_readiness.score / 10 : 5.0,
      stage: 'discovered',
      source_job_id: 'data-backup-import',
    };
    
    leadsToImport.push(lead);
    
    if (record.owner_email) withEmails++;
    if (analysis) withAnalysis++;
    
    // Create email draft if we have analysis + email
    if (record.owner_email && analysis && analysis.email_subject_line) {
      emailDraftsToCreate.push({
        lead_id: record.id,
        subject: analysis.email_subject_line,
        body: generateEmailBody(record, analysis),
        template_name: 'aeo-opportunity',
        campaign_type: 'cold-outreach',
        sent_from_email: 'ryan@nabl.ai',
        approval_status: 'pending',
      });
    }
  }
  
  console.log(`   ${leadsToImport.length} leads ready`);
  console.log(`   ${withEmails} with emails (${((withEmails/leadsToImport.length)*100).toFixed(1)}%)`);
  console.log(`   ${withAnalysis} with AI analysis`);
  console.log(`   ${emailDraftsToCreate.length} email drafts to create`);
  
  // ===========================================================================
  // STEP 4: Insert leads (upsert to avoid duplicates)
  // ===========================================================================
  console.log('\n4️⃣ Inserting leads into crm.leads...');
  
  const batchSize = 100;
  let inserted = 0;
  
  for (let i = 0; i < leadsToImport.length; i += batchSize) {
    const batch = leadsToImport.slice(i, i + batchSize);
    
    const { data, error } = await supabase
      .schema('crm')
      .from('leads')
      .upsert(batch, { onConflict: 'id' })
      .select('id');
    
    if (error) {
      console.error(`   ❌ Batch ${i}-${i+batchSize} failed:`, error.message);
    } else {
      inserted += data?.length || 0;
      console.log(`   ✅ Batch ${i}-${i+batchSize}: ${data?.length || 0} leads`);
    }
  }
  
  console.log(`\n   Total inserted: ${inserted} leads`);
  
  // ===========================================================================
  // STEP 5: Create email drafts (pending approval)
  // ===========================================================================
  console.log('\n5️⃣ Creating email drafts...');
  
  let draftsCreated = 0;
  
  for (let i = 0; i < emailDraftsToCreate.length; i += batchSize) {
    const batch = emailDraftsToCreate.slice(i, i + batchSize);
    
    const { data, error } = await supabase
      .schema('crm')
      .from('email_campaigns')
      .insert(batch)
      .select('id');
    
    if (error) {
      console.error(`   ❌ Batch ${i}-${i+batchSize} failed:`, error.message);
    } else {
      draftsCreated += data?.length || 0;
      console.log(`   ✅ Batch ${i}-${i+batchSize}: ${data?.length || 0} drafts`);
    }
  }
  
  console.log(`\n   Total drafts: ${draftsCreated}`);
  
  // ===========================================================================
  // SUMMARY
  // ===========================================================================
  console.log('\n✅ Import complete!\n');
  console.log('📊 Summary:');
  console.log(`   Leads imported: ${inserted}`);
  console.log(`   With emails: ${withEmails}`);
  console.log(`   With AI analysis: ${withAnalysis}`);
  console.log(`   Email drafts created: ${draftsCreated}`);
  console.log('\n💡 Next steps:');
  console.log('   1. Review drafts: SELECT * FROM crm.email_campaigns WHERE approval_status=\'pending\' LIMIT 10;');
  console.log('   2. Approve emails: Use /emails command in Telegram');
  console.log('   3. Send approved: Use email sending workflow');
}

function generateEmailBody(record: any, analysis: any): string {
  const { agency_pitch, opening_line, cta } = analysis;
  
  return `Hi ${record.owner_name || 'there'},

${opening_line}

${agency_pitch?.pain_point || 'Your HVAC business is missing out on AI-driven leads.'}

${agency_pitch?.proof_point || 'Our analysis shows critical gaps in your online presence.'}

${agency_pitch?.solution || 'We specialize in AEO (AI Engine Optimization) for HVAC businesses.'}

${agency_pitch?.impact_estimate || 'Companies see 30-40% increase in leads within 3 months.'}

${cta || 'Let\'s schedule a 15-minute call to discuss how we can help.'}

Best,
Ryan
NABL.ai`;
}

// Run import
importLeads().catch(console.error);
