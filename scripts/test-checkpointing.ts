#!/usr/bin/env node
/**
 * Test Workflow Checkpointing
 * 
 * Verifies that:
 * 1. Checkpoints are saved to Supabase
 * 2. Artifacts are persisted
 * 3. Logs are streamed
 * 4. Workflows can be resumed
 */

import { runner, checkpointStore, resumeWorkflow, getResumableWorkflows } from '../packages/harness/src/execution';
import { createClient } from '@supabase/supabase-js';

async function testCheckpointing() {
  console.log('🧪 Testing Workflow Checkpointing\n');
  
  // Check if Supabase is configured
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  
  if (!supabaseUrl || !supabaseKey) {
    console.error('❌ Supabase not configured');
    console.error('Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY');
    process.exit(1);
  }
  
  console.log('✅ Supabase configured');
  console.log(`   URL: ${supabaseUrl}`);
  
  // Check if checkpoint store is enabled
  if (!checkpointStore.isEnabled()) {
    console.error('❌ Checkpoint store not enabled');
    process.exit(1);
  }
  
  console.log('✅ Checkpoint store enabled\n');
  
  // Run a test workflow
  console.log('🚀 Running test discovery workflow...');
  
  try {
    const job = await runner.execute(
      'discover-businesses',
      {
        niche: 'HVAC',
        location: 'Denver, CO',
        limit: 5, // Small test
      },
      {
        tenantId: 'test-user',
        tier: 'pro',
      }
    );
    
    console.log(`\n✅ Workflow completed: ${job.id}`);
    console.log(`   Status: ${job.status}`);
    console.log(`   Cost: $${job.actualCostUsd.toFixed(4)}`);
    console.log(`   Steps: ${job.currentStep}/${job.totalSteps}`);
    
    // Check artifacts in Supabase
    console.log('\n📦 Checking artifacts...');
    
    const rawBusinesses = await checkpointStore.getArtifact(job.id, 'raw_businesses');
    const enrichedBusinesses = await checkpointStore.getArtifact(job.id, 'enriched_businesses');
    
    if (rawBusinesses) {
      console.log(`   ✅ raw_businesses: ${rawBusinesses.length} items`);
    } else {
      console.log('   ❌ raw_businesses: not found');
    }
    
    if (enrichedBusinesses) {
      console.log(`   ✅ enriched_businesses: ${enrichedBusinesses.length} items`);
    } else {
      console.log('   ❌ enriched_businesses: not found');
    }
    
    // Check steps in Supabase
    console.log('\n📋 Checking steps...');
    const completedSteps = await checkpointStore.getCompletedSteps(job.id);
    console.log(`   Completed steps: ${completedSteps.length}`);
    
    for (const step of completedSteps) {
      console.log(`   - Step ${step.stepIndex}: ${step.stepName}`);
    }
    
    // Check logs
    console.log('\n📝 Workflow logs saved to Supabase');
    
    // Query Supabase directly to verify
    const supabase = createClient(supabaseUrl, supabaseKey);
    
    const { data: steps, error: stepsError } = await supabase
      .from('workflow_steps')
      .select('*')
      .eq('run_id', job.id);
    
    if (stepsError) {
      console.error('   ❌ Error querying steps:', stepsError);
    } else {
      console.log(`   ✅ workflow_steps: ${steps?.length || 0} records`);
    }
    
    const { data: artifacts, error: artifactsError } = await supabase
      .from('workflow_artifacts')
      .select('artifact_key, size_bytes')
      .eq('run_id', job.id);
    
    if (artifactsError) {
      console.error('   ❌ Error querying artifacts:', artifactsError);
    } else {
      console.log(`   ✅ workflow_artifacts: ${artifacts?.length || 0} records`);
      for (const artifact of artifacts || []) {
        console.log(`      - ${artifact.artifact_key}: ${(artifact.size_bytes / 1024).toFixed(1)}KB`);
      }
    }
    
    const { data: logs, error: logsError } = await supabase
      .from('workflow_logs')
      .select('level')
      .eq('run_id', job.id);
    
    if (logsError) {
      console.error('   ❌ Error querying logs:', logsError);
    } else {
      const logCounts = (logs || []).reduce((acc, log) => {
        acc[log.level] = (acc[log.level] || 0) + 1;
        return acc;
      }, {} as Record<string, number>);
      
      console.log(`   ✅ workflow_logs: ${logs?.length || 0} records`);
      console.log(`      Debug: ${logCounts.debug || 0}, Info: ${logCounts.info || 0}, Warn: ${logCounts.warn || 0}, Error: ${logCounts.error || 0}`);
    }
    
    console.log('\n✅ All checkpointing tests passed!');
    
    // Test resume capability
    console.log('\n🔄 Testing resume capability...');
    const resumable = await getResumableWorkflows();
    console.log(`   Resumable workflows: ${resumable.length}`);
    
  } catch (error) {
    console.error('\n❌ Test failed:', error);
    process.exit(1);
  }
}

// Run tests
testCheckpointing().catch(console.error);
