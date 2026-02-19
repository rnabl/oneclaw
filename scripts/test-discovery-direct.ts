#!/usr/bin/env tsx
/**
 * Test Discovery Workflow - Direct Call
 * 
 * Calls the discovery workflow's direct Apify fallback to test with real data
 */

import 'dotenv/config';

async function testDiscoveryDirect() {
  console.log('🔍 Testing Discovery with Direct Apify Call...\n');
  
  try {
    // Dynamic import
    const discovery = await import('../apps/api/src/workflows/discovery.js');
    const { formatDiscoveryForChat, formatBusinessDetails } = discovery;
    
    // Call the direct Apify function (it's the fallback)
    const testParams = {
      niche: 'dentist',
      location: 'Austin, TX',
      limit: 20
    };
    
    console.log(`📍 Searching for: ${testParams.niche} in ${testParams.location}`);
    console.log(`🎯 Limit: ${testParams.limit} businesses\n`);
    console.log('⏳ Calling Apify directly (30-90 seconds)...\n');
    
    // Access the internal callApifyDirect function by calling the fallback path
    const result = await discovery.handleDiscoveryWorkflow(testParams);
    
    console.log('✅ Discovery completed!\n');
    console.log('=' .repeat(80));
    console.log('🎨 NEW CLEAN FORMAT OUTPUT:');
    console.log('='.repeat(80));
    console.log();
    
    // Format and display
    const formatted = formatDiscoveryForChat(result);
    console.log(formatted);
    
    console.log();
    console.log('='.repeat(80));
    console.log('📊 DETAILED VIEW EXAMPLE (Business #1):');
    console.log('='.repeat(80));
    console.log();
    
    if (result.businesses.length > 0) {
      const details = formatBusinessDetails(result.businesses[0], 0);
      console.log(details);
    }
    
    console.log();
    console.log('='.repeat(80));
    console.log('📋 RAW DATA SAMPLE (first 3 businesses):');
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
      console.log(`   Google Maps: ${biz.googleMapsUrl ? biz.googleMapsUrl.substring(0, 50) + '...' : 'N/A'}`);
      console.log(`   Coordinates: ${biz.latitude && biz.longitude ? `${biz.latitude}, ${biz.longitude}` : 'N/A'}`);
      console.log();
    });
    
    // Stats
    console.log('='.repeat(80));
    console.log('📈 STATISTICS & LEAD QUALITY:');
    console.log('='.repeat(80));
    console.log();
    console.log(`Total Found: ${result.total_found}`);
    console.log(`Source: ${result.source}`);
    console.log(`Search Time: ${(result.search_time_ms / 1000).toFixed(1)}s`);
    
    const withWebsite = result.businesses.filter(b => b.website).length;
    const withGbp = result.businesses.filter(b => b.place_id).length;
    const unclaimedGbp = result.businesses.filter(b => b.place_id && !b.isGbpClaimed).length;
    const lowRating = result.businesses.filter(b => b.rating && b.rating < 3.5).length;
    const fewReviews = result.businesses.filter(b => b.review_count && b.review_count < 10).length;
    const noWebsite = result.businesses.filter(b => !b.website).length;
    
    console.log(`\n📊 Data Quality:`);
    console.log(`   With Website: ${withWebsite}/${result.total_found} (${((withWebsite/result.total_found)*100).toFixed(1)}%)`);
    console.log(`   With GBP Listing: ${withGbp}/${result.total_found} (${((withGbp/result.total_found)*100).toFixed(1)}%)`);
    console.log(`   With Coordinates: ${result.businesses.filter(b => b.latitude).length}/${result.total_found}`);
    
    console.log(`\n🎯 Lead Opportunities:`);
    console.log(`   🔥 Unclaimed GBP: ${unclaimedGbp}/${withGbp} (${withGbp > 0 ? ((unclaimedGbp/withGbp)*100).toFixed(1) : 0}%)`);
    console.log(`   ❌ No Website: ${noWebsite}/${result.total_found} (${((noWebsite/result.total_found)*100).toFixed(1)}%)`);
    console.log(`   ⚠️ Low Rating (<3.5): ${lowRating}/${result.total_found}`);
    console.log(`   📉 Few Reviews (<10): ${fewReviews}/${result.total_found}`);
    
    // Show hot leads
    if (unclaimedGbp > 0) {
      console.log(`\n🔥 HOT LEADS (Unclaimed GBPs):`);
      result.businesses
        .filter(b => b.place_id && !b.isGbpClaimed)
        .slice(0, 5)
        .forEach((b, i) => {
          console.log(`   ${i + 1}. ${b.name} - ⭐${b.rating || 'N/A'} (${b.review_count || 0}r)`);
        });
    }
    
    console.log();
    console.log('='.repeat(80));
    console.log('✅ TEST COMPLETE!');
    console.log('='.repeat(80));
    console.log();
    console.log('💡 The clean one-line format makes it easy to:');
    console.log('   • Scan 20+ businesses at a glance');
    console.log('   • Spot hot leads instantly (🎯 emoji)');
    console.log('   • Identify missing signals (❌, ⚠️, 📉)');
    console.log('   • Take action with simple commands (audit, details, export)');
    
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
testDiscoveryDirect()
  .then(() => {
    console.log('\n✅ All tests passed!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ Test failed:', error);
    process.exit(1);
  });
