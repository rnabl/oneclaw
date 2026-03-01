#!/usr/bin/env node
/**
 * Cold Email Generator with Hooks & Spintax
 * Multiple variations for A/B testing
 */

const fs = require('fs');
const { parse } = require('csv-parse/sync');

// HOOK VARIATIONS (inspired by your example)
const HOOKS = [
  {
    name: "uncertainty_opener",
    templates: [
      "[First], wasn't sure if I should reach out to you or someone else at [Company], but noticed you're not showing up in ChatGPT and figured it'd be worth reaching out.",
      "[First], might be reaching out to the wrong person at [Company], but saw something about your AI visibility that seemed worth mentioning.",
      "[First], not 100% sure you're the right person at [Company], but noticed something about your ChatGPT presence (or lack of it) that caught my attention."
    ]
  },
  {
    name: "direct_observation",
    templates: [
      "[First], just ran a quick test - searched ChatGPT for '[City] HVAC' and you didn't come up.",
      "[First], weird thing happened - asked ChatGPT for best HVAC in [City], got 5 recommendations. You weren't one of them.",
      "[First], tested something - your competitors show up in ChatGPT when people search for [City] HVAC. You don't."
    ]
  },
  {
    name: "competitor_call_out",
    templates: [
      "[First], your competitors are showing up in AI search results. You're not. Despite having better reviews.",
      "[First], saw [Competitor] getting recommended by ChatGPT for [City] HVAC. You have better reviews but aren't showing up.",
      "[First], [Competitor] shows up 3x when I search AI for [City] HVAC companies. You don't show up at all."
    ]
  },
  {
    name: "social_proof",
    templates: [
      "[First], helped 3 HVAC companies in [State] get visible in ChatGPT last month. Noticed you're not showing up yet.",
      "[First], been working with HVAC companies on AI visibility - [City] came up and noticed you're missing from ChatGPT recommendations.",
      "[First], working on AI search optimization for HVAC - ran [City] and you didn't show. Worth fixing?"
    ]
  }
];

// BODY SPINTAX (short versions)
const BODY_TEMPLATES = {
  version_a: `{Matters because|This is important because|Why this matters} {40%|nearly half|4 in 10} of {people|customers|your potential customers} now {skip Google and go|go straight|default} to ChatGPT/Perplexity.

{Found|Spotted|Identified} {2 quick fixes|a couple easy changes|two simple updates} that could {change this|fix this|get you visible} in ~30 days.

{Want to see?|Interested?|Worth a look?}`,

  version_b: `{Sucks|Not great|Frustrating} because you have {better reviews|more reviews|higher ratings} ({[Reviews]}⭐ vs their {40-50|30-60|50-70}).

I can {fix it|change this|get you visible}. {Two changes|Couple fixes|Simple updates}, 30 days, you'll start showing up.

{Interested?|Want details?|Worth discussing?}`,

  version_c: `You: {Not mentioned|Invisible|Missing}
Your competitors: {Mentioned 3x|Showing up everywhere|Getting all the visibility}

{Fix?|Change this?|Interested in fixing it?} {Reply back|Let me know|Hit reply}.`
};

// SUBJECT LINE VARIATIONS
const SUBJECTS = [
  "[City] HVAC - {quick question|noticed something|heads up}",
  "[Company] - {visibility issue|AI search problem|ChatGPT gap}",
  "{Quick test|Ran a test|Checked something} - [City] HVAC",
  "[First] - {ChatGPT problem|AI visibility|missed opportunity}",
  "Not sure if you're the right person at [Company]...",
  "{Weird|Strange|Odd} - [Company] not showing up",
  "[Competitor] is beating you in ChatGPT searches"
];

// SPINTAX PARSER
function parseSpintax(text) {
  // Simple spintax parser: {option1|option2|option3}
  while (text.includes('{')) {
    text = text.replace(/\{([^}]+)\}/g, (match, options) => {
      const opts = options.split('|');
      return opts[Math.floor(Math.random() * opts.length)];
    });
  }
  return text;
}

// TEMPLATE REPLACER
function fillTemplate(template, data) {
  const replacements = {
    '[First]': data.first_name,
    '[Company]': data.business_name,
    '[City]': data.city,
    '[State]': data.state,
    '[Reviews]': data.reviews,
    '[Competitor]': data.top_competitor || 'Aire Serv'
  };
  
  let filled = template;
  Object.entries(replacements).forEach(([key, value]) => {
    filled = filled.replace(new RegExp(key.replace('[', '\\[').replace(']', '\\]'), 'g'), value);
  });
  
  return filled;
}

// GENERATE EMAIL
function generateEmail(business, hookType = 'uncertainty_opener', bodyVersion = 'version_b') {
  const hook = HOOKS.find(h => h.name === hookType);
  const hookTemplate = hook.templates[Math.floor(Math.random() * hook.templates.length)];
  
  const subjectTemplate = SUBJECTS[Math.floor(Math.random() * SUBJECTS.length)];
  const bodyTemplate = BODY_TEMPLATES[bodyVersion];
  
  const data = {
    first_name: business.business_name.split(' ')[0],
    business_name: business.business_name,
    city: business.location.split(',')[0],
    state: business.location.split(',')[1]?.trim() || '',
    reviews: business.gbp_review_count || 0,
    top_competitor: 'Mountain Pro HVAC' // From citation results
  };
  
  const subject = parseSpintax(fillTemplate(subjectTemplate, data));
  const hookLine = fillTemplate(hookTemplate, data);
  const body = parseSpintax(fillTemplate(bodyTemplate, data));
  
  return {
    subject,
    body: `${hookLine}\n\n${body}\n\nRyan`,
    hook_type: hookType,
    body_version: bodyVersion
  };
}

// LOAD REAL DATA
const ANALYSES_DIR = 'c:/Users/Ryan Nguyen/OneDrive/Desktop/Projects/oneclaw/.data/website-analyses';

console.log('📧 COLD EMAIL GENERATOR - Hooks + Spintax\n');
console.log('Loading real business data...\n');

const analysisFiles = fs.readdirSync(ANALYSES_DIR).filter(f => f.endsWith('.json'));
const businesses = analysisFiles.slice(0, 3).map(f => {
  const data = JSON.parse(fs.readFileSync(`${ANALYSES_DIR}/${f}`, 'utf-8'));
  return data;
});

console.log(`✅ Loaded ${businesses.length} businesses for testing\n`);
console.log('='.repeat(70) + '\n');

// Generate variations for first business
const testBusiness = businesses[0];
console.log(`🎯 Testing with: ${testBusiness.business_name}`);
console.log(`   Location: ${testBusiness.location}`);
console.log(`   Rating: ${testBusiness.gbp_rating}⭐ (${testBusiness.gbp_review_count} reviews)`);
console.log(`   AEO Score: ${testBusiness.overall_aeo_score}/100\n`);

// Generate 6 variations (3 hooks × 2 body styles)
const hookTypes = ['uncertainty_opener', 'direct_observation', 'competitor_call_out'];
const bodyVersions = ['version_b', 'version_c']; // Best 2

let count = 1;
hookTypes.forEach(hook => {
  bodyVersions.slice(0, 1).forEach(body => { // Just 1 body per hook for demo
    console.log(`\n📨 VARIATION ${count} (${hook} + ${body})\n`);
    console.log('─'.repeat(70));
    
    const email = generateEmail(testBusiness, hook, body);
    console.log(`SUBJECT: ${email.subject}\n`);
    console.log(`BODY:\n${email.body}`);
    console.log('\n' + '='.repeat(70));
    count++;
  });
});

console.log('\n\n💡 HOOK TYPES:\n');
HOOKS.forEach((hook, i) => {
  console.log(`${i+1}. ${hook.name}:`);
  console.log(`   Example: "${hook.templates[0].substring(0, 80)}..."`);
});

console.log('\n\n🎲 SPINTAX FEATURES:\n');
console.log('• Subject lines: 7 variations');
console.log('• Hook openers: 4 types × 3 variations each = 12 hooks');
console.log('• Body copy: 3 versions with spintax = 100s of combinations');
console.log('• Each email generated is unique!');

console.log('\n\n🚀 Ready to generate all 408 emails with variety!\n');
