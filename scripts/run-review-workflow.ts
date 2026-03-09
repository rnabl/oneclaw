/**
 * Trigger Review Scraping Workflow via Harness
 */

import * as dotenv from 'dotenv';
import * as path from 'path';

// Load environment variables
dotenv.config({ path: path.resolve(process.cwd(), '.env.production') });
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });
dotenv.config({ path: path.resolve(process.cwd(), '.env') });

import '../packages/harness/src/workflows';
import { runner } from '../packages/harness/src/execution/runner';

async function runReviewScraping() {
  console.log('🚀 Starting review scraping workflow...\n');

  try {
    const result = await runner.execute('scrape-reviews', {
      // Test with just 5 leads first
      batchSize: 5,
      
      // Skip leads that already have reviews
      skipExisting: true,
    }, {
      tenantId: 'manual-script',
      tier: 'pro',
    });

    console.log('\n✅ Workflow complete!');
    console.log(JSON.stringify(result, null, 2));

  } catch (error) {
    console.error('❌ Workflow failed:', error);
    process.exit(1);
  }
}

runReviewScraping();
