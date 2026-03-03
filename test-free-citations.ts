import { config } from 'dotenv';

config();

async function testFreeCitationChecker() {
  console.log('🧪 Testing Free Citation Checker...\n');
  
  // Import the handler directly
  const { checkCitationsHandler } = await import('./packages/harness/src/tools/check-citations-free');
  
  const testBusiness = {
    businessName: 'Uplift Outdoor',
    city: 'Pearland',
    state: 'TX',
  };
  
  console.log(`📋 Testing: ${testBusiness.businessName}`);
  console.log(`   Location: ${testBusiness.city}, ${testBusiness.state}\n`);
  console.log('⏳ Checking 20 directories (this may take 30-60 seconds)...\n');
  
  const startTime = Date.now();
  
  try {
    const result = await checkCitationsHandler(testBusiness, { tenantId: 'test' });
    
    const duration = ((Date.now() - startTime) / 1000).toFixed(1);
    
    console.log(`✅ Check complete in ${duration}s\n`);
    console.log('📊 Results:');
    console.log(`   Citations Found: ${result.citationsFound}/${result.citationsChecked}`);
    console.log(`   Consistency Score: ${result.consistencyScore}%\n`);
    
    // Group by tier
    const byTier: Record<number, any[]> = {};
    result.results.forEach(r => {
      if (!byTier[r.tier]) byTier[r.tier] = [];
      byTier[r.tier].push(r);
    });
    
    for (const tier of [1, 2, 3, 4]) {
      if (!byTier[tier]) continue;
      
      console.log(`\n🏆 Tier ${tier} Directories:`);
      byTier[tier].forEach(r => {
        if (r.found) {
          const nameMatch = r.matches?.name ? '✓' : '✗';
          console.log(`   ✅ ${r.directory.padEnd(30)} ${nameMatch} Name${r.name ? `: ${r.name}` : ''}`);
        } else {
          const reason = r.error ? ` (${r.error})` : '';
          console.log(`   ❌ ${r.directory.padEnd(30)} Not found${reason}`);
        }
      });
    }
    
    console.log('\n💰 Cost: $0.00 (FREE!)');
    console.log('\n✅ Test successful!');
    
  } catch (error) {
    console.error('❌ Test failed:', error);
    if (error instanceof Error) {
      console.error('Stack:', error.stack);
    }
  }
}

testFreeCitationChecker().catch(console.error);
