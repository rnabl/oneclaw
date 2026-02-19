# SKILLS.md - Workflow Capabilities & Method Selection

> This file defines available workflows and execution methods. The LLM reads this to choose the best approach based on user intent, context, and constraints.

---

## Format Rules
- List ALL methods for each task type (multiple ways to skin a cat)
- Include benchmarks: time, cost, visibility, quality, scalability
- Mark ⭐ for recommended default
- Define fallback chain: Method 1 fails → Method 2 → Method 3

---

## Business Discovery

### Methods Available

| Method | Time | Cost | Max Results | Visibility | Quality | Use when |
|--------|------|------|-------------|------------|---------|----------|
| `apify_gmaps` ⭐ | 30s | $0.05 | 10k | Low | High | Standard discovery, volume >50, proven reliable |
| `google_places_api` | 5s | $0.02 | 1k | Medium | High | Fast response, structured data, low volume <20 |
| `browser_scrape` | 2m | $0.10 | 50 | High | Medium | Custom data extraction, Apify missing fields |

**Fallback Chain:** `apify_gmaps` → `google_places_api` → `browser_scrape`

**Decision Logic:**
- User says "fast" OR volume >100 → `apify_gmaps`
- User says "just a few" OR volume <20 → `google_places_api`
- User needs custom fields not in Apify → `browser_scrape`
- First time user → `apify_gmaps` (most reliable)

---

## Contact Extraction (Owner Names, Decision Makers)

### Methods Available

| Method | Time | Cost | Accuracy | Visibility | Use when |
|--------|------|------|----------|------------|----------|
| `website_scrape_llm` ⭐ | 10s/site | $0.03 | High | Medium | Website has "About" or "Team" page |
| `linkedin_search` | 15s/company | $0.05 | Very High | Low | Need verified decision makers |
| `manual_prompt` | 0s | $0 | N/A | High | Not enough data, ask user to provide |

**Fallback Chain:** `website_scrape_llm` → `linkedin_search` → `manual_prompt`

**Decision Logic:**
- If website available → try `website_scrape_llm` first
- If business >10 employees → use `linkedin_search` (more reliable)
- If both fail → `manual_prompt` (ask user if they know owner)

---

## Website Analysis

### Methods Available

| Method | Time | Cost | Parallelism | Logging | Use when |
|--------|------|------|-------------|---------|----------|
| `async_batch` | 15s | $0.08 | Yes (10 at once) | Minimal | Speed critical, background task, no interaction needed |
| `sequential_log` | 90s | $0.08 | No (one at a time) | Full | User watching, debugging, need transparency |
| `hybrid_stream` ⭐ | 25s | $0.09 | Yes + Progress | Progressive | Default, best balance of speed + visibility |

**Fallback Chain:** `hybrid_stream` → `sequential_log` (async_batch has no fallback - too unreliable without logs)

**Decision Logic:**
- User says "quickly" / "fast" / "asap" → `async_batch`
- User says "show me" / "explain" / "how does it work" → `sequential_log`
- No preference OR first time → `hybrid_stream` (recommended)
- Background/scheduled task → `async_batch` (no user watching)

---

## Golf Tee Time Booking

### Methods Available

| Method | Time | Cost | Reliability | Data Quality | Use when |
|--------|------|------|-------------|--------------|----------|
| `apify_browse_parallel` ⭐ | 45s | $0.12 | Medium | High | Standard search, multiple courses |
| `browser_sequential` | 2m | $0.10 | High | Very High | Need accurate times, debugging |
| `api_direct` | 10s | $0.05 | Very High | Perfect | Course has booking API (rare) |

**Fallback Chain:** `apify_browse_parallel` → `browser_sequential` → `manual_prompt` ("Here are course websites, please check manually")

**Decision Logic:**
- Default → `apify_browse_parallel` (good balance)
- User says "accurate" / "exact" → `browser_sequential` (more reliable)
- Specific course known to have API → `api_direct` (fastest)
- All methods fail → provide links, ask user to check manually

---

## Email Management

### Methods Available

| Method | Time | Cost | Automation | Use when |
|--------|------|------|------------|----------|
| `gmail_check` ⭐ | 5s | $0.01 | Manual | User reviews before action (default for new users) |
| `gmail_auto_triage` | 10s | $0.03 | Full | Background monitoring, trusted rules established |
| `gmail_smart_triage` | 15s | $0.05 | LLM-assisted | Learning mode, semi-autonomous, building trust |

**Fallback Chain:** `gmail_smart_triage` → `gmail_check` → `manual_prompt`

**Decision Logic:**
- New user → `gmail_check` (build trust)
- User has used 5+ times without issues → offer `gmail_auto_triage`
- User explicitly requests automation → `gmail_smart_triage`

---

## General Decision-Making Framework

### Priority Order:
1. **Check MEMORY.md first**
   - "User prefers speed" → pick fastest method
   - "User likes seeing progress" → pick most visible method
   - "User is detail-oriented" → pick highest quality method

2. **Parse user intent**
   - Keywords: "fast", "quickly", "asap", "hurry" → prioritize speed
   - Keywords: "show me", "explain", "how", "progress" → prioritize visibility
   - Keywords: "accurate", "exact", "precise", "reliable" → prioritize quality
   - No keywords → use ⭐ recommended method

3. **Consider context**
   - First time doing this task type → pick most reliable (even if slower)
   - Background/scheduled task → pick fastest (no visibility needed)
   - Interactive chat → pick hybrid/balanced
   - Budget limited → pick cheapest (show cost upfront)

4. **Use fallback chain on failure**
   - Log: "⚠️ Method 1 failed ({error}), trying Method 2..."
   - Update MEMORY.md: "Method 1 unreliable for {task}, prefer Method 2"
   - Next time: Skip failed method, start with what worked

---

## Cost Optimization

- Check wallet balance before expensive methods
- Offer cheaper alternative if budget low: "Low balance ($0.50), recommend google_places_api ($0.02) instead of apify ($0.05)?"
- Batch operations when possible (10 websites in one call vs 10 separate calls)

---

## Adding New Skills

When agent learns a new task:
1. Research generates method options
2. User picks one, execution succeeds
3. Add new section to SKILLS.md with benchmarks
4. Include fallback chain based on reliability
5. Upload to Harness repository (optional)

**Example:**
```markdown
## Restaurant Reservations (Learned 2024-02-18)

| Method | Time | Cost | Reliability | Use when |
|--------|------|------|-------------|----------|
| opentable_api ⭐ | 10s | $0.03 | High | Restaurant on OpenTable |
| browser_scrape | 45s | $0.08 | Medium | No API available |
| manual_prompt | 0s | $0 | N/A | No online booking |

**Fallback Chain:** `opentable_api` → `browser_scrape` → `manual_prompt`
```

---

**Total Token Budget: ~600 tokens (stays under 800 for performance)**
