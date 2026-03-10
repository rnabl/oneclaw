/**
 * Mark Emails as Bounced
 * 
 * Track bounced emails and flag them for re-enrichment
 * 
 * Usage:
 * - Import bounced email list
 * - Or manually mark specific emails as bounced
 * - Automatically triggers contact enrichment for bounced leads
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

/**
 * Mark a single email as bounced
 */
async function markEmailAsBounced(
  email: string,
  bounceType: 'hard' | 'soft' | 'invalid',
  bounceReason?: string
): Promise<boolean> {
  
  // Find lead with this email
  const { data: leads, error } = await supabase
    .schema('crm')
    .from('leads')
    .select('id, company_name, email, source_metadata')
    .eq('email', email);
  
  if (error || !leads || leads.length === 0) {
    console.log(`   ❌ Lead not found for email: ${email}`);
    return false;
  }

  for (const lead of leads) {
    const updateData = {
      source_metadata: {
        ...(lead.source_metadata || {}),
        email_bounce: {
          bounced: true,
          bounce_type: bounceType,
          bounce_reason: bounceReason,
          bounced_at: new Date().toISOString(),
          needs_enrichment: true
        }
      }
    };

    const { error: updateError } = await supabase
      .schema('crm')
      .from('leads')
      .update(updateData)
      .eq('id', lead.id);

    if (updateError) {
      console.log(`   ❌ Failed to mark bounce: ${updateError.message}`);
      return false;
    }

    console.log(`   ✅ Marked as bounced: ${lead.company_name} (${email})`);
  }

  return true;
}

/**
 * Import bounced emails from CSV
 * CSV format: email, bounce_type, bounce_reason
 */
async function importBouncedEmailsFromCSV(csvPath: string): Promise<void> {
  console.log(`\n📄 Importing bounced emails from: ${csvPath}\n`);

  if (!fs.existsSync(csvPath)) {
    console.error('❌ File not found');
    return;
  }

  const content = fs.readFileSync(csvPath, 'utf-8');
  const lines = content.trim().split('\n');

  if (lines.length < 2) {
    console.error('❌ CSV file is empty or invalid');
    return;
  }

  // Skip header
  const dataLines = lines.slice(1);

  let marked = 0;
  let failed = 0;

  for (const line of dataLines) {
    const [email, bounceType, bounceReason] = line.split(',').map(s => s.trim());

    if (!email) continue;

    const success = await markEmailAsBounced(
      email,
      (bounceType as 'hard' | 'soft' | 'invalid') || 'hard',
      bounceReason
    );

    if (success) {
      marked++;
    } else {
      failed++;
    }

    // Small delay between updates
    await new Promise(resolve => setTimeout(resolve, 100));
  }

  console.log('\n' + '='.repeat(60));
  console.log('📊 Import Summary');
  console.log('='.repeat(60));
  console.log(`Total emails: ${dataLines.length}`);
  console.log(`✅ Marked as bounced: ${marked}`);
  console.log(`❌ Failed: ${failed}`);
  console.log('='.repeat(60));
}

/**
 * Get all leads with bounced emails
 */
async function getBouncedLeads(): Promise<void> {
  console.log('\n📊 Leads with Bounced Emails\n');

  const { data: leads, error } = await supabase
    .schema('crm')
    .from('leads')
    .select('id, company_name, email, source_metadata')
    .not('source_metadata->email_bounce->bounced', 'is', null);

  if (error) {
    console.error('❌ Error fetching bounced leads:', error);
    return;
  }

  if (!leads || leads.length === 0) {
    console.log('✅ No bounced emails found!');
    return;
  }

  console.log(`Found ${leads.length} leads with bounced emails:\n`);

  leads.forEach((lead, i) => {
    const bounce = lead.source_metadata?.email_bounce;
    console.log(`${i + 1}. ${lead.company_name}`);
    console.log(`   Email: ${lead.email}`);
    console.log(`   Type: ${bounce?.bounce_type || 'unknown'}`);
    console.log(`   Reason: ${bounce?.bounce_reason || 'N/A'}`);
    console.log(`   Date: ${new Date(bounce?.bounced_at).toLocaleDateString()}`);
    console.log(`   Needs Enrichment: ${bounce?.needs_enrichment ? 'Yes' : 'No'}`);
    console.log('');
  });

  console.log('💡 Run: pnpm leads:enrich to find new contact info for these leads');
}

/**
 * Main
 */
async function main() {
  console.log('📧 Bounced Email Manager\n');
  console.log('='.repeat(60));

  const args = process.argv.slice(2);

  if (args.length === 0) {
    // Show bounced leads
    await getBouncedLeads();
    return;
  }

  const command = args[0];

  switch (command) {
    case '--import':
      if (!args[1]) {
        console.error('❌ Please provide CSV file path');
        console.log('\nUsage: pnpm leads:bounced --import <csv-file>');
        return;
      }
      await importBouncedEmailsFromCSV(args[1]);
      break;

    case '--mark':
      if (!args[1]) {
        console.error('❌ Please provide email address');
        console.log('\nUsage: pnpm leads:bounced --mark <email> [bounce_type] [reason]');
        return;
      }
      const email = args[1];
      const bounceType = (args[2] as 'hard' | 'soft' | 'invalid') || 'hard';
      const bounceReason = args.slice(3).join(' ') || 'Manual entry';
      
      await markEmailAsBounced(email, bounceType, bounceReason);
      break;

    case '--list':
      await getBouncedLeads();
      break;

    default:
      console.log('Usage:');
      console.log('  pnpm leads:bounced                    # List bounced emails');
      console.log('  pnpm leads:bounced --list             # List bounced emails');
      console.log('  pnpm leads:bounced --mark <email>     # Mark email as bounced');
      console.log('  pnpm leads:bounced --import <csv>     # Import bounced emails from CSV');
  }
}

main().catch(console.error);
