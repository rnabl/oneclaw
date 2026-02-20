# OneClaw

**Lightning-fast AI agent runtime with durable workflow execution.**

Self-hosted. Data-local. Production-ready.

---

## Why OneClaw?

**Built with Rust** — Ultra-fast agent runtime with <10ms startup time  
**Privacy-First** — Your data stays local, OAuth tokens encrypted  
**Production-Ready** — Durable workflows, wallet system, policy enforcement  
**Developer-Friendly** — YAML workflows + Rust executors = infinite possibilities  

---

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    Your Machine                             │
│                                                             │
│  ┌────────────────────────────────────────────────────┐    │
│  │  OneClaw Node (Rust) - Port 8787                   │    │
│  │  • Simplified chat (minimal prompt)                │    │
│  │  • Agent OS (SOUL, IDENTITY, etc.)                 │    │
│  │  • Tool execution (```tool blocks)                 │    │
│  │  • Conversation memory (SQLite)                    │    │
│  │  • Web UI                                           │    │
│  └────────────────────────────────────────────────────┘    │
│                        │                                    │
│                        │ HTTP                               │
│                        ▼                                    │
│  ┌────────────────────────────────────────────────────┐    │
│  │  Harness (TypeScript) - Port 9000                  │    │
│  │  • Workflow executors                              │    │
│  │  • Durable execution                               │    │
│  │  • Artifact storage                                │    │
│  └────────────────────────────────────────────────────┘    │
│                        │                                    │
│                        │ Optional                           │
│                        ▼                                    │
│  ┌────────────────────────────────────────────────────┐    │
│  │  API (TypeScript/Hono) - Port 3000                 │    │
│  │  • OAuth proxy (Gmail, Calendar)                   │    │
│  │  • Billing & wallet                                │    │
│  │  • Node registry                                   │    │
│  └────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────┘
                        │
                        │ External Services
                        ▼
┌─────────────────────────────────────────────────────────────┐
│  • OpenRouter/Anthropic/OpenAI (LLM)                        │
│  • Google (Gmail, Calendar)                                 │
│  • Stripe (Payments)                                        │
│  • Supabase (Database)                                      │
└─────────────────────────────────────────────────────────────┘
```

---

## What's New in v0.2.0 (Simplified Chat)

**Removed:**
- IntentFrame extraction (LLM decides tool use)
- ExecutionPolicy injection (harness handles it)
- Golf special-case fallback (LLM handles uniformly)
- 500-line system prompt bloat
- Milestone spam

**Added:**
- Minimal 2-3 sentence system prompt
- Agent OS workspace loader (~/.oneclaw/workspace/)
- Simplified chat flow: LLM → tool blocks → execute → followup
- Single milestone: "Received your message"

**Result:** ~3-5x faster response, cleaner logs, same capabilities.

---

## Features

| Rust Performance | Privacy-First | Production-Ready | YAML Workflows |
|------------------|---------------|------------------|----------------|
| <10ms startup | Local data storage | Wallet system | Write once, run anywhere |
| <5MB RAM | Encrypted tokens | Policy engine | Pre-built executors |
| ~3MB binary | No telemetry | Durable execution | HTTP, Browser, Gmail |

---

## Quick Start

**1. Clone & Install**

```bash
git clone https://github.com/rnabl/oneclaw.git
cd oneclaw
pnpm install && pnpm build
```

**2. Configure** (create `.env.local`)

```env
# Required
ANTHROPIC_API_KEY=sk-ant-...
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=...

# Optional (for Gmail)
GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...
```

**3. Run**

```bash
# Terminal 1: API
pnpm --filter @oneclaw/api dev

# Terminal 2: Node  
cd oneclaw-node && cargo run -- daemon
```

**4. Open** → http://localhost:8787

---

## Project Structure

```
oneclaw/
├── oneclaw-node/          # Rust runtime
│   ├── daemon.rs          #   HTTP server
│   ├── workflow.rs        #   Workflow engine
│   ├── executor.rs        #   Tool execution
│   └── ui/                #   Web UI
│
├── apps/api/              # Control plane
│   ├── oauth.ts           #   OAuth proxy
│   ├── gmail.ts           #   Gmail integration
│   └── nodes.ts           #   Node management
│
├── packages/
│   ├── harness/           # Core infrastructure
│   ├── executors/         # Pre-built tools
│   └── node-runtime/      # Runtime library
│
└── workflows/             # YAML workflows
```

---

## Example: Gmail Integration

**1. Setup OAuth** (3 minutes)

- Go to [Google Cloud Console](https://console.cloud.google.com/)
- Create OAuth 2.0 Client
- Add redirect: `http://localhost:3000/oauth/google/callback`
- Copy credentials to `.env.local`

**2. Connect** (1 click)

```bash
# Open integrations page
open http://localhost:8787/integrations.html

# Click "Connect Gmail" → sign in → done
```

**3. Use** (API or workflows)

```bash
# Check inbox
curl http://localhost:8787/gmail/inbox

# Send email
curl -X POST http://localhost:8787/gmail/send \
  -H "Content-Type: application/json" \
  -d '{"to":"user@example.com","subject":"Hi","body":"Hello!"}'
```

---

## YAML Workflows

Create workflows by composing pre-built executors:

```yaml
# workflows/check_email.yaml
name: Morning Email Check
trigger:
  schedule: "0 9 * * *"  # Every day at 9 AM
steps:
  - executor: http.request
    params:
      url: http://localhost:8787/gmail/inbox
      method: GET
  - executor: llm.summarize
    params:
      prompt: "Summarize these emails briefly"
```

**No code needed.** Just YAML + pre-built executors.

---

## Security

**Privacy by default:**

- Data stays local (SQLite + Supabase)
- OAuth tokens encrypted (AES-256-GCM)
- No telemetry
- Secrets never logged

**Never commit:**

- `.env.local`
- API keys in code
- OAuth tokens

---

## Development

```bash
# Run tests
pnpm test

# Build release
cargo build --release

# Lint
pnpm lint
```

---

## Self-Hosting

### One-Click VPS Setup

Deploy OneClaw to your VPS with automatic SSL in 3 commands:

```bash
# 1. Clone and setup
git clone https://github.com/rnabl/oneclaw.git && cd oneclaw
sudo ./scripts/setup-vps.sh
# Enter: yourdomain.com
# Enter: your@email.com

# 2. Add API keys
nano .env.local

# 3. Build and start
pnpm install && pnpm build
./scripts/start-services.sh
```

**What the script does:**
- Installs Node.js, pnpm, PM2, Rust, Nginx, Certbot
- Configures SSL certificates (Let's Encrypt)
- Sets up reverse proxy for your domain
- Creates `.env.local` and `config.toml`
- Auto-updates `GOOGLE_REDIRECT_URI`

**What you need:**
- A VPS (DigitalOcean, AWS, etc.)
- A domain pointed to your VPS IP
- Root access

**After deployment:**
1. Update Google OAuth redirect URI in console to: `https://api.yourdomain.com/oauth/google/callback`
2. Your OneClaw instance will be live at `https://yourdomain.com`

### Manual Deployment

If you prefer manual setup:

```bash
# Clone repo
git clone https://github.com/rnabl/oneclaw.git
cd oneclaw

# Install dependencies
pnpm install && pnpm build

# Start services
./scripts/start-services.sh
```

For SSL configuration details, see [scripts/setup-vps.sh](scripts/setup-vps.sh).

---

## Benchmarks

Coming soon. We'll compare OneClaw Node against:
- OpenClaw (TypeScript)
- NanoBot (Python)
- PicoClaw (Go)

Metrics: Startup time, RAM usage, binary size, cost.

---

## Contributing

PRs welcome. OneClaw is designed to be:

- **Readable** — Clear code, well-documented
- **Modular** — Easy to add executors/workflows
- **Fast** — Rust performance, YAML simplicity

**Roadmap:**

- More executors (Calendar, Notion, Linear)
- Chat channels (Discord, Telegram, Slack)
- Sub-agent spawning (parallel workflows)
- Agent OS layer (SOUL.md, MEMORY.md)

---

## License

MIT License — see [LICENSE](LICENSE)

---

## Links

- **Issues:** [github.com/rnabl/oneclaw/issues](https://github.com/rnabl/oneclaw/issues)
- **Discussions:** [github.com/rnabl/oneclaw/discussions](https://github.com/rnabl/oneclaw/discussions)
- **Deployment Guide:** [DEPLOY.md](DEPLOY.md)
- **Local Setup:** [LOCALHOST.md](LOCALHOST.md)

---

## Built With

- [Rust](https://www.rust-lang.org/) — Agent runtime
- [Hono](https://hono.dev/) — API framework  
- [Anthropic](https://www.anthropic.com/) — Claude AI
- [Supabase](https://supabase.com/) — Database & auth

---

**Star us on GitHub** — Help others discover OneClaw
