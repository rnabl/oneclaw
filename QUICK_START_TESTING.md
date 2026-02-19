# Quick Start: Testing the New Workflows 🚀

## Setup

1. **Install dependencies** (if not already):
```bash
pnpm install
```

2. **Add API keys** to `.env`:
```bash
# Required for Golf Booking
BRAVE_API_KEY=BSA...         # Get from https://brave.com/search/api/
PLAYWRIGHT_ENABLED=true      # Enable browser automation

# Required for HVAC Discovery
BRAVE_API_KEY=BSA...         # Same key as above
# OR
APIFY_API_TOKEN=apify_api... # Fallback if no Brave key

# Optional: Premium APIs
GOLFNOW_API_KEY=xxx          # For Method 1 (fastest golf booking)
LINKEDIN_API_KEY=xxx         # For verified owner enrichment
```

3. **Start the server**:
```bash
npm run dev
# or
npx turbo dev
```

---

## Test 1: Golf Tee Time Booking 🏌️

### API Call:
```bash
curl -X POST http://localhost:3000/api/jobs \
  -H "Content-Type: application/json" \
  -d '{
    "workflowId": "golf-tee-time-booking",
    "input": {
      "location": "Denver, CO",
      "date": "2026-02-26",
      "timeRange": "9-10AM",
      "partySize": 4
    }
  }'
```

### Expected Response:
```json
{
  "jobId": "job_123",
  "status": "running"
}
```

### Watch Progress:
```bash
curl http://localhost:3000/api/jobs/job_123/status
```

### Expected Output:
```json
{
  "availableTimes": [
    {
      "course": {
        "name": "Riverside Golf Club",
        "website": "https://riversidegolf.com",
        "rating": 4.5,
        "source": "brave_search"
      },
      "time": "9:30 AM",
      "date": "2026-02-26",
      "players": 4,
      "price": 85,
      "bookingUrl": "https://riversidegolf.com/booking",
      "availability": "confirmed"
    }
  ],
  "stats": {
    "coursesChecked": 10,
    "timesFound": 3,
    "method": "brave_playwright_hybrid",
    "timeMs": 28000,
    "cost": 0.16
  },
  "toolsUsed": ["brave_search", "playwright"]
}
```

---

## Test 2: HVAC Contact Discovery 🔧

### API Call:
```bash
curl -X POST http://localhost:3000/api/jobs \
  -H "Content-Type: application/json" \
  -d '{
    "workflowId": "hvac-contact-discovery",
    "input": {
      "location": "Denver, CO",
      "limit": 100,
      "extractOwners": true
    }
  }'
```

### Expected Output:
```json
{
  "businesses": [
    {
      "name": "Smith HVAC Services",
      "phone": "(303) 555-0123",
      "website": "https://smithhvac.com",
      "address": "123 Main St",
      "city": "Denver",
      "state": "CO",
      "zipCode": "80202",
      "rating": 4.8,
      "owner": {
        "name": "John Smith",
        "title": "Owner",
        "source": "website"
      }
    }
  ],
  "stats": {
    "total": 100,
    "withOwners": 45,
    "withoutOwners": 55,
    "method": "brave_website_scrape",
    "timeMs": 60000,
    "cost": 0.18
  },
  "toolsUsed": ["brave_search", "cheerio", "llm"]
}
```

---

## Testing Self-Reflection 🧠

### Test: What happens if Brave API key is missing?

**Remove `BRAVE_API_KEY` from `.env`**, then run golf booking:

```bash
curl -X POST http://localhost:3000/api/jobs \
  -H "Content-Type: application/json" \
  -d '{
    "workflowId": "golf-tee-time-booking",
    "input": {
      "location": "Denver, CO",
      "date": "2026-02-26",
      "timeRange": "9-10AM",
      "partySize": 4
    }
  }'
```

**Expected behavior:**
```
Agent logs:
1. "Analyzing task requirements..."
2. "Tool analysis: Brave unavailable, using Apify + Playwright"
3. "Discovering courses via Apify (fallback)..."
4. "Found 10 golf courses"
5. "Visiting websites in parallel..."
```

---

## Testing Fallback Chains 🔄

### Test: Force Method 1 to fail

**Edit `golf-booking.ts` temporarily:**
```typescript
// In searchViaGolfNowAPI function, add:
throw new Error('GolfNow API unavailable');
```

**Run workflow with method specified:**
```bash
curl -X POST http://localhost:3000/api/jobs \
  -H "Content-Type: application/json" \
  -d '{
    "workflowId": "golf-tee-time-booking",
    "input": {
      "location": "Denver, CO",
      "date": "2026-02-26",
      "timeRange": "9-10AM",
      "partySize": 4,
      "method": "golfnow_api"
    }
  }'
```

**Expected logs:**
```
1. "🎯 Method 1: Trying GolfNow API (fastest)..."
2. "⚠️ GolfNow API failed: GolfNow API unavailable"
3. "🔄 Falling back to Brave + Playwright..."
4. "🎯 Method 2: Using Brave Search + Playwright (hybrid)..."
5. "✅ Brave + Playwright succeeded: 3 times found"
6. "📝 Learning: Primary method failed, fallback succeeded. Will adjust MEMORY.md."
```

---

## Testing Progress Streaming 📊

### Watch logs in real-time:

**Terminal 1** (start server):
```bash
npm run dev
```

**Terminal 2** (trigger workflow):
```bash
curl -X POST http://localhost:3000/api/jobs \
  -H "Content-Type: application/json" \
  -d '{
    "workflowId": "hvac-contact-discovery",
    "input": {
      "location": "Denver, CO",
      "limit": 20,
      "extractOwners": true
    }
  }'
```

**Expected console output:**
```
[harness] Starting HVAC contact discovery: Denver, CO
[harness] Analyzing task requirements (human-thinking approach)...
[harness] Tool analysis: Brave + Cheerio + LLM available - fast and cost-effective (60s, $0.18, 75%)
[harness] Discovering businesses via Brave Search...
[harness] Brave found 20 businesses
[harness] 12 businesses have websites
[harness] Extracting owners from 12 websites (parallel method)...
[harness] Extracted owners 5/12...
[harness] Extracted owners 10/12...
[harness] Extracted owners 12/12...
[harness] Owner extraction complete: 9/12 found (75% success)
[harness] HVAC discovery complete
```

---

## Testing Cost Optimization 💰

### Test: Low wallet balance

**Mock wallet balance in context:**
```typescript
// In workflow handler:
ctx.walletBalance = 0.10; // Only 10 cents
```

**Expected behavior:**
```
Agent logs:
"⚠️ Low balance ($0.10), recommend apify_only ($0.05) instead of brave_website_scrape ($0.18)?"
"Would you like to:"
"1. Continue with apify_only (no owner extraction) - $0.05"
"2. Continue with brave_website_scrape (with owners) - $0.18"
"3. Cancel"
```

---

## Debugging Tips 🐛

### 1. **Enable debug logging:**
```bash
# .env
LOG_LEVEL=debug
```

### 2. **Check job status:**
```bash
curl http://localhost:3000/api/jobs/job_123/status
```

### 3. **View full logs:**
```bash
curl http://localhost:3000/api/jobs/job_123/logs
```

### 4. **Test with mock data:**
If Brave/Apify unavailable, the workflows will return mock data (look for `"source": "mock"`).

---

## Common Issues

### Issue 1: "Brave API key not available"
**Solution:** Add `BRAVE_API_KEY=BSA...` to `.env`

### Issue 2: "Playwright not enabled"
**Solution:** Add `PLAYWRIGHT_ENABLED=true` to `.env`

### Issue 3: "No tee times found"
**Reason:** Playwright is currently simulated (returns mock data with 60% success rate)
**Next step:** Implement real Playwright browser automation

### Issue 4: "Owner extraction failed"
**Check:**
- Is the website accessible?
- Does the website have an "About" page?
- Is Cheerio parsing correctly? (check logs)

---

## Next Steps 🎯

1. ✅ **Test basic flow** (API call → response)
2. ✅ **Verify self-reflection** (missing tools → fallback)
3. ✅ **Watch progress streaming** (real-time logs)
4. ⏳ **Implement real Playwright** (replace mocks)
5. ⏳ **Add Perplexity for Research Mode**
6. ⏳ **Build playbook auto-generation**

---

## Success Criteria ✅

You'll know it's working when:
- ✅ Golf workflow returns tee times (even if mocked)
- ✅ HVAC workflow extracts owner names from websites
- ✅ Self-reflection logs show tool availability check
- ✅ Fallback chain activates when Method 1 fails
- ✅ Progress streaming shows "Extracted owners 5/10..."
- ✅ Cost tracking shows `$0.18` for Brave + scraping

---

**Ready to test?** Run `npm run dev` and start with Test 1! 🚀
