/**
 * Mark Campaigns as Sent
 * 
 * Updates campaign status after emails have been sent
 * Can import from CSV or mark by campaign IDs
 */

import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';
import * as fs from 'fs';
import * as path from 'path';
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

interface SentRecord {
  campaign_id: string;
  sent_at: string;
  gmail_message_id?: string;
  gmail_thread_id?: string;
}

async function markCampaignsSent(records: SentRecord[]): Promise<void> {
  console.log(`\n📧 Marking ${records.length} campaigns as sent...\n`);
  
  let updated = 0;
  let failed = 0;
  
  for (const record of records) {
    const { error } = await supabase
      .schema('crm')
      .from('home_services_campaigns')
      .update({
        status: 'sent',
        sent_at: record.sent_at,
        gmail_message_id: record.gmail_message_id || null,
        gmail_thread_id: record.gmail_thread_id || null
      })
      .eq('id', record.campaign_id)
      .eq('approval_status', 'approved'); // Safety: only mark approved campaigns
    
    if (error) {
      console.error(`❌ Failed to update ${record.campaign_id}: ${error.message}`);
      failed++;
    } else {
      console.log(`✅ Updated ${record.campaign_id}`);
      updated++;
    }
  }
  
  console.log(`\n📊 Summary:`);
  console.log(`   ✅ Updated: ${updated}`);
  console.log(`   ❌ Failed: ${failed}`);
}

async function markFromCSV(csvPath: string): Promise<void> {
  console.log(`\n📄 Reading CSV: ${csvPath}\n`);
  
  if (!fs.existsSync(csvPath)) {
    console.error(`❌ File not found: ${csvPath}`);
    return;
  }
  
  const content = fs.readFileSync(csvPath, 'utf-8');
  const lines = content.trim().split('\n');
  
  if (lines.length < 2) {
    console.error('❌ CSV file is empty or missing data');
    return;
  }
  
  const headers = lines[0].toLowerCase().split(',');
  const campaignIdIndex = headers.indexOf('campaign_id');
  const sentAtIndex = headers.indexOf('sent_at');
  const messageIdIndex = headers.indexOf('gmail_message_id');
  const threadIdIndex = headers.indexOf('gmail_thread_id');
  
  if (campaignIdIndex === -1) {
    console.error('❌ CSV must have "campaign_id" column');
    return;
  }
  
  const records: SentRecord[] = [];
  const now = new Date().toISOString();
  
  for (let i = 1; i < lines.length; i++) {
    const values = lines[i].split(',');
    
    if (values.length < campaignIdIndex + 1) continue;
    
    const campaignId = values[campaignIdIndex].trim().replace(/"/g, '');
    if (!campaignId) continue;
    
    records.push({
      campaign_id: campaignId,
      sent_at: sentAtIndex !== -1 && values[sentAtIndex] 
        ? values[sentAtIndex].trim().replace(/"/g, '') 
        : now,
      gmail_message_id: messageIdIndex !== -1 && values[messageIdIndex]
        ? values[messageIdIndex].trim().replace(/"/g, '')
        : undefined,
      gmail_thread_id: threadIdIndex !== -1 && values[threadIdIndex]
        ? values[threadIdIndex].trim().replace(/"/g, '')
        : undefined
    });
  }
  
  console.log(`Found ${records.length} campaign IDs in CSV\n`);
  
  const confirm = await question(`Mark these ${records.length} campaigns as sent? (y/n): `);
  
  if (confirm.toLowerCase() === 'y') {
    await markCampaignsSent(records);
  } else {
    console.log('\n❌ Cancelled');
  }
}

async function markFromExport(exportDir: string): Promise<void> {
  console.log(`\n📁 Scanning export directory: ${exportDir}\n`);
  
  if (!fs.existsSync(exportDir)) {
    console.error(`❌ Directory not found: ${exportDir}`);
    return;
  }
  
  const files = fs.readdirSync(exportDir)
    .filter(f => f.endsWith('.csv') && f.startsWith('campaigns-'))
    .sort()
    .reverse(); // Most recent first
  
  if (files.length === 0) {
    console.error('❌ No campaign CSV files found in exports/');
    return;
  }
  
  console.log('Available export files:');
  files.forEach((file, i) => {
    console.log(`  ${i + 1}. ${file}`);
  });
  
  const choice = await question('\nWhich file to mark as sent? (number): ');
  const fileIndex = parseInt(choice) - 1;
  
  if (fileIndex < 0 || fileIndex >= files.length) {
    console.error('❌ Invalid choice');
    return;
  }
  
  const csvPath = path.join(exportDir, files[fileIndex]);
  await markFromCSV(csvPath);
}

async function markBySender(senderEmail: string): Promise<void> {
  console.log(`\n📧 Marking campaigns for sender: ${senderEmail}\n`);
  
  const { data: campaigns, error } = await supabase
    .schema('crm')
    .from('home_services_campaigns')
    .select('id')
    .eq('sent_from_email', senderEmail)
    .eq('approval_status', 'approved')
    .eq('status', 'draft');
  
  if (error) {
    console.error(`❌ Error fetching campaigns: ${error.message}`);
    return;
  }
  
  if (!campaigns || campaigns.length === 0) {
    console.log('⚠️  No approved draft campaigns found for this sender');
    return;
  }
  
  console.log(`Found ${campaigns.length} approved draft campaigns\n`);
  
  const confirm = await question(`Mark these ${campaigns.length} campaigns as sent? (y/n): `);
  
  if (confirm.toLowerCase() === 'y') {
    const now = new Date().toISOString();
    const records: SentRecord[] = campaigns.map(c => ({
      campaign_id: c.id,
      sent_at: now
    }));
    
    await markCampaignsSent(records);
  } else {
    console.log('\n❌ Cancelled');
  }
}

async function interactiveMenu(): Promise<void> {
  console.log('\n📧 Mark Campaigns as Sent\n');
  console.log('='.repeat(60));
  
  // Show stats
  const { count: approved } = await supabase
    .schema('crm')
    .from('home_services_campaigns')
    .select('id', { count: 'exact', head: true })
    .eq('approval_status', 'approved')
    .eq('status', 'draft');
  
  const { count: sent } = await supabase
    .schema('crm')
    .from('home_services_campaigns')
    .select('id', { count: 'exact', head: true })
    .eq('status', 'sent');
  
  console.log(`\nCurrent Status:`);
  console.log(`  Approved (not sent): ${approved || 0}`);
  console.log(`  Already sent: ${sent || 0}`);
  
  if (!approved || approved === 0) {
    console.log('\n✅ No campaigns pending send!');
    rl.close();
    return;
  }
  
  console.log('\nOptions:');
  console.log('  1. Mark from CSV file');
  console.log('  2. Mark from exports/ directory');
  console.log('  3. Mark all approved campaigns for a sender');
  console.log('  4. Exit');
  
  const choice = await question('\nYour choice: ');
  
  switch (choice) {
    case '1':
      const csvPath = await question('Enter CSV file path: ');
      await markFromCSV(csvPath.trim());
      break;
    
    case '2':
      const exportDir = path.join(process.cwd(), 'exports');
      await markFromExport(exportDir);
      break;
    
    case '3':
      console.log('\nAvailable senders:');
      console.log('  1. riley@closelanepro.com');
      console.log('  2. madison@closelanepro.com');
      console.log('  3. bailey@closelanepro.com');
      
      const senderChoice = await question('\nChoose sender (1-3): ');
      const senders = [
        'riley@closelanepro.com',
        'madison@closelanepro.com',
        'bailey@closelanepro.com'
      ];
      
      const senderIndex = parseInt(senderChoice) - 1;
      if (senderIndex >= 0 && senderIndex < senders.length) {
        await markBySender(senders[senderIndex]);
      } else {
        console.error('❌ Invalid choice');
      }
      break;
    
    case '4':
      console.log('\n👋 Goodbye!');
      break;
    
    default:
      console.error('❌ Invalid choice');
  }
  
  rl.close();
}

// Parse command line args
const args = process.argv.slice(2);

if (args.length === 0) {
  // Interactive mode
  interactiveMenu().catch((error) => {
    console.error('Error:', error);
    rl.close();
  });
} else if (args[0] === '--csv' && args[1]) {
  // CSV mode
  markFromCSV(args[1])
    .then(() => rl.close())
    .catch((error) => {
      console.error('Error:', error);
      rl.close();
    });
} else if (args[0] === '--sender' && args[1]) {
  // Sender mode
  markBySender(args[1])
    .then(() => rl.close())
    .catch((error) => {
      console.error('Error:', error);
      rl.close();
    });
} else {
  console.log('\nUsage:');
  console.log('  pnpm campaign:sent                    # Interactive mode');
  console.log('  pnpm campaign:sent --csv <path>       # Mark from CSV');
  console.log('  pnpm campaign:sent --sender <email>   # Mark by sender');
  rl.close();
}
