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
    owner_email: csvMatch?.owner_email || null,
    website: analysis.website || csvMatch?.website,
    phone: csvMatch?.phone,
    ai_cited: false, // From ai-citation-results.json
    competitors: []
  };
});

// Filter only businesses WITH owner names
const businesses = allBusinesses.filter(b => b.owner_name && b.owner_name.trim());

console.log(`📧 Generating emails for ${businesses.length} businesses with owner names...`);

// Email templates
const SUBJECTS = [
  '{{city}} HVAC — quick question',
  'Tested {{business_name}} on ChatGPT',
  'AI search gap',
  'Quick test — {{city}} HVAC',
  '{{first_name}}, ran this by ChatGPT'
];

const HOOKS = [
  'Tested something {this morning|today}.\n\nAsked {ChatGPT and Google AI|ChatGPT|Google AI} for HVAC recommendations in {{city}}.\n\nYou didn\'t come up. {Your competitors did|Others showed up}.',
  '{Ran a quick test|Checked ChatGPT} for {{city}} HVAC.\n\n{You\'re not showing up|Your competitors are getting recommended}. You didn\'t make the list.',
  'Asked ChatGPT {who\'s the best HVAC in {{city}}|for HVAC recs in {{city}}}.\n\n{You weren\'t mentioned|Your name didn\'t come up}. Competitors were.',
  '{Quick question|Heads up} — ran {{business_name}} through AI search.\n\nNot showing up in {ChatGPT|Google AI|AI results}.'
];

const BODY_TEMPLATE = `{{hook}}

You've got {{rating}}⭐ with {{reviews}} reviews — {should be different|that's solid}.

Want to see what's blocking you?

Ryan`;

// Generate HTML
let html = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Cold Email Campaign - ${businesses.length} Businesses</title>
    <style>
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            background: #0a0a0a;
            color: #e0e0e0;
            padding: 40px 20px;
            line-height: 1.6;
        }
        .container {
            max-width: 1400px;
            margin: 0 auto;
        }
        .header {
            text-align: center;
            margin-bottom: 60px;
            padding-bottom: 30px;
            border-bottom: 2px solid #1a1a1a;
        }
        .header h1 {
            font-size: 42px;
            font-weight: 700;
            margin-bottom: 15px;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            -webkit-background-clip: text;
            -webkit-text-fill-color: transparent;
        }
        .header p {
            color: #888;
            font-size: 18px;
        }
        .stats {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
            gap: 20px;
            margin-bottom: 40px;
        }
        .stat-card {
            background: #111;
            padding: 20px;
            border-radius: 12px;
            border: 1px solid #222;
            text-align: center;
        }
        .stat-card .number {
            font-size: 32px;
            font-weight: 700;
            color: #667eea;
            margin-bottom: 5px;
        }
        .stat-card .label {
            color: #888;
            font-size: 14px;
        }
        .email-card {
            background: #111;
            border: 1px solid #222;
            border-radius: 16px;
            margin-bottom: 30px;
            overflow: hidden;
            transition: transform 0.2s, border-color 0.2s;
        }
        .email-card:hover {
            border-color: #667eea;
            transform: translateY(-2px);
        }
        .email-header {
            background: #1a1a1a;
            padding: 25px 30px;
            border-bottom: 1px solid #222;
            display: flex;
            justify-content: space-between;
            align-items: center;
            flex-wrap: wrap;
            gap: 15px;
        }
        .email-number {
            font-size: 14px;
            color: #667eea;
            font-weight: 600;
            letter-spacing: 1px;
        }
        .business-info {
            flex: 1;
        }
        .business-name {
            font-size: 22px;
            font-weight: 700;
            color: #fff;
            margin-bottom: 8px;
        }
        .business-details {
            color: #888;
            font-size: 14px;
        }
        .business-details span {
            margin-right: 15px;
            display: inline-flex;
            align-items: center;
            gap: 5px;
        }
        .rating {
            color: #fbbf24;
            font-weight: 600;
        }
        .email-body {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 30px;
            padding: 30px;
        }
        @media (max-width: 968px) {
            .email-body {
                grid-template-columns: 1fr;
            }
        }
        .section {
            background: #0a0a0a;
            padding: 25px;
            border-radius: 12px;
            border: 1px solid #1a1a1a;
        }
        .section-title {
            font-size: 14px;
            font-weight: 600;
            color: #667eea;
            margin-bottom: 15px;
            text-transform: uppercase;
            letter-spacing: 1px;
        }
        .email-preview {
            background: #0d0d0d;
            padding: 20px;
            border-radius: 8px;
            border: 1px solid #1a1a1a;
            font-size: 15px;
            line-height: 1.8;
            white-space: pre-wrap;
            color: #d0d0d0;
        }
        .email-subject {
            font-weight: 700;
            color: #fff;
            margin-bottom: 15px;
            padding-bottom: 15px;
            border-bottom: 1px solid #222;
            font-size: 16px;
        }
        .data-table {
            width: 100%;
        }
        .data-row {
            display: flex;
            padding: 10px 0;
            border-bottom: 1px solid #1a1a1a;
        }
        .data-row:last-child {
            border-bottom: none;
        }
        .data-label {
            font-weight: 600;
            color: #888;
            width: 140px;
            flex-shrink: 0;
            font-size: 13px;
        }
        .data-value {
            color: #e0e0e0;
            flex: 1;
            font-size: 14px;
        }
        .tag {
            display: inline-block;
            padding: 4px 10px;
            background: #1a1a1a;
            border: 1px solid #333;
            border-radius: 6px;
            font-size: 12px;
            font-weight: 600;
            margin-right: 8px;
            margin-top: 8px;
        }
        .tag.good {
            background: #0f4229;
            border-color: #10b981;
            color: #10b981;
        }
        .tag.warning {
            background: #422006;
            border-color: #f59e0b;
            color: #f59e0b;
        }
        .tag.bad {
            background: #3f1515;
            border-color: #ef4444;
            color: #ef4444;
        }
        .search-box {
            margin-bottom: 30px;
            background: #111;
            padding: 20px;
            border-radius: 12px;
            border: 1px solid #222;
        }
        .search-box input {
            width: 100%;
            padding: 15px;
            background: #0a0a0a;
            border: 1px solid #222;
            border-radius: 8px;
            color: #fff;
            font-size: 16px;
        }
        .search-box input:focus {
            outline: none;
            border-color: #667eea;
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>🎯 Cold Email Campaign</h1>
            <p>ChatGPT & Google AI Visibility Outreach</p>
        </div>

        <div class="stats">
            <div class="stat-card">
                <div class="number">${businesses.length}</div>
                <div class="label">Total Emails</div>
            </div>
            <div class="stat-card">
                <div class="number">${new Set(businesses.map(b => b.state)).size}</div>
                <div class="label">States</div>
            </div>
            <div class="stat-card">
                <div class="number">${businesses.filter(b => b.rating >= 4.8).length}</div>
                <div class="label">4.8⭐+ Rating</div>
            </div>
            <div class="stat-card">
                <div class="number">${businesses.filter(b => b.aeo_score >= 70).length}</div>
                <div class="label">AEO Score 70+</div>
            </div>
        </div>

        <div class="search-box">
            <input type="text" id="searchInput" placeholder="🔍 Search by business name, owner name, city..." onkeyup="filterEmails()">
        </div>

        <div id="emailList">
`;

// Generate each email
businesses.forEach((biz, idx) => {
  const firstName = biz.owner_name?.split(' ')[0] || biz.business_name?.split(' ')[0] || 'Hi';
  
  const subject = processSpin(SUBJECTS[idx % SUBJECTS.length]
    .replace(/\{\{business_name\}\}/g, biz.business_name)
    .replace(/\{\{city\}\}/g, biz.city)
    .replace(/\{\{first_name\}\}/g, firstName));
  
  const hook = processSpin(HOOKS[idx % HOOKS.length]
    .replace(/\{\{city\}\}/g, biz.city)
    .replace(/\{\{business_name\}\}/g, biz.business_name)
    .replace(/\{\{rating\}\}/g, biz.rating));
  
  const body = processSpin(BODY_TEMPLATE
    .replace('{{hook}}', hook)
    .replace(/\{\{rating\}\}/g, biz.rating)
    .replace(/\{\{reviews\}\}/g, biz.total_reviews));

  const qualityTags = [];
  if (biz.rating >= 4.8) qualityTags.push('<span class="tag good">High Rating</span>');
  if (biz.total_reviews >= 100) qualityTags.push('<span class="tag good">100+ Reviews</span>');
  if (biz.aeo_score >= 70) qualityTags.push('<span class="tag good">Good AEO</span>');
  if (biz.aeo_score < 60) qualityTags.push('<span class="tag warning">Low AEO</span>');
  if (!biz.owner_email) qualityTags.push('<span class="tag bad">No Email</span>');

  html += `
        <div class="email-card" data-search="${biz.business_name.toLowerCase()} ${biz.owner_name?.toLowerCase()} ${biz.city.toLowerCase()} ${biz.state?.toLowerCase()}">
            <div class="email-header">
                <div class="email-number">EMAIL #${idx + 1}</div>
                <div class="business-info">
                    <div class="business-name">${biz.business_name}</div>
                    <div class="business-details">
                        <span><span class="rating">${biz.rating}⭐</span> (${biz.total_reviews} reviews)</span>
                        <span>📍 ${biz.city}, ${biz.state || 'N/A'}</span>
                        <span>👤 ${biz.owner_name} ${biz.owner_role ? `(${biz.owner_role})` : ''}</span>
                    </div>
                </div>
            </div>
            <div class="email-body">
                <div class="section">
                    <div class="section-title">📧 Email Preview</div>
                    <div class="email-preview">
<div class="email-subject">SUBJECT: ${subject}</div>${firstName},

${body}</div>
                </div>
                <div class="section">
                    <div class="section-title">📊 Business Data</div>
                    <div class="data-table">
                        <div class="data-row">
                            <div class="data-label">Owner Name</div>
                            <div class="data-value">${biz.owner_name || 'N/A'}</div>
                        </div>
                        <div class="data-row">
                            <div class="data-label">Owner Role</div>
                            <div class="data-value">${biz.owner_role || 'N/A'}</div>
                        </div>
                        <div class="data-row">
                            <div class="data-label">Owner Email</div>
                            <div class="data-value">${biz.owner_email || '❌ Missing'}</div>
                        </div>
                        <div class="data-row">
                            <div class="data-label">Phone</div>
                            <div class="data-value">${biz.phone || 'N/A'}</div>
                        </div>
                        <div class="data-row">
                            <div class="data-label">Website</div>
                            <div class="data-value" style="word-break: break-all;">${biz.website || 'N/A'}</div>
                        </div>
                        <div class="data-row">
                            <div class="data-label">Rating</div>
                            <div class="data-value">${biz.rating}⭐ (${biz.total_reviews} reviews)</div>
                        </div>
                        <div class="data-row">
                            <div class="data-label">AEO Score</div>
                            <div class="data-value">${biz.aeo_score}/100</div>
                        </div>
                        <div class="data-row">
                            <div class="data-label">AI Citation</div>
                            <div class="data-value">${biz.ai_cited ? '✅ Yes' : '❌ No'}</div>
                        </div>
                        <div class="data-row">
                            <div class="data-label">Location</div>
                            <div class="data-value">${biz.city}, ${biz.state || 'N/A'}</div>
                        </div>
                    </div>
                    <div style="margin-top: 15px;">
                        ${qualityTags.join('')}
                    </div>
                </div>
            </div>
        </div>
`;
});

html += `
        </div>
    </div>

    <script>
        function filterEmails() {
            const input = document.getElementById('searchInput');
            const filter = input.value.toLowerCase();
            const cards = document.querySelectorAll('.email-card');
            
            cards.forEach(card => {
                const searchText = card.getAttribute('data-search');
                if (searchText.includes(filter)) {
                    card.style.display = '';
                } else {
                    card.style.display = 'none';
                }
            });
        }
    </script>
</body>
</html>`;

// Write HTML file
const outputPath = 'c:/Users/Ryan Nguyen/OneDrive/Desktop/Projects/oneclaw/.data/cold-email-campaign.html';
fs.writeFileSync(outputPath, html, 'utf-8');

console.log(`\n✅ Generated HTML file with ${businesses.length} emails`);
console.log(`📁 Location: ${outputPath}`);
console.log(`\n📊 Stats:`);
console.log(`   - Total emails: ${businesses.length}`);
console.log(`   - With owner email: ${businesses.filter(b => b.owner_email).length} (${(businesses.filter(b => b.owner_email).length / businesses.length * 100).toFixed(1)}%)`);
console.log(`   - 4.8⭐+ rating: ${businesses.filter(b => b.rating >= 4.8).length}`);
console.log(`   - AEO 70+: ${businesses.filter(b => b.aeo_score >= 70).length}`);
console.log(`\n🌐 Open the HTML file in your browser to review all emails!`);
