#!/usr/bin/env node
/**
 * Run Bounce Audit
 * 
 * Quick script to run the bounce audit tool and update the database
 */

import { auditBouncesHandler } from './src/tools/audit-bounces';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config({ path: '.env.production' });

async function main() {
  console.log('🚀 Running Email Bounce Audit...\n');
  
  const dryRun = process.argv.includes('--dry-run');
  const maxCampaigns = process.argv.find(arg => arg.startsWith('--max='))?.split('=')[1];
  
  if (dryRun) {
    console.log('⚠️  DRY RUN MODE - No database changes will be made\n');
  }
  
  const result = await auditBouncesHandler(
    {
      dryRun,
      maxCampaigns: maxCampaigns ? parseInt(maxCampaigns) : undefined,
    },
    { tenantId: 'system' }
  );
  
  if (!result.success) {
    console.error('\n❌ Audit failed:', result.error);
    process.exit(1);
  }
  
  console.log('\n📋 Detailed Results:');
  console.log(`   Total Scanned: ${result.scanned}`);
  console.log(`   Bounces Found: ${result.bouncesFound}`);
  console.log(`   Database Updated: ${result.updated}`);
  
  if (result.bounces.length > 0) {
    console.log('\n📊 Bounce Summary:');
    result.bounces.forEach((bounce, idx) => {
      console.log(`\n${idx + 1}. ${bounce.companyName}`);
      console.log(`   Email: ${bounce.email}`);
      console.log(`   Reason: ${bounce.bounceReason.substring(0, 100)}...`);
    });
  }
  
  console.log('\n✅ Audit complete! Run the campaign-status tool to see updated stats.');
}

main().catch(console.error);
