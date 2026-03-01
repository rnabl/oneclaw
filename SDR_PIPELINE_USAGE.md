# SDR Pipeline - Ready to Use

## What It Does

Orchestrates your existing workflows + new Supabase storage:

```
1. discover-businesses ($0.05) → Find leads
      ↓
2. Store in crm.leads → Supabase
      ↓
3. audit-website ($0.15 each) → Score top leads
      ↓
4. Update scores in Supabase → geo_score, aeo_score
      ↓
5. enrich-contact ($0.10 each) → Get owner email
      ↓
6. Generate personalized emails → Based on audit
      ↓
7. Submit to approvals_queue → CSM reviews
      ↓
8. You approve → send-gmail (free)
```

## Cost Control Built-In

```typescript
{
  leadLimit: 50,      // Find 50 leads ($0.05 total)
  auditTop: 10,       // Only audit top 10 ($1.50 total)
  generateEmails: true // Generate emails for top 10
}

Total cost: ~$2.55 for 50 leads, 10 audits, 10 enrichments, 10 emails
```

## Usage

### From Rust Daemon (Your Current Setup)

```rust
// clawd calls this via Telegram or HTTP
execute_tool(state, "sdr-pipeline", serde_json::json!({
    "niche": "hvac",
    "location": "Austin, TX",
    "leadLimit": 50,      // Control cost: more leads
    "auditTop": 10,       // Control cost: only audit best ones
    "generateEmails": true
})).await
```

### From Harness API Directly

```bash
curl -X POST http://localhost:9000/execute \
  -H "Content-Type: application/json" \
  -d '{
    "workflowId": "sdr-pipeline",
    "input": {
      "niche": "plumbing",
      "location": "Denver, CO",
      "leadLimit": 100,
      "auditTop": 20,
      "generateEmails": true
    },
    "tenantId": "agency-1"
  }'
```

## What Gets Stored in Supabase

### crm.leads table
```sql
SELECT 
  company_name,
  lead_score,        -- 0-100
  geo_readiness_score,  -- 0-10
  aeo_readiness_score,  -- 0-10
  stage,             -- discovered → qualified
  email,             -- From enrichment
  audit_data         -- Full audit JSON
FROM crm.leads
ORDER BY lead_score DESC;
```

### crm.email_campaigns table
```sql
SELECT 
  subject,
  body,
  approval_status,   -- pending, approved, rejected
  lead_id
FROM crm.email_campaigns
WHERE approval_status = 'pending';
```

### platform.approvals_queue table
```sql
-- What you see in CSM dashboard
SELECT * FROM public.csm_approval_dashboard;
```

## CSM Approval Flow

### 1. View Pending Approvals

```typescript
const { data: approvals } = await supabase
  .from('platform.approvals_queue')
  .select('*')
  .eq('status', 'pending')
  .order('priority', { ascending: false });

// Or use the view:
const { data: dashboard } = await supabase
  .from('csm_approval_dashboard')
  .select('*');
```

### 2. Review Email Preview

```javascript
approval.preview_data = {
  to: "owner@abchvac.com",
  subject: "Quick question about ABC HVAC's online visibility",
  body: "Hi there, I noticed ABC HVAC...",
  lead_score: 85
}
```

### 3. Approve or Reject

```typescript
// Approve
await supabase
  .from('platform.approvals_queue')
  .update({
    status: 'approved',
    approved_by_user: 'csm-ryan',
    approved_at: new Date().toISOString()
  })
  .eq('id', approvalId);

// Update email campaign
await supabase
  .from('crm.email_campaigns')
  .update({
    approval_status: 'approved',
    approved_by: 'csm-ryan',
    approved_at: new Date().toISOString()
  })
  .eq('id', emailId);

// Send the email (separate workflow or manual)
await harness.execute('send-gmail', {
  to: email.to,
  subject: email.subject,
  body: email.body
});
```

## Cost Optimization Strategies

### Strategy 1: Tiered Approach
```typescript
// Cheap discovery first
{ leadLimit: 1000, auditTop: 0, generateEmails: false }
// Cost: $0.05 to find 1000 leads

// Then audit only best
{ leadLimit: 0, auditTop: 50, generateEmails: true }
// Cost: $7.50 to audit top 50
```

### Strategy 2: Batch Processing
```typescript
// Day 1: Discover and store
{ leadLimit: 500, auditTop: 0 }

// Day 2: Audit top scored
{ auditTop: 25 }

// Day 3: Send approved emails
{ generateEmails: true }
```

### Strategy 3: Smart Filtering
```typescript
// Pre-filter by Google rating before auditing
const { data: highRatedLeads } = await supabase
  .from('crm.leads')
  .select('*')
  .gte('google_rating', 4.0)
  .gte('google_reviews', 20)
  .order('lead_score', { ascending: false })
  .limit(20);

// Only audit these high-quality leads
```

## Output Example

```json
{
  "leadsDiscovered": 50,
  "leadsStored": 50,
  "leadsAudited": 10,
  "emailsGenerated": 10,
  "emailsPendingApproval": 10,
  "totalCostUsd": 2.55,
  "leadsInSupabase": ["uuid-1", "uuid-2", ...]
}
```

## Next Steps

1. **Add Supabase credentials to .env**
2. **Run the pipeline** with small numbers first (test mode)
3. **Review approvals** in Supabase or build a dashboard
4. **Approve emails** and send
5. **Track results** in email_campaigns table

---

**The infrastructure is ready. You control costs by setting `leadLimit` and `auditTop` parameters!** 🚀
