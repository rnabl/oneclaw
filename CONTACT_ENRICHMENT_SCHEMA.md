# Contact Enrichment Data Structure

## Overview

We store enriched contact data in a separate `crm.lead_contacts` table with a **one-to-many** relationship:
- **One lead** can have **many contacts** (owner, CEO, VP, managers, etc.)
- Each contact has validation status, enrichment source, and priority

---

## Schema Design

### `crm.lead_contacts` Table

Stores all enriched contacts discovered through the waterfall enrichment process.

```sql
crm.lead_contacts
├── id (UUID)
├── lead_id (FK to crm.leads)
│
├── Contact Info
│   ├── full_name
│   ├── first_name
│   ├── last_name
│   ├── title
│   └── seniority_level (owner, c_suite, director, vp, head, manager, partner, staff)
│
├── Contact Methods
│   ├── email
│   ├── email_status (unverified, verified, bounced_hard, bounced_soft, invalid)
│   ├── bounced_at
│   ├── bounce_reason
│   ├── phone
│   ├── phone_type (mobile, work, unknown)
│   └── linkedin_url
│
├── Enrichment Metadata
│   ├── source (perplexity, apify, website_scrape, manual)
│   ├── enriched_at
│   ├── apify_run_id
│   └── confidence_score (0.00-1.00)
│
└── Outreach Priority
    ├── is_primary (only one per lead)
    └── outreach_priority (1=highest, 10=lowest)
```

### `crm.leads` Table Updates

Added enrichment tracking columns:

```sql
crm.leads
└── Enrichment Tracking
    ├── enrichment_status (pending, enriching, completed, failed)
    ├── enrichment_tier (perplexity, apify, website_scrape, none)
    ├── last_enriched_at
    ├── contacts_count
    ├── contacts_with_email
    └── contacts_with_phone
```

---

## Data Flow

### 1. Enrichment Process

```
Lead (no contacts)
  ↓
Tier 1: Perplexity
  → Find owner: "David Daher (CEO)"
  → Get email: "amy@company.com"
  → Get phone: "(555) 123-4567"
  → INSERT INTO lead_contacts (source='perplexity', is_primary=true)
  ↓
Tier 2: Apify (if needed)
  → Scrape LinkedIn
  → Find 5 decision-makers
  → INSERT INTO lead_contacts (source='apify', is_primary=false)
  ↓
Tier 3: Website Scrape (fallback)
  → Extract from HTML
  → INSERT INTO lead_contacts (source='website_scrape')
```

### 2. Contact Priority Logic

**Automatic priority assignment:**
- **Owner/Founder**: Priority 1 (highest)
- **C-Suite (CEO, CFO, CTO)**: Priority 2
- **VP/Director**: Priority 3
- **Head/Manager**: Priority 4
- **Partner**: Priority 2
- **Staff**: Priority 10 (lowest)

**Primary contact rules:**
- Only ONE primary contact per lead
- Automatically set to highest priority contact
- Used for initial outreach campaigns

### 3. Email Status Tracking

**Status Flow:**
```
unverified (default)
  ↓
[Send email]
  ↓
  ├─→ verified (delivered successfully)
  ├─→ bounced_hard (mailbox doesn't exist - permanent)
  ├─→ bounced_soft (mailbox full - temporary)
  └─→ invalid (format error)
```

**Bounce handling:**
```sql
-- Mark email as bounced
SELECT crm.mark_email_bounced(
  'old@company.com',
  'hard',
  'Mailbox does not exist'
);

-- Get leads needing re-enrichment
SELECT * FROM crm.get_leads_needing_enrichment(100);
```

---

## Usage Examples

### Get Lead with Primary Contact

```sql
SELECT * FROM crm.leads_with_primary_contact
WHERE company_name = 'Freedom Heating & Air Conditioning';
```

**Result:**
```
company_name                        | primary_contact_name | primary_contact_email      | primary_contact_title
----------------------------------- | -------------------- | -------------------------- | ---------------------
Freedom Heating & Air Conditioning  | David Daher          | amy@freedomheatingandair.com | CEO
```

### Get All Contacts Ready for Outreach

```sql
SELECT * FROM crm.leads_ready_for_outreach
WHERE city = 'Ramsey' AND state = 'MN'
ORDER BY lead_id, is_primary DESC, outreach_priority ASC;
```

**Result:**
```
company_name | full_name     | title      | email                        | is_primary | outreach_priority
------------ | ------------- | ---------- | ---------------------------- | ---------- | -----------------
Freedom HVAC | David Daher   | CEO        | amy@freedomheatingandair.com | true       | 1
Freedom HVAC | John Smith    | VP Ops     | john@freedomheatingandair.com| false      | 3
Freedom HVAC | Sarah Jones   | Manager    | sarah@freedomheatingandair.com| false     | 4
```

### Mark Bounced Emails and Re-Enrich

```sql
-- 1. Mark bounced
SELECT crm.mark_email_bounced(
  'bounced@company.com',
  'hard',
  'User unknown'
);

-- 2. Get leads needing enrichment
SELECT * FROM crm.get_leads_needing_enrichment(50);

-- 3. Run enrichment script
-- pnpm leads:enrich
```

---

## Outreach Workflow

### 1. Generate Campaigns

```sql
-- Get primary contacts for outreach
SELECT 
  l.id as lead_id,
  l.company_name,
  l.industry,
  l.city,
  l.state,
  c.full_name as contact_name,
  c.email,
  c.phone,
  c.title
FROM crm.leads l
INNER JOIN crm.lead_contacts c ON l.id = c.lead_id
WHERE 
  c.is_primary = true
  AND c.email_status IN ('unverified', 'verified')
  AND l.enrichment_status = 'completed'
LIMIT 100;
```

### 2. Handle Bounces

```typescript
// After sending emails, process bounces
const bounces = [
  { email: 'bad@company.com', type: 'hard', reason: 'No such user' },
  // ...
];

for (const bounce of bounces) {
  await supabase.rpc('mark_email_bounced', {
    p_email: bounce.email,
    p_bounce_type: bounce.type,
    p_bounce_reason: bounce.reason
  });
}
```

### 3. Re-Enrich Bounced Leads

```typescript
// Get leads with bounced primary contacts
const { data: needsEnrichment } = await supabase
  .rpc('get_leads_needing_enrichment', { p_limit: 100 });

// Run enrichment waterfall
for (const lead of needsEnrichment) {
  await enrichContact(lead.lead_id, lead.website, lead.company_name);
}
```

### 4. A/B/C Testing with Multiple Contacts

```sql
-- Get 3 contacts per lead for A/B/C split testing
WITH ranked_contacts AS (
  SELECT 
    *,
    ROW_NUMBER() OVER (
      PARTITION BY lead_id 
      ORDER BY is_primary DESC, outreach_priority ASC
    ) as rank
  FROM crm.lead_contacts
  WHERE email_status IN ('unverified', 'verified')
)
SELECT * FROM ranked_contacts
WHERE rank <= 3;  -- Top 3 contacts per lead
```

---

## Benefits

### ✅ Multiple Contacts Per Lead
- Reach decision-makers at multiple levels
- A/B/C test different contact personas
- Fallback contacts if primary bounces

### ✅ Email Validation Tracking
- Never send to known bounced emails
- Track bounce reasons for analysis
- Automatic re-enrichment triggers

### ✅ Source Attribution
- Know which enrichment tier found each contact
- Track Apify run IDs for debugging
- Confidence scores for data quality

### ✅ Priority-Based Outreach
- Automatically prioritize owners/C-suite
- Target decision-makers first
- Fallback to managers if needed

### ✅ Outreach Views
- `leads_with_primary_contact` - Quick primary lookup
- `leads_ready_for_outreach` - All valid contacts
- Helper functions for common operations

---

## Next Steps

1. **Run migration**: Execute `011_lead_contacts_enrichment.sql` in Supabase
2. **Update enrichment scripts**: Save contacts to `lead_contacts` table
3. **Update campaign generator**: Query `leads_ready_for_outreach` view
4. **Add bounce handler**: Use `mark_email_bounced()` function
5. **Schedule re-enrichment**: Run daily for bounced leads
