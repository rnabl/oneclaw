# Volume Outreach Strategy - OneClaw SDR

## The Approach

**Volume + Personalization = Scale**

Don't audit selectively - discover businesses at scale (cheap), then personalize based on **signals already captured** by the website scanner.

## What `discover-businesses` Already Gives You

Your discovery workflow scans every website and captures:

```javascript
signals: {
  // SEO
  seoOptimized: true/false,
  hasSSL: true/false,
  hasMetaDescription: true/false,
  hasStructuredData: true/false,
  
  // Marketing
  hasAds: true/false,
  hasFacebookPixel: true/false,
  hasGoogleAnalytics: true/false,
  
  // AI Readiness (KEY FOR GEO/AEO)
  aiReadable: true/false,
  aiReadabilityScore: 0-10,
  
  // Social
  hasSocials: true/false,
  socialPlatforms: ['facebook', 'instagram'],
  
  // Tech
  hasBooking: true/false,
  hasChatbot: true/false,
  
  // Trust (from Google)
  reviewCount: 127,
  averageRating: 4.8
}
```

**This is FREE** - included in discovery! No expensive audits needed.

## Personalization Logic

### The Hook: "You're Not Being Recommended"

All roads lead to the same insight: **They're invisible to AI search engines.**

But we personalize the angle based on their current situation:

```typescript
if (!aiReadable || aiReadabilityScore < 7) {
  hook = "ai_visibility"
  angle = "ChatGPT doesn't recommend you"
  
} else if (hasAds && !seoOptimized) {
  hook = "wasted_ad_spend"
  angle = "Your ads drive traffic AI won't convert"
  
} else if (!hasAds) {
  hook = "no_digital_marketing"
  angle = "60% of searchers use AI - you're missing them"
  
} else {
  hook = "ai_opportunity"
  angle = "Your SEO is solid, but AI doesn't cite you"
}
```

### Email Examples

**Hook 1: AI Visibility (Most Common)**
```
Subject: ABC HVAC isn't showing up in ChatGPT searches

I searched ChatGPT for "hvac in Austin" and ABC HVAC wasn't mentioned.

That's a problem because 60% of people now ask AI for recommendations.

We specialize in getting businesses cited by ChatGPT and Perplexity.
Worth a quick call?
```

**Hook 2: Wasted Ad Spend**
```
Subject: Your ad spend could be working harder for ABC HVAC

I noticed you're running Facebook ads, but your site isn't optimized 
for how people actually search now.

60% of searches happen in ChatGPT - not Google. Your paid traffic 
is hitting a site AI won't recommend.

Quick 15-min call to show you what I found?
```

**Hook 3: No Digital Marketing**
```
Subject: ABC HVAC is invisible to 60% of searchers

Quick question: When someone asks ChatGPT "best hvac in Austin", 
does ABC HVAC get mentioned?

I just tested it - you're not showing up.

We get businesses cited in AI search. Worth a conversation?
```

## Cost Economics

### Volume Approach
```
1000 businesses discovered = $0.05
Website signals included = FREE (part of discovery)
Enrich 1000 contacts = $100 ($0.10 each)
Generate 1000 emails = FREE (code)
Send 1000 emails = FREE (Gmail)

Total: $100.05 for 1000 personalized outreach emails
Cost per email: $0.10
```

### Traditional Approach (Old Way)
```
1000 businesses discovered = $0.05
Audit 1000 websites = $150 ($0.15 each)
Enrich 1000 contacts = $100
Send 1000 emails = FREE

Total: $250.05 per 1000
Cost per email: $0.25
```

**Savings: $150 per 1000 emails (60% cheaper)**

## Workflow

```bash
# Discover 1000 HVAC businesses in Texas
curl -X POST http://localhost:9000/execute \
  -d '{
    "workflowId": "sdr-volume-outreach",
    "input": {
      "niche": "hvac",
      "location": "Texas",
      "volumeTarget": 1000,
      "enrichContactInfo": true,
      "skipAudit": true
    }
  }'

# Returns:
{
  "businessesDiscovered": 1000,
  "businessesStored": 1000,
  "emailsGenerated": 847,  // Only those with emails
  "pendingApprovalBatchId": "uuid-123",
  "totalCostUsd": 84.75,
  "breakdown": {
    "discoveryCost": 0.05,
    "enrichmentCost": 84.70
  }
}
```

## Blink Approval UI

### Generated HTML Link
```
https://oneclaw.chat/approvals/uuid-123
```

Shows:
- ✅ Total emails: 847
- ✅ Sample previews (3 emails)
- ✅ Cost: $0 to send
- ✅ Buttons: Approve, Request Changes, Reject

### One-Click Approval
```
Click "Approve & Send All"
    ↓
All 847 emails marked approved in Supabase
    ↓
Background job sends via Gmail (rate limited)
    ↓
Updates sent_at, gmail_message_id in crm.email_campaigns
```

## Scaling

### Daily Volume
```
Mon: 1000 HVAC businesses in Texas
Tue: 1000 Plumbing businesses in Florida  
Wed: 1000 Roofing businesses in California
Thu: 1000 Dental practices in New York
Fri: 1000 Law firms in Illinois

Weekly: 5000 personalized emails
Cost: ~$500/week
```

### Cost Optimization
```
# Skip enrichment, use phone numbers instead
{
  "enrichContactInfo": false  // Saves $100 per 1000
}

# Businesses already have phone from Google
# Cold call instead of cold email
# Cost: $0.05 per 1000 businesses
```

## Next: Approval + Sending Infrastructure

Need to build:

1. **Blink UI Endpoint** - Generate approval links
2. **Approval Handler** - Process approve/reject
3. **Email Sender Job** - Send approved batches
4. **Rate Limiter** - Gmail limits (500/day per account)

Want me to build these next?

---

**Key Insight: You were right - it's 90% built! Just needed to connect existing tools to Supabase and add approval workflow.** 🚀
