# Run Denver HVAC Test

## Quick Start

### Option 1: Via Script (Easiest)

```bash
cd /workspace
./test-denver-hvac.sh
```

### Option 2: Via Telegram (Production Flow)

Just message your daemon:

```
"Find 10 HVAC businesses in Denver and check if they're recommended by ChatGPT"
```

### Option 3: Via API (Manual)

```bash
curl -X POST http://localhost:9000/execute \
  -H "Content-Type: application/json" \
  -d '{
    "workflowId": "complete-sdr-discovery",
    "input": {
      "niche": "hvac",
      "city": "Denver",
      "state": "CO", 
      "service": "AC repair",
      "limit": 10,
      "runCMOAnalysis": false,
      "checkAIRankings": true
    },
    "tenantId": "test-denver"
  }'
```

## What Will Happen

```
⏱️  Time: ~30 seconds

Step 1: Apify Discovers 10 HVAC businesses in Denver
  ├─ Gets: names, phones, emails, addresses, Google data
  └─ 💰 Cost: $0.015

Step 2: Website Scanner (with human-like delays)
  ├─ Scans each website sequentially
  ├─ 300-700ms delay between scans
  ├─ If any blocked → Uses residential proxy
  ├─ Captures: SEO, ads, booking, chatbot, AI readability
  └─ 💰 Cost: FREE

Step 3: AI Rankings Check (ONE query)
  ├─ Query: "Best HVAC in Denver, CO for AC repair"
  ├─ Perplexity lists top businesses
  ├─ Extracts top 3 mentioned
  └─ 💰 Cost: $0.005

Step 4: Match businesses against AI results
  ├─ Compare 10 discovered vs AI response
  ├─ Mark which are mentioned (position 1-10)
  └─ Mark which are invisible

Step 5: Store in Supabase
  ├─ crm.leads (10 businesses with all data)
  ├─ analytics.ai_visibility_tracking (10 records)
  └─ 💰 Cost: FREE

Total Cost: $0.02
```

## Verify Results in Supabase

### Check Leads Table

```sql
SELECT 
  company_name,
  website,
  phone,
  email,
  lead_score,
  geo_readiness_score,
  aeo_readiness_score,
  website_signals,
  google_rating,
  google_reviews
FROM crm.leads
WHERE city = 'Denver' 
  AND industry = 'hvac'
ORDER BY lead_score DESC;
```

### Check AI Visibility

```sql
SELECT 
  l.company_name,
  a.brand_mentioned,
  a.citation_position,
  a.ai_engine,
  a.test_query
FROM analytics.ai_visibility_tracking a
JOIN crm.leads l ON l.id = a.client_id
WHERE a.test_query LIKE '%Denver%'
ORDER BY a.citation_position NULLS LAST;
```

### Sample Expected Results

```
company_name: "Alpine Heating & Air"
email: "owner@alpineheating.com"
phone: "(720) 555-1234"
lead_score: 85
geo_readiness_score: 7.0
aeo_readiness_score: 8.0  ← High because mentioned in AI
website_signals: {
  "hasAds": true,
  "seoOptimized": true,
  "aiReadable": true,
  "hasBooking": true
}

AI Visibility:
brand_mentioned: true
citation_position: 2  ← Ranked #2 by Perplexity
test_query: "Best HVAC in Denver, CO for AC repair"
```

## Troubleshooting

### If no results in Supabase
```bash
# Check Supabase credentials on VPS
ssh your-vps
echo $SUPABASE_URL
echo $SUPABASE_SERVICE_ROLE_KEY

# If not set, add to .env
export SUPABASE_URL=https://xxx.supabase.co
export SUPABASE_SERVICE_ROLE_KEY=xxx

# Restart harness
pm2 restart harness
```

### If scans failing
```bash
# Add residential proxy (optional)
export RESIDENTIAL_PROXY_URL=http://user:pass@proxy.brightdata.com:22225
```

### If costs seem high
```bash
# Check metering tracker
curl http://localhost:9000/jobs/[job-id]/cost
```

## Next Steps After Test

If test succeeds:

1. ✅ Scale to more businesses (100, 1000)
2. ✅ Add email generation and approval
3. ✅ Test sending emails
4. ✅ Run for multiple cities
5. ✅ Automate daily discovery

---

**Run the test and let me know what you see!** 🚀
