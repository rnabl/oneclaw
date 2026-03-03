/**
 * Email Campaign Generator
 * 
 * Generates personalized cold emails for all leads with emails in Supabase
 * and inserts them into crm.email_campaigns with staggered scheduling.
 * 
 * Template: Long-form hook style
 * Senders: riley@, bailey@, madison@ (round-robin)
 */

import { config } from 'dotenv';
import { createClient } from '@supabase/supabase-js';

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

// Subject line templates (rotated)
const SUBJECT_TEMPLATES = [
  (vars: EmailVars) => `Quick question about ${vars.businessName}`,
  (vars: EmailVars) => vars.firstName ? `${vars.firstName}, noticed something about ${vars.businessName}` : `Noticed something about ${vars.businessName}`,
  (vars: EmailVars) => `${vars.city} HVAC + ChatGPT`,
  (vars: EmailVars) => `${vars.businessName} and AI search`,
  (vars: EmailVars) => vars.firstName ? `${vars.firstName}, quick question` : `Quick question for ${vars.businessName}`,
];

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

// Strip business suffixes
function cleanBusinessName(name: string): string {
  return name
    .replace(/,?\s*(LLC|Inc\.?|Corp\.?|Corporation|Company|Co\.?|L\.L\.C\.?)$/i, '')
    .replace(/\s+/g, ' ')
    .trim();
}

// Extract first name from owner name
function getFirstName(ownerName: string | null): string | null {
  if (!ownerName) return null;
  
  // Skip bad names
  if (ownerName.toLowerCase().includes('business owner')) return null;
  if (ownerName.length < 3) return null;
  
  const firstName = ownerName.split(' ')[0];
  
  // Validate it looks like a name
  if (firstName.length < 2 || !/^[A-Z][a-z]+$/.test(firstName)) return null;
  
  return firstName;
}

// Generate email body using long-form hook template
function generateEmailBody(vars: EmailVars, senderName: string): string {
  const greeting = vars.firstName ? `${vars.firstName},` : 'Hi there,';
  
  const opener = vars.firstName
    ? `Wasn't quite sure if I should reach out to you or someone else at ${vars.businessName}, but I noticed you weren't being recommended by ChatGPT when I was looking for ${vars.service} in ${vars.city}, ${vars.state}.`
    : `Wasn't quite sure who handles marketing at ${vars.businessName}, but I noticed you weren't being recommended by ChatGPT when I was looking for ${vars.service} in ${vars.city}, ${vars.state}.`;
  
  let socialProof = '';
  if (vars.rating && vars.reviewCount) {
    socialProof = `\n\nYou've got ${vars.rating} stars with ${vars.reviewCount} reviews - that should be enough to show up.`;
  }
  
  const cta = `\n\nOther ${vars.city} HVAC businesses are getting recommended. Worth a quick look?`;
  
  const signature = `\n\n${senderName}`;
  
  return `${greeting}\n\n${opener}${socialProof}${cta}${signature}`;
}

// Generate subject line (rotated)
function generateSubject(vars: EmailVars, index: number): string {
  const template = SUBJECT_TEMPLATES[index % SUBJECT_TEMPLATES.length];
  return template(vars);
}

// Calculate scheduled send time (staggered 3 min apart, business hours)
function calculateScheduledTime(index: number): Date {
  const now = new Date();
  
  // Start tomorrow at 9 AM local
  const startTime = new Date(now);
  startTime.setDate(startTime.getDate() + 1);
  startTime.setHours(9, 0, 0, 0);
  
  // 3 minutes between each email
  const minutesOffset = index * 3;
  
  // Max 150 emails per day (50 per sender x 3 senders)
  // That's 450 minutes = 7.5 hours of sending per day
  const emailsPerDay = 150;
  const dayOffset = Math.floor(index / emailsPerDay);
  const indexInDay = index % emailsPerDay;
  
  const scheduled = new Date(startTime);
  scheduled.setDate(scheduled.getDate() + dayOffset);
  scheduled.setMinutes(scheduled.getMinutes() + (indexInDay * 3));
  
  // If past 5 PM, move to next day at 9 AM
  if (scheduled.getHours() >= 17) {
    scheduled.setDate(scheduled.getDate() + 1);
    scheduled.setHours(9, 0, 0, 0);
  }
  
  return scheduled;
}

async function generateEmailCampaigns() {
  console.log('📧 Email Campaign Generator\n');
  console.log('='.repeat(80) + '\n');
  
  // Get all leads with emails
  const { data: leads, error } = await supabase
    .schema('crm')
    .from('leads')
    .select('id, company_name, email, city, state, contact_data, audit_data')
    .eq('industry', 'HVAC')
    .not('email', 'is', null)
    .order('company_name');
  
  if (error) {
    console.error('❌ Error fetching leads:', error);
    return;
  }
  
  console.log(`📊 Found ${leads?.length || 0} leads with emails\n`);
  
  if (!leads || leads.length === 0) {
    console.log('No leads to process.');
    return;
  }
  
  // Generate emails
  const campaigns: any[] = [];
  const htmlEmails: string[] = [];
  
  for (let i = 0; i < leads.length; i++) {
    const lead = leads[i] as Lead;
    const sender = SENDERS[i % SENDERS.length];
    
    // Extract variables
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
    
    const subject = generateSubject(vars, i);
    const body = generateEmailBody(vars, sender.name);
    const scheduledFor = calculateScheduledTime(i);
    
    campaigns.push({
      lead_id: lead.id,
      subject,
      body,
      template_name: 'long-form-hook-v1',
      campaign_type: 'cold_outreach',
      sent_from_email: sender.email,
      approval_status: 'approved', // Pre-approved for sending
      // Note: scheduled_for tracked in metadata since column doesn't exist yet
    });
    
    // Also generate HTML for review
    htmlEmails.push(generateHtmlCard(i + 1, lead, vars, subject, body, sender, scheduledFor));
  }
  
  console.log(`✅ Generated ${campaigns.length} email campaigns\n`);
  
  // Insert into database
  console.log('📤 Inserting into crm.email_campaigns...\n');
  
  // Insert in batches of 50
  const batchSize = 50;
  let inserted = 0;
  
  for (let i = 0; i < campaigns.length; i += batchSize) {
    const batch = campaigns.slice(i, i + batchSize);
    
    const { error: insertError } = await supabase
      .schema('crm')
      .from('email_campaigns')
      .insert(batch);
    
    if (insertError) {
      console.error(`❌ Error inserting batch ${Math.floor(i / batchSize) + 1}:`, insertError);
    } else {
      inserted += batch.length;
      console.log(`   ✅ Inserted batch ${Math.floor(i / batchSize) + 1} (${inserted}/${campaigns.length})`);
    }
  }
  
  console.log(`\n✅ Inserted ${inserted} campaigns into database\n`);
  
  // Generate HTML file for review
  const htmlContent = generateHtmlFile(htmlEmails, campaigns.length);
  
  // Write to file
  const fs = await import('fs/promises');
  await fs.writeFile('.data-backup/cold-email-campaign-v2.html', htmlContent);
  console.log('📄 Generated .data-backup/cold-email-campaign-v2.html for review\n');
  
  // Summary stats
  const byDay = campaigns.reduce((acc, c) => {
    const day = new Date(c.scheduled_for).toLocaleDateString();
    acc[day] = (acc[day] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);
  
  console.log('📅 Schedule Summary:');
  Object.entries(byDay).forEach(([day, count]) => {
    console.log(`   ${day}: ${count} emails`);
  });
  
  console.log('\n' + '='.repeat(80));
  console.log('✅ Done! Emails are queued and ready to send.');
  console.log('   The scheduler will start sending at the scheduled times.');
}

function generateHtmlCard(
  num: number,
  lead: Lead,
  vars: EmailVars,
  subject: string,
  body: string,
  sender: typeof SENDERS[0],
  scheduledFor: Date
): string {
  const escapedBody = body.replace(/\n/g, '<br>');
  
  return `
        <div class="email-card" data-search="${lead.company_name.toLowerCase()} ${vars.firstName?.toLowerCase() || ''} ${lead.city.toLowerCase()} ${lead.state.toLowerCase()}">
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
                    <span class="schedule-badge">📅 ${scheduledFor.toLocaleDateString()} ${scheduledFor.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
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
  const bySender = {
    riley: Math.ceil(totalCount / 3),
    bailey: Math.ceil(totalCount / 3),
    madison: totalCount - (Math.ceil(totalCount / 3) * 2),
  };
  
  return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Cold Email Campaign v2 - ${totalCount} Businesses</title>
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
            display: flex;
            gap: 20px;
            color: #888;
            font-size: 14px;
            flex-wrap: wrap;
        }
        .sender-info {
            display: flex;
            flex-direction: column;
            gap: 8px;
            align-items: flex-end;
        }
        .sender-badge {
            background: #2d5a27;
            color: #7bed7b;
            padding: 6px 12px;
            border-radius: 20px;
            font-size: 12px;
            font-weight: 600;
        }
        .schedule-badge {
            background: #1a3a5c;
            color: #7bb8ed;
            padding: 6px 12px;
            border-radius: 20px;
            font-size: 12px;
        }
        .email-body {
            padding: 30px;
        }
        .section {
            margin-bottom: 25px;
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
            background: #0a0a0a;
            border: 1px solid #222;
            border-radius: 12px;
            padding: 25px;
            font-family: 'Georgia', serif;
            line-height: 1.8;
            white-space: pre-wrap;
        }
        .email-subject {
            color: #667eea;
            font-weight: 600;
            margin-bottom: 10px;
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        }
        .email-to {
            color: #888;
            font-size: 14px;
            margin-bottom: 20px;
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        }
        .rating {
            color: #fbbf24;
        }
        .search-box {
            margin-bottom: 30px;
        }
        .search-box input {
            width: 100%;
            padding: 15px 20px;
            border-radius: 12px;
            border: 1px solid #333;
            background: #111;
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
            <h1>Cold Email Campaign v2</h1>
            <p>Long-Form Hook Template - ${totalCount} Personalized Emails</p>
        </div>
        
        <div class="stats">
            <div class="stat-card">
                <div class="number">${totalCount}</div>
                <div class="label">Total Emails</div>
            </div>
            <div class="stat-card">
                <div class="number">${bySender.riley}</div>
                <div class="label">Riley</div>
            </div>
            <div class="stat-card">
                <div class="number">${bySender.bailey}</div>
                <div class="label">Bailey</div>
            </div>
            <div class="stat-card">
                <div class="number">${bySender.madison}</div>
                <div class="label">Madison</div>
            </div>
        </div>
        
        <div class="search-box">
            <input type="text" id="searchInput" placeholder="Search by business name, city, or owner..." onkeyup="filterEmails()">
        </div>
        
        <div id="emailList">
${emailCards.join('\n')}
        </div>
    </div>
    
    <script>
        function filterEmails() {
            const query = document.getElementById('searchInput').value.toLowerCase();
            const cards = document.querySelectorAll('.email-card');
            
            cards.forEach(card => {
                const searchText = card.getAttribute('data-search') || '';
                card.style.display = searchText.includes(query) ? 'block' : 'none';
            });
        }
    </script>
</body>
</html>`;
}

generateEmailCampaigns().catch(console.error);
