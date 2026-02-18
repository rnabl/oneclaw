# iClaw - AI Agent Platform

## Product Overview

iClaw is a **framework-agnostic** AI agent platform that allows users to deploy their own AI assistants in Discord, Telegram, or Slack. Users can choose their preferred orchestration framework (OpenClaw, ZeroClaw, IronClaw, LangGraph, CrewAI, or custom), while iClaw provides the execution layer (nabl cloud), deployment infrastructure (Fly.io), and billing system.

**One-liner**: Deploy your own AI assistant with any orchestration framework - we handle execution, deployment, and billing.

## Key Differentiator: Framework Agnostic

Unlike other platforms that lock you into a specific framework, iClaw lets you:
- **Choose your orchestrator**: OpenClaw, ZeroClaw, IronClaw, LangGraph, CrewAI, or bring your own
- **Switch frameworks anytime**: Your workflows and credits work with any framework
- **Use nabl as universal execution**: All frameworks call the same nabl API for long-running tasks

---

## Problem Statement

1. **Existing agent frameworks have painful onboarding** - ZeroClaw, IronClaw, and others require complex CLI setup, database configuration, and terminal expertise
2. **Browser automation doesn't work on headless VPS** - OpenClaw's browser relay requires Chrome extension + active tab, fails in server environments
3. **LLMs "roleplay" tool use instead of executing** - Agents often pretend to run tools rather than actually executing them
4. **Non-technical users can't deploy agents** - Current solutions require CLI/IDE knowledge that intimidates consultants and low-code builders

---

## Solution

### Architecture Split

- **User's Choice of Orchestrator** = Any framework that can make HTTP calls (OpenClaw, ZeroClaw, IronClaw, LangGraph, CrewAI, custom)
- **nabl** = Universal execution layer (browser automation, long-running workflows, anything taking 30s+)
- **iClaw Platform** = Deployment, billing, and user management

### Supported Frameworks

| Framework | Language | Complexity | Best For |
|-----------|----------|------------|----------|
| OpenClaw | TypeScript | Medium | Quick setup, good defaults |
| ZeroClaw | Rust | Low | Lightweight, fast |
| IronClaw | Rust | High | Security, enterprise |
| LangGraph | Python | Medium | Complex workflows |
| CrewAI | Python | Medium | Multi-agent |
| Custom | Any | Varies | Full control |

### Deployment Model

- **Demo bot** in iClaw Discord server for try-before-buy
- **User's own bot** deployed to their Discord/Telegram/Slack via Fly.io
- **Framework selection** during onboarding (or later)
- **One-click onboarding** through Discord DM flow

---

## Target Users

1. **Primary**: Consultants/agencies who want AI assistants for their clients
2. **Secondary**: Small business owners who want automation without coding
3. **Tertiary**: Developers who want a pre-built agent platform to customize

---

## User Journey

### Phase 1: Discovery
- User finds iClaw (Twitter, Discord, referral)
- Joins iClaw Discord server

### Phase 2: Try (Demo Bot)
- Uses demo bot: `@iClaw audit mysite.com`
- Gets real result (limited free usage: 3 audits)
- Experiences the value firsthand

### Phase 3: Convert
- User types `@iClaw deploy` or clicks `/deploy` command
- Bot DMs them onboarding flow:
  1. Pick channel: Discord / Telegram / Slack
  2. OAuth to add bot to their server (Discord) or connect bot token
  3. Pick plan: Starter ($15/mo) or Pro ($30/mo)
  4. Stripe checkout

### Phase 4: Provision
- Payment confirmed
- Fly.io spins up their dedicated VM
- Bot goes live in their server
- User gets welcome message with available commands

### Phase 5: Use
- User and team use bot daily
- Workflows execute, credits consumed
- Upgrade prompts when hitting limits

### Phase 6: Expand (Future)
- Connect integrations (Google Calendar, Gmail, etc.)
- Create custom workflows
- Invite team members

---

## MVP Scope (Week 1-2)

### Week 1: Demo Bot + Core Workflow

| Feature | Description | Priority |
|---------|-------------|----------|
| Discord bot setup | Create bot, add to iClaw server | P0 |
| OpenClaw gateway | Running on VPS, Discord channel enabled | P0 |
| nabl integration | Custom tool that calls nabl API for long tasks | P0 |
| Website audit workflow | End-to-end: user requests → nabl executes → result returns | P0 |
| Basic error handling | Graceful failures, user-friendly messages | P0 |

### Week 2: User Self-Deploy

| Feature | Description | Priority |
|---------|-------------|----------|
| Onboarding flow | DM-based flow: channel picker → OAuth → payment | P0 |
| Stripe integration | Checkout links, webhook handling, subscription management | P0 |
| Fly.io provisioning | Auto-provision VM on payment confirmation | P0 |
| User bot activation | Bot joins their server, sends welcome message | P0 |
| Credit system | Track usage per user, enforce limits | P1 |

---

## Technical Architecture

```
┌─────────────────────────────────────────────────────────────┐
│              User's Fly VM (Framework-Agnostic)            │
│                                                             │
│  ┌─────────────────────────────────────────────────────────┐│
│  │  Pick One Orchestrator:                                 ││
│  │  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐   ││
│  │  │ OpenClaw │ │ ZeroClaw │ │ IronClaw │ │  Custom  │   ││
│  │  └──────────┘ └──────────┘ └──────────┘ └──────────┘   ││
│  └─────────────────────────────────────────────────────────┘│
│                           │                                 │
│          All frameworks integrate the same way:             │
│  ┌─────────────────────────────────────────────────────────┐│
│  │  POST nabl.dev/api/v1/workflow                         ││
│  │  {                                                      ││
│  │    "workflow": "audit" | "discovery" | "book-golf",    ││
│  │    "params": { ... },                                  ││
│  │    "iclaw_key": "user_api_key"                         ││
│  │  }                                                      ││
│  └─────────────────────────────────────────────────────────┘│
└─────────────────────────────────────────────────────────────┘
                    │
                    │ All long-running tasks
                    ▼
┌─────────────────────────────────────────────────────────────┐
│                     nabl Worker Cloud                       │
│                                                             │
│  Universal API:                                             │
│  POST /api/v1/workflow                                     │
│  ├─ audit         → Website audit (Playwright)             │
│  ├─ discovery     → Lead search (Apify)                    │
│  ├─ book-golf     → Golf booking (Playwright)              │
│  ├─ enrich        → Contact enrichment                     │
│  └─ custom        → User-defined workflows (future)        │
│                                                             │
│  Features:                                                  │
│  ├─ Framework-agnostic (any HTTP client works)            │
│  ├─ Async support (webhook callbacks)                      │
│  ├─ Credit metering per user                               │
│  └─ Rate limiting                                          │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### Framework Integration Examples

**OpenClaw** (TypeScript tool):
```typescript
export const nablTool = {
  name: 'nabl_workflow',
  execute: async (workflow: string, params: object) => {
    const res = await fetch('https://nabl.dev/api/v1/workflow', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ workflow, params, iclaw_key: process.env.ICLAW_KEY })
    });
    return res.json();
  }
};
```

**ZeroClaw** (Rust skill):
```rust
pub async fn nabl_workflow(workflow: &str, params: Value) -> Result<Value> {
    let client = reqwest::Client::new();
    let res = client.post("https://nabl.dev/api/v1/workflow")
        .json(&json!({ "workflow": workflow, "params": params, "iclaw_key": env::var("ICLAW_KEY")? }))
        .send().await?;
    Ok(res.json().await?)
}
```

**Python** (LangGraph/CrewAI):
```python
import requests, os
def nabl_workflow(workflow: str, params: dict) -> dict:
    return requests.post('https://nabl.dev/api/v1/workflow', json={
        'workflow': workflow, 'params': params, 'iclaw_key': os.environ['ICLAW_KEY']
    }).json()
```

---

## Tech Stack

| Component | Technology |
|-----------|------------|
| Orchestration | OpenClaw |
| LLM Provider | Anthropic (Claude Sonnet) or OpenRouter |
| Chat Channels | Discord.js, Telegram Bot API, Slack Bolt |
| User VMs | Fly.io Machines API |
| Database | Supabase (users, subscriptions, usage) |
| Payments | Stripe (subscriptions, checkout) |
| Browser Automation | Playwright, Apify (in nabl) |
| Worker Cloud | nabl (existing infrastructure) |

---

## Pricing Model

### Plans

| Plan | Price | Included | Overage |
|------|-------|----------|---------|
| Free (demo) | $0 | 3 workflow runs | N/A |
| Starter | $15/mo | 200 credits | $0.015/credit |
| Pro | $30/mo | 600 credits | $0.01/credit |

### Credit Costs (Internal)

| Workflow | Your Cost | Credits Charged |
|----------|-----------|-----------------|
| Website audit | ~$0.10 | 10 credits |
| Find 50 businesses | ~$0.20 | 20 credits |
| Find owner/email | ~$0.05 | 5 credits |
| Golf booking | ~$0.15 | 15 credits |

---

## API Endpoints (nabl)

### POST /api/audit
```json
Request:
{
  "url": "example.com",
  "iclaw_key": "user_api_key"
}

Response:
{
  "score": 72,
  "critical_issues": 3,
  "warnings": 5,
  "report_url": "https://nabl.dev/reports/abc123"
}
```

### POST /api/discovery
```json
Request:
{
  "niche": "hvac",
  "location": "Denver, CO",
  "limit": 50,
  "iclaw_key": "user_api_key"
}

Response:
{
  "businesses": [...],
  "count": 47,
  "credits_used": 20
}
```

---

## Discord Bot Commands

### Demo Bot (in iClaw server)
- `@iClaw help` - Show available commands
- `@iClaw audit <url>` - Run website audit
- `@iClaw deploy` - Start onboarding to get your own bot

### User's Bot (in their server)
- `@Bot help` - Show available commands
- `@Bot audit <url>` - Run website audit
- `@Bot find leads <niche> in <location>` - Search for businesses
- `@Bot status` - Check credits and usage
- `@Bot connect google` - Connect Google account (OAuth)

---

## Onboarding Flow (Discord DM)

```
Bot: "Hey! Let's set up your own iClaw bot. 🚀

First, where do you want your bot?

1️⃣ Discord
2️⃣ Telegram  
3️⃣ Slack"

User: "1"

Bot: "Great! Click here to add the bot to your server:
[Add to Discord →]

Once added, reply 'done'"

User: "done"

Bot: "Perfect! I see the bot joined [Server Name].

Now pick your plan:

⭐ Starter ($15/mo) - 200 credits/month
🚀 Pro ($30/mo) - 600 credits/month + priority support

Reply 'starter' or 'pro'"

User: "starter"

Bot: "Here's your checkout link:
[Pay $15/mo →]

I'll activate your bot as soon as payment confirms!"

[After Stripe webhook confirms payment]

Bot: "✅ You're all set!

Your bot is now live in [Server Name].
Try it out: @YourBot audit yoursite.com

Need help? Reply here anytime."
```

---

## Success Metrics

### Week 1
- [ ] Demo bot responds in Discord within 3 seconds
- [ ] Audit workflow completes end-to-end
- [ ] 5 community members test successfully
- [ ] No "roleplaying" - actual execution happens
- [ ] Error rate < 5%

### Week 2
- [ ] 3 users complete self-deploy flow
- [ ] Stripe payments process correctly
- [ ] Fly VMs provision automatically
- [ ] User bots go live within 60 seconds of payment

### Month 1
- [ ] 20 paying users
- [ ] < 2% churn
- [ ] 90% of audits complete successfully
- [ ] Community feedback incorporated

---

## Risks & Mitigations

| Risk | Mitigation |
|------|------------|
| OpenClaw breaks/changes | Keep fork minimal, mostly config. Core logic in nabl. |
| Fly.io costs spike | Auto-stop idle machines. Monitor usage. |
| nabl overloaded | Queue system, rate limiting per user |
| Discord rate limits | Respect limits, queue messages if needed |
| User confusion | Clear error messages, help command, docs |

---

## Future Roadmap

### Month 2
- Telegram and Slack channel support
- Workflow builder UI (visual)
- More workflows: calendar, email, reservations

### Month 3
- Marketplace for shared workflows
- Team seats and permissions
- White-label option for agencies

### Month 4+
- Mobile app for quick commands
- Voice interface (Whisper integration)
- Custom workflow creation via chat

---

## Open Questions (Resolved)

1. **Discord bot approach**: Use OpenClaw's Discord channel support initially. Can switch to standalone discord.js if needed.

2. **nabl API auth**: Use `iclaw_api_key` per user, validated against Supabase.

3. **Report viewing**: nabl generates and hosts reports. Returns URL to agent.

4. **User bot branding**: Starter = shared "iClaw" bot. Pro = can create own bot (future).

---

## Appendix: File Structure

```
iClaw/
├── .taskmaster/
│   ├── docs/
│   │   └── PRD.md (this file)
│   └── tasks/
│       └── tasks.json (generated)
├── apps/
│   └── api/               # Backend API (Hono)
├── packages/
│   ├── core/              # Shared types, utils
│   ├── database/          # Supabase client
│   └── skills/            # Skill registry (existing)
├── infrastructure/
│   └── fly/               # Fly.io config (existing)
└── .env.local             # Environment variables
```
