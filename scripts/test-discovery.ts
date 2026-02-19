#!/usr/bin/env tsx
/**
 * Test Discovery Workflow
 * 
 * Tests the new clean list format for discovery results
 */

import 'dotenv/config';

// Import from apps/api since that has the formatting functions
async function testDiscovery() {
  console.log('🔍 Testing Discovery Workflow with new clean format...\n');
  
  try {
    // Dynamic import to handle ESM/CJS
    const { handleDiscoveryWorkflow, formatDiscoveryForChat } = await import('../apps/api/src/workflows/discovery.js');
    
    const testParams = {
      niche: 'dentist',
      location: 'Austin, TX',
      limit: 20
    };
    
    console.log(`📍 Searching for: ${testParams.niche} in ${testParams.location}`);
    console.log(`🎯 Limit: ${testParams.limit} businesses\n`);
    console.log('⏳ Running discovery (this may take 30-60 seconds)...\n');
    
    const startTime = Date.now();
    const result = await handleDiscoveryWorkflow(testParams);
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    
    console.log(`✅ Discovery completed in ${elapsed}s\n`);
    console.log('=' .repeat(80));
    console.log('NEW CLEAN FORMAT OUTPUT:');
    console.log('='.repeat(80));
    console.log();
    
    // Format and display
    const formatted = formatDiscoveryForChat(result);
    console.log(formatted);
    
    console.log();
    console.log('='.repeat(80));
    console.log('RAW DATA SAMPLE (first 3 businesses):');
    console.log('='.repeat(80));
    console.log();
    
    result.businesses.slice(0, 3).forEach((biz, i) => {
      console.log(`${i + 1}. ${biz.name}`);
      console.log(`   Category: ${biz.category || 'N/A'}`);
      console.log(`   Rating: ${biz.rating ? `⭐${biz.rating}` : 'N/A'} (${biz.review_count || 0} reviews)`);
      console.log(`   Website: ${biz.website || '❌ None'}`);
      console.log(`   Phone: ${biz.phone || 'N/A'}`);
      console.log(`   Address: ${biz.address || 'N/A'}`);
      console.log(`   Place ID: ${biz.place_id || 'N/A'}`);
      console.log(`   GBP Claimed: ${biz.isGbpClaimed ? '✅ Yes' : '🎯 NO (Hot Lead!)'}`);
      console.log(`   Google Maps: ${biz.googleMapsUrl || 'N/A'}`);
      console.log(`   Coordinates: ${biz.latitude && biz.longitude ? `${biz.latitude}, ${biz.longitude}` : 'N/A'}`);
      console.log();
    });
    
    // Stats
    console.log('='.repeat(80));
    console.log('STATISTICS:');
    console.log('='.repeat(80));
    console.log();
    console.log(`Total Found: ${result.total_found}`);
    console.log(`Source: ${result.source}`);
    console.log(`Search Time: ${result.search_time_ms}ms`);
    
    const withWebsite = result.businesses.filter(b => b.website).length;
    const withGbp = result.businesses.filter(b => b.place_id).length;
    const unclaimedGbp = result.businesses.filter(b => b.place_id && !b.isGbpClaimed).length;
    const lowRating = result.businesses.filter(b => b.rating && b.rating < 3.5).length;
    const fewReviews = result.businesses.filter(b => b.review_count && b.review_count < 10).length;
    
    console.log(`\nWith Website: ${withWebsite}/${result.total_found} (${((withWebsite/result.total_found)*100).toFixed(1)}%)`);
    console.log(`With GBP: ${withGbp}/${result.total_found} (${((withGbp/result.total_found)*100).toFixed(1)}%)`);
    console.log(`🎯 Unclaimed GBP: ${unclaimedGbp}/${withGbp} (${withGbp > 0 ? ((unclaimedGbp/withGbp)*100).toFixed(1) : 0}%)`);
    console.log(`Low Rating (<3.5): ${lowRating}/${result.total_found}`);
    console.log(`Few Reviews (<10): ${fewReviews}/${result.total_found}`);
    
    console.log();
    console.log('='.repeat(80));
    console.log('✅ TEST COMPLETE!');
    console.log('='.repeat(80));
    
    return result;
    
  } catch (error) {
    console.error('❌ Test failed:', error);
    if (error instanceof Error) {
      console.error('Error details:', error.message);
      console.error('Stack:', error.stack);
    }
    process.exit(1);
  }
}

// Run test
testDiscovery()
  .then(() => {
    console.log('\n✅ All tests passed!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ Test failed:', error);
    process.exit(1);
  });
