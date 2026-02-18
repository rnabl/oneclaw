# PRD: OneClaw Agent OS Layer (Sprint Mode)

**One-liner:** Add personality + memory + smart workflow routing + sub-agents to OneClaw Node in 3-5 days via lightweight `.md` files + executor registry, enabling progressive multi-turn workflows.

---

## Problem

**Current:** OneClaw Node executes reliably but feels cold (no personality, no memory, no smart routing)

**Competitors:**
- OpenClaw: Great vibe, unreliable execution
- CrewAI: Requires Python code
- Zapier: No reasoning, rigid

**Opportunity:** OpenClaw vibe + OneClaw reliability = viral product

---

## Solution: Three Layers

### Layer 1: Agent OS (Cognition)
Five `.md` files guide LLM:
1. **SOUL.md** (400 tokens) — Purpose, principles, tone
2. **IDENTITY.md** (150 tokens) — Name, role, style
3. **SKILLS.md** (400 tokens) — Workflow benchmarks table
4. **PLAYBOOKS.md** (800 tokens) — Task strategies
5. **MEMORY.md** (2-3k tokens) — Learned preferences

### Layer 2: Executor Registry
Pre-built Rust executors (compose via YAML):
- `http.request`, `browser.navigate`, `gmail.send`, `calendar.list`
- `llm.call`, `llm.spawn_subagents` (NEW)
- `file.write`, `transform.json`

### Layer 3: Sub-Agents (Parallelism)
New executor: spawn N parallel LLM workers
- **Use:** Research 10 competitors in 30s vs 5 min serial
- **Pricing:** $0.01 + $0.005/agent
- **Each:** Fresh context, narrow task, isolated

---

## Core Features

### 1. Metadata-Driven Workflow Selection
SKILLS.md = catalog with benchmarks:
```markdown
| Workflow | Time | Cost | Quality | Max | Use when |
| apify_gmaps | 30s | $0.05 | High | 10k | Volume >50 |
| browser | 2m | $0.10 | Med | 50 | Deep analysis |
```
LLM reads, chooses based on intent ("100 businesses" → Apify)

### 2. Progressive Multi-Turn Workflows
```
Turn 1: Find 100 businesses → cache results
Turn 2: Filter → use cached (no re-fetch)
Turn 3: Rank → spawn sub-agents
Turn 4: Audit → generate report
```
User co-pilots, agent adapts each turn.

### 3. Sub-Agent Swarms
Spawn 10 parallel workers for audits, research, analysis.
Report to harness for billing.

### 4. Versioning
Hash `.md` files, bump version on edit, log in receipts.
Rollback = restore snapshot.

---

## Technical Architecture

### File Structure
```
~/.oneclaw/
├── SOUL.md, IDENTITY.md, SKILLS.md, PLAYBOOKS.md, MEMORY.md
├── workflows/
│   ├── research/apify_gmaps.yaml
│   └── audit/seo_audit.yaml
├── executors/
│   └── llm_subagents.json
└── snapshots/v1.0.0.tar.gz
```

### Integration with Harness
- **Workflows** (audit, discovery): Registered + executed by harness
- **OAuth** (Gmail tokens): Stored in harness (Supabase)
- **Billing**: Harness tracks wallet, deducts per action
- **Sub-agents**: Node spawns locally, reports usage to harness

**Node = reasoning + executors**  
**Harness = workflows + billing + OAuth**

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

**Hour 13-14: Create SKILLS.md Template**
- [ ] Create `templates/SKILLS.md` with benchmarks table
- [ ] Include: Research (Apify, Browser, Perplexity), Email (check, draft, send)
- [ ] Add lazy loading: if message contains "email" → load only email section

**Hour 15-16: Test Smart Routing**
- [ ] "Find 100 businesses" → LLM should mention Apify (from SKILLS.md table)
- [ ] "Find 3 and analyze" → LLM should mention Browser or sub-agents
- [ ] **Gate:** LLM must reference benchmarks in reasoning
- [ ] Commit: "feat(agent-os): Add MEMORY.md persistence + SKILLS.md routing"

---

### Day 3: Playbooks + Sub-Agents (8 hours)

**Hour 17-18: Create PLAYBOOKS.md**
- [ ] Create `templates/PLAYBOOKS.md`: Progressive Research pattern, Email Triage, etc.
- [ ] Inject into chat (full) and heartbeat (proactive section only)
- [ ] Test: "Research businesses" → LLM follows multi-turn pattern from PLAYBOOKS

**Hour 19-20: Implement llm.spawn_subagents Executor (Rust)**
- [ ] Create `src/executors/llm_subagents.rs`
- [ ] Parse params: agents array, timeout
- [ ] Spawn tokio tasks (parallel), each calls LLM with isolated context
- [ ] Return: `{results: [...], succeeded: N, failed: M}`

**Hour 21-22: Add Manifest + Test**
- [ ] Create `executors/llm_subagents.json`: schema, pricing, rate limits
- [ ] Test: Spawn 3 agents with simple tasks → check parallel execution time
- [ ] **Gate:** 3 agents must complete in <20s (vs 30s+ serial)

**Hour 23-24: Integrate with Harness Billing**
- [ ] Add harness endpoint: `POST /api/v1/billing/report` (async billing report)
- [ ] After sub-agent spawn: report usage to harness (don't block)
- [ ] Test: Spawn 5 agents → check wallet deducted $0.01 + 5×$0.005 = $0.035
- [ ] Commit: "feat(agent-os): Add PLAYBOOKS.md + llm.spawn_subagents executor"

---

### Day 4: Progressive Workflows + Versioning (8 hours)

**Hour 25-26: Add Conversation State Persistence**
- [ ] Update `conversation.rs`: Add `state: HashMap<String, Value>` to ConversationContext
- [ ] After Turn 1: Store results in `context.state["businesses"]`
- [ ] Turn 2: LLM references cached data (no re-fetch)

**Hour 27-28: Test 4-Turn Progressive Workflow**
- [ ] Turn 1: "Find 100 HVAC in Denver" → calls Apify, stores in state
- [ ] Turn 2: "Who would you analyze?" → filters cached list
- [ ] Turn 3: "Which best for me?" → ranks cached list
- [ ] Turn 4: "Run audits" → spawns sub-agents on top 10
- [ ] **Gate:** No redundant API calls, user steers each step

**Hour 29-30: Implement File Versioning**
- [ ] Add `src/agent_os.rs`: `version_files()` (hash all 5 .md, bump version if changed)
- [ ] On edit: create snapshot `~/.oneclaw/snapshots/v{version}.tar.gz`
- [ ] Test: Edit SOUL.md → version 1.0.0 → 1.1.0, snapshot created

**Hour 31-32: Log Version in Receipts**
- [ ] Update `workflow.rs`: Add `agent_os_version` and file hashes to receipt
- [ ] Test workflow: Check receipt includes `"agent_os_version": "1.1.0"`
- [ ] Commit: "feat(agent-os): Add progressive workflows + versioning"

---

### Day 5: Polish + UI (8 hours)

**Hour 33-34: Add Node UI Badge**
- [ ] Update `oneclaw-node/src/ui/index.html`: Show "Agent OS v1.X" badge in header
- [ ] Badge links to `/agent-os` page

**Hour 35-36: Create Agent OS UI Page**
- [ ] Create `/agent-os.html`: Show current version, list files with edit buttons
- [ ] "Edit SOUL.md" → modal with textarea, save button
- [ ] "View MEMORY.md" → read-only view

**Hour 37-38: Add Rollback Feature**
- [ ] UI: "Version History" dropdown, "Rollback to vX" button
- [ ] Backend: `POST /agent-os/rollback?version=1.0.0` → extract snapshot, replace files
- [ ] Test: Rollback from v1.2.0 → v1.1.0 → files restored

**Hour 39-40: End-to-End Test + Documentation**
- [ ] Run full flow: localhost Gmail → chat with personality → memory persists → progressive workflow → sub-agents spawn → receipt shows version
- [ ] Update PROGRESS.md: Add Agent OS section
- [ ] Create `AGENT_OS.md` doc: File structure, injection rules, versioning
- [ ] Commit: "feat(agent-os): Add UI for editing/rollback + docs"

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
**Day 2 (8h):** Memory + Skills  
**Day 3 (8h):** Playbooks + Sub-agents  
**Day 4 (8h):** Progressive workflows + Versioning  
**Day 5 (8h):** UI + Polish

**Total:** 40 hours = 5 days × 8 hours

**Aggressive mode:** 2-3 days if working 12-16h/day

---

**Ready to parse and generate tasks.**
