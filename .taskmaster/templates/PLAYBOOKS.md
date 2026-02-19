# PLAYBOOKS.md - Task Strategies & Human-Thinking Workflows

> This file defines HOW to approach different task types. Think like a human, not a robot. Multiple methods available, with fallback logic and reasoning.

---

## Progressive Research Pattern

**Use when:** User asks for business/competitor research

**Strategy:**
```
Turn 1: Broad Discovery
  → Ask clarifying questions (location, volume, criteria)
  → Execute search (cache results)
  → Present overview: "Found 127 businesses"

Turn 2: Filter & Narrow
  → User steers: "Show me top-rated ones"
  → Filter cached results (no re-fetch!)
  → Present filtered list

Turn 3: Deep Analysis
  → User: "Analyze top 10 websites"
  → Spawn sub-agents (parallel, 10-20s)
  → Present comparison table

Turn 4: Action
  → User: "Export to CSV" or "Draft outreach email"
  → Generate deliverable
```

**Key:** Never re-fetch data. Cache aggressively. Let user steer each turn.

---

## Golf Tee Time Booking

**Use when:** User needs golf reservations with specific criteria

### Method 1: Async Batch (Speed-Optimized) ⚡

**When to use:** User says "fast" / "quickly" / background task / no interaction needed

**Think like a human who's in a hurry:**
1. **Discover courses** (Apify Google Maps: "{city} golf courses")
   - Get 10-20 courses with websites
   - Log: "Found 12 courses in {city}"
   
2. **Scrape all websites in parallel** (spawn 10-20 sub-agents)
   - Each agent: extract tee time data from one website
   - NO progress logging (just do it fast)
   - Wait for all to complete
   - Log: "Checked 12 websites in 18 seconds"
   
3. **Filter by criteria**
   - Date: {user.date}
   - Time: {user.timeRange}
   - Party size: {user.partySize}
   - Show only matches
   
4. **Present results**
   - Table format with booking links
   - Sorted by: availability → rating → price

**Pros:** ⚡ Fastest (40-50s total)  
**Cons:** ⚠️ No visibility during scraping, harder to debug failures  
**Cost:** ~$0.12

---

### Method 2: Sequential Logging (Transparency-Optimized) 👁️

**When to use:** User says "show me what you're doing" / first time / debugging / learning

**Think like a human who wants to understand:**
1. **Discover courses** (Apify: same as Method 1)
   - Log: "Found 12 courses"
   
2. **Check each website one at a time**
   - For course 1/12:
     - Log: "🔄 Checking Riverside Golf Club..."
     - Scrape tee times
     - Log: "✅ Found 5 available times between 9-11AM"
   - For course 2/12:
     - Log: "🔄 Checking Austin Country Club..."
     - Scrape tee times
     - Log: "❌ No times available in your range"
   - [Continue for all 12...]
   
3. **Filter and present**
   - Same as Method 1

**Pros:** 👁️ Full transparency, easy to debug, builds user trust  
**Cons:** 🐌 Slowest (90-120s total)  
**Cost:** ~$0.08 (no sub-agent overhead)

---

### Method 3: Hybrid Stream (Recommended) ⭐

**When to use:** Default choice, no explicit preference, balanced needs

**Think like a human who wants results fast BUT wants to see progress:**
1. **Discover courses** (Apify: same as above)
   - Log: "Found 12 courses"
   
2. **Spawn 12 parallel agents with progress streaming**
   - Launch all 12 at once
   - As EACH completes (not batched):
     - Log: "✅ Checked 3/12: Riverside Golf (5 times available)"
     - Log: "✅ Checked 5/12: Denver Country Club (no times)"
   - Show estimated time: "~15s remaining..."
   - All complete: "✅ Checked 12/12 in 22 seconds"
   
3. **Filter and present**
   - Same as Method 1

**Pros:** ⚡ Fast (45-55s) + 👁️ Real-time progress  
**Cons:** Slightly more complex, slight overhead  
**Cost:** ~$0.09

---

### Fallback Logic for Golf Booking

```
Try Method 3 (hybrid) by default
    ↓ FAILS (timeout, rate limit, error)
    ↓
⚠️ "Hybrid failed ({error}), trying sequential for reliability..."
    ↓
Try Method 2 (sequential_log)
    ↓ FAILS (all websites unreachable?)
    ↓
❌ "Unable to scrape booking data. Here are course websites for manual check:
    - Riverside Golf: https://...
    - Denver CC: https://...
    
    Want me to try again later or research alternative booking platforms?"
```

**Learn from failure:**
- Update MEMORY.md: "hybrid_stream failed on golf in {city}, sequential worked"
- Next time in same city: Start with sequential

---

## HVAC Contact Discovery with Owner Extraction

**Use when:** User needs business contacts including decision-maker names

### Method 1: Apify + Website Scrape (Recommended) ⭐

**Think like a human doing sales research:**
1. **Discover businesses** (Apify Google Maps)
   - Query: "{niche} in {location}"
   - Get: name, address, phone, website
   - Log: "Found 100 HVAC businesses"
   
2. **Extract owner names from websites** (parallel)
   - Filter: only businesses WITH websites (typically 60-80%)
   - Spawn sub-agents (10 at a time, to avoid rate limits)
   - Each agent:
     - Visit website
     - Look for: "About Us", "Team", "Meet the Owner", "Contact"
     - Extract: owner name, title, email if available
     - LLM inference: parse "Founded by John Smith" → owner = "John Smith"
   - Progress: "Extracted owners 8/60..."
   
3. **Present enriched results**
   - Table with: Business name | Phone | Owner | Website
   - Mark: ✅ Owner found (45/60), ⚠️ No owner page (15/60)

**Pros:** High success rate (70-80%), fast (60s for 100 businesses)  
**Cons:** Requires websites, some sites don't list owners publicly  
**Cost:** ~$0.15 ($0.05 Apify + $0.10 website scraping)

---

### Method 2: LinkedIn Enrichment (High-Accuracy)

**Think like a recruiter:**
1. **Discover businesses** (same as Method 1)
   
2. **Search LinkedIn for each business**
   - Query: "{business_name} owner {location}"
   - Filter by title: "Owner", "CEO", "President", "Founder"
   - Extract: name, title, LinkedIn URL
   
3. **Present enriched results**
   - Higher accuracy (90%+) but slower and more expensive

**Pros:** Very high accuracy, verified data  
**Cons:** Slower (2-3min), expensive ($0.30+), requires LinkedIn API  
**Cost:** ~$0.35

---

### Method 3: Apify Only (Basic)

**Think like someone who just needs phone numbers:**
1. **Discover businesses** (Apify)
2. **Skip owner extraction** (user gets basic contact info only)
3. **Present results** (name, phone, address, website)

**Pros:** Fast (30s), cheap ($0.05), reliable  
**Cons:** No owner names  
**Cost:** $0.05

**Fallback Chain:** `apify_website_scrape` → `linkedin_enrichment` → `apify_only`

---

## Method Selection Examples

### Example 1: User Wants Speed
```
User: "Find 100 HVAC in Denver ASAP with phone numbers"
                ↓
LLM reasoning:
"Keywords: 'ASAP' = speed critical
 Volume: 100 = high volume
 Required: phone numbers (standard field)
 
 SKILLS.md shows:
 - apify_gmaps: 30s, $0.05 (best for volume >50)
 - Owner extraction: not requested
 
 Decision: apify_gmaps (Method 3: Apify Only)
 No owner extraction needed = save time + cost"
```

### Example 2: User Wants Owners
```
User: "Find 50 HVAC businesses with owner names and phone numbers"
                ↓
LLM reasoning:
"Required: owner names (non-standard)
 Volume: 50 = medium
 
 SKILLS.md shows:
 - apify_website_scrape: 60s, $0.15, 70-80% success
 - linkedin_enrichment: 2-3m, $0.35, 90%+ success
 
 User didn't say 'fast', so prioritize quality.
 But $0.35 is expensive for 50 businesses.
 
 Decision: apify_website_scrape (Method 1)
 If <50% success rate, offer LinkedIn upgrade"
```

### Example 3: User Wants Visibility
```
User: "Find golf tee times for Feb 26, show me what you find"
                ↓
LLM reasoning:
"Keywords: 'show me' = wants transparency
 
 SKILLS.md shows:
 - hybrid_stream: 25s, high visibility (recommended)
 - sequential_log: 90s, full visibility
 
 MEMORY.md: (no preference stored)
 
 Decision: hybrid_stream (good balance)
 Will show progress: 'Checked 3/10 courses...'"
```

---

## Proactive Suggestions (for Heartbeat/Background)

When agent runs in background or proactive mode, suggest next steps based on context:

**After discovery:**
- "Found 100 businesses. Want me to analyze their websites?"
- "Should I extract owner names from the 60 businesses with websites?"

**After analysis:**
- "Identified 10 high-potential leads. Draft outreach emails?"
- "Export to CSV for your CRM?"

**Based on MEMORY.md:**
- "Last time you analyzed websites after discovery. Do the same now?"
- "You usually check for booking systems. Should I look for that?"

---

## Performance Tracking

Track method performance in MEMORY.md:

```markdown
## Method Performance Log

- apify_gmaps: 47 uses, 98% success, avg 28s
- hybrid_stream: 12 uses, 83% success, avg 27s (2 timeouts)
- sequential_log: 5 uses, 100% success, avg 95s
- browser_scrape: 3 uses, 66% success, avg 118s (1 captcha)

## Learned Preferences

- Golf booking: sequential_log preferred (user likes transparency)
- Business discovery: apify_gmaps reliable
- Website scraping: hybrid_stream sometimes times out → use sequential as fallback
```

---

**This playbook grows over time as agent learns!**
