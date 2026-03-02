# Email Outreach Approval Flow - READY TO USE

## What You Have:

✅ **crm.leads** - HVAC businesses discovered
✅ **crm.email_campaigns** - Email drafts waiting for approval
✅ **Approval workflow** - Review before sending

---

## Quick Commands (Telegram/CLI):

### 1. **View Pending Drafts**
```typescript
import { getPendingEmailDrafts, formatPendingList } from '@oneclaw/harness/outreach/email-approval';

const result = await getPendingEmailDrafts();
console.log(formatPendingList(result.drafts));
```

**Telegram:**
```
User: /emails pending

Bot: 📋 Pending Email Drafts (12)
     
     1. ABC HVAC Company
        Subject: Boost Your Local Visibility
        Score: 75
        ID: abc-123
     
     2. XYZ Heating & Cooling
        Subject: Free SEO Audit
        Score: 82
        ID: def-456
```

### 2. **Review Specific Draft**
```typescript
import { getPendingEmailDrafts, formatEmailDraft } from '@oneclaw/harness/outreach/email-approval';

const drafts = await getPendingEmailDrafts();
const draft = drafts.drafts[0];
console.log(formatEmailDraft(draft));
```

**Telegram:**
```
User: /review abc-123

Bot: 📧 Email Draft
     
     To: ABC HVAC Company
     Email: contact@abchvac.com
     Subject: Boost Your Local Visibility
     
     Body:
     Hi [Name],
     
     I noticed ABC HVAC has great reviews but isn't showing up 
     in AI search results...
     
     [Full email body]
     
     Commands:
     /approve abc-123 - Send this email
     /reject abc-123 needs work - Reject with reason
```

### 3. **Approve Email**
```typescript
import { approveEmail } from '@oneclaw/harness/outreach/email-approval';

await approveEmail('abc-123', 'ryan@nabl.ai');
```

**Telegram:**
```
User: /approve abc-123

Bot: ✅ Email approved!
     Will be sent in next batch.
```

### 4. **Reject Email**
```typescript
import { rejectEmail } from '@oneclaw/harness/outreach/email-approval';

await rejectEmail('abc-123', 'Too generic, needs personalization', 'ryan@nabl.ai');
```

**Telegram:**
```
User: /reject abc-123 too generic

Bot: ❌ Email rejected
     Reason: too generic
     SDR agent will revise.
```

---

## SQL Queries (Check Your Data):

### See Pending Drafts:
```sql
SELECT 
  ec.id,
  ec.subject,
  ec.approval_status,
  l.company_name,
  l.email,
  l.lead_score,
  ec.created_at
FROM crm.email_campaigns ec
LEFT JOIN crm.leads l ON ec.lead_id = l.id
WHERE ec.approval_status = 'pending'
ORDER BY ec.created_at DESC
LIMIT 20;
```

### See Approved (Ready to Send):
```sql
SELECT 
  ec.id,
  ec.subject,
  l.company_name,
  l.email,
  ec.approved_at,
  ec.sent_at
FROM crm.email_campaigns ec
LEFT JOIN crm.leads l ON ec.lead_id = l.id
WHERE ec.approval_status = 'approved'
  AND ec.sent_at IS NULL
ORDER BY ec.approved_at DESC;
```

### See Campaign Stats:
```sql
SELECT 
  approval_status,
  COUNT(*) as count,
  COUNT(CASE WHEN sent_at IS NOT NULL THEN 1 END) as sent_count,
  COUNT(CASE WHEN opened THEN 1 END) as opened_count,
  COUNT(CASE WHEN replied THEN 1 END) as replied_count
FROM crm.email_campaigns
GROUP BY approval_status;
```

---

## Send Approved Emails (Gmail Integration):

```typescript
import { getApprovedEmails, markEmailSent } from '@oneclaw/harness/outreach/email-approval';
import { sendEmail } from '@oneclaw/harness/providers/gmail'; // Need to create this

async function sendApprovedEmails() {
  const result = await getApprovedEmails(10); // Batch of 10
  
  for (const email of result.emails) {
    try {
      // Send via Gmail
      const gmailMessageId = await sendEmail({
        to: email.lead.email,
        subject: email.subject,
        body: email.body,
        from: email.sent_from_email,
      });
      
      // Mark as sent
      await markEmailSent(email.id, gmailMessageId);
      
      console.log(`✅ Sent to ${email.lead.company_name}`);
    } catch (error) {
      console.error(`❌ Failed to send to ${email.lead.company_name}:`, error);
    }
  }
}
```

---

## Current Status Check:

Run this to see what you have:

```sql
-- How many leads?
SELECT COUNT(*) as total_leads FROM crm.leads;

-- How many pending email drafts?
SELECT COUNT(*) as pending_drafts 
FROM crm.email_campaigns 
WHERE approval_status = 'pending';

-- How many approved but not sent?
SELECT COUNT(*) as ready_to_send
FROM crm.email_campaigns 
WHERE approval_status = 'approved' 
  AND sent_at IS NULL;

-- Campaign performance
SELECT 
  COUNT(*) as total_campaigns,
  COUNT(CASE WHEN sent_at IS NOT NULL THEN 1 END) as sent,
  COUNT(CASE WHEN opened THEN 1 END) as opened,
  COUNT(CASE WHEN replied THEN 1 END) as replied,
  ROUND(100.0 * COUNT(CASE WHEN opened THEN 1 END) / NULLIF(COUNT(CASE WHEN sent_at IS NOT NULL THEN 1 END), 0), 1) as open_rate,
  ROUND(100.0 * COUNT(CASE WHEN replied THEN 1 END) / NULLIF(COUNT(CASE WHEN sent_at IS NOT NULL THEN 1 END), 0), 1) as reply_rate
FROM crm.email_campaigns;
```

---

## Telegram Bot Integration:

Add these commands to your bot:

```typescript
import {
  getPendingEmailDrafts,
  approveEmail,
  rejectEmail,
  formatPendingList,
  formatEmailDraft,
} from '@oneclaw/harness/outreach/email-approval';

// In your message handler:

if (message === '/emails' || message === '/emails pending') {
  const result = await getPendingEmailDrafts();
  return formatPendingList(result.drafts);
}

if (message.startsWith('/review ')) {
  const emailId = message.split(' ')[1];
  const result = await getPendingEmailDrafts();
  const draft = result.drafts.find(d => d.id === emailId);
  return draft ? formatEmailDraft(draft) : 'Draft not found';
}

if (message.startsWith('/approve ')) {
  const emailId = message.split(' ')[1];
  const result = await approveEmail(emailId, userId);
  return result.success ? '✅ Email approved!' : `Error: ${result.error}`;
}

if (message.startsWith('/reject ')) {
  const parts = message.split(' ');
  const emailId = parts[1];
  const reason = parts.slice(2).join(' ');
  const result = await rejectEmail(emailId, reason, userId);
  return result.success ? `❌ Email rejected: ${reason}` : `Error: ${result.error}`;
}
```

---

## Next Steps:

1. **Check what drafts exist:**
   ```sql
   SELECT * FROM crm.email_campaigns LIMIT 5;
   ```

2. **If no drafts exist, create some:**
   - Need the SDR agent to generate email drafts
   - Or manually insert test drafts

3. **Test approval flow on Telegram**

4. **Set up Gmail sending** (if not already done)

Want me to help you check what's in the database right now?
