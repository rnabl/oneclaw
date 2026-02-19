# PRD: OneClaw Agent OS Layer (R+L Enhanced)

**One-liner:** Self-improving autonomous agent with Research+Learn loop, multi-method workflows, and shared harness repository - OpenClaw vibe meets OneClaw reliability.

---

## Problem

**Current:** OneClaw Node executes reliably but feels cold (no personality, no memory, no smart routing)

**Competitors:**
- OpenClaw: Great vibe, unreliable execution, learns dynamically
- CrewAI: Requires Python code, static workflows
- Zapier: No reasoning, rigid, pre-defined only

**Opportunity:** OpenClaw vibe + OneClaw reliability + Self-learning = viral product

---

## Solution: Four Layers

### Layer 1: Agent OS (Cognition)
Five `.md` files guide LLM:
1. **SOUL.md** (400 tokens) — Purpose, principles, tone
2. **IDENTITY.md** (150 tokens) — Name, role, style
3. **SKILLS.md** (600 tokens) — Multi-method benchmarks (NEW: fallback chains)
4. **PLAYBOOKS.md** (1200 tokens) — Task strategies with method selection logic
5. **MEMORY.md** (2-3k tokens) — Learned preferences + method performance

### Layer 2: Research + Learn Loop (NEW)
Dynamic workflow discovery and improvement:
- **Research:** LLM investigates unknown tasks, proposes approach
- **Plan:** Shows user multiple methods with tradeoffs
- **Execute:** Chains executors dynamically, logs each step
- **Learn:** Saves successful patterns to local PLAYBOOKS.md
- **Share:** Uploads proven workflows to Harness repository

### Layer 3: Executor Registry
Pre-built TypeScript/Rust executors (composable):
- `http.request`, `browser.navigate`, `gmail.send`, `calendar.list`
- `llm.call`, `llm.spawn_subagents` (parallel workers)
- `file.write`, `transform.json`

### Layer 4: Sub-Agents (Parallelism)
Spawn N parallel LLM workers with progress streaming:
- **Use:** Check 10 websites in 20s vs 90s sequential
- **Pricing:** $0.01 + $0.005/agent
- **Progress:** Stream updates as each completes ("Checked 3/10...")
- **Fallback:** If parallel fails, retry sequentially

---

## Core Features

### 1. Multi-Method Workflow Selection (NEW)
SKILLS.md = catalog with MULTIPLE methods per task:
```markdown
## Golf Tee Time Search
| Method | Time | Cost | Visibility | Use when |
| async_batch | 20s | $0.08 | Low | Speed critical |
| sequential | 90s | $0.08 | High | Need transparency |
| hybrid ⭐ | 25s | $0.09 | High | Default (recommended) |
```
LLM chooses method based on:
- User intent ("fast" → async, "show me" → sequential)
- MEMORY.md preferences
- Fallback chain: Method 1 fails → try Method 2 → try Method 3

### 2. Research + Learn Loop (NEW)
```
Unknown Task Detected
    ↓
Research: Query Perplexity/harness for approach
    ↓
Plan: Show user 2-3 methods with tradeoffs
    ↓
Execute: Chain executors dynamically, log steps
    ↓
Learn: Save successful pattern to PLAYBOOKS.md
    ↓
Share: (Optional) Upload to Harness repository
```
Agent gets smarter with every new task type.

### 3. Harness Workflow Repository (NEW)
Shared knowledge across all OneClaw agents:
- User A learns golf booking → uploads to harness
- User B needs golf → downloads proven workflow (instant!)
- Network effect: every user improves the platform
- Version controlled, usage stats, success rates

### 4. Progressive Multi-Turn Workflows
```
Turn 1: Find 100 businesses → cache results
Turn 2: Filter → use cached (no re-fetch)
Turn 3: Rank → spawn sub-agents
Turn 4: Audit → generate report
```
User co-pilots, agent adapts each turn.

### 5. Sub-Agent Swarms with Progress Streaming
Spawn N parallel workers with real-time updates:
- Launch 10 agents simultaneously (parallel execution)
- Stream progress: "Checked 3/10 websites..."
- Report to harness for billing
- Fallback: If parallel fails, retry sequentially

### 6. Versioning
Hash `.md` files, bump version on edit, log in receipts.
Rollback = restore snapshot.

---

## Technical Architecture

### File Structure
```
~/.oneclaw/
├── SOUL.md, IDENTITY.md, SKILLS.md, PLAYBOOKS.md, MEMORY.md
├── workflows/
│   ├── local/ (experiments, not yet proven)
│   │   ├── golf_booking_v1.yaml
│   │   └── restaurant_search.yaml
│   └── harness/ (downloaded from shared repository)
│       ├── hvac_discovery.yaml
│       └── email_triage.yaml
├── executors/
│   └── llm_subagents.json
└── snapshots/v1.0.0.tar.gz
```

### Integration with Harness

**Harness = Central Repository + Execution Platform**

```
┌────────────────────────────────────────────────┐
│ LOCAL AGENT (Per-User)                         │
│ - SOUL/IDENTITY (personality)                 │
│ - MEMORY (personal learnings)                 │
│ - PLAYBOOKS (local experiments)               │
│                                                │
│ Workflow Priority:                            │
│ 1. Check local PLAYBOOKS first               │
│ 2. Query Harness repository                  │
│ 3. Enter Research mode (learn new)           │
└────────────────────────────────────────────────┘
                    ↕ API calls
┌────────────────────────────────────────────────┐
│ HARNESS (Shared Across All Users)             │
│                                                │
│ API Endpoints:                                │
│ ├─ GET  /workflows?task={type} (search)      │
│ ├─ POST /workflows (upload learned)          │
│ ├─ GET  /workflows/{id}/stats (metrics)      │
│ └─ GET  /executors (available tools)         │
│                                                │
│ Storage:                                      │
│ ├─ workflows/ (proven YAML, 3+ uses)         │
│ ├─ executors/ (tool registry)                │
│ ├─ OAuth tokens (Gmail, Calendar, etc.)      │
│ └─ billing/ (cost tracking)                  │
└────────────────────────────────────────────────┘
```

**Key Principles:**
- **Modular:** Swap executors without changing agent logic
- **Composable:** Workflows = chained executors (YAML)
- **Pluggable:** Harness backend (Supabase/SQLite) selected at runtime
- **Lightweight:** Deploy on Mac mini / VPS (Node.js + SQLite + optional Rust)

### Research + Learn Flow

```
1. User: "Find golf tee times in Denver"
        ↓
2. Agent checks: Local PLAYBOOKS → Not found
        ↓
3. Agent checks: Harness repository → Not found
        ↓
4. RESEARCH MODE:
   - Query: "How to find golf tee times programmatically?"
   - Sources: Perplexity API, Harness docs, executor registry
   - Output: "Need to: (1) Find courses, (2) Scrape booking pages"
        ↓
5. PLAN (show user options):
   "🤔 I don't have a golf workflow yet. Here are 3 approaches:
   
   Method 1 (Async): 20s, $0.08, minimal logs ⚡
   Method 2 (Sequential): 90s, $0.08, full logs 👁️
   Method 3 (Hybrid): 25s, $0.09, progressive logs ⭐ (recommended)
   
   Which approach? [1] [2] [3] [Auto-pick]"
        ↓
6. EXECUTE (user picks Method 3):
   - Log each step for learning
   - Stream progress: "Checked 3/10 websites..."
   - Store results in conversation state
        ↓
7. LEARN (after success):
   "✅ Success! This workflow worked great.
   
   Save as playbook?
   - [Local Only] Keep private
   - [Share to Harness] Help other users
   
   Stats: 25s, $0.09, 100% success"
        ↓
8. SAVE (user picks Share):
   - Append to local PLAYBOOKS.md
   - Generate workflow YAML from logged steps
   - POST to Harness: /workflows (with metadata)
   - Next time: instant execution (no research needed)
```

**Network Effect:** Every user makes the platform smarter!

### Fallback Chain Logic

Each task has multiple methods ranked by preference:

```typescript
// Example: Website scraping
const methods = [
  { id: 'hybrid', priority: 1, confidence: 'high' },
  { id: 'async', priority: 2, confidence: 'medium' },
  { id: 'sequential', priority: 3, confidence: 'high' },
];

// Try Method 1
try {
  result = await executeMethod(methods[0]);
} catch (err) {
  log('⚠️ Method 1 failed, trying Method 2...');
  
  // Try Method 2
  try {
    result = await executeMethod(methods[1]);
  } catch (err2) {
    log('⚠️ Method 2 failed, trying Method 3...');
    
    // Try Method 3 (most reliable, slowest)
    result = await executeMethod(methods[2]);
  }
}

// Learn from failure
updatePlaybook({
  method: failedMethod,
  note: 'Failed on {error}, switched to {successMethod}'
});
```

**Result:** Reliable execution with graceful degradation.

### Integration with Harness
- **Workflows** (discovery, audit, golf_booking): Registered + executed by harness
- **OAuth** (Gmail, Calendar tokens): Stored in harness (Supabase/SQLite)
- **Billing**: Harness tracks wallet, deducts per action
- **Sub-agents**: Spawn locally, report usage to harness API
- **Workflow Repository**: Shared across all users, version controlled

**Node = reasoning + executors + local learning**  
**Harness = workflows + billing + OAuth + shared repository**

---

## Hourly Implementation Plan

### Day 1: Foundation (8 hours)

**Hour 1-2: Test Gmail on Localhost**
- [ ] Run API: `pnpm --filter @oneclaw/api dev` (port 3000)
- [ ] Run Node: `cd oneclaw-node && cargo run -- daemon` (port 8787)
- [ ] Test: http://localhost:8787/integrations.html → Connect Gmail → OAuth → callback
- [ ] **Gate:** OAuth must work before continuing

**Hour 3-4: Create SOUL.md Template + Load**
- [ ] Create `oneclaw-node/templates/SOUL.md` (400 chars: North Star section, principles, tone)
- [ ] Add `src/agent_os.rs`: `load_md(path)`, `hash_file(path)`
- [ ] Test: `load_md("SOUL.md")` returns string

**Hour 5-6: Inject SOUL.md into Prompts**
- [ ] Update `src/conversation.rs`: inject SOUL.md into system prompt
- [ ] Test: Chat without SOUL.md vs with → check if tone changes
- [ ] **Gate:** Personality must be noticeably different

**Hour 7-8: Add IDENTITY.md + Test**
- [ ] Create `oneclaw-node/templates/IDENTITY.md` (150 chars: name, role, emojis)
- [ ] Inject into chat prompts (not workflow/heartbeat)
- [ ] Test: Agent introduces self as "Monica" with emojis
- [ ] Commit: "feat(agent-os): Add SOUL.md + IDENTITY.md injection"

---

### Day 2: Memory + Skills (8 hours)

**Hour 9-10: Create MEMORY.md + Append Logic**
- [ ] Create empty `~/.oneclaw/MEMORY.md` on first run
- [ ] Add `src/memory.rs`: `append(fact)`, `compress()`
- [ ] After each chat: LLM generates "what to remember", append to MEMORY.md

**Hour 11-12: Test Memory Persistence**
- [ ] Session 1: "I prefer bullet points" → appends to MEMORY
- [ ] Session 2: Ask question → agent uses bullets (reads MEMORY)
- [ ] **Gate:** Must remember across sessions

**Hour 13-14: Create SKILLS.md Template (Multi-Method)**
- [ ] Create `templates/SKILLS.md` with multi-method benchmarks
- [ ] Include for each task type: 2-3 methods with tradeoffs
- [ ] Format: Method, Time, Cost, Visibility, Quality, Use When, Fallback
- [ ] Add lazy loading: if message contains "email" → load only email section

**Hour 15-16: Test Smart Routing**
- [ ] "Find 100 businesses fast" → LLM should pick fastest method from SKILLS.md
- [ ] "Find 3 and show me progress" → LLM should pick sequential/hybrid
- [ ] **Gate:** LLM must reference method selection reasoning
- [ ] Commit: "feat(agent-os): Add MEMORY.md persistence + multi-method SKILLS.md"

---

### Day 3: Research + Learn (8 hours) (NEW)

**Hour 17-18: Implement Research Mode**
- [ ] Add `src/research.rs`: `research_task(prompt)` function
- [ ] When no workflow found: call Perplexity to research approach
- [ ] Output: 2-3 method options with estimated time/cost/tools
- [ ] Check for missing tools (Playwright, browser, API keys)

**Hour 19-20: Add Dynamic Planning UI**
- [ ] Show research results to user: methods table with tradeoffs
- [ ] Let user pick method OR auto-select recommended
- [ ] Log selected method for learning

**Hour 21-22: Implement Dynamic Execution**
- [ ] Allow LLM to chain executors without pre-built YAML
- [ ] Log each executor call with timing/cost
- [ ] Store execution trace for learning

**Hour 23-24: Add Learning Layer**
- [ ] After successful execution: generate PLAYBOOKS.md entry
- [ ] Prompt user: "Save as playbook? [Local] [Share to Harness]"
- [ ] If shared: generate workflow YAML, POST to harness
- [ ] Commit: "feat(agent-os): Add Research+Learn loop"

---

### Day 4: Playbooks + Sub-Agents (8 hours)

**Hour 25-26: Create PLAYBOOKS.md Template**
- [ ] Create `templates/PLAYBOOKS.md` with multi-method strategies
- [ ] Include: Progressive Research, Email Triage, Method Selection Logic
- [ ] Document fallback chains: Method 1 fails → Method 2 → Method 3
- [ ] Inject into chat (full) and heartbeat (proactive section only)

**Hour 27-28: Test Method Fallbacks**
- [ ] Force Method 1 to fail → verify switches to Method 2
- [ ] Log fallback reasoning: "async failed (timeout), trying sequential"
- [ ] **Gate:** Must gracefully degrade without user intervention

**Hour 29-30: Implement llm.spawn_subagents Executor**
- [ ] Create `src/executors/llm_subagents.rs` (or TypeScript equivalent)
- [ ] Spawn N parallel tasks (tokio/Promise.all)
- [ ] Stream progress: channel for "Checked X/N" updates
- [ ] Return: `{results: [...], succeeded: N, failed: M, timeMs: X}`

**Hour 31-32: Add Progress Streaming**
- [ ] Create progress channel/stream
- [ ] As each sub-agent completes: emit progress event
- [ ] Frontend shows: "Checked 3/10 websites... (~15s remaining)"
- [ ] **Gate:** User must see real-time updates
- [ ] Commit: "feat(agent-os): Add PLAYBOOKS.md + sub-agents with streaming"

---

### Day 5: Harness Integration (8 hours) (NEW)

**Hour 33-34: Build Workflow Repository API**
- [ ] Harness endpoint: `GET /api/workflows?task={type}` (search workflows)
- [ ] Harness endpoint: `POST /api/workflows` (upload with metadata)
- [ ] Harness endpoint: `GET /api/workflows/{id}` (download)
- [ ] Store in Supabase table: workflows (id, task_type, yaml, creator, uses, success_rate, version)

**Hour 35-36: Implement Workflow Upload Flow**
- [ ] After successful dynamic execution: offer to save
- [ ] Generate YAML from logged executor chain
- [ ] Include metadata: creator, initial stats, method type
- [ ] POST to harness with auth token

**Hour 37-38: Implement Workflow Download Flow**
- [ ] Before research mode: query harness for existing workflows
- [ ] Show stats: "golf_booking used 15 times, 93% success"
- [ ] Let user: [Use This] [Research New] [Customize]
- [ ] Cache downloaded workflows locally

**Hour 39-40: Test Network Effect**
- [ ] User A: Learn new workflow → upload to harness
- [ ] User B: Request same task → download from harness (no research)
- [ ] **Gate:** User B must execute <5s (download) vs User A's research time
- [ ] Commit: "feat(harness): Add workflow repository with network learning"

---

### Day 6: Progressive Workflows + Polish (8 hours)

**Hour 41-42: Add Conversation State Persistence**
- [ ] Update `conversation.rs`: Add `state: HashMap<String, Value>` to ConversationContext
- [ ] After Turn 1: Store results in `context.state["businesses"]`
- [ ] Turn 2: LLM references cached data (no re-fetch)

**Hour 43-44: Test 4-Turn Progressive Workflow**
- [ ] Turn 1: "Find 100 HVAC in Denver" → calls Apify, stores in state
- [ ] Turn 2: "Who would you analyze?" → filters cached list
- [ ] Turn 3: "Which best for me?" → ranks cached list
- [ ] Turn 4: "Run audits" → spawns sub-agents on top 10
- [ ] **Gate:** No redundant API calls, user steers each step

**Hour 45-46: Implement File Versioning**
- [ ] Add `src/agent_os.rs`: `version_files()` (hash all 5 .md, bump version if changed)
- [ ] On edit: create snapshot `~/.oneclaw/snapshots/v{version}.tar.gz`
- [ ] Test: Edit SOUL.md → version 1.0.0 → 1.1.0, snapshot created

**Hour 47-48: Log Version in Receipts + Documentation**
- [ ] Update `workflow.rs`: Add `agent_os_version` and file hashes to receipt
- [ ] Test workflow: Check receipt includes `"agent_os_version": "1.1.0"`
- [ ] Update PROGRESS.md: Add Agent OS section
- [ ] Create `AGENT_OS.md` doc: File structure, injection rules, R+L flow, harness integration
- [ ] Commit: "feat(agent-os): Add progressive workflows + versioning + docs"

---

### Day 7: Example Workflows (8 hours) (NEW)

**Hour 49-52: Build HVAC Contact Discovery Workflow**
- [ ] Create `packages/harness/src/workflows/hvac-contact-discovery.ts`
- [ ] Implement multi-method approach (async, sequential, hybrid)
- [ ] Extract: business name, phone, owner name (via LLM or website scrape)
- [ ] Test: "Find 100 HVAC with phone + owner" → returns full contact data
- [ ] **Gate:** Must include owner names (not just business info)

**Hour 53-56: Build Golf Tee Time Booking Workflow**
- [ ] Create `packages/harness/src/workflows/golf-booking.ts`
- [ ] Implement: (1) Find courses (Apify), (2) Scrape tee times (parallel), (3) Filter by criteria
- [ ] Support inputs: date, time range, party size, location
- [ ] Test: "Feb 26, 9-10AM, 4-some, Denver CO" → returns available tee times
- [ ] **Gate:** Must handle specific date/time/party-size filtering
- [ ] Commit: "feat(workflows): Add HVAC contact discovery + golf tee time booking"

---

## Success Metrics

**After Day 1:**
- [ ] SOUL.md makes personality noticeably consistent

**After Day 2:**
- [ ] MEMORY.md enables cross-session learning
- [ ] SKILLS.md table referenced in LLM reasoning

**After Day 3:**
- [ ] Sub-agents 3-5× faster than serial
- [ ] Cost correctly metered

**After Day 4:**
- [ ] Progressive workflow completes without re-fetching
- [ ] Versioning tracks changes

**After Day 5:**
- [ ] UI allows editing/rollback
- [ ] E2E flow works

---

## Files to Create/Modify

### New Files (Templates)
- `oneclaw-node/templates/SOUL.md`
- `oneclaw-node/templates/IDENTITY.md`
- `oneclaw-node/templates/SKILLS.md`
- `oneclaw-node/templates/PLAYBOOKS.md`
- `oneclaw-node/templates/MEMORY.md` (empty, user-generated)
- `oneclaw-node/executors/llm_subagents.json`

### New Rust Modules
- `oneclaw-node/src/agent_os.rs` — Load, hash, version, snapshot
- `oneclaw-node/src/memory.rs` — Append, compress
- `oneclaw-node/src/executors/llm_subagents.rs` — Sub-agent spawning

### Modified Rust Modules
- `oneclaw-node/src/conversation.rs` — Inject .md files, add state HashMap
- `oneclaw-node/src/workflow.rs` — Log agent_os_version in receipts
- `oneclaw-node/src/daemon.rs` — Add `/agent-os` routes

### New UI Files
- `oneclaw-node/src/ui/agent_os.html` — Edit/rollback interface

### Harness Changes (Minimal)
- `apps/api/src/routes/billing.ts` — Add `POST /api/v1/billing/report` endpoint

### Config Updates
- `oneclaw-node/config.yaml` — Add `agent_os` section with token budgets

---

## Dependencies

**Rust crates (add to Cargo.toml):**
```toml
sha2 = "0.10"          # File hashing
tar = "0.4"            # Snapshots
flate2 = "1.0"         # Gzip
```

**Existing (already have):**
- Conversation context (SQLite)
- Executor registry
- Harness API (workflows, OAuth, billing)

---

## Risk Mitigation

**Risk:** Token cost too high (6k baseline)
**Mitigation:** Lazy loading (only relevant sections), measure actual usage

**Risk:** LLM ignores .md instructions
**Mitigation:** Manifests enforce safety at executor level

**Risk:** MEMORY.md grows unbounded
**Mitigation:** Auto-compress at 3k tokens

**Risk:** Sub-agents not faster
**Mitigation:** Measure first 5 spawns, pivot if <2× speedup

---

## Gates (Kill Switches)

**After Hour 6:** If SOUL.md doesn't change behavior → simplify or stop  
**After Hour 12:** If MEMORY.md doesn't persist → maybe skip elaborate system  
**After Hour 16:** If SKILLS.md routing fails → adjust format  
**After Hour 22:** If sub-agents not faster → skip complexity  
**After Hour 28:** If progressive workflows clunky → simplify to one-shot

---

## Timeline

**Day 1 (8h):** Foundation (Gmail test + SOUL + IDENTITY)  
**Day 2 (8h):** Memory + Multi-Method Skills  
**Day 3 (8h):** Research + Learn Loop (NEW)  
**Day 4 (8h):** Playbooks + Sub-agents with Streaming  
**Day 5 (8h):** UI + Polish  
**Day 6 (8h):** Harness Repository Integration (NEW)  
**Day 7 (8h):** Example Workflows (HVAC + Golf) (NEW)

**Total:** 56 hours = 7 days × 8 hours

**Aggressive mode:** 4-5 days if working 12-14h/day

---

## Success Metrics

**After Day 1:**
- [ ] SOUL.md makes personality noticeably consistent

**After Day 2:**
- [ ] MEMORY.md enables cross-session learning
- [ ] SKILLS.md shows multiple methods per task type

**After Day 3:**
- [ ] Agent can research unknown tasks
- [ ] Dynamic execution works without pre-built YAML
- [ ] Successful workflows save to PLAYBOOKS.md

**After Day 4:**
- [ ] Sub-agents 3-5× faster than serial
- [ ] Method fallbacks work gracefully
- [ ] Progress streaming shows real-time updates

**After Day 5:**
- [ ] UI allows editing/rollback
- [ ] E2E flow works

**After Day 6:**
- [ ] Workflow upload/download to harness works
- [ ] Network effect: User B benefits from User A's learnings

**After Day 7:**
- [ ] HVAC workflow extracts owner names
- [ ] Golf workflow filters by date/time/party-size
- [ ] Both workflows use multi-method with fallbacks

---

**Ready to parse and generate tasks.**
