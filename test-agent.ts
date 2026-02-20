/**
 * Test the Universal Discovery Agent
 * 
 * This is an OpenClaw-style agent that uses vision to:
 * 1. See what's on screen
 * 2. Think about what to do
 * 3. Act (click, type, scroll)
 * 4. Loop until goal achieved
 * 
 * Run with: npx ts-node test-agent.ts
 */

import * as dotenv from 'dotenv';
import { resolve } from 'path';

// Load env
dotenv.config({ path: resolve(__dirname, '.env.local') });

import { runAgent } from './packages/harness/src/workflows/discovery';

async function main() {
  const apiKey = process.env.GOOGLE_API_KEY;
  
  if (!apiKey) {
    console.error('❌ GOOGLE_API_KEY not found in .env.local');
    console.error('Add: GOOGLE_API_KEY=your-key-here');
    process.exit(1);
  }

  console.log('🤖 Starting Universal Discovery Agent');
  console.log('=====================================\n');

  // Test Case: Find golf tee times
  const result = await runAgent(
    // The goal - in natural language, just like you'd tell a human
    'Find available golf tee times for 4 players. Look for times between 9:00 AM and 10:00 AM. ' +
    'I need to see what tee times are available and their prices.',
    
    // Starting URL
    'https://www.riverdalegolf.com/teetimes/',
    
    // API Key
    apiKey,
    
    // Options
    {
      maxIterations: 10,
      extractData: true,
      debug: true,
    }
  );

  console.log('\n=====================================');
  console.log('📊 RESULT');
  console.log('=====================================');
  console.log(`Success: ${result.success}`);
  console.log(`Iterations: ${result.iterations}`);
  console.log(`Actions taken:`);
  result.actions.forEach((action, i) => {
    console.log(`  ${i + 1}. ${action}`);
  });
  
  if (result.data) {
    console.log('\n📋 Extracted Data:');
    console.log(JSON.stringify(result.data, null, 2));
  }
  
  if (result.error) {
    console.log(`\n❌ Error: ${result.error}`);
  }

  // Save screenshots for debugging
  if (result.screenshots && result.screenshots.length > 0) {
    const fs = await import('fs');
    const path = await import('path');
    const debugDir = path.join(__dirname, 'debug-screenshots');
    
    if (!fs.existsSync(debugDir)) {
      fs.mkdirSync(debugDir, { recursive: true });
    }
    
    console.log(`\n📸 Saving ${result.screenshots.length} screenshots to ./debug-screenshots/`);
    
    for (let i = 0; i < result.screenshots.length; i++) {
      const filePath = path.join(debugDir, `step-${i + 1}.png`);
      fs.writeFileSync(filePath, Buffer.from(result.screenshots[i], 'base64'));
      console.log(`  Saved: step-${i + 1}.png`);
    }
  }
}

main().catch(console.error);
