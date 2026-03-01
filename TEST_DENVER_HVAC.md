# Test: Denver HVAC Discovery with AI Rankings

## Test Command

```bash
# Via Telegram to your Rust daemon:
"Find 10 HVAC businesses in Denver and check which ones ChatGPT recommends"

# Or via API:
curl -X POST http://localhost:9000/execute \
  -H "Content-Type: application/json" \
  -d '{
    "workflowId": "test-denver-discovery",
    "input": {
      "city": "Denver",
      "state": "CO",
      "niche": "hvac",
      "service": "AC repair",
      "limit": 10
    },
    "tenantId": "test"
  }'
```

## Expected Flow

### Step 1: Discover Businesses
```
Tool: discover-businesses
Input: { niche: "hvac", location: "Denver, CO", limit: 10 }

Apify Leads Finder returns:
- 10 HVAC businesses
- With verified emails
- With owner names
- With phone numbers

Cost: $0.015 (10 / 1000 × $1.50)
```

### Step 2: Website Scanner
```
Scans all 10 websites (FREE - part of discovery)

Captures signals:
✅ hasAds (Facebook Pixel, Google Analytics)
✅ seoOptimized (SSL, meta tags, structured data)
✅ aiReadable (AI crawlability score 0-10)
✅ hasBooking (online scheduling)
✅ hasChatbot (live chat)
```

### Step 3: Check AI Rankings
```
Tool: check-ai-rankings
Query: "Best HVAC in Denver, CO for AC repair"

Perplexity returns:
- Top 3 businesses mentioned
- Position of each
- Why they were recommended
- Citations (sources)

For each of our 10 businesses:
✅ Is it mentioned? (yes/no)
✅ What position? (1, 2, 3... or not ranked)

Cost: $0.005 (one query)
```

### Step 4: Store in Supabase
```sql
-- crm.leads (10 businesses)
INSERT INTO crm.leads (
  company_name,
  website,
  phone,
  email,  -- From Apify ✅
  owner_name,  -- From Apify ✅
  city,
  state,
  google_rating,
  google_reviews,
  website_signals,  -- From scanner ✅
  lead_score,
  geo_readiness_score,
  aeo_readiness_score  -- Based on AI ranking ✅
);

-- analytics.ai_visibility_tracking (10 checks)
INSERT INTO analytics.ai_visibility_tracking (
  lead_id,  -- Reference to crm.leads
  test_query,  -- "Best HVAC in Denver for AC repair"
  ai_engine,  -- "perplexity"
  brand_mentioned,  -- true/false
  citation_position,  -- 1, 2, 3... or null
  tested_at
);
```

## Expected Results

### Scenario 1: Business IS Mentioned
```json
{
  "business": "Alpine Heating & Air",
  "mentioned_in_ai": true,
  "position": 2,
  "reason": "Excellent reviews and fast response times",
  "email_hook": "ai_opportunity",
  "email_subject": "Your #2 ranking in ChatGPT - can we get you to #1?",
  "aeo_score": 8.0
}
```

### Scenario 2: Business NOT Mentioned
```json
{
  "business": "Bob's HVAC",
  "mentioned_in_ai": false,
  "position": null,
  "reason": null,
  "email_hook": "ai_visibility",
  "email_subject": "Bob's HVAC isn't showing up in ChatGPT searches",
  "aeo_score": 2.0
}
```

## Email Personalization Based on AI Ranking

### If Mentioned (Position 1-3)
```
Subject: You're #2 in ChatGPT for "HVAC in Denver" - opportunity to reach #1

Hi [Owner],

Great news - when people ask ChatGPT for the best HVAC company in Denver, 
[Business] is already being recommended (#2 out of hundreds).

But I noticed you could be #1 with a few optimizations...
```

### If Mentioned (Position 4-10)
```
Subject: [Business] is getting AI recommendations - let's increase visibility

[Business] is showing up when people ask AI for HVAC recommendations in Denver.

We specialize in moving businesses from the middle of the pack to the top 3...
```

### If NOT Mentioned
```
Subject: [Business] is invisible to ChatGPT users

I just searched ChatGPT for "best HVAC in Denver for AC repair" and [Business] 
wasn't mentioned.

Meanwhile, your competitors are getting cited...
```

## Total Test Cost

```
Discover 10 businesses: $0.015 (Apify)
Scan 10 websites: FREE
Check AI rankings: $0.005 (Perplexity)
Store in Supabase: FREE
Generate emails: FREE

Total: $0.02 for complete test
```

## Success Criteria

After test, you should see in Supabase:

1. ✅ 10 rows in `crm.leads` with all data
2. ✅ 10 rows in `analytics.ai_visibility_tracking`
3. ✅ `website_signals` JSONB populated
4. ✅ AI scores calculated (aeo_readiness_score)
5. ✅ Cost logged in job output

## Run the Test

Just say to your daemon:

```
"Test HVAC discovery in Denver - find 10 businesses and check if they're 
mentioned by ChatGPT. Then draft personalized emails based on their AI visibility."
```

Daemon will:
1. Create autonomous job
2. Run all steps
3. Store in Supabase
4. Show you results + cost
5. Present approval batch

**Ready to test?** Just need to confirm Supabase creds are on VPS! 🚀
