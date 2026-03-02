# OneClaw Architecture Audit Report

## Executive Summary

**The system is not working because your local harness and daemon are running OLD cached code.**

### Current Status (UNCOMMITTED CHANGES)
```
 M oneclaw-node/src/executor.rs        ← Daemon fix (calls /tools/:id/execute)
 M packages/harness/src/api/routes.ts  ← Harness fix (new /tools/:id/execute endpoint)
 M packages/harness/src/execution/runner.ts ← Added hasWorkflow() method
```

The code fixes have been applied in your working directory. But you need to:
1. Kill all running processes
2. Rebuild the harness (TypeScript)
3. Rebuild the daemon (Rust)
4. Restart both services

---

## System Architecture

```
┌─────────────────┐     ┌──────────────────────────────────────────────────────┐
│    Telegram     │     │                      VPS/Local                       │
│   (User Input)  │     │                                                      │
└────────┬────────┘     │  ┌────────────────┐      ┌─────────────────────────┐ │
         │              │  │     Daemon     │      │        Harness          │ │
         │              │  │  (Rust Binary) │      │   (Node.js/TypeScript)  │ │
         ▼              │  │                │      │                         │ │
┌────────────────────┐  │  │  ┌──────────┐  │      │  ┌───────────────────┐  │ │
│ Telegram Bot API   │──┼──┼─▶│ daemon.rs│  │      │  │   routes.ts       │  │ │
└────────────────────┘  │  │  └────┬─────┘  │      │  │   /tools          │  │ │
                        │  │       │        │      │  │   /tools/:id/exec │  │ │
                        │  │       │        │      │  └────────┬──────────┘  │ │
                        │  │       ▼        │      │           │             │ │
                        │  │  ┌──────────┐  │ HTTP │           ▼             │ │
                        │  │  │executor.rs│─┼──────┼─▶ ┌───────────────────┐ │ │
                        │  │  └──────────┘  │      │   │  Tool Registry    │ │ │
                        │  │                │      │   │  (id → handler)   │ │ │
                        │  └────────────────┘      │   └────────┬──────────┘ │ │
                        │                          │            │            │ │
                        │                          │            ▼            │ │
                        │                          │   ┌───────────────────┐ │ │
                        │                          │   │  Workflow Runner  │ │ │
                        │                          │   │  (for workflows)  │ │ │
                        │                          │   └───────────────────┘ │ │
                        │                          └─────────────────────────┘ │
                        └──────────────────────────────────────────────────────┘
```

---

## The Problem

### What the user sees:
```
Error: Harness error 500: No handler registered for workflow: supabase-database
```

### What this means:
The harness is calling `runner.execute('supabase-database', ...)` which throws this error because `supabase-database` is a **tool with a handler**, NOT a workflow.

### Why it happens:
**The running harness process is using OLD CODE that doesn't check `tool.handler` first.**

---

## Tool vs Workflow

| Type | Has Handler? | Has Workflow? | How to Execute |
|------|-------------|---------------|----------------|
| **Tool** (e.g., `supabase-database`) | ✅ YES | ❌ NO | Call `tool.handler()` |
| **Workflow** (e.g., `discover-businesses`) | ❌ NO | ✅ YES | Call `runner.execute()` |
| **Email Tools** (e.g., `get-pending-emails`) | ✅ YES | ❌ NO | Call `tool.handler()` |

---

## The Fix (Already Applied)

### 1. `packages/harness/src/api/routes.ts` - `/tools/:id/execute`

**Before (broken):**
```typescript
// Always tried to use handler, returned 500 if no handler
if (!tool.handler) {
  return c.json({ error: 'Tool has no handler' }, 500);
}
```

**After (fixed):**
```typescript
// Option 1: Tool has a direct handler - use it
if (tool.handler) {
  const result = await tool.handler(validatedInput, { tenantId });
  return c.json({ success: true, result });
}

// Option 2: Tool is a registered workflow - run through runner
const hasWorkflow = runner.hasWorkflow(toolId);
if (hasWorkflow) {
  const job = await runner.execute(toolId, validatedInput, { tenantId, tier: 'free' });
  return c.json({ success: true, result: job.output });
}

// Option 3: Neither - error
return c.json({ error: `Tool ${toolId} has no handler and no workflow` }, 500);
```

### 2. `packages/harness/src/execution/runner.ts` - Added `hasWorkflow()` method

```typescript
hasWorkflow(workflowId: string): boolean {
  return this.workflows.has(workflowId);
}
```

---

## How to Apply the Fix

### Step 1: Kill ALL Running Processes

```powershell
# In PowerShell (as Admin if needed)
# Find and kill Node.js processes (harness)
Get-Process | Where-Object {$_.ProcessName -eq "node"} | Stop-Process -Force

# Find and kill the daemon
Get-Process | Where-Object {$_.ProcessName -eq "oneclaw-node"} | Stop-Process -Force

# Or use netstat to find by port
netstat -ano | findstr :8787  # Harness port
netstat -ano | findstr :9000  # Daemon port

# Then: taskkill /F /PID <PID>
```

### Step 2: Rebuild the Harness (TypeScript)

```powershell
cd C:\Users\Ryan Nguyen\OneDrive\Desktop\Projects\oneclaw

# Install dependencies if needed
pnpm install

# Build the harness
cd packages/harness
pnpm build

# Or from root:
pnpm --filter harness build
```

### Step 3: Start the Harness

```powershell
cd C:\Users\Ryan Nguyen\OneDrive\Desktop\Projects\oneclaw\packages\harness
npm run dev
```

**Expected output:**
```
[Runner] Registered workflow: discover-businesses
[Runner] Registered workflow: audit-website
...
Harness listening on http://0.0.0.0:8787
```

### Step 4: Rebuild the Daemon (Rust) - If Needed

```powershell
cd C:\Users\Ryan Nguyen\OneDrive\Desktop\Projects\oneclaw\oneclaw-node

# Clean rebuild
cargo clean
cargo build --release

# Run the daemon
.\target\release\oneclaw-node.exe daemon
```

### Step 5: Test via curl

```powershell
# Test supabase-database tool directly
curl -X POST http://localhost:8787/tools/supabase-database/execute `
  -H "Content-Type: application/json" `
  -d '{"input":{"operation":"select","table":"businesses","limit":5},"tenantId":"default"}'
```

---

## Tool Inventory

### Tools WITH Handlers (Should Work)

| Tool ID | Handler Location | Status |
|---------|-----------------|--------|
| `supabase-database` | `tools/supabase-database.ts` | ✅ Has handler |
| `supabase-storage` | `tools/supabase-storage.ts` | ✅ Has handler |
| `read-file` | `tools/file-operations.ts` | ✅ Has handler |
| `write-file` | `tools/file-operations.ts` | ✅ Has handler |
| `execute-code` | `tools/execute-code.ts` | ✅ Has handler |
| `get-pending-emails` | `tools/email-approval.ts` | ✅ Has handler |
| `approve-email` | `tools/email-approval.ts` | ✅ Has handler |
| `reject-email` | `tools/email-approval.ts` | ✅ Has handler |
| `resume-workflow` | `tools/workflow-checkpoint.ts` | ✅ Has handler |
| `list-resumable-workflows` | `tools/workflow-checkpoint.ts` | ✅ Has handler |
| `database` | `tools/database.ts` | ✅ Has handler |
| `init-database` | `tools/init-database.ts` | ✅ Has handler |
| `check-ai-rankings` | `tools/check-ai-rankings.ts` | ✅ Has handler |

### Workflows (Runner-Based)

| Workflow ID | Handler Location | Status |
|------------|-----------------|--------|
| `discover-businesses` | `workflows/discover-businesses.ts` | ✅ Runner workflow |
| `audit-website` | `workflows/audit-website.ts` | ✅ Runner workflow |
| `enrich-contact` | `workflows/enrich-contact.ts` | ✅ Runner workflow |
| `golf-tee-time-booking` | `workflows/golf-booking.ts` | ✅ Runner workflow |

---

## Verification Checklist

After restarting both services:

- [ ] Harness shows "Harness listening on http://0.0.0.0:8787"
- [ ] Harness shows "[Runner] Registered workflow: discover-businesses" etc
- [ ] curl to `/tools` returns list of tools with IDs
- [ ] curl to `/tools/supabase-database/execute` returns data (not "No handler registered")
- [ ] Telegram bot can query database
- [ ] Telegram bot can use `get-pending-emails`

---

## Common Issues

### "EADDRINUSE" - Port already in use
```powershell
netstat -ano | findstr :8787
taskkill /F /PID <PID>
```

### "Access is denied" when killing process
Run PowerShell as Administrator.

### Daemon says "fetching tools..." but gets empty list
Check that harness is running FIRST before starting daemon.

### Changes not taking effect
Old process is still running with cached code. Kill ALL node.exe and oneclaw-node.exe processes.

---

## VPS Deployment

If you want changes on VPS:

```bash
# SSH to VPS
ssh your-vps

# Pull latest code
cd ~/oneclaw
git pull

# Restart services
pm2 restart all
# Or manually:
pm2 stop harness daemon
cd packages/harness && pnpm build
cd ../..
pm2 start harness daemon
```

---

## Summary

**TL;DR: Kill all processes, rebuild, restart.**

```powershell
# Quick fix sequence:
taskkill /F /IM node.exe
taskkill /F /IM oneclaw-node.exe

cd C:\Users\Ryan Nguyen\OneDrive\Desktop\Projects\oneclaw
pnpm install
pnpm --filter harness build

# Terminal 1: Start harness
cd packages\harness && npm run dev

# Terminal 2: Start daemon (after harness is up)
cd oneclaw-node && cargo run --release daemon
```
