const fs = require('fs');
const path = require('path');
const { parse } = require('csv-parse/sync');

// Spintax processor
function processSpin(text) {
  return text.replace(/\{([^{}]+)\}/g, (match, options) => {
    const choices = options.split('|');
    return choices[Math.floor(Math.random() * choices.length)];
  });
}

// Load CSV data
const csvPath = 'c:/Users/Ryan Nguyen/OneDrive/Desktop/Projects/oneclaw/.data/hvac-leads-clean.csv';
const csvData = fs.readFileSync(csvPath, 'utf-8');
const csvRecords = parse(csvData, { columns: true, skip_empty_lines: true });

// Create lookup by business name
const csvLookup = {};
csvRecords.forEach(row => {
  csvLookup[row.name.toLowerCase().trim()] = row;
});

// Load real business data and merge with CSV
const ANALYSES_DIR = 'c:/Users/Ryan Nguyen/OneDrive/Desktop/Projects/oneclaw/.data/website-analyses';
const analysisFiles = fs.readdirSync(ANALYSES_DIR).filter(f => f.endsWith('.json'));

// First pass: collect all businesses with matched data
const allBusinesses = analysisFiles.map(f => {
  const analysis = JSON.parse(fs.readFileSync(path.join(ANALYSES_DIR, f), 'utf-8'));
  
  // Find matching CSV record
  const csvMatch = csvLookup[analysis.business_name?.toLowerCase().trim()];
  
  // Parse location (e.g., "Pearland, Texas" -> city: "Pearland")
  const locationParts = analysis.location?.split(',').map(s => s.trim());
  const city = locationParts?.[0] || csvMatch?.city || 'your area';
  
  return {
    business_name: analysis.business_name,
    city: city,
    state: locationParts?.[1] || csvMatch?.state,
    rating: analysis.gbp_rating || csvMatch?.google_rating || '4.8',
    total_reviews: analysis.gbp_review_count || csvMatch?.google_review_count || '100+',
    aeo_score: analysis.overall_aeo_score || Math.floor(Math.random() * 30 + 40),
    quick_wins: analysis.aeo_readiness?.quick_wins || [
      'Add FAQ schema markup',
      'Optimize Google Business Profile'
    ],
    owner_name: csvMatch?.owner_name || null,
    owner_role: csvMatch?.owner_role || null,
    competitors: [] // We don't have this yet
  };
});

// Prioritize businesses WITH owner names for better demo quality
const withOwnerName = allBusinesses.filter(b => b.owner_name && b.owner_name.trim());
const withoutOwnerName = allBusinesses.filter(b => !b.owner_name || !b.owner_name.trim());

// Take 7 with owner names + 3 without to show both cases
const businesses = [...withOwnerName.slice(0, 7), ...withoutOwnerName.slice(0, 3)];

// Email templates with spintax
const SUBJECTS = [
  '{{business_name}} + ChatGPT',
  '{{city}} HVAC — quick question',
  'ChatGPT test for {{business_name}}',
  'AI search gap',
  'Ran your business through ChatGPT'
];

const HOOKS = {
  direct: [
    'Asked ChatGPT {who\'s the best HVAC company in {{city}}|for HVAC recs in {{city}}|about {{city}} HVAC}.\n\nYou {weren\'t mentioned|didn\'t come up|weren\'t on the list}.',
    '{Ran some searches|Tested this morning} — ChatGPT and Google AI {aren\'t recommending you|don\'t know you exist|skip right over you}.',
    'Your competitors are showing up in {ChatGPT|Google AI|AI search}.\n\nYou\'re not.'
  ],
  competitor: [
    '{Checked ChatGPT|Asked Google AI|Ran AI searches} for {{city}} HVAC.\n\n{Your competitors got cited|Others showed up|You didn\'t make the list}.',
    'People with {{rating}}⭐ reviews should be getting {more visibility|more AI traffic|cited by ChatGPT}.\n\nYou\'re {invisible|not showing up}.',
    'When AI recommends HVAC in {{city}}, {it\'s not you|your name doesn\'t come up|competitors win}.'
  ]
};

const BODY_TEMPLATE = `{{hook}}

{You've got|You have} {{rating}}⭐ with {{reviews}} reviews.

{But when people ask ChatGPT for HVAC help|When homeowners ask Google AI|When people search AI assistants}, you're not showing up.

{Quick fixes|Two changes}:
→ {{quick_win_1}}
→ {{quick_win_2}}

{That's probably 10-15 extra leads/month|Could unlock 30-40% more leads|Gets you in front of AI search}.

{Want to see the full audit|Want the breakdown|Interested}?

Ryan

P.S. {Running this for a few {{city}} companies this week|Only taking 3 more this month|First come basis}.`;

// Generate 10 emails
businesses.forEach((biz, idx) => {
  // Better first name handling
  const firstName = biz.owner_name?.split(' ')[0] || biz.business_name?.split(' ')[0] || 'Hi';
  
  const subject = processSpin(SUBJECTS[idx % SUBJECTS.length]
    .replace(/\{\{business_name\}\}/g, biz.business_name || 'Your Business')
    .replace(/\{\{city\}\}/g, biz.city));
  
  const hookType = idx % 2 === 0 ? 'direct' : 'competitor';
  const hook = processSpin(HOOKS[hookType][idx % HOOKS[hookType].length]
    .replace(/\{\{city\}\}/g, biz.city)
    .replace(/\{\{rating\}\}/g, biz.rating)
    .replace(/\{\{competitor_name\}\}/g, biz.competitors?.[0] || 'competitors'));
  
  const body = processSpin(BODY_TEMPLATE
    .replace('{{hook}}', hook)
    .replace(/\{\{rating\}\}/g, biz.rating)
    .replace(/\{\{reviews\}\}/g, biz.total_reviews)
    .replace(/\{\{score\}\}/g, biz.aeo_score)
    .replace(/\{\{quick_win_1\}\}/g, biz.quick_wins[0])
    .replace(/\{\{quick_win_2\}\}/g, biz.quick_wins[1])
    .replace(/\{\{city\}\}/g, biz.city));

  console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
EMAIL #${idx + 1}: ${biz.business_name} (${biz.city}, ${biz.state || ''})
Rating: ${biz.rating}⭐ (${biz.total_reviews} reviews) | AEO Score: ${biz.aeo_score}/100
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

SUBJECT: ${subject}

BODY:
${firstName},

${body}

`);
});
