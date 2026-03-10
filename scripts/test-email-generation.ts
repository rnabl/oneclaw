/**
 * Test Email Generation Quality
 * 
 * Generates a batch of test emails and validates them against quality criteria:
 * - Word count (40-75 words)
 * - No em dashes
 * - No duplicate phrases
 * - Proper apostrophes
 * - Subject line format
 * - Uniqueness across batch
 */

import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';

dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

interface QualityCheck {
  pass: boolean;
  issues: string[];
  warnings: string[];
}

function countWords(text: string): number {
  return text.trim().split(/\s+/).length;
}

function checkEmailQuality(subject: string, body: string, index: number): QualityCheck {
  const issues: string[] = [];
  const warnings: string[] = [];
  
  // 1. Word count (40-75 words)
  const wordCount = countWords(body);
  if (wordCount < 40) {
    issues.push(`Too short: ${wordCount} words (min 40)`);
  } else if (wordCount > 75) {
    issues.push(`Too long: ${wordCount} words (max 75)`);
  } else if (wordCount < 45) {
    warnings.push(`Near minimum: ${wordCount} words`);
  } else if (wordCount > 70) {
    warnings.push(`Near maximum: ${wordCount} words`);
  }
  
  // 2. Em dashes check
  if (body.includes('—')) {
    issues.push('Contains em dash (—)');
  }
  
  // 3. Subject line checks
  if (subject !== subject.toLowerCase()) {
    issues.push('Subject not lowercase');
  }
  
  if (subject.includes('—')) {
    issues.push('Subject contains em dash');
  }
  
  // Check for duplicate segments in subject (e.g., "quick question, ... quick question")
  const subjectSegments = subject.split(',').map(s => s.trim().toLowerCase());
  const uniqueSegments = [...new Set(subjectSegments)];
  if (subjectSegments.length !== uniqueSegments.length) {
    issues.push('Subject has duplicate phrases');
  }
  
  // 4. Check for proper apostrophes in possessives
  const possessivePattern = /\b(\w+)s\s+(review|feedback)/gi;
  const matches = subject.match(possessivePattern);
  if (matches) {
    matches.forEach(match => {
      if (!match.includes("'")) {
        warnings.push(`Possible missing apostrophe: "${match}"`);
      }
    });
  }
  
  // 5. Check for common issues
  if (body.includes('  ')) {
    warnings.push('Contains double spaces');
  }
  
  if (body.match(/[.!?]\s+[a-z]/)) {
    warnings.push('Lowercase after sentence end');
  }
  
  // 6. Check for placeholder text
  if (body.includes('...') || body.includes('[') || body.includes(']')) {
    warnings.push('Contains placeholder-like text');
  }
  
  // 7. Check structure (should have greeting, body, CTA, signature)
  const lines = body.split('\n').filter(l => l.trim());
  if (lines.length < 4) {
    warnings.push(`Possibly missing structure elements (${lines.length} lines)`);
  }
  
  return {
    pass: issues.length === 0,
    issues,
    warnings
  };
}

function checkUniqueness(emails: Array<{ subject: string; body: string }>): {
  duplicateSubjects: number;
  duplicateBodies: number;
  similarityWarnings: string[];
} {
  const subjects = emails.map(e => e.subject.toLowerCase());
  const bodies = emails.map(e => e.body.toLowerCase().replace(/\s+/g, ' '));
  
  const uniqueSubjects = new Set(subjects);
  const uniqueBodies = new Set(bodies);
  
  const duplicateSubjects = subjects.length - uniqueSubjects.size;
  const duplicateBodies = bodies.length - uniqueBodies.size;
  
  // Check for very similar emails (>80% word overlap)
  const similarityWarnings: string[] = [];
  for (let i = 0; i < bodies.length; i++) {
    for (let j = i + 1; j < bodies.length; j++) {
      const words1 = new Set(bodies[i].split(/\s+/));
      const words2 = new Set(bodies[j].split(/\s+/));
      const intersection = new Set([...words1].filter(w => words2.has(w)));
      const similarity = intersection.size / Math.min(words1.size, words2.size);
      
      if (similarity > 0.8) {
        similarityWarnings.push(`Emails ${i + 1} and ${j + 1} are ${(similarity * 100).toFixed(0)}% similar`);
      }
    }
  }
  
  return {
    duplicateSubjects,
    duplicateBodies,
    similarityWarnings
  };
}

async function testBatch(batchSize: number = 20) {
  console.log('\n🧪 Email Generation Quality Test\n');
  console.log('='.repeat(60));
  console.log(`Generating ${batchSize} test emails...\n`);
  
  // Get test leads from database
  const { data: existing } = await supabase
    .schema('crm')
    .from('home_services_leads')
    .select('email');
  
  const existingEmails = new Set(existing?.map(l => l.email.toLowerCase()) || []);
  
  const { data: leads } = await supabase
    .schema('crm')
    .from('leads')
    .select('*')
    .not('email', 'is', null)
    .order('google_rating', { ascending: false })
    .range(0, batchSize * 5);
  
  if (!leads || leads.length === 0) {
    console.log('❌ No leads found');
    return;
  }
  
  // Filter to leads with signals
  const testLeads = leads
    .filter(lead => !existingEmails.has(lead.email.toLowerCase()))
    .filter(lead => {
      // Has hiring signal
      const hasHiring = lead.source_type === 'job_posting' || 
                       lead.source_metadata?.job_postings?.length > 0 ||
                       lead.source_metadata?.job_title;
      
      // Has reviews signal
      const reviews = lead.source_metadata?.reviews || [];
      const hasReviews = reviews.some((r: any) => 
        r.rating === 5 && 
        r.reviewer_name && 
        r.reviewer_name.split(' ').length >= 2
      );
      
      return hasHiring || hasReviews;
    })
    .slice(0, batchSize);
  
  console.log(`Found ${testLeads.length} test leads with signals\n`);
  
  // Import generation functions from the main script
  // For now, we'll just check existing campaigns
  
  const { data: campaigns } = await supabase
    .schema('crm')
    .from('home_services_campaigns')
    .select(`
      id,
      subject,
      body,
      signal_used,
      template_variant,
      created_at
    `)
    .order('created_at', { ascending: false })
    .limit(batchSize);
  
  if (!campaigns || campaigns.length === 0) {
    console.log('⚠️  No campaigns found. Run generate-home-services-campaigns.ts first.\n');
    console.log('💡 Suggestion: Set DRY_RUN=false and BATCH_SIZE=20 in the generator script\n');
    return;
  }
  
  console.log(`Testing ${campaigns.length} existing campaigns\n`);
  console.log('='.repeat(60));
  
  // Quality checks
  let passCount = 0;
  let issueCount = 0;
  let warningCount = 0;
  
  const allEmails: Array<{ subject: string; body: string }> = [];
  
  campaigns.forEach((campaign, index) => {
    const check = checkEmailQuality(campaign.subject, campaign.body, index + 1);
    allEmails.push({ subject: campaign.subject, body: campaign.body });
    
    if (check.pass) {
      passCount++;
      console.log(`\n✅ Campaign ${index + 1}: PASS`);
    } else {
      issueCount++;
      console.log(`\n❌ Campaign ${index + 1}: FAIL`);
    }
    
    console.log(`   Signal: ${campaign.signal_used} (${campaign.template_variant})`);
    console.log(`   Subject: "${campaign.subject}"`);
    console.log(`   Word count: ${countWords(campaign.body)}`);
    
    if (check.issues.length > 0) {
      console.log(`   Issues:`);
      check.issues.forEach(issue => console.log(`     - ${issue}`));
    }
    
    if (check.warnings.length > 0) {
      warningCount += check.warnings.length;
      console.log(`   Warnings:`);
      check.warnings.forEach(warning => console.log(`     ⚠️  ${warning}`));
    }
    
    // Show preview for first 3
    if (index < 3) {
      console.log(`\n   Preview:`);
      console.log(`   ${'-'.repeat(50)}`);
      const preview = campaign.body.split('\n').slice(0, 5).join('\n   ');
      console.log(`   ${preview}`);
      console.log(`   ${'-'.repeat(50)}`);
    }
  });
  
  // Uniqueness check
  console.log('\n' + '='.repeat(60));
  console.log('\n🔍 Uniqueness Analysis\n');
  
  const uniqueness = checkUniqueness(allEmails);
  
  console.log(`Duplicate subjects: ${uniqueness.duplicateSubjects}`);
  console.log(`Duplicate bodies: ${uniqueness.duplicateBodies}`);
  
  if (uniqueness.similarityWarnings.length > 0) {
    console.log(`\nSimilarity warnings:`);
    uniqueness.similarityWarnings.forEach(warning => {
      console.log(`  ⚠️  ${warning}`);
    });
  }
  
  // Summary
  console.log('\n' + '='.repeat(60));
  console.log('\n📊 Summary\n');
  
  const passRate = (passCount / campaigns.length * 100).toFixed(1);
  console.log(`✅ Passed: ${passCount}/${campaigns.length} (${passRate}%)`);
  console.log(`❌ Failed: ${issueCount}/${campaigns.length}`);
  console.log(`⚠️  Total warnings: ${warningCount}`);
  
  const uniquenessRate = ((allEmails.length - uniqueness.duplicateBodies) / allEmails.length * 100).toFixed(1);
  console.log(`\n🎨 Uniqueness: ${uniquenessRate}%`);
  
  if (passCount === campaigns.length && uniqueness.duplicateBodies === 0) {
    console.log(`\n🎉 All campaigns passed quality checks!`);
  } else {
    console.log(`\n⚠️  Some issues found. Review above for details.`);
  }
  
  console.log('\n' + '='.repeat(60));
}

// Run test
const batchSize = parseInt(process.argv[2]) || 20;
testBatch(batchSize).catch(console.error);
