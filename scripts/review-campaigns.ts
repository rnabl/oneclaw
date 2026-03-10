/**
 * Review and Polish Home Services Campaigns
 * 
 * Interactive script to review campaigns and mark them as approved/rejected
 * Also allows for manual edits before approval
 */

import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';
import * as readline from 'readline';

dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

function question(prompt: string): Promise<string> {
  return new Promise((resolve) => {
    rl.question(prompt, resolve);
  });
}

function countWords(text: string): number {
  return text.trim().split(/\s+/).length;
}

interface Campaign {
  id: string;
  subject: string;
  body: string;
  signal_used: string;
  template_variant: string;
  approval_status: string;
  lead: {
    company_name: string;
    city: string;
    state: string;
    email: string;
    industry: string;
    first_name?: string;
    competitors?: any[];
  };
}

async function getCampaignsForReview(limit: number = 10): Promise<Campaign[]> {
  const { data, error } = await supabase
    .schema('crm')
    .from('home_services_campaigns')
    .select(`
      id,
      subject,
      body,
      signal_used,
      template_variant,
      approval_status,
      lead:lead_id (
        company_name,
        city,
        state,
        email,
        industry,
        first_name,
        competitors
      )
    `)
    .eq('approval_status', 'pending_approval')
    .order('created_at', { ascending: true })
    .limit(limit);
  
  if (error) {
    console.error('Error fetching campaigns:', error);
    return [];
  }
  
  return (data as any[]) || [];
}

async function updateCampaign(
  campaignId: string,
  updates: {
    subject?: string;
    body?: string;
    approval_status?: string;
  }
): Promise<boolean> {
  const { error } = await supabase
    .schema('crm')
    .from('home_services_campaigns')
    .update(updates)
    .eq('id', campaignId);
  
  if (error) {
    console.error('Error updating campaign:', error);
    return false;
  }
  
  return true;
}

function displayCampaign(campaign: Campaign, index: number, total: number) {
  console.log('\n' + '='.repeat(70));
  console.log(`📧 Campaign ${index}/${total}`);
  console.log('='.repeat(70));
  console.log(`\nCompany: ${campaign.lead.company_name}`);
  console.log(`Location: ${campaign.lead.city}, ${campaign.lead.state}`);
  console.log(`Industry: ${campaign.lead.industry}`);
  console.log(`Email: ${campaign.lead.email}`);
  console.log(`Contact: ${campaign.lead.first_name || 'N/A'}`);
  console.log(`\nSignal: ${campaign.signal_used} (${campaign.template_variant})`);
  
  if (campaign.lead.competitors && campaign.lead.competitors.length > 0) {
    const competitorNames = campaign.lead.competitors.map((c: any) => c.name).join(', ');
    console.log(`Competitors: ${competitorNames}`);
  }
  
  console.log('\n' + '-'.repeat(70));
  console.log(`Subject: ${campaign.subject}`);
  console.log('-'.repeat(70));
  console.log(campaign.body);
  console.log('-'.repeat(70));
  console.log(`\nWord count: ${countWords(campaign.body)} words`);
  console.log(`Status: ${campaign.approval_status}`);
}

async function reviewCampaign(campaign: Campaign, index: number, total: number): Promise<boolean> {
  displayCampaign(campaign, index, total);
  
  while (true) {
    console.log('\nOptions:');
    console.log('  [a] Approve');
    console.log('  [r] Reject');
    console.log('  [e] Edit subject');
    console.log('  [b] Edit body');
    console.log('  [s] Skip (review later)');
    console.log('  [q] Quit review session');
    
    const choice = await question('\nYour choice: ');
    
    switch (choice.toLowerCase()) {
      case 'a':
        console.log('\n✅ Approving campaign...');
        const approved = await updateCampaign(campaign.id, {
          approval_status: 'approved'
        });
        if (approved) {
          console.log('✅ Campaign approved!');
          return true;
        }
        break;
      
      case 'r':
        const reason = await question('Reason for rejection (optional): ');
        console.log('\n❌ Rejecting campaign...');
        const rejected = await updateCampaign(campaign.id, {
          approval_status: 'rejected'
        });
        if (rejected) {
          console.log(`❌ Campaign rejected${reason ? `: ${reason}` : ''}`);
          return true;
        }
        break;
      
      case 'e':
        const newSubject = await question('\nNew subject line: ');
        if (newSubject.trim()) {
          console.log('\n💾 Updating subject...');
          const updated = await updateCampaign(campaign.id, {
            subject: newSubject.trim().toLowerCase()
          });
          if (updated) {
            console.log('✅ Subject updated!');
            campaign.subject = newSubject.trim().toLowerCase();
            displayCampaign(campaign, index, total);
          }
        }
        break;
      
      case 'b':
        console.log('\nEnter new body (press Enter twice when done):');
        let bodyLines: string[] = [];
        let emptyLineCount = 0;
        
        while (emptyLineCount < 2) {
          const line = await question('');
          if (line === '') {
            emptyLineCount++;
          } else {
            emptyLineCount = 0;
            bodyLines.push(line);
          }
        }
        
        const newBody = bodyLines.join('\n').trim();
        if (newBody) {
          const wordCount = countWords(newBody);
          if (wordCount < 40 || wordCount > 75) {
            console.log(`\n⚠️  Warning: Body is ${wordCount} words (target: 40-75)`);
            const confirm = await question('Continue anyway? (y/n): ');
            if (confirm.toLowerCase() !== 'y') {
              break;
            }
          }
          
          console.log('\n💾 Updating body...');
          const updated = await updateCampaign(campaign.id, {
            body: newBody
          });
          if (updated) {
            console.log('✅ Body updated!');
            campaign.body = newBody;
            displayCampaign(campaign, index, total);
          }
        }
        break;
      
      case 's':
        console.log('\n⏭️  Skipping campaign...');
        return true;
      
      case 'q':
        return false;
      
      default:
        console.log('\n❌ Invalid choice. Please try again.');
    }
  }
}

async function main() {
  console.log('\n🔍 Home Services Campaign Review Tool\n');
  
  // Get stats first
  const { count: pending } = await supabase
    .schema('crm')
    .from('home_services_campaigns')
    .select('id', { count: 'exact', head: true })
    .eq('approval_status', 'pending_approval');
  
  const { count: approved } = await supabase
    .schema('crm')
    .from('home_services_campaigns')
    .select('id', { count: 'exact', head: true })
    .eq('approval_status', 'approved');
  
  const { count: rejected } = await supabase
    .schema('crm')
    .from('home_services_campaigns')
    .select('id', { count: 'exact', head: true })
    .eq('approval_status', 'rejected');
  
  console.log('Campaign Status:');
  console.log(`  Pending: ${pending || 0}`);
  console.log(`  Approved: ${approved || 0}`);
  console.log(`  Rejected: ${rejected || 0}`);
  console.log(`  Total: ${(pending || 0) + (approved || 0) + (rejected || 0)}`);
  
  if (!pending || pending === 0) {
    console.log('\n✅ No campaigns pending review!');
    rl.close();
    return;
  }
  
  const batchSizeInput = await question(`\nHow many campaigns to review? (max ${pending}): `);
  const batchSize = Math.min(parseInt(batchSizeInput) || 10, pending);
  
  console.log(`\n📋 Loading ${batchSize} campaigns for review...\n`);
  
  const campaigns = await getCampaignsForReview(batchSize);
  
  if (campaigns.length === 0) {
    console.log('❌ No campaigns found');
    rl.close();
    return;
  }
  
  let reviewed = 0;
  let approvedCount = 0;
  let rejectedCount = 0;
  let skippedCount = 0;
  
  for (let i = 0; i < campaigns.length; i++) {
    const shouldContinue = await reviewCampaign(campaigns[i], i + 1, campaigns.length);
    
    if (!shouldContinue) {
      console.log('\n👋 Ending review session...');
      break;
    }
    
    reviewed++;
    
    // Check final status
    const { data } = await supabase
      .schema('crm')
      .from('home_services_campaigns')
      .select('approval_status')
      .eq('id', campaigns[i].id)
      .single();
    
    if (data?.approval_status === 'approved') {
      approvedCount++;
    } else if (data?.approval_status === 'rejected') {
      rejectedCount++;
    } else {
      skippedCount++;
    }
  }
  
  // Summary
  console.log('\n' + '='.repeat(70));
  console.log('📊 Review Session Summary');
  console.log('='.repeat(70));
  console.log(`\nReviewed: ${reviewed}/${campaigns.length}`);
  console.log(`✅ Approved: ${approvedCount}`);
  console.log(`❌ Rejected: ${rejectedCount}`);
  console.log(`⏭️  Skipped: ${skippedCount}`);
  
  const { count: stillPending } = await supabase
    .schema('crm')
    .from('home_services_campaigns')
    .select('id', { count: 'exact', head: true })
    .eq('approval_status', 'pending_approval');
  
  console.log(`\n📋 Remaining pending: ${stillPending || 0}`);
  
  console.log('\n✅ Review session complete!\n');
  rl.close();
}

main().catch((error) => {
  console.error('Error:', error);
  rl.close();
});
