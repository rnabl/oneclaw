
# OneClaw - Agent OS
## Product Requirements Document (PRD)

---

| Document Details | |
|-----------------|---|
| **Project Name** | OneClaw |
| **Version** | 1.0.1 |
| **Status** | Ready for Implementation |
| **License** | MIT (Open Source) |

---

# 1. Executive Summary

## 1.1 Problem

Current AI assistants can converse, but cannot execute real-world tasks. Users want AI that can find golf tee times, scrape business data, post to Google My Business, connect to Gmail/Notion/Slack, and learn from every interaction.

Existing solutions are either too simple (chat-only), too complex (Zapier requires manual workflows), or too closed (Cursor/Windsurf - IDE-only).

## 1.2 Solution

**OneClaw** is a self-improving Agent OS combining:
- **Rust daemon** - LLM orchestration, reasoning, state
- **TypeScript harness** - Browser automation (Playwright), API executors
- **.md file system** - SOUL, IDENTITY, SKILLS, PLAYBOOKS, MEMORY
- **Research + Learn loop** - Uses Brave Search (cheap), handles unknown tasks
- **Self-healing** - Monitors execution, auto-fallbacks when stuck
- **Marketplace** - Shared workflows, connectors (Zapier-like automations)

## 1.3 Core Philosophy

| Principle | Description |
|-----------|-------------|
| **Modularity** | Each executor is independent - swap without breaking |
| **Agnostic** | LLM decides best tool, not hardcoded |
| **Composable** | Workflows = chained executors (YAML) |
| **Pluggable** | Add new tools without touching core |
| **Portability** | Deploy anywhere (Mac Mini, VPS, Fly.io) |
| **Self-learning** | Gets smarter with every task |

## 1.4 Success Criteria (v1.0)

- [ ] User can deploy on Mac Mini or Fly.io
- [ ] User asks: "Find golf tee times Feb 26 in Denver for 4 people between 9-10AM"
- [ ] Agent finds courses, checks websites via Playwright, returns clickable links
- [ ] User can connect Gmail via OAuth
- [ ] Agent monitors execution and auto-fallbacks if stuck
- [ ] If tool doesn't exist → prompts user to connect API key

---

# 2. Vision

## 2.1 The North Star

**"Ask your computer to do things. It just happens."**

One day: "Find me golf tee times"  
Another day: "Post a update to my Google My Business"  
Another day: "Scrape 50 HVAC company websites and find the owner names"

**The LLM figures it out.**

---

### The Experience

```
User: "Find me golf tee times next Saturday"

OneClaw: (thinks for 2 seconds)
         "Found 12 courses. Checking availability..."
         (10 seconds later via Playwright)
         "Got 5 options. Here's the best ones:"
         [Links with times, prices, ratings]

---

User: "Post an update to my Google My Business"

OneClaw: "I can help with that! Let me check my registry..."
         "I don't have a Google My Business connector yet.
          Would you like to connect it?
          [Connect Google My Business] [Enter API Key] [Skip]"
```

---

### What's Happening Behind the Scenes

```
1. "Find me golf tee times"
   ↓
2. Check SKILLS.md → No match → RESEARCH MODE
   ↓
3. Brave Search: "how to find golf tee times programmatically"
   ↓
4. Found: Need Google Maps + website scraping
   ↓
5. EXECUTE: Call Apify → get courses
   ↓
6. EXECUTE: Playwright spawns 12 agents to check each site
   ↓
7. MONITOR: 2 failed (blocked) → sequential retry
   ↓
8. Got results! → LEARN: Save to PLAYBOOKS.md
   ↓
Next time: Instant (no research needed)
```

---

### The "It Just Works" Principle

| Layer | What It Enables |
|-------|-----------------|
| **SOUL + IDENTITY** | Consistent personality users recognize |
| **MEMORY** | Remembers preferences across sessions |
| **SKILLS** | Smart routing - fast for simple, powerful |
|  |
| **send 7|


 |


 I'm currently |3+7.6| Playwright | Handles complex browsing with screenshots |
 3.7| Monitor + Heal | Gracefully recovers from failures |
 3.8| Learn | Adapts from every interaction |
 3.9| Marketplace | Leverages shared community knowledge |

The end goal is a complete Zapier alternative where large language models can automatically discover and execute workflows through metadata and schemas. New integrations become instantly available—Google My Business, Shopify, or any other service—without requiring---

# 3. Architecture

## 3.1 High-Level System Design

```
┌─────────────────────────────────────────────────────────────────────────┐
│                           USER INTERFACES                               │
│              Discord │ Telegram │ Web UI │ CLI                         │
└─────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                    RUST DAEMON (oneclaw-node/)                         │
│                            Port: 8787                                   │
├─────────────────────────────────────────────────────────────────────────┤
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐   │
│  │   SOUL.md   │  │  SKILLS.md  │  │  MEMORY.md  │  │ PLAYBOOKS.md│   │
│  │ (prompts)   │  │ (methods)   │  │ (history)   │  │ (workflows) │   │
│  └─────────────┘  └─────────────┘  └─────────────┘  └─────────────┘   │
│                                                                      │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │                    ORCHESTRATION ENGINE                         │   │
│  │  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐          │   │
│  │  │   CLASSIFY   │  │   RESEARCH   │  │   DISPATCH   │          │   │
│  │  │  (routing)   │  │ (Brave Search│  │  (→ Harness) │          │   │
│  │  └──────────────┘  └──────────────┘  └──────────────┘          │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│                                                                      │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │                    EXECUTION PATHS                               │   │
│  │  ┌────────────┐  ┌────────────┐  ┌────────────┐  ┌──────────┐ │   │
│  │  │  DIRECT    │  │  EXECUTOR  │  │  WORKFLOW  │  │ RESEARCH │ │   │
│  │  │ (LLM only) │  │  (1 step)  │  │ (multi-step)│  │ (novel)  │ │   │
│  │  └────────────┘  └────────────┘  └────────────┘  └──────────┘ │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│                                                                      │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │                    MONITOR + HEAL                              │   │
│  │  - Log parsing    - Error classification    - Fallback chain  │   │
│  └─────────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────────┘
                                    │
                         HTTP /execute │ + trace
                                    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                  TYPESCRIPT HARNESS (packages/harness/)                │
│                            Port: 9000                                   │
├─────────────────────────────────────────────────────────────────────────┤
│  ┌──────────────────────────────────────────────────────────────────┐   │
│  │                     TOOL REGISTRY                                │   │
│  │   apify_gmaps │ brave_search │ playwright │ gmail │ ...        │   │
│  │   ──────────────────────────────────────────────────────────    │   │
│  │   | Tool | Description | Schema | Cost |                      │   │
│  │   |------|-------------|--------|------|                       │   │
│  │   | golf-booking | Find tee times | {...} | $0.17 |           │   │
│  │   | google_my_business | Post updates | {...} | $0.05 |       │   │
│  └──────────────────────────────────────────────────────────────────┘   │
│                                                                      │
│  ┌──────────────────────────────────────────────────────────────────┐   │
│  │                    WORKFLOW ENGINE                              │   │
│  │  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐  │   │
│  │  │golf-booking.ts  │  │hvac-discovery.ts│  │ discovery.ts    │  │   │
│  │  │ (Playwright)   │  │ (Apify + LLM)   │  │ (Vision agent)  │  │   │
│  │  └─────────────────┘  └─────────────────┘  └─────────────────┘  │   │
│  └──────────────────────────────────────────────────────────────────┘   │
│                                                                      │
│  ┌──────────────────────────────────────────────────────────────────┐   │
│  │                    MARKETPLACE (Future)                         │   │
│  │   Connectors (Gmail, GMB, Shopify) │ Shared Workflows           │   │
│  └──────────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────────┘
```

## 3.2 The Dispatch Mechanism

**Key concept: The Rust LLM "dispatches" complex tasks to TypeScript harness**

```rust
// How the LLM knows to send to harness
pub fn get_available_tools() -> Vec<ToolMetadata> {
    vec![
        ToolMetadata {
            name: "golf-booking".to_string(),
            description: "Find and book golf tee times".to_string(),
            params_schema: json!({
                "type": "object",
                "properties": {
                    "location": { "type": "string" },
                    "date": { "type": "string" },
                    "timeRange": { "type": "string" },
                    "partySize": { "type": "number" }
                }
            }),
            cost_estimate: 0.17,
            estimated_time_sec: 25,
        },
        ToolMetadata {
            name: "google_my_business".to_string(),
            description: "Post updates to Google My Business".to_string(),
            params_schema: json!({...}),
            cost_estimate: 0.05,
            needs_connection: true,
        },
        // ... more tools
    ]
}

// In the LLM prompt - inject tool registry
pub fn build_system_prompt() -> String {
    format!(r#"
You are OneClaw, a personal AI agent.

## Your Capabilities
You have access to a registry of tools/workflows:
{}

## When to Use Each
- Simple tasks (weather, reminders): Use LLM directly
- Single API call: Use an executor from the registry
- Multi-step tasks: Dispatch to the TypeScript harness
- Unknown tasks: Use Brave Search to research, then execute

## How to Dispatch to Harness
When a task requires multiple steps or browser automation:
1. Construct a JSON payload with the executor name and params
2. Send to http://localhost:9000/execute
3. Parse the response and present results to user

## If Tool Doesn't Exist
If the user asks for something you don't have a tool for:
1. Apologize and explain you don't have that capability yet
2. Offer to help connect it: "I can help you connect [service]!
   Would you like to provide an API key or OAuth?"
3. Do NOT make up functionality

## Your Principles
- Be transparent about what you can and can't do
- Always show your reasoning
- If something fails, try another way or explain why
- Learn from every interaction
"#, get_tool_registry_json())
}
```

---

# 4. The .md File System (Agent OS)

## 4.1 Overview

These files are **loaded into the LLM** to give it context, personality, and capabilities.

| File | Tokens | Purpose |
|------|--------|---------|
| **SOUL.md** | ~400 | Principles, capabilities, dispatch instructions |
| **IDENTITY.md** | ~150 | Name, role, style |
| **SKILLS.md** | ~600 | Method benchmarks, fallback chains |
| **PLAYBOOKS.md** | ~1200 | Task strategies |
| **MEMORY.md** | ~2-3k | Learned preferences |

## 4.2 SOUL.md (Updated)

```markdown
# OneClaw SOUL

You are **OneClaw**, a personal AI agent that helps users accomplish real-world tasks.

## Your Principles
1. **Be helpful** - Do whatever the user asks within your capabilities
2. **Be transparent** - Show your reasoning, don't hide what you're doing
3. **Be reliable** - If something fails, try another way or explain why
4. **Learn** - Remember what works and what doesn't

## Your Capabilities

### How You Execute Tasks
You have access to a **Tool Registry** with executors and workflows:

| Tool | What It Does | When To Use |
|------|--------------|-------------|
| brave_search | Web search (cheap) | Quick research, finding info |
| apify_gmaps | Scrape Google Maps | Find businesses, restaurants |
| playwright | Browser automation | Complex websites, forms, scraping |
| gmail.send | Send emails | User needs to email someone |
| golf-booking | Find tee times | User wants golf |
| hvac-contact-discovery | Find business contacts | Lead generation |

### How to Dispatch (Important!)
For complex tasks, you **dispatch to the TypeScript harness**:

1. Identify the right executor from the registry
2. Construct the params based on the schema
3. Send HTTP POST to `http://localhost:9000/execute` with:
   ```json
   {
     "executor": "golf-booking",
     "params": { "location": "Denver", "date": "2026-02-26" },
     "context": { "user_id": "..." }
   }
   ```
4. Parse the response and present results

### If You Don't Have a Tool
If the user asks for something you don't have:
1. Be honest: "I don't have a [tool] yet"
2. Offer to help connect it: "I can help you connect [service]!
   Would you like to provide an API key or OAuth?"
3. Do NOT make up functionality or pretend you can do it

### Your Limits
- You cannot access files on the user's computer (security)
- You need explicit permission to connect to services (OAuth)
- Some websites block automation (will try alternatives)
- You cost money to run - be efficient with tool calls

## Learning
After each successful execution:
- Note what worked in MEMORY.md
- If it's a new task type, consider saving to PLAYBOOKS.md
- Update SKILLS.md with timing/cost if it was a new method
```

## 4.3 SKILLS.md

```markdown
# OneClaw SKILLS

## Available Execution Methods

| Method | Avg Time | Avg Cost | Reliability | Use When |
|--------|----------|----------|-------------|----------|
| direct | <1s | $0.001 | N/A | Simple questions |
| brave_search | 2s | $0.002 | High | Quick research |
| apify_gmaps | 15s | $0.05 | Medium | Find businesses |
| playwright_single | 10s | $0.02 | Medium | Single page scrape |
| playwright_parallel | 25s | $0.15 | High | Multi-page (fast) |
| golf_booking_hybrid | 25s | $0.17 | High | Best for tee times |
| hvac_contact_hybrid | 120s | $0.25 | High | Lead generation |

## Fallback Chains

### Golf Booking
golf_booking_hybrid → golf_booking_sequential → show_manual_links

### Website Scraping
playwright_parallel → playwright_single → brave_search_for_manual

### Business Discovery
apify_gmaps → brave_search → ask_user_for_urls

## Cost Optimization Tips
- Use direct LLM for simple tasks (weather, definitions)
- Use brave_search instead of Playwright for simple lookups
- Batch parallel requests when possible
- Cache results in conversation state for follow-up questions
```

## 4.4 MEMORY.md

```markdown
# OneClaw MEMORY

## User Preferences
- Preferred golf times: 8-10 AM
- Maximum price per person: $100
- Default location: Denver, CO

## Recent Tasks
- 2024-02-20: Found 5 golf times at Cherry Hills
- 2024-02-18: Extracted 45 HVAC contacts in Austin
- 2024-02-15: Connected Gmail account

## Learned Patterns
- "golf" → use golf_booking_hybrid
- "HVAC" + "contact" → use hvac_contact_hybrid
- "find businesses" → apify_gmaps first
- When rate limited → switch to sequential

## Missing Tools (Noted for User)
- Google My Business (user asked, not connected)
- Shopify (future interest)
```

---

# 5. The OneClaw Loop

## 5.1 Framework

| Phase | Description |
|-------|-------------|
| **Classify** | Parse request, determine complexity |
| **Research** | Check SKILLS/PLAYBOOKS, Brave Search if unknown |
| **Plan** | Show methods with tradeoffs |
| **Dispatch** | Send to TypeScript harness if complex |
| **Execute** | Run executor/workflow |
| **Monitor** | Watch logs, detect patterns |
| **Heal** | Auto-fallback if stuck |
| **Learn** | Save to MEMORY/PLAYBOOKS |

## 5.2 Visual

```
User Request → Classify → [Simple?] → Direct (LLM)
                         [Medium?] → Executor (single API)
                         [Complex?] → Dispatch to Harness
                         [Unknown?] → Brave Search → Research → Learn
```

---

# 6. Self-Healing

## 6.1 Monitor

```rust
async fn monitor_and_heal(execution_id: &str) {
    let mut failures = 0;
    
    loop {
        let logs = get_logs(execution_id);
        
        // Detect patterns
        if logs.contains("timeout") || logs.contains("429") {
            failures += 1;
            if failures >= 2 {
                // Fallback to sequential
                switch_to_sequential(execution_id).await;
            }
        }
        
        if logs.contains("blocked") || logs.contains("403") {
            // Try stealth mode
            enable_stealth_browser(execution_id).await;
        }
        
        if is_complete(execution_id) { break; }
        sleep(1).await;
    }
}
```

---

# 7. Marketplace Vision

## 7.1 The Goal

```
┌─────────────────────────────────────────────────────────────┐
│                    ONECLAW MARKETPLACE                      │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│   ┌──────────────┐  ┌──────────────┐  ┌──────────────┐     │
│   │  Connectors  │  │  Workflows   │  │   Agents     │     │
│   ├──────────────┤  ├──────────────┤  ├──────────────┤     │
│   │ Gmail        │  │ Golf Booking │  │ Lead Gen     │     │
│   │ Google Maps  │  │ HVAC Extract │  │ Research     │     │
│   │ Shopify      │  │ Email Triage │  │ Scraper      │     │
│   │ Stripe       │  │ Content Gen  │  │ Analyst      │     │
│   │ Slack        │  │ ...          │  │ ...          │     │
│   └──────────────┘  └──────────────┘  └──────────────┘     │
│                                                              │
│   Every Zapier integration = OneClaw executor              │
│   LLM looks up schema → constructs params → executes       │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

## 7.2 How It Works

1. **Developer creates executor** with schema
2. **Uploads to marketplace** with metadata
3. **LLM sees new tool** in registry
4. **User asks for something** → LLM uses new executor
5. **If tool missing** → LLM prompts to connect

```typescript
// Executor schema example
{
  "name": "google_my_business",
  "description": "Post updates to Google My Business locations",
  "provider": "google",
  "params": {
    "locationId": { "type": "string", "required": true },
    "post": { "type": "string", "required": true },
    "images": { "type": "array", "required": false }
  },
  "auth": "oauth2",
  "cost_estimate": 0.05
}
```

---

# 8. API Specification

## 8.1 Rust → Harness Dispatch

```typescript
// Dispatch request
POST http://localhost:9000/execute
{
  "executor": "golf-booking",
  "params": {
    "location": "Denver, CO",
    "date": "2026-02-26",
    "timeRange": "9:00-10:00",
    "partySize": 4
  },
  "context": {
    "user_id": "user_123",
    "task_id": "task_abc",
    "max_cost": 0.50,
    "max_time_ms": 60000
  }
}

// Response
{
  "success": true,
  "data": {
    "availableTimes": [
      {
        "course": "Cherry Hills",
        "time": "9:08 AM",
        "price": 85,
        "url": "https://booking.example.com/..."
      }
    ]
  },
  "execution": {
    "duration_ms": 25000,
    "cost": 0.17,
    "steps": [
      {
        "name": "apify_gmaps",
        "status": "success",
        "duration_ms": 5000
      },
      {
        "name": "playwright_parallel",
        "status": "success",
        "duration_ms": 20000
      }
    ]
  }
}
```

## 8.2 Tool Registry Endpoint

```
GET http://localhost:9000/api/tools

{
  "tools": [
    {
      "name": "golf-booking",
      "description": "Find and book golf tee times",
      "params": {...},
      "cost_estimate": 0.17,
      "needs_connection": false
    },
    {
      "name": "google_my_business",
      "description": "Post updates to GMB",
      "params": {...},
      "cost_estimate": 0.05,
      "needs_connection": true
    }
  ]
}
```

```

  "s
: 3,
     

---
```

    "oauth : "needs```

---

# 9. Implementation Roadmap

## Phase 1: Foundation

| Task | Description |
|------|-------------|
| 1.1 | Bridge Rust → TypeScript (harness executor) |
| 1.2 | Implement agent_os.rs - Load .md files |
| 1.3 | Add SOUL.md injection with tool registry |
| 1.4 | Wire golf workflow end-to-end (Brave + Playwright) |

## Phase 2: Intelligence

| Task | Description |
|------|-------------|
| 2.1 | Implement Research Mode (Brave Search) |
| 2.2 | Add Plan UI (show method options) |
| 2.3 | Implement MEMORY.md persistence |
| 2.4 | Auto-update SKILLS.md |

## Phase 3: Resilience

| Task | Description |
|------|-------------|
| 3.1 | Method Fallback Chain |
| 3.2 | Self-Healing Monitor |
| 3.3 | Intervention Logic |

## Phase 4: Integration

| Task | Description |
|------|-------------|
| 4.1 | OAuth Flow (Gmail) |
| 4.2 | Tool "not found" prompts user |
| 4.3 | Marketplace API structure |

---

# 10. Success Metrics

| Metric | Target |
|--------|--------|
| Simple task | <2s |
| Executor task | <15s |
| Golf workflow | <60s |
| Cost per golf workflow | <$0.25 |
| First-try success | 80% |
| Fallback success | 95% |

---

# 11. File Structure

```
oneclaw/
├── oneclaw-node/
│   ├── src/
│   │   ├── main.rs
│   │   ├── daemon.rs
│   │   ├── executor.rs         # Add harness bridge
│   │   ├── agent_os.rs         # TO BUILD
│   │   ├── research.rs         # TO BUILD (Brave Search)
│   │   ├── memory.rs           # TO BUILD
│   │   └── conversation.rs
│   │
│   └── templates/
│       ├── SOUL.md             # Updated with dispatch info
│       ├── IDENTITY.md
│       ├── SKILLS.md
│       ├── PLAYBOOKS.md
│       └── MEMORY.md
│
├── packages/
│   ├── harness/
│   │   ├── src/
│   │   │   ├── server.ts
│   │   │   ├── registry/       # Tool registry
│   │   │   └── workflows/
│   │   │       ├── golf-booking.ts  # Brave + Playwright
│   │   │       └── hvac-contact-discovery.ts
│   │   └── package.json
│   │
│   └── core/
│
└── docker/
    ├── Dockerfile.rust
    └── docker-compose.yml
```

---

# 12. Tech Stack

| Component | Technology |
|-----------|------------|
| Runtime | Rust (1.75+), Node.js 20+ |
| Web | Axum (Rust), Hono (TypeScript) |
| Database | SQLite (local), Supabase (cloud) |
| LLM | Anthropic Claude (default) |
| Browser | Playwright |
| Search | Brave Search API |
| Maps | Apify Google Maps |
| Deployment | Docker, Fly.io |

---

# 13. Dependencies (Rust)

```toml
sha2 = "0.10"
tar = "0.4"
flate2 = "1.0"
reqwest = "0.11"  # For dispatching to harness
```

---

**Document Version:** 1.0.1  
**Status:** Ready for Implementation  
**Updated:** $(date)

```

---
