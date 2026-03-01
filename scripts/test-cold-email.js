#!/usr/bin/env node
/**
 * Cold Email Generator - Test One
 * Generate personalized outreach based on website analysis
 */

const fs = require('fs');

// Example business from analysis
const business = {
  "overall_aeo_score": 78,
  "business_name": "The Cooling Company - Henderson HVAC & Plumbing",
  "location": "Henderson, Nevada",
  "gbp_rating": 5,
  "gbp_review_count": 129,
  "website": "https://thecoolingco.com/henderson",
  "aeo_readiness": {
    "score": 75,
    "quick_wins": [
      "Expand FAQ content to address more specific HVAC queries.",
      "Incorporate HowTo schema for common HVAC maintenance tasks."
    ]
  },
  "ai_visibility_gap": {
    "primary_gap": "Lack of conversational content and authority signals.",
    "invisible_for": "Queries related to HVAC troubleshooting and maintenance.",
    "low_hanging_fruit": "Adding HowTo schema and expanding FAQ content."
  },
  "gbp_analysis": {
    "score": 90,
    "critical_issues": [
      "No recent posts or Q&A engagement.",
      "Missing appointment booking link in GBP."
    ]
  }
};

// EMAIL TEMPLATE - Version A (Direct Value)
const emailA = {
  subject: `Missing 40% of HVAC leads? (AI visibility gap spotted)`,
  
  body: `Hey {{first_name}},

I ran a quick AI search for "best HVAC company in {{city}}" and noticed something concerning:

**{{business_name}} isn't showing up in AI-generated recommendations.**

This matters because:
- 40% of people now use ChatGPT/Perplexity instead of Google
- Your 5-star rating ({{reviews}} reviews) deserves better visibility
- Your competitors ARE being cited by AI assistants

**Your Quick Win:** I spotted 2 fixes that could get you cited within 30 days:
1. {{quick_win_1}}
2. {{quick_win_2}}

Want to see the full analysis? I'll send over a video breakdown of exactly what's blocking your AI visibility.

Reply "SHOW ME" and I'll get it over today.

Ryan
OneClaw AI`
};

// EMAIL TEMPLATE - Version B (Curiosity + Social Proof)
const emailB = {
  subject: `{{business_name}} - AI visibility audit (Henderson HVAC)`,
  
  body: `{{first_name}},

Ran AI searches for HVAC companies in Henderson...

**You're invisible.**

While you have killer reviews ({{rating}}⭐, {{reviews}} reviews), AI assistants like ChatGPT aren't recommending you when people search for:
- "best HVAC company near me"
- "emergency AC repair Henderson"
- "reliable heating and cooling services"

**Your competitors are.** They're getting cited 2-3x per search.

I found {{score}}/100 on your AEO (Answer Engine Optimization) - which means there's low-hanging fruit:

✅ {{quick_win_1}}
✅ {{quick_win_2}}

These alone could get you 30-40% more qualified leads.

Want the full breakdown? I recorded a 3-min Loom showing exactly what's missing.

Just reply "SEND IT" and I'll drop the link.

Ryan
OneClaw AI

P.S. We're doing this for 5 Henderson HVAC companies this week. First to respond gets priority.`
};

// EMAIL TEMPLATE - Version C (Ultra Short + Pattern Interrupt)
const emailC = {
  subject: `Quick Q: Do you show up in ChatGPT? 🤔`,
  
  body: `{{first_name}},

Just searched ChatGPT for "best HVAC companies in {{city}}"

Your competitors showed up.

You didn't.

Want to fix this?

Ryan`
};

// Fill in template
function fillTemplate(template, data) {
  let filled = JSON.parse(JSON.stringify(template));
  
  const firstName = data.business_name.split(' ')[0];
  const city = data.location.split(',')[0];
  
  const replacements = {
    '{{first_name}}': firstName,
    '{{business_name}}': data.business_name,
    '{{city}}': city,
    '{{reviews}}': data.gbp_review_count,
    '{{rating}}': data.gbp_rating,
    '{{score}}': data.overall_aeo_score,
    '{{quick_win_1}}': data.aeo_readiness.quick_wins[0],
    '{{quick_win_2}}': data.aeo_readiness.quick_wins[1]
  };
  
  Object.entries(replacements).forEach(([key, value]) => {
    filled.subject = filled.subject.replace(new RegExp(key, 'g'), value);
    filled.body = filled.body.replace(new RegExp(key, 'g'), value);
  });
  
  return filled;
}

console.log('🎯 COLD EMAIL TEST - 3 Variations\n');
console.log('Business: The Cooling Company - Henderson HVAC & Plumbing');
console.log('5⭐ (129 reviews) | AEO Score: 78/100');
console.log('\n' + '='.repeat(70) + '\n');

console.log('📧 VERSION A - Direct Value\n');
console.log('─'.repeat(70));
const filledA = fillTemplate(emailA, business);
console.log(`SUBJECT: ${filledA.subject}\n`);
console.log('BODY:');
console.log(filledA.body);
console.log('\n' + '='.repeat(70) + '\n');

console.log('📧 VERSION B - Curiosity + Social Proof\n');
console.log('─'.repeat(70));
const filledB = fillTemplate(emailB, business);
console.log(`SUBJECT: ${filledB.subject}\n`);
console.log('BODY:');
console.log(filledB.body);
console.log('\n' + '='.repeat(70) + '\n');

console.log('📧 VERSION C - Ultra Short (Pattern Interrupt)\n');
console.log('─'.repeat(70));
const filledC = fillTemplate(emailC, business);
console.log(`SUBJECT: ${filledC.subject}\n`);
console.log('BODY:');
console.log(filledC.body);
console.log('\n' + '='.repeat(70) + '\n');

console.log('💡 RECOMMENDATIONS:\n');
console.log('• Version A: Best for cold email (clear value prop)');
console.log('• Version B: Best for LinkedIn (social proof + urgency)');
console.log('• Version C: Best for follow-up (pattern interrupt)');
console.log('\n🎯 Test all 3 and track reply rates!');
