# OneClaw

**Lightning-fast AI agent runtime with durable workflow execution.**

Self-hosted. Data-local. Production-ready.

---

# OneClaw

**AI agent that writes and executes code on demand.**

Chat with it on Telegram. Ask it to scrape websites, process data, call APIs — it writes TypeScript and runs it instantly.

Self-hosted. Data-local. Production-ready.

---

## What Makes This Different

**It codes live.** Other AI assistants suggest code. OneClaw writes it, executes it in a secure sandbox, and shows you the result — all in one response.

```
You: "Get the top 3 Hacker News stories"

Agent: *writes TypeScript*
        *executes in Deno sandbox*
        *returns formatted results*

Output:
🔥 TOP 3 HACKER NEWS STORIES
1. FrameBook
   👍 209 points | 💬 38 comments
```

**Real example from production** ↑

---

## Live Demo

<function_calls>
<invoke name="StrReplace">
<parameter name="new_string">## Why OneClaw?

**Writes Code on Demand** — Ask for anything, it writes & executes TypeScript/JavaScript/Bash  
**Telegram Native** — Chat with your agent anywhere, anytime  
**33+ Built-in Tools** — Gmail, database, business discovery, web scraping, file ops  
**Self-Hosted** — Your data stays local, OAuth tokens encrypted  
**Production-Ready** — Durable workflows, auto-restarts, PM2 deployment  

---

## How It Works

### Architecture

```
┌─────────────────────────────────────────────┐
│             Telegram Bot API                 │
│                    ↓                         │
│  ┌──────────────────────────────────────┐   │
│  │  Daemon (Rust) - Port 8787           │   │
│  │  • Receives messages from Telegram   │   │
│  │  • Agent OS (SOUL, SKILLS, MEMORY)   │   │
│  │  • Calls Claude AI to decide action  │   │
│  │  • Executes tools via Harness        │   │
│  └─────────────┬────────────────────────┘   │
│                │ HTTP                        │
│                ▼                             │
│  ┌──────────────────────────────────────┐   │
│  │  Harness (TypeScript) - Port 9000    │   │
│  │  • Tool registry (33 tools)          │   │
│  │  • execute-code (Deno sandbox)       │   │
│  │  • Database, files, business tools   │   │
│  └─────────────┬────────────────────────┘   │
│                │ OAuth only                  │
│                ▼                             │
│  ┌──────────────────────────────────────┐   │
│  │  API (TypeScript) - Port 3000        │   │
│  │  • Gmail OAuth proxy                 │   │
│  │  • Handles OAuth callbacks           │   │
│  └──────────────────────────────────────┘   │
└─────────────────────────────────────────────┘
```

**Flow:**
1. You message the bot on Telegram
2. Daemon receives it, loads Agent OS context
3. Claude AI decides what to do (tool call or code execution)
4. Harness executes the tool/code securely
5. Daemon formats the result
6. You get the response on Telegram

**Agent OS (Self-Improving):**
- `SOUL.md` - Core principles and tool syntax
- `SKILLS.md` - Auto-synced list of all available tools
- `PLAYBOOKS.md` - Common task patterns
- `MEMORY.md` - Learned preferences and context
- `IDENTITY.md` - Personality and formatting style

These Markdown files are in `~/.oneclaw/workspace/` and updated automatically as the agent learns.

---

## What Can It Do?

### 💻 Dynamic Code Execution

```
You: "Calculate fibonacci(15)"
Agent: [writes TS, executes, returns: 610]

You: "Fetch weather from wttr.in API"
Agent: [writes fetch code, returns formatted weather]

You: "Parse this JSON and count items"
Agent: [writes parser, returns count]
```

### 🌐 Web Scraping & APIs

```
You: "Get top Hacker News stories"
Agent: [fetches HN API, formats with emojis]

You: "Scrape example.com for all links"
Agent: [writes scraper, extracts URLs]
```

### 📧 Gmail Integration

```
You: "Show my inbox"
Agent: [fetches via OAuth, displays]

You: "Send email to user@example.com"
Agent: [composes and sends]
```

### 🏢 Business Discovery (Optional)

```
You: "Find coffee shops in Austin TX"
Agent: [uses discover-businesses tool]

You: "Get contact info for this website"
Agent: [uses enrich-contact tool]
```

---

## Features

| Feature | Description |
|---------|-------------|
| **Dynamic Code Execution** | Writes & runs TypeScript/JavaScript/Bash in secure Deno sandbox |
| **Telegram Integration** | Chat with your agent anywhere, anytime |
| **33+ Built-in Tools** | Gmail, database, files, web scraping, business discovery, AI search |
| **Agent OS** | Self-improving through SKILLS.md, MEMORY.md, PLAYBOOKS.md, SOUL.md |
| **Secure by Default** | Encrypted OAuth tokens, sandboxed code execution, no telemetry |
| **Production Ready** | PM2 auto-restart, SQLite/Supabase, durable workflows |
| **Docker or Manual** | 5-min Docker setup OR 15-min manual install |

---

## Quick Start

### Option 1: Docker (5 Minutes) ⚡

```bash
git clone https://github.com/rnabl/oneclaw.git
cd oneclaw
cp .env.example .env
nano .env  # Add your ANTHROPIC_API_KEY
docker-compose up
```

**That's it!** Open http://localhost:8787

**What you get instantly:**
- ✅ AI agent with Telegram integration
- ✅ Code execution (TypeScript/JavaScript/Bash via Deno)
- ✅ 33+ tools (Gmail, database, files, web scraping, business tools)
- ✅ Auto-syncing Agent OS (learns and improves)
- ✅ Secure OAuth handling
- ✅ SQLite database (or optional Supabase)

**Required in `.env`:**
```env
ANTHROPIC_API_KEY=sk-ant-...
TELEGRAM_BOT_TOKEN=...  # Get from @BotFather
```

**Optional (progressive add-ons):**
```env
GOOGLE_CLIENT_ID=...           # For Gmail
GOOGLE_CLIENT_SECRET=...
APIFY_API_TOKEN=...            # For business discovery ($0.05/search)
PERPLEXITY_API_KEY=...         # For AI search ($0.10/query)
SUPABASE_URL=...               # For cloud database
```

See [DOCKER.md](./DOCKER.md) for complete setup guide.

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

### Option 2: Production VPS (20 Minutes)

**Deploy to your VPS with Telegram integration:**

```bash
# On your VPS
git clone https://github.com/rnabl/oneclaw.git
cd oneclaw

# Pull, build, start (one command)
./scripts/nuke-and-deploy.sh
```

**What the script does:**
- Pulls latest code
- Rebuilds Harness (TypeScript) and Daemon (Rust)
- Starts all services with PM2
- Auto-restarts on crashes
- Boots on server restart

**After deployment:**
1. Chat with your agent via Telegram (@yourbotname)
2. It has access to all 33+ tools
3. Can write and execute code on demand
4. Learns and improves over time

See [scripts/setup-vps.sh](./scripts/setup-vps.sh) for initial VPS setup.

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

## Real Examples

### Code Execution

**Input:** "Calculate the first 10 fibonacci numbers"

**Output:**
```
Code executed successfully (77ms):

🔢 First 10 Fibonacci Numbers:
============================
F(0): 0
F(1): 1
F(2): 1
F(3): 2
F(4): 3
F(5): 5
F(6): 8
F(7): 13
F(8): 21
F(9): 34
```

---

### Web Scraping

**Input:** "Get top 3 Hacker News stories"

**Output:**
```
Code executed successfully (272ms):

🔥 TOP 3 HACKER NEWS STORIES
=============================

1. FrameBook
   👍 209 points | 💬 38 comments
   🔗 https://fb.edoo.gg

2. Google just gave Sundar Pichai a $692M pay package
   👍 70 points | 💬 56 comments
   🔗 https://techcrunch.com/...

3. Show HN: I built a real-time OSINT dashboard
   👍 4 points | 💬 1 comments
   🔗 https://github.com/...
```

---

### Tool Usage

**33+ tools available:**

**Core (Free):**
- `execute-code` - Run TypeScript/JavaScript/Bash
- `database` - SQLite operations
- `write-file`, `read-file` - File operations
- `send-gmail`, `get-gmail-inbox` - Gmail (OAuth)

**Business (Paid):**
- `discover-businesses` - Google Maps scraping ($0.05/search)
- `enrich-contact` - Find owner emails ($0.10/query)
- `discover-hiring-businesses` - Find companies hiring ($1.00/search)
- `audit-website` - SEO, AI visibility, local presence ($0.15/audit)

**Analysis (Paid):**
- `check-ai-rankings` - See which businesses AI recommends ($0.005/query)
- `check-citations` - NAP consistency across 50+ directories ($0.50/check)

See full tool list: http://localhost:9000/tools

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
