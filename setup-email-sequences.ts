/**
 * Email Sequence Setup
 * 
 * 1. Clears existing campaigns
 * 2. Generates touch 1 emails with varied templates
 * 3. Tags with sequence_number and template_variant
 */

import { config } from 'dotenv';
import { createClient } from '@supabase/supabase-js';
import { randomUUID } from 'crypto';

config();

const supabaseUrl = process.env.SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

// Sender rotation
const SENDERS = [
  { email: 'riley@closelanepro.com', name: 'Riley' },
  { email: 'bailey@closelanepro.com', name: 'Bailey' },
  { email: 'madison@closelanepro.com', name: 'Madison' },
];

// Template variants for Touch 1 (curiosity/question-based)
const TEMPLATES = {
  'curiosity-hook': {
    getSubject: (vars: EmailVars) => 
      vars.firstName 
        ? `${vars.firstName}, quick question about ${vars.businessName}`
        : `Quick question about ${vars.businessName}`,
    getBody: (vars: EmailVars, sender: string) => {
      const greeting = vars.firstName ? `${vars.firstName},` : 'Hi there,';
      return `${greeting}

Wasn't sure if I should reach out to you or someone else at ${vars.businessName}, but I noticed something when I searched for ${vars.service} in ${vars.city}. You're not showing up in ChatGPT or AI search results. Most people don't realize this is even a thing yet, but it's where a lot of local searches are heading.

Want me to show you what it takes to get listed?

- ${sender}`;
    }
  },
  
  'short-direct': {
    getSubject: (vars: EmailVars) => `${vars.city} ${vars.service} + AI search`,
    getBody: (vars: EmailVars, sender: string) => {
      const greeting = vars.firstName ? `${vars.firstName},` : 'Hey,';
      return `${greeting}

Searched "${vars.service} ${vars.city}" in ChatGPT. ${vars.businessName} didn't come up. Your competitors did.

Want me to show you how to fix that?

- ${sender}`;
    }
  },
  
  'social-proof': {
    getSubject: (vars: EmailVars) => 
      vars.firstName
        ? `${vars.firstName}, ${vars.city} HVAC companies are doing this`
        : `${vars.city} HVAC companies are doing this`,
    getBody: (vars: EmailVars, sender: string) => {
      const greeting = vars.firstName ? `${vars.firstName},` : 'Hi,';
      const ratingLine = vars.rating && vars.reviewCount 
        ? ` You've got ${vars.rating} stars and ${vars.reviewCount} reviews, so clearly you're doing something right.`
        : '';
      return `${greeting}

I've been looking at how AI tools like ChatGPT recommend local businesses, and I noticed ${vars.businessName} isn't showing up for ${vars.service} searches in ${vars.city}.${ratingLine}

A few other ${vars.city} HVAC companies have started optimizing for this. It's still early, so there's an opportunity to get ahead. Want me to show you how it works?

- ${sender}`;
    }
  },
  
  'problem-agitate': {
    getSubject: (vars: EmailVars) => `ChatGPT isn't recommending ${vars.businessName}`,
    getBody: (vars: EmailVars, sender: string) => {
      const greeting = vars.firstName ? `Hey ${vars.firstName},` : 'Hey,';
      return `${greeting}

When someone asks ChatGPT "best HVAC company in ${vars.city}", your name doesn't come up. That's a problem because more people are using AI to find local services, and if you're not in those results, you're invisible to a growing chunk of potential customers.

The fix isn't complicated, but most businesses don't know it exists yet. Want me to show you what needs to change?

- ${sender}`;
    }
  },
};

// Touch 2 templates (value/follow-up, sent 3-5 days after touch 1)
const TEMPLATES_TOUCH2 = {
  'follow-up-value': {
    getSubject: (vars: EmailVars) => `Re: ${vars.city} HVAC + AI search`,
    getBody: (vars: EmailVars, sender: string) => {
      const greeting = vars.firstName ? `${vars.firstName},` : 'Hi,';
      return `${greeting}

Following up on my last note about ${vars.businessName} not appearing in AI search results.

I ran a deeper check and found a few specific things that might be hurting your visibility:

- Your business info isn't consistent across directories
- Missing structured data that AI tools use to understand your services  
- No recent content signals for AI to reference

These are all fixable. Would a 10-minute breakdown be useful?

${sender}`;
    }
  },
  
  'follow-up-curiosity': {
    getSubject: (vars: EmailVars) => `Ran a check on ${vars.businessName}`,
    getBody: (vars: EmailVars, sender: string) => {
      const greeting = vars.firstName ? `Hey ${vars.firstName},` : 'Hey,';
      return `${greeting}

I actually went ahead and ran a full AI visibility check on ${vars.businessName}.

Found some interesting stuff. Nothing alarming, but there are a few gaps that explain why you're not showing up when people ask AI for ${vars.service} recommendations in ${vars.city}.

Happy to share what I found if you're curious.

${sender}`;
    }
  },
};

// Touch 3 templates (breakup/final, sent 3-5 days after touch 2)
const TEMPLATES_TOUCH3 = {
  'breakup-soft': {
    getSubject: (vars: EmailVars) => `Last note about AI search`,
    getBody: (vars: EmailVars, sender: string) => {
      const greeting = vars.firstName ? `${vars.firstName},` : 'Hi,';
      return `${greeting}

I've reached out a couple times about ${vars.businessName} and AI search visibility.

Totally understand if it's not a priority right now. I'll leave it here.

If you ever want to see the report I put together, just reply and I'll send it over. No pressure either way.

${sender}`;
    }
  },
  
  'breakup-direct': {
    getSubject: (vars: EmailVars) => `Closing the loop`,
    getBody: (vars: EmailVars, sender: string) => {
      const greeting = vars.firstName ? `${vars.firstName},` : 'Hey,';
      return `${greeting}

Haven't heard back, so I'm guessing the timing isn't right.

No worries at all. If AI search visibility ever becomes a priority for ${vars.businessName}, feel free to reach out.

Best,
${sender}`;
    }
  },
};

interface EmailVars {
  firstName: string | null;
  businessName: string;
  city: string;
  state: string;
  rating: number | null;
  reviewCount: number | null;
  service: string;
}

interface Lead {
  id: string;
  company_name: string;
  email: string;
  city: string;
  state: string;
  contact_data: any;
  audit_data: any;
}

function cleanBusinessName(name: string): string {
  return name
    .replace(/,?\s*(LLC|Inc\.?|Corp\.?|Corporation|Company|Co\.?|L\.L\.C\.?)$/i, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function getFirstName(ownerName: string | null): string | null {
  if (!ownerName) return null;
  if (ownerName.toLowerCase().includes('business owner')) return null;
  if (ownerName.length < 3) return null;
  
  const firstName = ownerName.split(' ')[0];
  if (firstName.length < 2 || !/^[A-Z][a-z]+$/.test(firstName)) return null;
  
  return firstName;
}

function isValidEmail(email: string): boolean {
  if (!email) return false;
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) return false;
  if (email.includes('.png') || email.includes('.jpg') || email.includes('favicon')) return false;
  return true;
}

async function setupEmailSequences() {
  console.log('📧 Email Sequence Setup\n');
  console.log('='.repeat(80) + '\n');
  
  // Step 1: Clear existing campaigns
  console.log('🗑️  Clearing existing campaigns...');
  const { error: delError, count: delCount } = await supabase
    .schema('crm')
    .from('email_campaigns')
    .delete()
    .neq('id', '00000000-0000-0000-0000-000000000000');
  
  if (delError) {
    console.error('   Error:', delError.message);
  } else {
    console.log(`   ✅ Cleared campaigns\n`);
  }
  
  // Step 2: Get all leads with valid emails
  console.log('📊 Fetching leads...');
  const { data: leads, error } = await supabase
    .schema('crm')
    .from('leads')
    .select('id, company_name, email, city, state, contact_data, audit_data')
    .eq('industry', 'HVAC')
    .not('email', 'is', null)
    .order('company_name');
  
  if (error || !leads) {
    console.error('❌ Error fetching leads:', error);
    return;
  }
  
  // Filter valid emails
  const validLeads = leads.filter(l => isValidEmail(l.email));
  console.log(`   Found ${leads.length} leads, ${validLeads.length} with valid emails\n`);
  
  // Step 3: Generate Touch 1 campaigns with varied templates
  console.log('✏️  Generating Touch 1 campaigns...');
  
  const templateKeys = Object.keys(TEMPLATES) as (keyof typeof TEMPLATES)[];
  const campaigns: any[] = [];
  const htmlEmails: string[] = [];
  
  for (let i = 0; i < validLeads.length; i++) {
    const lead = validLeads[i] as Lead;
    const sender = SENDERS[i % SENDERS.length];
    const templateKey = templateKeys[i % templateKeys.length];
    const template = TEMPLATES[templateKey];
    const sequenceId = randomUUID();
    
    const ownerName = lead.contact_data?.owner_name || null;
    const firstName = getFirstName(ownerName);
    const businessName = cleanBusinessName(lead.company_name);
    const rating = lead.audit_data?.rating || null;
    const reviewCount = lead.audit_data?.reviewCount || lead.audit_data?.review_count || null;
    
    const vars: EmailVars = {
      firstName,
      businessName,
      city: lead.city || 'your area',
      state: lead.state || '',
      rating,
      reviewCount,
      service: 'HVAC services',
    };
    
    const subject = template.getSubject(vars);
    const body = template.getBody(vars, sender.name);
    
    campaigns.push({
      lead_id: lead.id,
      subject,
      body,
      template_name: templateKey,
      campaign_type: 'cold_outreach',
      sent_from_email: sender.email,
      approval_status: 'approved',
      sequence_number: 1,
      sequence_id: sequenceId,
    });
    
    htmlEmails.push(generateHtmlCard(i + 1, lead, vars, subject, body, sender, templateKey, 1));
  }
  
  console.log(`   Generated ${campaigns.length} campaigns\n`);
  
  // Step 4: Insert into database
  console.log('📤 Inserting into crm.email_campaigns...');
  
  const batchSize = 50;
  let inserted = 0;
  
  for (let i = 0; i < campaigns.length; i += batchSize) {
    const batch = campaigns.slice(i, i + batchSize);
    
    const { error: insertError } = await supabase
      .schema('crm')
      .from('email_campaigns')
      .insert(batch);
    
    if (insertError) {
      // If columns don't exist, try without them
      if (insertError.message.includes('sequence_number') || insertError.message.includes('sequence_id')) {
        console.log('   ⚠️  Sequence columns not in DB yet, inserting without them...');
        const batchWithoutSeq = batch.map(({ sequence_number, sequence_id, ...rest }) => rest);
        const { error: retryError } = await supabase
          .schema('crm')
          .from('email_campaigns')
          .insert(batchWithoutSeq);
        
        if (retryError) {
          console.error(`   ❌ Batch ${Math.floor(i / batchSize) + 1}:`, retryError.message);
        } else {
          inserted += batch.length;
        }
      } else {
        console.error(`   ❌ Batch ${Math.floor(i / batchSize) + 1}:`, insertError.message);
      }
    } else {
      inserted += batch.length;
      console.log(`   ✅ Batch ${Math.floor(i / batchSize) + 1} (${inserted}/${campaigns.length})`);
    }
  }
  
  console.log(`\n✅ Inserted ${inserted} campaigns\n`);
  
  // Step 5: Generate HTML preview
  const htmlContent = generateHtmlFile(htmlEmails, campaigns.length);
  const fs = await import('fs/promises');
  await fs.writeFile('.data-backup/cold-email-campaign-v2.html', htmlContent);
  console.log('📄 Generated .data-backup/cold-email-campaign-v2.html\n');
  
  // Stats
  const byTemplate = campaigns.reduce((acc, c) => {
    acc[c.template_name] = (acc[c.template_name] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);
  
  const bySender = campaigns.reduce((acc, c) => {
    const name = c.sent_from_email.split('@')[0];
    acc[name] = (acc[name] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);
  
  console.log('📊 Template Distribution:');
  Object.entries(byTemplate).forEach(([t, count]) => {
    console.log(`   ${t}: ${count}`);
  });
  
  console.log('\n📊 Sender Distribution:');
  Object.entries(bySender).forEach(([s, count]) => {
    console.log(`   ${s}: ${count}`);
  });
  
  console.log('\n' + '='.repeat(80));
  console.log('✅ Touch 1 emails ready! Run follow-up generator in 3-5 days for Touch 2.');
}

function generateHtmlCard(
  num: number,
  lead: Lead,
  vars: EmailVars,
  subject: string,
  body: string,
  sender: typeof SENDERS[0],
  template: string,
  touchNum: number
): string {
  const escapedBody = body.replace(/\n/g, '<br>');
  const templateBadge = {
    'curiosity-hook': '🎣 Curiosity',
    'short-direct': '⚡ Direct',
    'social-proof': '👥 Social Proof',
    'problem-agitate': '🔥 Problem',
  }[template] || template;
  
  return `
        <div class="email-card" data-search="${lead.company_name.toLowerCase()} ${vars.firstName?.toLowerCase() || ''} ${lead.city.toLowerCase()} ${template}">
            <div class="email-header">
                <div class="email-number">EMAIL #${num}</div>
                <div class="business-info">
                    <div class="business-name">${vars.businessName}</div>
                    <div class="business-details">
                        <span>${vars.rating ? `<span class="rating">${vars.rating}⭐</span> (${vars.reviewCount} reviews)` : 'No rating'}</span>
                        <span>📍 ${vars.city}, ${vars.state}</span>
                        <span>👤 ${vars.firstName || 'Unknown'}</span>
                    </div>
                </div>
                <div class="sender-info">
                    <span class="sender-badge">From: ${sender.name}</span>
                    <span class="template-badge">${templateBadge}</span>
                    <span class="touch-badge">Touch ${touchNum}</span>
                </div>
            </div>
            <div class="email-body">
                <div class="section">
                    <div class="section-title">📧 Email Preview</div>
                    <div class="email-preview">
<div class="email-subject">SUBJECT: ${subject}</div>
<div class="email-to">TO: ${lead.email}</div>
${escapedBody}</div>
                </div>
            </div>
        </div>`;
}

function generateHtmlFile(emailCards: string[], totalCount: number): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Cold Email Campaign - Touch 1 - ${totalCount} Emails</title>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            background: #0a0a0a;
            color: #e0e0e0;
            padding: 40px 20px;
            line-height: 1.6;
        }
        .container { max-width: 1400px; margin: 0 auto; }
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
        .header p { color: #888; font-size: 18px; }
        .stats {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
            gap: 15px;
            margin-bottom: 40px;
        }
        .stat-card {
            background: #111;
            padding: 15px;
            border-radius: 12px;
            border: 1px solid #222;
            text-align: center;
        }
        .stat-card .number { font-size: 28px; font-weight: 700; color: #667eea; }
        .stat-card .label { color: #888; font-size: 12px; }
        .email-card {
            background: #111;
            border: 1px solid #222;
            border-radius: 16px;
            margin-bottom: 30px;
            overflow: hidden;
        }
        .email-card:hover { border-color: #667eea; }
        .email-header {
            background: #1a1a1a;
            padding: 20px 25px;
            border-bottom: 1px solid #222;
            display: flex;
            justify-content: space-between;
            align-items: center;
            flex-wrap: wrap;
            gap: 10px;
        }
        .email-number { font-size: 12px; color: #667eea; font-weight: 600; }
        .business-info { flex: 1; }
        .business-name { font-size: 20px; font-weight: 700; color: #fff; margin-bottom: 5px; }
        .business-details { display: flex; gap: 15px; color: #888; font-size: 13px; flex-wrap: wrap; }
        .sender-info { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }
        .sender-badge { background: #2d5a27; color: #7bed7b; padding: 5px 10px; border-radius: 15px; font-size: 11px; }
        .template-badge { background: #5a2d57; color: #ed7bed; padding: 5px 10px; border-radius: 15px; font-size: 11px; }
        .touch-badge { background: #2d3a5a; color: #7bb8ed; padding: 5px 10px; border-radius: 15px; font-size: 11px; }
        .email-body { padding: 25px; }
        .section-title { font-size: 12px; font-weight: 600; color: #667eea; margin-bottom: 12px; text-transform: uppercase; }
        .email-preview {
            background: #0a0a0a;
            border: 1px solid #222;
            border-radius: 12px;
            padding: 20px;
            font-family: 'Georgia', serif;
            line-height: 1.8;
            white-space: pre-wrap;
        }
        .email-subject { color: #667eea; font-weight: 600; margin-bottom: 8px; font-family: sans-serif; }
        .email-to { color: #888; font-size: 13px; margin-bottom: 15px; font-family: sans-serif; }
        .rating { color: #fbbf24; }
        .search-box { margin-bottom: 30px; }
        .search-box input {
            width: 100%;
            padding: 12px 18px;
            border-radius: 10px;
            border: 1px solid #333;
            background: #111;
            color: #fff;
            font-size: 15px;
        }
        .search-box input:focus { outline: none; border-color: #667eea; }
        .filter-row { display: flex; gap: 10px; margin-bottom: 20px; flex-wrap: wrap; }
        .filter-btn {
            padding: 8px 16px;
            border-radius: 20px;
            border: 1px solid #333;
            background: #111;
            color: #888;
            cursor: pointer;
            font-size: 13px;
        }
        .filter-btn:hover, .filter-btn.active { border-color: #667eea; color: #667eea; }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>Cold Email Campaign - Touch 1</h1>
            <p>${totalCount} Personalized Emails with 4 Template Variants</p>
        </div>
        
        <div class="stats">
            <div class="stat-card"><div class="number">${totalCount}</div><div class="label">Total</div></div>
            <div class="stat-card"><div class="number">${Math.ceil(totalCount/4)}</div><div class="label">🎣 Curiosity</div></div>
            <div class="stat-card"><div class="number">${Math.ceil(totalCount/4)}</div><div class="label">⚡ Direct</div></div>
            <div class="stat-card"><div class="number">${Math.ceil(totalCount/4)}</div><div class="label">👥 Social</div></div>
            <div class="stat-card"><div class="number">${Math.ceil(totalCount/4)}</div><div class="label">🔥 Problem</div></div>
        </div>
        
        <div class="filter-row">
            <button class="filter-btn active" onclick="filterByTemplate('')">All</button>
            <button class="filter-btn" onclick="filterByTemplate('curiosity')">🎣 Curiosity</button>
            <button class="filter-btn" onclick="filterByTemplate('direct')">⚡ Direct</button>
            <button class="filter-btn" onclick="filterByTemplate('social')">👥 Social Proof</button>
            <button class="filter-btn" onclick="filterByTemplate('problem')">🔥 Problem</button>
        </div>
        
        <div class="search-box">
            <input type="text" id="searchInput" placeholder="Search by business, city, or owner..." onkeyup="filterEmails()">
        </div>
        
        <div id="emailList">
${emailCards.join('\n')}
        </div>
    </div>
    
    <script>
        let currentFilter = '';
        
        function filterEmails() {
            const query = document.getElementById('searchInput').value.toLowerCase();
            const cards = document.querySelectorAll('.email-card');
            
            cards.forEach(card => {
                const searchText = card.getAttribute('data-search') || '';
                const matchesSearch = searchText.includes(query);
                const matchesFilter = !currentFilter || searchText.includes(currentFilter);
                card.style.display = (matchesSearch && matchesFilter) ? 'block' : 'none';
            });
        }
        
        function filterByTemplate(template) {
            currentFilter = template;
            document.querySelectorAll('.filter-btn').forEach(btn => btn.classList.remove('active'));
            event.target.classList.add('active');
            filterEmails();
        }
    </script>
</body>
</html>`;
}

// Export templates for follow-up generator
export { TEMPLATES_TOUCH2, TEMPLATES_TOUCH3 };

setupEmailSequences().catch(console.error);
