# OneClaw Node Runtime

**Deterministic, privacy-first workflow execution engine.**

Born from 20+ hours of frustration with opaque agent frameworks (ZeroClaw, OpenClaw), the OneClaw Node Runtime is built on these principles:

## Core Principles

1. **Single Source of Truth**: ONE config file (`node.yaml`). No workspace copies, no home directory duplication, no hidden configs.
2. **If curl works, executor works**: HTTP executor MUST match curl behavior exactly. This is tested.
3. **Executors cannot lie**: Only the runtime sets `status` and `denial_reason`. Agents can't fake success.
4. **Full audit trail**: Every run produces a receipt with complete execution trace.
5. **Debuggability first**: When something fails, you know exactly what and why.

## Architecture

```
packages/
├── node-runtime/          # Core runtime daemon
│   ├── config/           # Single source config loader
│   ├── daemon/           # HTTP server (port 8787)
│   ├── executors/        # Executor system + registry
│   ├── receipts/         # Receipt generation
│   └── workflow/         # Workflow spec types
├── executors/
│   └── http/             # HTTP executor with curl parity
├── cli/                  # oneclaw CLI
└── node-ui/              # Vanilla HTML/CSS/JS (~10KB)
```

## Quick Start

### 1. Install & Onboard

```bash
npm install
npm run oneclaw onboard
```

This creates `~/.oneclaw/node.yaml` - THE config file.

### 2. Start Daemon

```bash
npm run oneclaw daemon
```

Runs on `localhost:8787`.

### 3. Run Workflow

```bash
npm run oneclaw run wallet_check --input='{"user_id":"123"}'
```

### 4. View Receipt

```bash
cat ~/.oneclaw/artifacts/{run_id}/receipt.json
```

Full execution trace: inputs, outputs, denials, errors, duration.

## Configuration (`node.yaml`)

```yaml
node:
  id: abc123
  name: My OneClaw Node
  environment: private  # private | managed | hybrid

llm:
  provider: anthropic
  api_key_env: ANTHROPIC_API_KEY
  model: claude-3-5-sonnet-20241022

security:
  mode: strict
  allowed_executors:
    - http.request
    - browser.playwright

http:
  allowed_domains:
    - "*.stripe.com"
    - api.twilio.com
    - "*"  # Allow all (use with caution)

artifacts:
  storage: local
  path: ~/.oneclaw/artifacts

control_plane:
  url: http://104.131.111.116:3000
  token: null
```

## Executors

### HTTP Executor

**Guarantee**: If `curl` works, executor works.

```typescript
import { HttpExecutor } from '@oneclaw/executor-http';

const executor = new HttpExecutor();
const result = await executor.execute({
  method: 'GET',
  url: 'https://api.stripe.com/v1/customers',
  headers: { Authorization: 'Bearer sk_...' },
});

// result.status: 'executed' | 'denied' | 'failed'
// result.denial_reason: { rule, attempted, policy } if denied
// result.result: { status, headers, body } if successful
```

**Domain Allowlist**: Enforced at runtime. Denials are structured:

```json
{
  "status": "denied",
  "denial_reason": {
    "rule": "http.allowed_domains",
    "attempted": "https://evil.com",
    "policy": "Domain not in allowed_domains list"
  }
}
```

### Future Executors

- **Browser**: Playwright automation
- **LLM**: Claude/GPT calls with token tracking
- **Data**: Transform/filter/map operations

## Workflow Spec Format

```yaml
version: '1.0'
id: hvac_search_local
name: Find Local HVAC Services

inputs:
  zip_code:
    type: string
    required: true

outputs:
  contractors:
    type: array

steps:
  - id: search_google
    executor: http.request
    input:
      method: GET
      url: https://google.com/search
    uses:
      q: inputs.zip_code + ' HVAC'
```

## Control Plane Integration

Nodes can pair with OneClaw cloud to receive dispatched workflows:

1. **Register**: `POST /api/v1/nodes/register`
2. **Pair**: Generate code, enter at `app.oneclaw.com/nodes`
3. **Heartbeat**: Node sends ping every 30s
4. **Poll**: Node checks for pending workflows
5. **Execute**: Run workflow, upload receipt
6. **Report**: Send completion status

## Receipts

Every workflow run produces a receipt:

```json
{
  "run_id": "abc123",
  "workflow_id": "hvac_search",
  "status": "success",
  "steps": [
    {
      "step_id": "search_google",
      "executor": "http.request",
      "status": "executed",
      "duration_ms": 234,
      "request": { "method": "GET", "url": "..." },
      "response": { "status": 200, "body": "..." }
    }
  ],
  "debug": {
    "config_snapshot": "a1b2c3d4",
    "total_duration_ms": 245
  }
}
```

## Testing

### Curl Parity Tests

```bash
cd packages/executors/http
npm test
```

Tests verify:
- Simple GET matches curl
- POST with JSON matches curl
- Custom headers match curl
- Timeouts behave like curl
- Network errors behave like curl

## Development

```bash
# Build all packages
npm run build

# Watch mode
npm run dev

# Type check
npm run typecheck

# Test
npm test
```

## What We Learned (from 20+ hours of pain)

### Anti-Patterns to Avoid

1. **Multiple config sources**: ZeroClaw had config, workspace config, and home config. Which one wins? WHO KNOWS.
2. **Opaque security blocking**: Tool says "blocked by security" but curl works. Zero debugging info.
3. **Weak models pretending to work**: Minimax 2.5 ignored all instructions, made up URLs.
4. **Agent lying about errors**: Reports "security restriction" when request actually succeeded.
5. **Skill systems that don't work**: If skills can't call APIs, what's the point?

### Our Solution

1. **ONE config file**: `node.yaml`. Period.
2. **Structured denials**: `{ rule, attempted, policy }` tells you exactly why.
3. **Model-agnostic**: Any LLM can interpret workflow specs (they're just YAML).
4. **Runtime sets status**: Executors return results, runtime decides success/failure.
5. **Curl parity**: If curl works, executor works. This is tested.

## Why "OneClaw"?

Because ZeroClaw and OpenClaw were a nightmare. One claw to rule them all. 🦞

## License

MIT
