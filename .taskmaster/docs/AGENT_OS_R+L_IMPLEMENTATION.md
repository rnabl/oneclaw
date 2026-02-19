# Agent OS Implementation Plan - R+L Enhanced

## Overview

This document extends the original agent_os_prd.md with Research+Learn (R+L) capabilities, multi-method workflows, and harness repository integration.

---

## NEW TASKS (Insert After Task 20)

### Research + Learn Phase (Day 3.5 - NEW)

#### Task 21: Implement Research Mode for Unknown Tasks
**Priority:** High  
**Dependencies:** [20]  
**Description:** Create research module that investigates unknown tasks and proposes execution methods

**Details:**
- Detect when no workflow matches user request in SKILLS.md
- Call Perplexity API to research: "How to accomplish {task} programmatically?"
- Analyze available executors in registry
- Output 2-3 method options with:
  - Estimated time and cost
  - Required tools/executors
  - Reliability rating
  - Visibility level (logs/progress)
- Check for missing API keys (Playwright, LinkedIn, etc.)
- Prompt user if tools need configuration

**Test Strategy:**
- Request unknown task: "Find golf tee times in Denver"
- Verify agent enters research mode
- Shows multiple method options with benchmarks
- Detects missing tools and prompts for keys

---

#### Task 22: Add Dynamic Planning UI
**Priority:** High  
**Dependencies:** [21]  
**Description:** Show research results to user and allow method selection

**Details:**
- Display method options in table format:
  ```
  Method 1 (async_batch): 20s, $0.08, minimal logs ⚡
  Method 2 (sequential): 90s, $0.08, full logs 👁️  
  Method 3 (hybrid): 25s, $0.09, progressive logs ⭐ (recommended)
  ```
- Allow user to:
  - Pick a method manually [1] [2] [3]
  - Auto-select recommended [Auto]
  - Research alternative [Rethink]
- Store selected method for execution
- Show missing tools warning if applicable

**Test Strategy:**
- Research mode presents options clearly
- User can select method via UI/chat
- Selection stored correctly
- UI is intuitive (non-technical users can understand)

---

#### Task 23: Implement Dynamic Workflow Execution
**Priority:** High  
**Dependencies:** [22]  
**Description:** Enable LLM to chain executors without pre-built YAML workflows

**Details:**
- Allow agent to construct workflow dynamically:
  ```typescript
  const workflow = [
    { executor: 'apify_gmaps', params: {...} },
    { executor: 'spawn_subagents', params: { count: 10, task: 'scrape_website' } },
    { executor: 'filter', params: {...} },
  ];
  ```
- Log each executor call with:
  - Timing (start, end, duration)
  - Cost (for billing)
  - Result (success/failure)
  - Output data
- Store execution trace for learning
- Support both parallel (sub-agents) and sequential execution

**Test Strategy:**
- Execute dynamically constructed workflow
- Verify executors chain correctly
- All steps logged with timing/cost
- Execution completes successfully
- Trace stored for playbook generation

---

#### Task 24: Add Tool Auto-Detection
**Priority:** Medium  
**Dependencies:** [23]  
**Description:** Detect missing tools/API keys and prompt user to configure them

**Details:**
- Parse research plan for required tools:
  - Playwright, Puppeteer → check for PLAYWRIGHT_KEY
  - LinkedIn scraping → check for LINKEDIN_API_KEY
  - Browser automation → check if browser executor available
- Show user prompt:
  ```
  ⚠️ This method requires PLAYWRIGHT_KEY
  [Add Key] [Try Alternative Method] [Skip This Task]
  ```
- Link to settings page for key configuration
- After key added, offer to retry execution

**Test Strategy:**
- Research plan requires Playwright but key missing
- User prompted to add key with clear instructions
- After adding key, agent can proceed
- Fallback to alternative method if user declines

---

#### Task 25: Implement Playbook Generation After Success
**Priority:** High  
**Dependencies:** [24]  
**Description:** Auto-generate playbook entries from successful dynamic executions

**Details:**
- After dynamic execution succeeds, use LLM to summarize:
  - Task description
  - Method used (async/sequential/hybrid)
  - Steps taken (executor chain)
  - Actual benchmarks (time, cost from execution trace)
  - Decision criteria ("Use when user needs speed", "Use when debugging")
- Generate markdown format matching PLAYBOOKS.md structure
- Prompt user: "✨ Success! Save this workflow for future use? [Local] [Share to Harness] [No Thanks]"
- If Local: Append to ~/.oneclaw/PLAYBOOKS.md
- If Share: Also upload to harness repository (Task 28)

**Test Strategy:**
- Complete dynamic workflow successfully
- Playbook entry generated with correct format
- User can approve/reject
- Entry appended to PLAYBOOKS.md if approved
- Next execution of same task type uses learned workflow

---

#### Task 26: Auto-Update SKILLS.md with Learned Workflows  
**Priority:** High  
**Dependencies:** [25]  
**Description:** Add learned workflows to SKILLS.md benchmarks table automatically

**Details:**
- When user approves playbook save, extract benchmark data:
  - Actual time (from execution trace)
  - Actual cost (from metered calls)
  - Success/failure rate
  - Method type
- Append new row to appropriate section in SKILLS.md:
  ```markdown
  | golf_booking_hybrid | 25s | $0.09 | High | 50 | Balanced speed+visibility |
  ```
- Trigger file versioning (hash changed)
- Create snapshot
- Next LLM call: sees new workflow option in SKILLS.md

**Test Strategy:**
- Save playbook after successful execution
- SKILLS.md updated with new benchmark row
- Benchmarks reflect actual execution data (not estimates)
- File version bumped
- Snapshot created
- Next execution: LLM references new workflow in SKILLS.md

---

### Harness Repository Integration (Day 6 - NEW)

#### Task 27: Implement Harness Workflow Repository API
**Priority:** High  
**Dependencies:** [26]  
**Description:** Create API endpoints for sharing learned workflows across users

**Details:**
Create harness API endpoints in `apps/api/src/routes/workflows.ts`:

1. **GET /api/workflows?task={type}** - Search workflows
   - Query by task type (golf_booking, hvac_discovery, etc.)
   - Return: Array of workflows with metadata
   - Include: id, name, description, creator, uses, success_rate, version, yaml_content

2. **POST /api/workflows** - Upload workflow
   - Body: { name, task_type, yaml_content, method, benchmarks }
   - Validate YAML structure
   - Store in Supabase workflows table
   - Return: workflow_id

3. **GET /api/workflows/{id}** - Download workflow
   - Return full workflow with YAML
   - Increment usage counter

4. **GET /api/workflows/{id}/stats** - Get workflow statistics
   - Return: uses, success_rate, avg_time, avg_cost, ratings

**Schema (Supabase):**
```sql
CREATE TABLE workflows (
  id UUID PRIMARY KEY,
  task_type TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  yaml_content TEXT NOT NULL,
  method TEXT NOT NULL, -- 'hybrid', 'sequential', etc.
  creator_id UUID REFERENCES users(id),
  uses INTEGER DEFAULT 0,
  success_count INTEGER DEFAULT 0,
  failure_count INTEGER DEFAULT 0,
  avg_time_ms INTEGER,
  avg_cost DECIMAL(10,4),
  version TEXT DEFAULT '1.0.0',
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_workflows_task_type ON workflows(task_type);
```

**Test Strategy:**
- Test search: Returns relevant workflows for task type
- Test upload: Saves workflow with all metadata
- Test download: Retrieves full workflow YAML
- Test stats: Tracks usage accurately
- Test auth: Only authenticated users can upload

---

#### Task 28: Implement Workflow Upload Flow
**Priority:** Medium  
**Dependencies:** [27]  
**Description:** Allow users to share learned workflows to harness repository

**Details:**
- After playbook generation (Task 25), if user chooses "Share to Harness":
  1. Generate workflow YAML from logged executor chain
  2. Include metadata:
     - Creator ID (from auth)
     - Initial benchmarks (from execution)
     - Method type (hybrid/sequential/async)
     - Description (from LLM summary)
  3. POST to /api/workflows with auth token
  4. Handle response:
     - Success: "✅ Uploaded as 'golf_booking' v1.0.0 to harness!"
     - Error: "❌ Upload failed: {reason}"
  5. Store workflow ID locally for future updates

**Test Strategy:**
- Complete dynamic workflow
- Choose "Share to Harness"
- Verify YAML generated correctly from execution trace
- Upload succeeds with proper auth
- Workflow appears in harness repository search
- Confirmation message shown to user
- Local config stores workflow ID

---

#### Task 29: Implement Workflow Download Flow
**Priority:** Medium  
**Dependencies:** [28]  
**Description:** Allow agents to download and use workflows shared by other users

**Details:**
- Before entering research mode, query harness repository:
  ```typescript
  const existingWorkflows = await fetch('/api/workflows?task=golf_booking');
  ```
- If workflows found, show user:
  ```
  ✅ Found existing workflow: "golf_booking_hybrid"
  - Created by: User A
  - Used: 15 times
  - Success rate: 93%
  - Time: ~25s, Cost: ~$0.09
  
  [Use This Workflow] [Research New Approach] [Customize]
  ```
- If user approves:
  1. Download workflow YAML
  2. Cache locally in ~/.oneclaw/workflows/harness/
  3. Execute workflow
  4. Report usage back to harness (increment counter)
- Benefits:
  - User B benefits from User A's learning (network effect!)
  - No research time needed (<5s download vs 30-60s research)
  - Proven reliability (success rate visible)

**Test Strategy:**
- User A uploads workflow to harness
- User B requests same task type
- Agent queries harness, finds User A's workflow
- Shows stats clearly
- User B approves
- Workflow downloads and executes successfully
- Execution time <10s (vs 60s+ for research)
- Harness usage counter increments

---

#### Task 30: Test Network Effect with Multiple Users
**Priority:** High  
**Dependencies:** [29]  
**Description:** Verify workflow sharing creates self-improving system across users

**Details:**
End-to-end test scenario:
1. **User A (First Time):**
   - Request: "Find golf tee times in Austin"
   - Agent: Enters research mode (no workflow exists)
   - Agent: Shows 3 method options
   - User A: Picks hybrid
   - Agent: Executes (~50s total)
   - Agent: Offers to save
   - User A: Shares to harness
   - Result: Workflow uploaded to repository

2. **User B (Benefits from A):**
   - Request: "Find golf tee times in Miami"
   - Agent: Queries harness, finds golf_booking workflow
   - Agent: "Found existing workflow (15 uses, 93% success)"
   - User B: Uses it
   - Agent: Downloads + executes (~5s download + 25s execute = 30s total)
   - Result: Saved 20-30s, no research needed!

**Success Criteria:**
- User A's research/learning benefits User B
- User B's execution faster than User A's first time
- Usage stats update (uses: 1 → 2)
- Both users have functional workflows

**Test Strategy:**
- Complete full flow with two separate user accounts
- Measure time savings
- Verify workflow stats update
- Confirm network learning effect works

---

### Method Fallback Logic (Day 4.5 - NEW)

#### Task 31: Add Method Fallback Chain Implementation
**Priority:** High  
**Dependencies:** [23]  
**Description:** Implement graceful degradation when primary method fails

**Details:**
Define fallback chains in SKILLS.md for each workflow type:

```markdown
## Golf Booking Fallbacks
1. hybrid_stream (try first)
   ↓ fails (timeout, rate limit)
2. sequential_log (fallback)
   ↓ fails (all websites unreachable)
3. manual_links (last resort - show user course websites)
```

Implementation:
```typescript
async function executeWithFallback(methods, ctx) {
  for (let i = 0; i < methods.length; i++) {
    try {
      const result = await executeMethod(methods[i], ctx);
      
      if (i > 0) {
        // Log that we used fallback
        await ctx.log('info', `✅ Fallback to ${methods[i].name} successful`);
        
        // Update MEMORY.md
        await appendMemory(`Method ${methods[0].name} failed for {task}, ${methods[i].name} worked`);
      }
      
      return result;
      
    } catch (error) {
      if (i < methods.length - 1) {
        await ctx.log('warn', `⚠️ ${methods[i].name} failed: ${error.message}, trying ${methods[i+1].name}...`);
      } else {
        throw new Error(`All methods failed: ${error.message}`);
      }
    }
  }
}
```

**Test Strategy:**
- Force primary method (hybrid) to fail via timeout
- Verify agent automatically tries sequential
- Success message indicates fallback used
- MEMORY.md updated with learned preference: "hybrid unreliable for golf in Denver, use sequential"
- Next execution in same city: Start with sequential (skip hybrid)

---

### Example Workflows (Day 7 - NEW)

#### Task 32: Build HVAC Contact Discovery Workflow
**Priority:** High  
**Dependencies:** [31]  
**Description:** Create production workflow for finding HVAC businesses with owner names

**Details:**
Create `packages/harness/src/workflows/hvac-contact-discovery.ts`:

**Workflow Steps:**
1. **Discover HVAC businesses** (Apify Google Maps)
   - Query: "HVAC" in {location}
   - Get: name, phone, website, address, rating
   - Target: 100 businesses
   - Time: 30s, Cost: $0.05

2. **Extract owner names** (Parallel website scraping)
   - Filter: businesses WITH websites (typically 60-80%)
   - Method options:
     - `hybrid`: Spawn 10 sub-agents at a time, stream progress
     - `sequential`: One-by-one with full logging
     - `apify_only`: Skip owner extraction
   - For each website:
     - Visit site
     - Look for: "About Us", "Team", "Meet the Owner"
     - Extract: owner name, title using LLM parsing
     - Examples: "Founded by John Smith" → owner = "John Smith"
   - Log progress: "Extracted owners 8/60..."
   - Time: 60s (hybrid), 180s (sequential)
   - Cost: $0.10 (LLM calls for parsing)

3. **Present enriched results**
   - Table: Business name | Phone | Owner | Website
   - Mark: ✅ Owner found (45/60), ⚠️ No owner page (15/60)
   - Offer export to CSV

**Input:**
```typescript
{
  location: "Denver, CO",
  limit: 100,
  extractOwners: true,
  method: "hybrid" | "sequential" | "apify_only" | undefined (auto-select)
}
```

**Output:**
```typescript
{
  businesses: [{
    name: string,
    phone: string,
    website: string,
    owner: { name: string, title: string, source: 'website' | 'inference' } | undefined
  }],
  stats: {
    total: 100,
    withOwners: 45,
    withoutOwners: 55,
    method: 'hybrid',
    timeMs: 90000,
    cost: 0.15
  }
}
```

**Fallback Chain:** hybrid → sequential → apify_only (no owners)

**Test Strategy:**
- Execute: "Find 100 HVAC businesses with owners in Denver"
- Verify Apify returns 100 businesses
- Owner extraction runs (hybrid method)
- Results include owner names for 60-80% of businesses with websites
- Total time: <2 minutes
- Total cost: ~$0.15
- Can fallback to sequential if hybrid fails

---

#### Task 33: Build Golf Tee Time Booking Workflow
**Priority:** High  
**Dependencies:** [32]  
**Description:** Create production workflow for finding golf tee times with specific criteria

**Details:**
Create `packages/harness/src/workflows/golf-booking.ts`:

**Workflow Steps:**
1. **Find golf courses** (Apify Google Maps)
   - Query: "golf courses" in {location}
   - Get: name, website, phone, address, rating
   - Filter: only courses WITH websites (need for booking check)
   - Target: 10 courses
   - Time: 30s, Cost: $0.05

2. **Check tee time availability** (Parallel website scraping)
   - Method options:
     - `hybrid`: Parallel + progress streaming ⭐
     - `sequential`: One-by-one with full logs
     - `async_batch`: All at once, minimal logs
   - For each course website:
     - Navigate to booking page
     - Look for: "Book Tee Time", "Reservations", "Tee Sheet"
     - Extract: available times via HTML parsing or LLM screenshot analysis
     - Filter by:
       - Date: {user.date} (e.g., "2026-02-26")
       - Time range: {user.timeRange} (e.g., "9:00-10:00")
       - Party size: {user.partySize} (e.g., 4 players)
   - Progress: "✅ Checked 3/10: Riverside Golf (5 times found)"
   - Time: 20s (hybrid), 90s (sequential)
   - Cost: $0.08-0.12 (browser automation)

3. **Filter and sort results**
   - Filter: only times matching criteria
   - Sort by: time (closest to start) → rating → price
   - Show top 5 options

4. **Present results**
   - Table: Course | Time | Players | Price | Rating | [Book]
   - Each row has clickable booking link

**Input:**
```typescript
{
  location: "Denver, CO",
  date: "2026-02-26" | "Feb 26",
  timeRange: "9:00-10:00" | "9-10AM",
  partySize: 4,
  maxCourses: 10,
  method: "hybrid" | "sequential" | "async_batch" | undefined (auto-select)
}
```

**Output:**
```typescript
{
  availableTimes: [{
    course: { name, website, phone, address, rating },
    time: "9:30 AM",
    date: "2026-02-26",
    players: 4,
    price: 85,
    bookingUrl: string,
    availability: 'confirmed' | 'likely' | 'unknown'
  }],
  stats: {
    coursesChecked: 10,
    timesFound: 8,
    method: 'hybrid',
    timeMs: 50000,
    cost: 0.17
  }
}
```

**Fallback Chain:** hybrid → sequential → manual_links (show websites to user)

**Test Criteria (from user):**
- Date: February 26, 2026
- Location: Denver, CO
- Time: 9-10 AM
- Party size: 4 players (foursome)

**Test Strategy:**
- Execute: "Find golf tee times for Feb 26 in Denver for 4 people between 9-10AM"
- Parse date/time/party size correctly
- Find 10+ golf courses in Denver
- Check each website for availability
- Filter: only times in 9-10AM range for 4 players
- Results show times between 9:00-10:00 AM
- Booking links are functional
- Total time: <60s
- Total cost: ~$0.17
- Fallback works if hybrid fails

---

## Updated Task Dependencies

Original tasks 21-40 now depend on new R+L tasks:

- Old Task 21 (Conversation State) → Now depends on Task 30 (Network Effect tested)
- Tasks 21-30 (NEW) form the R+L layer
- Tasks 31-40 (renamed from 21-30) continue as planned

---

## Implementation Order

**Week 1:**
- Days 1-2: Foundation (SOUL, IDENTITY, MEMORY, SKILLS) → Tasks 1-16
- Day 3: Playbooks + Sub-Agents → Tasks 17-20
- **Day 3.5: Research + Learn → Tasks 21-26 (NEW)**

**Week 2:**
- Day 4: Harness Integration → Tasks 27-30 (NEW)
- Day 4.5: Method Fallbacks → Task 31 (NEW)
- **Day 5: Example Workflows → Tasks 32-33 (NEW)**
- Days 6-7: Progressive State + Versioning + UI + Polish → Remaining tasks

---

## Success Metrics (Updated)

**After Day 3.5:**
- [ ] Agent can research unknown tasks
- [ ] Shows multiple method options to user
- [ ] Dynamically executes workflows without pre-built YAML
- [ ] Saves successful patterns to PLAYBOOKS.md
- [ ] SKILLS.md auto-updates with learned workflows

**After Day 4:**
- [ ] Workflows uploaded to harness repository
- [ ] Other users can download shared workflows
- [ ] Network effect works (User B benefits from User A)
- [ ] Download faster than research (<10s vs 60s)

**After Day 5:**
- [ ] HVAC workflow extracts owner names (60-80% success)
- [ ] Golf workflow filters by specific date/time/party-size
- [ ] Both workflows use multi-method with fallbacks
- [ ] Fallback chains work gracefully (no user intervention needed)

---

## Key Architectural Principles

1. **Modular:** Workflows are composable executor chains
2. **Pluggable:** Executors can be swapped (browser → Playwright → Puppeteer)
3. **Lightweight:** Deploy on Mac mini / VPS (Node.js + SQLite + minimal deps)
4. **Self-Improving:** Every user teaches the system new capabilities
5. **Graceful Degradation:** Multiple fallback methods ensure reliability
6. **Human-Thinking:** Workflows mirror how humans approach tasks

---

**This is the R+L enhanced Agent OS - autonomous, self-learning, and production-ready.**
