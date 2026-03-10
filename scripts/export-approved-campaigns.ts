/**
 * Export Approved Campaigns
 * 
 * Exports approved campaigns to CSV for import into email sending platform
 * Includes all necessary fields for personalized sending
 */

import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';
import * as fs from 'fs';
import * as path from 'path';

dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

interface ExportCampaign {
  campaign_id: string;
  company_name: string;
  email: string;
  first_name: string;
  city: string;
  state: string;
  industry: string;
  subject: string;
  body: string;
  sent_from_email: string;
  signal_used: string;
  template_variant: string;
  created_at: string;
}

function escapeCSV(value: any): string {
  if (value === null || value === undefined) return '';
  const str = String(value);
  if (str.includes(',') || str.includes('"') || str.includes('\n')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

function generateCSV(campaigns: ExportCampaign[]): string {
  const headers = [
    'campaign_id',
    'company_name',
    'email',
    'first_name',
    'city',
    'state',
    'industry',
    'subject',
    'body',
    'sent_from_email',
    'signal_used',
    'template_variant',
    'created_at'
  ];
  
  const rows = campaigns.map(c => [
    c.campaign_id,
    c.company_name,
    c.email,
    c.first_name,
    c.city,
    c.state,
    c.industry,
    c.subject,
    c.body,
    c.sent_from_email,
    c.signal_used,
    c.template_variant,
    c.created_at
  ]);
  
  const csvLines = [
    headers.map(escapeCSV).join(','),
    ...rows.map(row => row.map(escapeCSV).join(','))
  ];
  
  return csvLines.join('\n');
}

async function exportApprovedCampaigns(limit?: number) {
  console.log('\n📤 Export Approved Campaigns\n');
  console.log('='.repeat(60));
  
  // Get approved campaigns
  let query = supabase
    .schema('crm')
    .from('home_services_campaigns')
    .select(`
      id,
      subject,
      body,
      sent_from_email,
      signal_used,
      template_variant,
      created_at,
      lead:lead_id (
        company_name,
        email,
        first_name,
        city,
        state,
        industry
      )
    `)
    .eq('approval_status', 'approved')
    .eq('status', 'draft')
    .order('created_at', { ascending: true });
  
  if (limit) {
    query = query.limit(limit);
  }
  
  const { data, error } = await query;
  
  if (error) {
    console.error('❌ Error fetching campaigns:', error);
    return;
  }
  
  if (!data || data.length === 0) {
    console.log('⚠️  No approved campaigns ready for export');
    console.log('\n💡 Make sure campaigns are:');
    console.log('   - approval_status = "approved"');
    console.log('   - status = "draft" (not sent yet)');
    return;
  }
  
  console.log(`✅ Found ${data.length} approved campaigns ready to send\n`);
  
  // Transform data
  const campaigns: ExportCampaign[] = data.map((c: any) => ({
    campaign_id: c.id,
    company_name: c.lead.company_name,
    email: c.lead.email,
    first_name: c.lead.first_name || '',
    city: c.lead.city || '',
    state: c.lead.state || '',
    industry: c.lead.industry || '',
    subject: c.subject,
    body: c.body,
    sent_from_email: c.sent_from_email,
    signal_used: c.signal_used,
    template_variant: c.template_variant,
    created_at: c.created_at
  }));
  
  // Group by sender
  const bySender: Record<string, ExportCampaign[]> = {};
  campaigns.forEach(c => {
    if (!bySender[c.sent_from_email]) {
      bySender[c.sent_from_email] = [];
    }
    bySender[c.sent_from_email].push(c);
  });
  
  console.log('By Sender:');
  Object.entries(bySender).forEach(([sender, campaigns]) => {
    console.log(`  ${sender}: ${campaigns.length} campaigns`);
  });
  
  // Group by signal
  const bySignal: Record<string, number> = {};
  campaigns.forEach(c => {
    bySignal[c.signal_used] = (bySignal[c.signal_used] || 0) + 1;
  });
  
  console.log('\nBy Signal:');
  Object.entries(bySignal).forEach(([signal, count]) => {
    console.log(`  ${signal}: ${count}`);
  });
  
  // Create exports directory
  const exportsDir = path.join(process.cwd(), 'exports');
  if (!fs.existsSync(exportsDir)) {
    fs.mkdirSync(exportsDir, { recursive: true });
  }
  
  // Generate timestamp
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
  
  // Export all campaigns
  const allCSV = generateCSV(campaigns);
  const allFilename = path.join(exportsDir, `campaigns-all-${timestamp}.csv`);
  fs.writeFileSync(allFilename, allCSV);
  console.log(`\n✅ Exported all campaigns: ${allFilename}`);
  console.log(`   ${campaigns.length} campaigns`);
  
  // Export by sender
  Object.entries(bySender).forEach(([sender, senderCampaigns]) => {
    const senderName = sender.split('@')[0];
    const csv = generateCSV(senderCampaigns);
    const filename = path.join(exportsDir, `campaigns-${senderName}-${timestamp}.csv`);
    fs.writeFileSync(filename, csv);
    console.log(`\n✅ Exported ${senderName}: ${filename}`);
    console.log(`   ${senderCampaigns.length} campaigns`);
  });
  
  // Generate summary report
  const summary = {
    exported_at: new Date().toISOString(),
    total_campaigns: campaigns.length,
    by_sender: Object.entries(bySender).map(([sender, campaigns]) => ({
      sender,
      count: campaigns.length
    })),
    by_signal: Object.entries(bySignal).map(([signal, count]) => ({
      signal,
      count
    })),
    campaigns: campaigns.map(c => ({
      id: c.campaign_id,
      company: c.company_name,
      email: c.email,
      sender: c.sent_from_email,
      signal: c.signal_used
    }))
  };
  
  const summaryFilename = path.join(exportsDir, `campaigns-summary-${timestamp}.json`);
  fs.writeFileSync(summaryFilename, JSON.stringify(summary, null, 2));
  console.log(`\n✅ Summary report: ${summaryFilename}`);
  
  console.log('\n' + '='.repeat(60));
  console.log('\n📊 Export Summary\n');
  console.log(`Total campaigns exported: ${campaigns.length}`);
  console.log(`Export directory: ${exportsDir}`);
  console.log('\n💡 Next steps:');
  console.log('   1. Review CSV files in exports/ directory');
  console.log('   2. Import into email sending platform');
  console.log('   3. Mark campaigns as "sent" after sending');
  console.log('\n✅ Export complete!\n');
}

// Parse command line args
const args = process.argv.slice(2);
const limitArg = args.find(arg => arg.startsWith('--limit='));
const limit = limitArg ? parseInt(limitArg.split('=')[1]) : undefined;

if (limit) {
  console.log(`📋 Limiting export to ${limit} campaigns`);
}

exportApprovedCampaigns(limit).catch(console.error);
