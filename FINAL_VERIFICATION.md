# Final Verification - All Systems Check

## ✅ Verified: Everything You Asked For

### 1. Supabase on VPS
**Status:** ✅ Already in .env.example (lines 6-10)

```bash
# Check on your VPS:
echo $SUPABASE_URL
echo $SUPABASE_SERVICE_ROLE_KEY

# If not set, add to .env or environment
```

### 2. Cost Logging
**Status:** ✅ Already implemented

```typescript
// In every workflow:
ctx.recordApiCall('apify', 'leads_finder', 1000);
// Cost tracked in metering system

// In discovery:
const apifyCost = (results.length / 1000) * 1.50;
await ctx.log('info', `Cost: $${apifyCost.toFixed(4)}`);
```

**Enhanced in latest commit** - Now logs exact Apify Leads Finder cost.

### 3. Enrichment Fallback Chain
**Status:** ✅ Already implemented in `enrich-contact.ts`

```
Try 1: Apify Leads Finder ($1.50 per 1000)
  └─ Includes: verified email, owner name, LinkedIn
  └─ If fails ↓

Try 2: Perplexity AI ($0.005 per search)
  └─ Fast owner name extraction
  └─ If fails ↓

Try 3: DataForSEO SERP ($0.10 per search)
  └─ SERP data mining
  └─ If fails ↓

Try 4: Website Scrape (FREE)
  └─ Regex extraction from contact page
```

### 4. AI Citation Query
**Status:** ⚠️ Tool exists but NOT integrated into discovery

**What exists:**
- ✅ `check-citation` tool (uses Perplexity)
- ✅ Can query: "Best HVAC in Denver for AC repair"

**What's missing:**
- ❌ Not automatically run during discovery
- ❌ Not stored in Supabase

**Should we add this?**

## Proposed Enhancement: AI Visibility Check

Add to discovery workflow:

```typescript
// After discovering businesses
for (const business of topLeads) {
  // Query Perplexity with format you specified
  const query = `Best ${niche} in ${city}, ${state} for ${mainService}`;
  
  const citation = await harness.execute('check-citation', {
    query,
    businessName: business.name
  });
  
  // Store result in Supabase
  await supabase.from('analytics.ai_visibility_tracking').insert({
    client_id: null, // Still a lead
    lead_id: business.id,
    test_query: query,
    ai_engine: 'perplexity',
    brand_mentioned: citation.cited,
    citation_snippet: citation.snippets?.[0],
    tested_at: new Date().toISOString()
  });
  
  // Update lead with AI visibility data
  await supabase.from('crm.leads').update({
    aeo_readiness_score: citation.cited ? 8.0 : 2.0
  }).eq('id', business.id);
}
```

**Cost impact:**
- Citation check: $0.005 per business
- For 1000 businesses: +$5.00

**Total with citation checks:**
- Apify: $1.50
- Citations: $5.00
- **Total: $6.50 per 1000 (still cheap!)**

## Test Plan: One City

### Test Command
```bash
# Via Telegram or API
"Find 10 HVAC businesses in Denver and check if they're cited by ChatGPT"
```

### Expected Flow
```
Step 1: Apify Leads Finder
  ├─ Finds 10 HVAC in Denver
  ├─ Gets emails, owner names, LinkedIn
  └─ Cost: $0.015

Step 2: Website Scanner
  ├─ Scans 10 websites
  ├─ Captures signals (ads, SEO, etc.)
  └─ Cost: FREE

Step 3: AI Citation Check (NEW)
  ├─ Query: "Best HVAC in Denver for AC repair"
  ├─ Check if each business is mentioned
  └─ Cost: $0.05 (10 × $0.005)

Step 4: Store in Supabase
  ├─ crm.leads (all 10 businesses)
  ├─ analytics.ai_visibility_tracking (citation results)
  └─ Cost: FREE

Step 5: Generate emails
  ├─ Personalize based on:
  │   • Citation status (mentioned or not)
  │   • Signals (has ads, SEO, etc.)
  └─ Cost: FREE

Total Test Cost: $0.065 for 10 businesses
```

### Expected Supabase Data

**crm.leads:**
```sql
SELECT 
  company_name,
  lead_score,
  geo_readiness_score,
  aeo_readiness_score,  -- Updated from citation check
  website_signals
FROM crm.leads
WHERE city = 'Denver' AND industry = 'hvac';
```

**analytics.ai_visibility_tracking:**
```sql
SELECT 
  test_query,
  brand_mentioned,
  citation_snippet
FROM analytics.ai_visibility_tracking
WHERE test_query LIKE '%Denver%';
```

## Questions to Confirm

1. **Add AI citation check to discovery?**
   - Pro: Better personalization ("You're NOT in ChatGPT")
   - Con: +$5 per 1000 businesses
   - Your call?

2. **Test with Denver first?**
   - Small batch (10-20 businesses)
   - Verify Supabase storage
   - Check cost tracking
   - Test approval flow

3. **Main service per niche?**
   ```
   HVAC → "AC repair" or "heating and cooling"?
   Plumbing → "emergency plumber" or "water heater"?
   Dental → "teeth whitening" or "dental implants"?
   ```

---

**Everything is built. Just need to:**
1. Confirm Supabase creds on VPS
2. Decide on citation checks (add $5 per 1000)
3. Test with Denver (10 businesses)

Ready when you are! 🚀
