#!/usr/bin/env node
/**
 * Test Discovery Workflow - Populates crm.leads with HVAC businesses
 */

import { runner } from '../packages/harness/src/execution';

async function testDiscovery() {
  console.log('🧪 Testing HVAC Discovery + CRM Storage\n');
  
  try {
    const job = await runner.execute(
      'discover-businesses',
      {
        niche: 'HVAC',
        location: 'Denver, CO',
        limit: 10, // Small test
        enrich: true,
      },
      {
        tenantId: 'test-user',
        tier: 'pro',
      }
    );
    
    console.log(`\n✅ Workflow completed: ${job.id}`);
    console.log(`   Status: ${job.status}`);
    console.log(`   Businesses found: ${job.output?.totalFound || 0}`);
    console.log(`   Cost: $${job.actualCostUsd.toFixed(4)}`);
    
    console.log('\n📊 Check Supabase:');
    console.log('   SELECT * FROM crm.leads ORDER BY created_at DESC LIMIT 10;');
    console.log('   SELECT * FROM workflow_artifacts WHERE artifact_key = \'enriched_businesses\';');
    
  } catch (error) {
    console.error('\n❌ Test failed:', error);
    process.exit(1);
  }
}

testDiscovery();
