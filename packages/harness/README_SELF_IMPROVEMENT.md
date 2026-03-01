# Self-Improvement Tools

OneClaw can now write code, execute it, and persist data autonomously.

## Quick Overview

### New Tools Added

| Tool | Purpose | Example |
|------|---------|---------|
| `execute-code` | Run TypeScript/JS/Bash safely | Test generated code |
| `write-file` | Create files in workspace | Build custom tools |
| `read-file` | Read files from workspace | Load configurations |
| `database` | SQLite CRUD operations | Store business data |
| `init-database` | Setup database schema | Initialize campaign DB |

### Usage from Rust Daemon

```rust
// Your Rust daemon already supports this!
execute_tool(state, "database", serde_json::json!({
    "action": "insert",
    "table": "businesses",
    "data": { "name": "ABC HVAC", "niche": "hvac" }
})).await
```

The Rust daemon calls these tools via `HarnessExecutor` → HTTP → TypeScript Harness.

## File Structure

```
src/
├── tools/          # Tool implementations (committed)
├── security/       # Security layer (committed)
└── database/       # SQL schemas (committed)

oneclaw-workspace/  # AI workspace (gitignored)
├── code/          # Generated code
├── data/*.db      # SQLite databases
└── logs/          # Execution logs
```

## Security

- ✅ Sandboxed to `oneclaw-workspace/` only
- ✅ Path validation on all file operations
- ✅ Blocked dangerous operations (process.exit, eval, etc.)
- ✅ SQL injection protection

## Configuration

### Development
Workspace: `packages/harness/oneclaw-workspace/`

### Production
```bash
# Set custom workspace location
export ONECLAW_WORKSPACE=/var/lib/oneclaw/workspace

# Or use default: ~/.oneclaw/workspace
export NODE_ENV=production
```

## Documentation

- **Full Guide:** `/workspace/SELF_IMPROVEMENT_GUIDE.md`
- **Architecture:** `/workspace/ARCHITECTURE_DIAGRAM.md`
- **Workspace Details:** `WORKSPACE_STRUCTURE.md`
- **Quick Start:** `/workspace/QUICK_START.md`

## Testing

```bash
cd packages/harness
npx tsx tests/self-improvement.test.ts
```

---

**No repository bloat:** All runtime artifacts are gitignored. Only source code is committed.
