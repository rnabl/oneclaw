/**
 * Blink Approval System
 * 
 * Quick HTML interface for CSM to approve/reject email batches.
 * Generates shareable link that shows preview and approve/reject buttons.
 */

import { createClient } from '@supabase/supabase-js';

function getSupabaseClient() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Supabase not configured');
  return createClient(url, key);
}

/**
 * Generate Blink approval HTML
 */
export async function generateBlinkApproval(approvalId: string): Promise<string> {
  const supabase = getSupabaseClient();
  
  // Get approval details
  const { data: approval, error } = await supabase
    .from('platform.approvals_queue')
    .select('*')
    .eq('id', approvalId)
    .single();
  
  if (error || !approval) {
    throw new Error('Approval not found');
  }
  
  // Get sample emails to preview
  const sampleIds = approval.preview_data.sample_emails || [];
  const { data: sampleEmails } = await supabase
    .from('crm.email_campaigns')
    .select(`
      *,
      lead:crm.leads!inner(company_name, email, lead_score, city, state)
    `)
    .in('id', sampleIds);
  
  const previewHtml = sampleEmails?.map(email => `
    <div class="email-preview">
      <div class="email-header">
        <strong>${email.lead.company_name}</strong>
        <span class="score">Score: ${email.lead.lead_score}/100</span>
      </div>
      <div class="email-to">To: ${email.lead.email}</div>
      <div class="email-subject">Subject: ${email.subject}</div>
      <div class="email-body">${email.body.replace(/\n/g, '<br>')}</div>
    </div>
  `).join('') || '';
  
  // Generate Blink HTML
  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Approve Email Campaign</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      min-height: 100vh;
      padding: 20px;
    }
    .container {
      max-width: 900px;
      margin: 0 auto;
      background: white;
      border-radius: 20px;
      padding: 40px;
      box-shadow: 0 20px 60px rgba(0,0,0,0.3);
    }
    .header {
      text-align: center;
      margin-bottom: 30px;
    }
    .header h1 {
      font-size: 32px;
      color: #1a1a1a;
      margin-bottom: 10px;
    }
    .stats {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
      gap: 15px;
      margin-bottom: 30px;
    }
    .stat {
      background: #f8f9fa;
      padding: 20px;
      border-radius: 12px;
      text-align: center;
    }
    .stat-value {
      font-size: 32px;
      font-weight: bold;
      color: #667eea;
    }
    .stat-label {
      font-size: 14px;
      color: #666;
      margin-top: 5px;
    }
    .email-preview {
      background: #f8f9fa;
      padding: 20px;
      border-radius: 12px;
      margin-bottom: 20px;
      border-left: 4px solid #667eea;
    }
    .email-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 10px;
    }
    .score {
      background: #667eea;
      color: white;
      padding: 4px 12px;
      border-radius: 20px;
      font-size: 12px;
      font-weight: bold;
    }
    .email-to, .email-subject {
      font-size: 14px;
      margin-bottom: 8px;
      color: #555;
    }
    .email-subject {
      font-weight: 600;
      color: #333;
    }
    .email-body {
      font-size: 14px;
      line-height: 1.6;
      color: #666;
      margin-top: 15px;
      padding-top: 15px;
      border-top: 1px solid #ddd;
      max-height: 200px;
      overflow-y: auto;
    }
    .actions {
      display: flex;
      gap: 15px;
      margin-top: 30px;
      justify-content: center;
    }
    .btn {
      padding: 16px 40px;
      font-size: 18px;
      font-weight: 600;
      border: none;
      border-radius: 12px;
      cursor: pointer;
      transition: all 0.2s;
    }
    .btn-approve {
      background: #10b981;
      color: white;
    }
    .btn-approve:hover {
      background: #059669;
      transform: translateY(-2px);
    }
    .btn-reject {
      background: #ef4444;
      color: white;
    }
    .btn-reject:hover {
      background: #dc2626;
      transform: translateY(-2px);
    }
    .btn-changes {
      background: #f59e0b;
      color: white;
    }
    .btn-changes:hover {
      background: #d97706;
    }
    .loading {
      display: none;
      text-align: center;
      padding: 20px;
      color: #667eea;
    }
    .result {
      display: none;
      text-align: center;
      padding: 40px;
      font-size: 24px;
    }
    .result.success { color: #10b981; }
    .result.error { color: #ef4444; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>📧 Email Campaign Approval</h1>
      <p>${approval.preview_title}</p>
    </div>
    
    <div class="stats">
      <div class="stat">
        <div class="stat-value">${approval.preview_data.total_emails}</div>
        <div class="stat-label">Total Emails</div>
      </div>
      <div class="stat">
        <div class="stat-value">${approval.preview_data.niche}</div>
        <div class="stat-label">Industry</div>
      </div>
      <div class="stat">
        <div class="stat-value">${approval.preview_data.location}</div>
        <div class="stat-label">Location</div>
      </div>
      <div class="stat">
        <div class="stat-value">$${approval.preview_data.cost_to_send}</div>
        <div class="stat-label">Cost to Send</div>
      </div>
    </div>
    
    <h2 style="margin-bottom: 20px;">Sample Emails</h2>
    ${previewHtml}
    
    <div class="actions">
      <button class="btn btn-approve" onclick="handleApproval('approved')">
        ✅ Approve & Send All
      </button>
      <button class="btn btn-changes" onclick="handleApproval('needs_changes')">
        📝 Request Changes
      </button>
      <button class="btn btn-reject" onclick="handleApproval('rejected')">
        ❌ Reject
      </button>
    </div>
    
    <div class="loading">Processing...</div>
    <div class="result"></div>
  </div>
  
  <script>
    async function handleApproval(decision) {
      const buttons = document.querySelectorAll('.btn');
      const loading = document.querySelector('.loading');
      const result = document.querySelector('.result');
      
      buttons.forEach(b => b.disabled = true);
      loading.style.display = 'block';
      
      try {
        const response = await fetch('/api/approvals/${approvalId}/decide', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ 
            decision,
            approved_by: 'csm-ryan',
            notes: decision === 'needs_changes' ? prompt('What changes are needed?') : null
          })
        });
        
        const data = await response.json();
        
        loading.style.display = 'none';
        result.style.display = 'block';
        
        if (data.success) {
          result.className = 'result success';
          result.textContent = decision === 'approved' 
            ? '✅ Approved! Emails will be sent shortly.'
            : decision === 'needs_changes'
            ? '📝 Changes requested. SDR agent will revise.'
            : '❌ Batch rejected.';
        } else {
          result.className = 'result error';
          result.textContent = '❌ Error: ' + data.error;
        }
      } catch (error) {
        loading.style.display = 'none';
        result.style.display = 'block';
        result.className = 'result error';
        result.textContent = '❌ Error: ' + error.message;
      }
    }
  </script>
</body>
</html>
  `;
}

/**
 * Process approval decision
 */
export async function processApprovalDecision(
  approvalId: string,
  decision: 'approved' | 'rejected' | 'needs_changes',
  approvedBy: string,
  notes?: string
): Promise<{ success: boolean; emailsSent?: number; error?: string }> {
  const supabase = getSupabaseClient();
  
  // Update approval record
  await supabase
    .from('platform.approvals_queue')
    .update({
      status: decision === 'approved' ? 'approved' : 'rejected',
      approved_by_user: approvedBy,
      approval_notes: notes,
      approved_at: new Date().toISOString(),
    })
    .eq('id', approvalId);
  
  if (decision === 'approved') {
    // Get all campaign IDs from this batch
    const { data: approval } = await supabase
      .from('platform.approvals_queue')
      .select('preview_data')
      .eq('id', approvalId)
      .single();
    
    const campaignIds = approval?.preview_data?.campaign_ids || [];
    
    // Update all campaigns to approved
    await supabase
      .from('crm.email_campaigns')
      .update({
        approval_status: 'approved',
        approved_by: approvedBy,
        approved_at: new Date().toISOString(),
      })
      .in('id', campaignIds);
    
    // TODO: Trigger actual email sending
    // This would call send-gmail for each approved email
    
    return {
      success: true,
      emailsSent: campaignIds.length,
    };
  }
  
  return { success: true };
}

export { generateBlinkApproval, processApprovalDecision };
