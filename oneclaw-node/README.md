# OneClaw Node (Rust)

**Lightning-fast AI agent runtime with simplified chat and durable workflows.**

Built with Rust for <10ms startup, <5MB RAM, ~3MB binary.

---

## Features

- **Simplified Chat** — Minimal 2-3 sentence system prompt, no intent extraction bloat
- **Agent OS** — Load personality from `~/.oneclaw/workspace/` (SOUL.md, IDENTITY.md, etc.)
- **Tool Execution** — Parse ```tool blocks from LLM, execute via harness or local executors
- **Conversation Memory** — SQLite-backed persistent chat history
- **Web UI** — Built-in chat interface at http://localhost:8787
- **Multi-Provider LLM** — OpenRouter, Anthropic, OpenAI, Minimax, etc.

---

## Quick Start

### 1. Install Rust

```bash
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
```

### 2. Configure

Create `~/.oneclaw/node.yaml`:

```yaml
node:
  id: "unique-node-id"
  name: "My OneClaw Node"
  environment: "private"

llm:
  provider: "openrouter"
  model: "minimax/minimax-m2.5"

control_plane:
  url: "http://localhost:3000"

harness:
  url: "http://localhost:9000"
```

Create `.env.local` in repo root:

```env
OPENROUTER_API_KEY=sk-or-v1-...
# or
ANTHROPIC_API_KEY=sk-ant-...
```

### 3. Run

```bash
cargo run -- daemon --port 8787
```

**Open:** http://localhost:8787/chat.html

---

## Agent OS (Workspace)

OneClaw loads agent personality from `~/.oneclaw/workspace/`:

```
~/.oneclaw/workspace/
├── SOUL.md         # Personality, values, communication style
├── IDENTITY.md     # Name, role, visual description
├── SKILLS.md       # Available tools and their costs
├── PLAYBOOKS.md    # Common task patterns
└── MEMORY.md       # Persistent facts
```

If the workspace doesn't exist, OneClaw falls back to `oneclaw-node/templates/` (copy these to get started).

---

## Simplified Chat Flow

```
User: "hi"
  ↓
LLM (minimal prompt: "You are OneClaw, a helpful AI assistant...")
  ↓
Response: "Hey! How can I help?"
  ↓
Done (no tool blocks)

─────────────────────────────────

User: "find me golf times"
  ↓
LLM sees tools list
  ↓
Emits: ```tool {"tool": "harness.execute", "input": {...}}```
  ↓
Daemon executes tool → harness
  ↓
LLM followup: "Found 5 tee times..."
  ↓
Done
```

**No IntentFrame. No golf special-case. Just LLM + tools.**

---

## Architecture Changes (v0.2.0)

### What Was Removed

| Removed | Why |
|---------|-----|
| IntentFrame extraction | Not needed - LLM decides tool use |
| ExecutionPolicy injection | Harness handles policy |
| Golf special-case fallback | LLM handles all skills uniformly |
| 500-line system prompt | Bloated, caused blocking |
| Milestone tracking spam | Just "Received your message" now |
| Tool parse failure recovery | Keep it simple |

### What Was Added

- **Minimal system prompt** — 2-3 sentences + tools list
- **Agent OS loader** — Workspace-first, templates as fallback
- **Simplified chat helpers** — `format_tools`, `execute_tool`, `find_and_execute_tools`
- **Followup LLM** — Summarizes tool results in plain language

---

## CLI Commands

```bash
# Start daemon
cargo run -- daemon --port 8787

# Run onboarding wizard (creates ~/.oneclaw/node.yaml)
cargo run -- onboard

# Show current config
cargo run -- config

# Run a workflow (WIP)
cargo run -- run check-email
```

---

## Configuration

### LLM Provider Override

Environment variables override `~/.oneclaw/node.yaml`:

```bash
LLM_PROVIDER=anthropic
LLM_MODEL=claude-3-5-sonnet-20241022
ANTHROPIC_API_KEY=sk-ant-...
```

### Harness URL

```bash
HARNESS_URL=http://localhost:9000
```

### Store Type

```yaml
# node.yaml
store:
  store_type: "sqlite"  # or "hosted"
  sqlite_path: "~/.oneclaw/node.db"
```

---

## Development

### Build

```bash
cargo build --release
```

Binary: `target/release/oneclaw-node` (~3MB)

### Test Chat

```powershell
# PowerShell
Invoke-RestMethod -Uri "http://localhost:8787/chat" `
  -Method POST `
  -ContentType "application/json" `
  -Body '{"message":"hi"}'
```

### Logs

Set log level:

```bash
RUST_LOG=info cargo run -- daemon
```

---

## API Endpoints

### POST /chat

```json
{
  "message": "find me golf times",
  "channel": "http",
  "provider": "http",
  "provider_id": "user123"
}
```

Response:

```json
{
  "response": "Found 5 tee times at Riverdale Golf...",
  "tool_calls": [
    {
      "tool": "harness.execute",
      "input": {...},
      "output": {...},
      "duration_ms": 12500
    }
  ],
  "milestones": ["Received your message"],
  "duration_ms": 14200
}
```

### GET /chat/history

```bash
curl "http://localhost:8787/chat/history?user_id=http:anonymous"
```

### POST /chat/clear

```bash
curl -X POST "http://localhost:8787/chat/clear?user_id=http:anonymous"
```

### GET /health

```bash
curl http://localhost:8787/health
```

---

## File Structure

```
oneclaw-node/
├── src/
│   ├── main.rs           # CLI entry point
│   ├── daemon.rs         # HTTP server + simplified chat
│   ├── agent_os.rs       # Workspace loader (SOUL, IDENTITY, etc.)
│   ├── executor.rs       # LLM + harness executor registry
│   ├── conversation.rs   # SQLite conversation storage
│   ├── identity.rs       # User identity resolution
│   ├── config.rs         # YAML + env config loader
│   └── ui/               # HTML/CSS/JS for web UI
│
├── templates/            # Default Agent OS (copy to workspace)
│   ├── SOUL.md
│   ├── IDENTITY.md
│   ├── SKILLS.md
│   ├── PLAYBOOKS.md
│   └── MEMORY.md
│
└── Cargo.toml
```

---

## Benchmarks

```
Startup:  <10ms
RAM:      ~5MB idle, ~12MB during LLM call
Binary:   2.8MB (release, stripped)
Chat:     1.5-3s (depends on LLM provider)
```

---

## Troubleshooting

### "Config not found"

Run `cargo run -- onboard` to create `~/.oneclaw/node.yaml`.

### "Could not fetch harness tools"

The harness isn't running. Start it:

```bash
cd packages/harness
pnpm dev
```

### "Agent OS templates dir not found"

Copy templates to workspace:

```bash
mkdir -p ~/.oneclaw/workspace
cp oneclaw-node/templates/* ~/.oneclaw/workspace/
```

### Port 8787 in use

```bash
# Find process
netstat -ano | findstr :8787

# Kill it (Windows)
taskkill /PID <pid> /F

# Kill it (Linux/Mac)
kill <pid>
```

---

## Contributing

PRs welcome. The daemon is designed to be:

- **Simple** — Minimal abstractions, clear flow
- **Fast** — Rust performance, no bloat
- **Readable** — Well-documented, idiomatic Rust

---

## License

MIT — see [LICENSE](../LICENSE)
