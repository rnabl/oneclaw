const testUrl = 'http://localhost:9000';

async function testAPI() {
  console.log('Testing Harness API...\n');
  
  // Test 1: Health check
  try {
    const health = await fetch(`${testUrl}/health`);
    console.log('✅ Health:', health.status, await health.text());
  } catch (e) {
    console.log('❌ Health failed:', e);
  }
  
  // Test 2: List tools
  try {
    const tools = await fetch(`${testUrl}/tools`);
    const toolsData = await tools.json();
    console.log('\n✅ Tools available:', toolsData.tools?.length || 0);
    const enrichTool = toolsData.tools?.find((t: any) => t.id === 'enrich-contact');
    if (enrichTool) {
      console.log('✅ enrich-contact tool found:', enrichTool.name);
    } else {
      console.log('❌ enrich-contact tool NOT found');
      console.log('Available tools:', toolsData.tools?.map((t: any) => t.id).slice(0, 10));
    }
  } catch (e) {
    console.log('❌ Tools failed:', e);
  }
  
  // Test 3: Execute enrich-contact
  try {
    console.log('\n🧪 Testing enrich-contact execution...');
    const result = await fetch(`${testUrl}/tools/enrich-contact/execute`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        input: {
          url: 'https://www.trinityheatcool.com/',
          businessName: 'Trinity Heating & Cooling',
          method: 'auto',
        },
        tenantId: 'default',
      })
    });
    
    console.log('Response status:', result.status);
    const data = await result.json();
    console.log('Response data:', JSON.stringify(data, null, 2));
  } catch (e) {
    console.log('❌ Execute failed:', e);
  }
}

testAPI().catch(console.error);
