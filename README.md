# OneClaw

**Lightning-fast AI agent runtime with durable workflow execution.**

Self-hosted. Data-local. Production-ready.

---

## Why OneClaw?

**5-Minute Setup** — Docker Compose → AI agent with code execution  
**Self-Hosted** — Your data stays local, OAuth tokens encrypted  
**Production-Ready** — Durable workflows, SQLite/Supabase, policy enforcement  
**Developer-Friendly** — Markdown-driven agent, 8 core tools, progressive add-ons  

---

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    Docker Compose                            │
│                                                              │
│  ┌────────────────────────────────────────────────────┐    │
│  │  Daemon (Rust) - Port 8787                         │    │
│  │  • Chat UI & Agent runtime                         │    │
│  │  • Agent OS (SOUL, SKILLS, PLAYBOOKS, MEMORY)      │    │
│  │  • Conversation memory (SQLite)                    │    │
│  │  • Auto-syncs SKILLS.md from Harness              │    │
│  └────────────────────────────────────────────────────┘    │
│                        │                                     │
│                        │ HTTP                                │
│                        ▼                                     │
│  ┌────────────────────────────────────────────────────┐    │
│  │  Harness (TypeScript) - Port 9000                  │    │
│  │  • Tool registry (24 tools)                        │    │
│  │  • execute-code (Deno sandbox)                     │    │
│  │  • Database, files, business tools                 │    │
│  │  • Durable execution engine                        │    │
│  └────────────────────────────────────────────────────┘    │
│                        │                                     │
│                        │ HTTP (OAuth only)                   │
│                        ▼                                     │
│  ┌────────────────────────────────────────────────────┐    │
│  │  API (TypeScript) - Port 3000                      │    │
│  │  • Gmail OAuth proxy                               │    │
│  │  • Google Calendar (optional)                      │    │
│  │  • Stripe billing (optional)                       │    │
│  └────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────┘
                        │
                        │ External Services
                        ▼
┌─────────────────────────────────────────────────────────────┐
│  • Anthropic/OpenAI/OpenRouter (LLM)                        │
│  • Google (Gmail OAuth)                                     │
│  • Supabase (optional - cloud database)                     │
│  • Apify (optional - business discovery)                    │
│  • Perplexity (optional - AI search)                        │
└─────────────────────────────────────────────────────────────┘
```

**Start everything:** `docker-compose up`

**Access:**
- Main UI: http://localhost:8787 (Daemon)
- Tools API: http://localhost:9000 (Harness)
- OAuth: http://localhost:3000 (API)

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

| Docker Setup | Agent OS | 8 Core Tools | Progressive Add-Ons |
|--------------|----------|--------------|---------------------|
| One command | Markdown files define behavior | Code execution, Files, Database, Gmail | Supabase, Business Discovery, AI Search |
| 5 minutes | Self-improving through SKILLS.md | SQLite included | Choose what you need |
| No Rust/Node install needed | SOUL, IDENTITY, PLAYBOOKS, MEMORY | Deno sandbox | $0 to $30/mo based on add-ons |

---

## Quick Start

### Option 1: Docker (Recommended) ⚡

**Time: 5 minutes**

```bash
git clone https://github.com/rnabl/oneclaw.git
cd oneclaw
cp .env.example .env.local
nano .env.local  # Add your API keys
docker-compose up
```

Open → http://localhost:8787

**What you get:**
- ✅ AI agent with chat UI
- ✅ Code execution (TypeScript/JavaScript/Bash via Deno)
- ✅ File operations (read/write)
- ✅ Local database (SQLite)
- ✅ Gmail integration (with OAuth setup)
- ✅ 8 core tools, ready to use

**Required in `.env.local`:**
```env
ANTHROPIC_API_KEY=sk-ant-...
GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...
```

See [DOCKER.md](./DOCKER.md) for complete Docker documentation.

---

### Option 2: Manual Setup

**Time: 15 minutes**

```bash
# 1. Clone & Build
git clone https://github.com/rnabl/oneclaw.git
cd oneclaw
pnpm install && pnpm build
cd oneclaw-node && cargo build --release

# 2. Configure
cp .env.example .env.local
nano .env.local  # Add API keys

# 3. Run (3 terminals)
pnpm --filter @oneclaw/harness dev        # Terminal 1 (port 9000)
pnpm --filter @oneclaw/api dev            # Terminal 2 (port 3000)
cd oneclaw-node && cargo run -- daemon    # Terminal 3 (port 8787)
# Or custom port: cargo run -- daemon --port 8888
```

Open → http://localhost:8787

---

### Option 3: Production VPS

**Time: 20 minutes** - One-click deployment with SSL

See [DEPLOY.md](./DEPLOY.md) for VPS setup guide.

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
