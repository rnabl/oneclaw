/**
 * Check Home Services Campaign Status
 * 
 * Comprehensive status check for the new home services campaign system
 */

import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';

dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function main() {
  console.log('\n🏠 Home Services Campaign System Status\n');
  console.log('='.repeat(60));
  
  // 1. Check home_services_leads table
  const { count: totalHomeLeads } = await supabase
    .schema('crm')
    .from('home_services_leads')
    .select('id', { count: 'exact', head: true });
  
  console.log(`\n📊 Home Services Leads:`);
  console.log(`   Total migrated: ${totalHomeLeads || 0}`);
  
  if (totalHomeLeads && totalHomeLeads > 0) {
    // Get breakdown by industry
    const { data: byIndustry } = await supabase
      .schema('crm')
      .from('home_services_leads')
      .select('industry');
    
    const industries: Record<string, number> = {};
    byIndustry?.forEach(lead => {
      industries[lead.industry] = (industries[lead.industry] || 0) + 1;
    });
    
    console.log(`\n   By Industry:`);
    Object.entries(industries)
      .sort((a, b) => b[1] - a[1])
      .forEach(([industry, count]) => {
        console.log(`   - ${industry}: ${count}`);
      });
    
    // Get breakdown by signals
    const { data: allLeads } = await supabase
      .schema('crm')
      .from('home_services_leads')
      .select('hiring_signal, ads_signal, reviews_signal');
    
    const signalCounts = {
      hiring: 0,
      ads: 0,
      reviews: 0,
      multiple: 0
    };
    
    allLeads?.forEach(lead => {
      let signals = 0;
      if (lead.hiring_signal) { signalCounts.hiring++; signals++; }
      if (lead.ads_signal) { signalCounts.ads++; signals++; }
      if (lead.reviews_signal) { signalCounts.reviews++; signals++; }
      if (signals > 1) signalCounts.multiple++;
    });
    
    console.log(`\n   By Signal:`);
    console.log(`   - Hiring: ${signalCounts.hiring}`);
    console.log(`   - Ads: ${signalCounts.ads}`);
    console.log(`   - Reviews: ${signalCounts.reviews}`);
    console.log(`   - Multiple signals: ${signalCounts.multiple}`);
  }
  
  // 2. Check home_services_campaigns table
  const { count: totalCampaigns } = await supabase
    .schema('crm')
    .from('home_services_campaigns')
    .select('id', { count: 'exact', head: true });
  
  console.log(`\n\n📧 Home Services Campaigns:`);
  console.log(`   Total campaigns: ${totalCampaigns || 0}`);
  
  if (totalCampaigns && totalCampaigns > 0) {
    // By signal type
    const { data: bySignal } = await supabase
      .schema('crm')
      .from('home_services_campaigns')
      .select('signal_used, template_variant');
    
    const signals: Record<string, number> = {};
    const variants: Record<string, number> = {};
    
    bySignal?.forEach(c => {
      signals[c.signal_used] = (signals[c.signal_used] || 0) + 1;
      variants[c.template_variant] = (variants[c.template_variant] || 0) + 1;
    });
    
    console.log(`\n   By Signal:`);
    Object.entries(signals)
      .sort((a, b) => b[1] - a[1])
      .forEach(([signal, count]) => {
        console.log(`   - ${signal}: ${count}`);
      });
    
    console.log(`\n   By Template Variant:`);
    Object.entries(variants)
      .sort((a, b) => b[1] - a[1])
      .forEach(([variant, count]) => {
        console.log(`   - ${variant}: ${count}`);
      });
    
    // By status
    const { data: byStatus } = await supabase
      .schema('crm')
      .from('home_services_campaigns')
      .select('approval_status, status');
    
    const approvalStatus: Record<string, number> = {};
    const campaignStatus: Record<string, number> = {};
    
    byStatus?.forEach(c => {
      approvalStatus[c.approval_status] = (approvalStatus[c.approval_status] || 0) + 1;
      campaignStatus[c.status] = (campaignStatus[c.status] || 0) + 1;
    });
    
    console.log(`\n   By Approval Status:`);
    Object.entries(approvalStatus)
      .sort((a, b) => b[1] - a[1])
      .forEach(([status, count]) => {
        console.log(`   - ${status}: ${count}`);
      });
    
    console.log(`\n   By Campaign Status:`);
    Object.entries(campaignStatus)
      .sort((a, b) => b[1] - a[1])
      .forEach(([status, count]) => {
        console.log(`   - ${status}: ${count}`);
      });
    
    // Show sample campaigns
    const { data: samples } = await supabase
      .schema('crm')
      .from('home_services_campaigns')
      .select(`
        id,
        signal_used,
        template_variant,
        subject,
        approval_status,
        created_at,
        lead:lead_id (
          company_name,
          city,
          state,
          industry
        )
      `)
      .order('created_at', { ascending: false })
      .limit(5);
    
    if (samples && samples.length > 0) {
      console.log(`\n   Recent Campaigns (Top 5):`);
      samples.forEach((c: any, i: number) => {
        const lead = c.lead;
        console.log(`\n   ${i + 1}. ${lead?.company_name || 'Unknown'} (${lead?.city}, ${lead?.state})`);
        console.log(`      Industry: ${lead?.industry}`);
        console.log(`      Signal: ${c.signal_used} (${c.template_variant})`);
        console.log(`      Subject: "${c.subject}"`);
        console.log(`      Status: ${c.approval_status}`);
      });
    }
  }
  
  // 3. Check source leads availability
  const { data: existing } = await supabase
    .schema('crm')
    .from('home_services_leads')
    .select('email');
  
  const existingEmails = new Set(existing?.map(l => l.email.toLowerCase()) || []);
  
  const { count: totalSourceLeads } = await supabase
    .schema('crm')
    .from('leads')
    .select('id', { count: 'exact', head: true })
    .not('email', 'is', null);
  
  const { count: withReviews } = await supabase
    .schema('crm')
    .from('leads')
    .select('id', { count: 'exact', head: true })
    .not('source_metadata->reviews', 'is', null);
  
  console.log(`\n\n📦 Source Leads Pool:`);
  console.log(`   Total leads with email: ${totalSourceLeads || 0}`);
  console.log(`   With reviews scraped: ${withReviews || 0}`);
  console.log(`   Already migrated: ${existingEmails.size}`);
  console.log(`   Available for migration: ${(totalSourceLeads || 0) - existingEmails.size}`);
  
  // 4. Estimate leads with signals
  const { data: sampleLeads } = await supabase
    .schema('crm')
    .from('leads')
    .select('*')
    .not('email', 'is', null)
    .limit(100);
  
  let withHiring = 0;
  let withReviewsSignal = 0;
  
  sampleLeads?.forEach(lead => {
    // Check hiring signal
    if (lead.source_type === 'job_posting' || 
        lead.source_metadata?.job_postings?.length > 0 ||
        lead.source_metadata?.hiring_signal?.roles?.length > 0 ||
        lead.source_metadata?.job_title) {
      withHiring++;
    }
    
    // Check reviews signal
    const reviews = lead.source_metadata?.reviews || [];
    const fiveStarReviews = reviews.filter((r: any) => 
      r.rating === 5 && 
      r.reviewer_name && 
      r.reviewer_name.split(' ').length >= 2
    );
    if (fiveStarReviews.length > 0) {
      withReviewsSignal++;
    }
  });
  
  console.log(`\n   Sample Analysis (100 leads):`);
  console.log(`   - With hiring signal: ${withHiring}%`);
  console.log(`   - With reviews signal: ${withReviewsSignal}%`);
  
  const availablePool = (totalSourceLeads || 0) - existingEmails.size;
  const estimatedWithSignals = Math.floor(availablePool * Math.max(withHiring, withReviewsSignal) / 100);
  console.log(`\n   💡 Estimated leads with signals: ~${estimatedWithSignals}`);
  
  console.log('\n' + '='.repeat(60));
  console.log('\n✅ Status check complete!\n');
}

main().catch(console.error);
