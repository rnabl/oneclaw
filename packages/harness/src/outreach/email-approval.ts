/**
 * Email Campaign Approval Interface
 * 
 * View pending email drafts and approve/reject them for sending.
 * Works with crm.email_campaigns table from migration 004.
 */

import { createClient, SupabaseClient } from '@supabase/supabase-js';

let supabase: SupabaseClient | null = null;

function getSupabaseClient() {
  if (!supabase) {
    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY;
    
    if (!supabaseUrl || !supabaseKey) {
      throw new Error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY environment variables');
    }
    
    supabase = createClient(supabaseUrl, supabaseKey);
  }
  return supabase;
}

// =============================================================================
// VIEW PENDING DRAFTS
// =============================================================================

export async function getPendingEmailDrafts(limit = 50) {
  const supabase = getSupabaseClient();
  
  // First get email campaigns without the join (cross-schema joins are tricky)
  const { data: campaigns, error } = await supabase
    .schema('crm')
    .from('email_campaigns')
    .select(`
      id,
      subject,
      body,
      template_name,
      campaign_type,
      sent_from_email,
      approval_status,
      created_at,
      lead_id
    `)
    .eq('approval_status', 'pending')
    .order('created_at', { ascending: false })
    .limit(limit);
  
  if (error || !campaigns) {
    return { success: false, error: error?.message || 'No campaigns found', drafts: [] };
  }
  
  // Get lead data separately if there are lead_ids
  const leadIds = campaigns.map(c => c.lead_id).filter(Boolean);
  let leadsMap: Record<string, any> = {};
  
  if (leadIds.length > 0) {
    const { data: leads } = await supabase
      .schema('crm')
      .from('leads')
      .select('id, company_name, website, phone, email, city, state, lead_score')
      .in('id', leadIds);
    
    if (leads) {
      leadsMap = Object.fromEntries(leads.map(l => [l.id, l]));
    }
  }
  
  // Merge lead data into campaigns
  const drafts = campaigns.map(c => ({
    ...c,
    lead: c.lead_id ? leadsMap[c.lead_id] || null : null
  }));

  if (error) {
    return { success: false, error: error.message, drafts: [] };
  }

  return { success: true, drafts: data || [] };
}

// =============================================================================
// APPROVE EMAIL
// =============================================================================

export async function approveEmail(emailId: string, approvedBy: string) {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .schema('crm')
    .from('email_campaigns')
    .update({
      approval_status: 'approved',
      approved_by: approvedBy,
      approved_at: new Date().toISOString(),
    })
    .eq('id', emailId)
    .select();

  if (error) {
    return { success: false, error: error.message };
  }

  return { success: true, email: data?.[0] };
}

// =============================================================================
// REJECT EMAIL
// =============================================================================

export async function rejectEmail(emailId: string, reason: string, rejectedBy: string) {
  const supabase = getSupabaseClient();
  const { data, error} = await supabase
    .schema('crm')
    .from('email_campaigns')
    .update({
      approval_status: 'rejected',
      approved_by: rejectedBy,
      rejection_reason: reason,
      approved_at: new Date().toISOString(),
    })
    .eq('id', emailId)
    .select();

  if (error) {
    return { success: false, error: error.message };
  }

  return { success: true, email: data?.[0] };
}

// =============================================================================
// GET APPROVED EMAILS (READY TO SEND)
// =============================================================================

export async function getApprovedEmails(limit = 50) {
  const supabase = getSupabaseClient();
  
  // Get approved campaigns
  const { data: campaigns, error } = await supabase
    .schema('crm')
    .from('email_campaigns')
    .select(`
      id,
      subject,
      body,
      sent_from_email,
      lead_id
    `)
    .eq('approval_status', 'approved')
    .is('sent_at', null)
    .order('approved_at', { ascending: false })
    .limit(limit);
  
  if (error || !campaigns) {
    return { success: false, error: error?.message || 'No campaigns found', emails: [] };
  }
  
  // Get lead data separately
  const leadIds = campaigns.map(c => c.lead_id).filter(Boolean);
  let leadsMap: Record<string, any> = {};
  
  if (leadIds.length > 0) {
    const { data: leads } = await supabase
      .schema('crm')
      .from('leads')
      .select('id, company_name, email, phone')
      .in('id', leadIds);
    
    if (leads) {
      leadsMap = Object.fromEntries(leads.map(l => [l.id, l]));
    }
  }
  
  // Merge lead data
  const emails = campaigns.map(c => ({
    ...c,
    lead: c.lead_id ? leadsMap[c.lead_id] || null : null
  }));

  return { success: true, emails };
}

// =============================================================================
// MARK AS SENT
// =============================================================================

export async function markEmailSent(emailId: string, gmailMessageId?: string) {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .schema('crm')
    .from('email_campaigns')
    .update({
      sent_at: new Date().toISOString(),
      gmail_message_id: gmailMessageId,
    })
    .eq('id', emailId)
    .select();

  if (error) {
    return { success: false, error: error.message };
  }

  return { success: true, email: data?.[0] };
}

// =============================================================================
// FORMAT FOR DISPLAY
// =============================================================================

export function formatEmailDraft(draft: any): string {
  const lead = draft.lead || {};
  
  let message = `📧 **Email Draft**\n\n`;
  message += `**To:** ${lead.company_name || 'Unknown'}\n`;
  message += `**Email:** ${lead.email || 'No email'}\n`;
  message += `**Subject:** ${draft.subject}\n\n`;
  message += `**Body:**\n${draft.body}\n\n`;
  message += `**Lead Score:** ${lead.lead_score || 'N/A'}\n`;
  message += `**Created:** ${new Date(draft.created_at).toLocaleDateString()}\n\n`;
  message += `**ID:** \`${draft.id}\`\n`;
  
  return message;
}

export function formatPendingList(drafts: any[]): string {
  if (drafts.length === 0) {
    return '✅ No pending email drafts to review.';
  }

  let message = `📋 **Pending Email Drafts (${drafts.length})**\n\n`;

  for (let i = 0; i < Math.min(drafts.length, 10); i++) {
    const draft = drafts[i];
    const lead = draft.lead || {};
    
    message += `${i + 1}. **${lead.company_name || 'Unknown'}**\n`;
    message += `   Subject: ${draft.subject}\n`;
    message += `   Score: ${lead.lead_score || 'N/A'}\n`;
    message += `   ID: \`${draft.id}\`\n\n`;
  }

  message += `\n💡 Commands:\n`;
  message += `• \`/review <id>\` - View full draft\n`;
  message += `• \`/approve <id>\` - Approve for sending\n`;
  message += `• \`/reject <id> <reason>\` - Reject draft\n`;

  return message;
}
