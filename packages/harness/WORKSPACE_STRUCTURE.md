# OneClaw Harness - Self-Improvement Workspace Structure

## 📁 Clean File Organization

```
packages/harness/
├── src/
│   ├── tools/                    # Self-improvement tools (COMMITTED)
│   │   ├── execute-code.ts       # Code execution sandbox
│   │   ├── write-file.ts         # File writing with security
│   │   ├── read-file.ts          # File reading with security
│   │   ├── database.ts           # SQLite operations
│   │   ├── init-database.ts      # Database schema setup
│   │   ├── send-gmail.ts         # Existing: Gmail integration
│   │   └── README.md             # Tool documentation
│   │
│   ├── security/                 # Security layer (COMMITTED)
│   │   ├── path-validator.ts     # Path validation & sandboxing
│   │   └── index.ts
│   │
│   ├── database/                 # Database schemas (COMMITTED)
│   │   └── autonomous-schema.sql # SQLite schema for AI autonomy
│   │
│   └── [existing dirs...]        # registry/, execution/, etc.
│
├── tests/                        # Test files (COMMITTED)
│   └── self-improvement.test.ts  # Integration tests
│
├── oneclaw-workspace/            # Runtime workspace (GITIGNORED)
│   ├── code/                     # AI-generated code
│   ├── data/                     # SQLite databases
│   │   └── *.db                  # User databases created at runtime
│   ├── logs/                     # Execution logs
│   └── tools/                    # Prototyped tools
│
├── .gitignore                    # Ignores oneclaw-workspace/
├── package.json
└── WORKSPACE_STRUCTURE.md        # This file
```

## 🎯 What Gets Committed

### ✅ Source Code (Always Committed)
- `src/tools/*.ts` - Tool implementations
- `src/security/*.ts` - Security layer
- `src/database/*.sql` - Database schemas
- `tests/*.test.ts` - Test files

### ❌ Runtime Artifacts (Never Committed)
- `oneclaw-workspace/` - User's AI workspace
- `*.db` files in workspace - Runtime databases
- Generated code in workspace
- Execution logs

## 📊 Database Storage Strategy

### Development (localhost)
```
packages/harness/oneclaw-workspace/data/
├── oneclaw.db              # Default database
├── campaign-austin.db      # User-created campaign DB
└── test-*.db               # Test databases
```

### Production (VPS/Cloud)
```
~/.oneclaw/data/            # System-wide location
├── oneclaw.db
├── user-123-campaigns.db
└── [tenant-specific DBs]
```

### Configuration
The workspace location is configurable via path-validator.ts:

```typescript
// Default: packages/harness/oneclaw-workspace
const WORKSPACE_ROOT = path.join(__dirname, '../../oneclaw-workspace');

// Production: Override with env var
const WORKSPACE_ROOT = process.env.ONECLAW_WORKSPACE || 
                       path.join(os.homedir(), '.oneclaw/workspace');
```

## 🔐 Security Model

### Sandboxing
All AI operations are restricted to `oneclaw-workspace/`:

```
✅ Allowed:
- oneclaw-workspace/code/my-script.ts
- oneclaw-workspace/data/campaigns.db
- oneclaw-workspace/tools/custom-analyzer.ts

❌ Blocked:
- /etc/passwd
- ~/.ssh/id_rsa
- /workspace/packages/harness/src/core/*
- node_modules/
- .env files
```

### Path Validation
Every file operation goes through security checks:

```typescript
const validation = pathValidator.validateWrite(userPath);
if (!validation.allowed) {
  throw new Error(validation.reason);
}
```

## 🚀 Runtime Initialization

### First Run
1. Harness server starts
2. Path validator checks workspace exists
3. If not exists, creates directory structure:
   ```bash
   mkdir -p oneclaw-workspace/{code,data,logs,tools}
   ```

### Database Creation
1. User/AI calls `init-database` tool
2. Creates SQLite DB in `oneclaw-workspace/data/`
3. Runs `autonomous-schema.sql`
4. Returns table list

### Cleanup
Workspace can be safely deleted - it will be recreated on next use:

```bash
# Clean development workspace
rm -rf packages/harness/oneclaw-workspace/

# Clean production workspace  
rm -rf ~/.oneclaw/workspace/
```

## 📦 Deployment Considerations

### Docker
```dockerfile
# Create workspace volume
VOLUME /app/oneclaw-workspace

# Or mount host directory
-v /host/oneclaw-data:/app/oneclaw-workspace
```

### VPS
```bash
# Set workspace location
export ONECLAW_WORKSPACE=/var/lib/oneclaw/workspace

# Ensure permissions
chown -R oneclaw:oneclaw /var/lib/oneclaw/workspace
```

### Multi-Tenant
Each tenant can have isolated workspace:

```typescript
const WORKSPACE_ROOT = path.join(
  process.env.ONECLAW_WORKSPACE_ROOT || '~/.oneclaw',
  tenantId,
  'workspace'
);
```

## 🧹 Keeping Repo Clean

### .gitignore Rules
```gitignore
# Workspace artifacts (never commit)
oneclaw-workspace/

# Test databases
*.test.db
test-*.db

# Execution logs
*.execution.log
```

### What This Prevents
- ❌ 100KB+ SQLite databases in git
- ❌ Test code artifacts
- ❌ Execution logs
- ❌ User-generated content

### Repo Size Impact
**Before cleanup:** ~128KB of test artifacts  
**After cleanup:** ~0KB (only source code)

## 📖 Documentation Organization

### Keep in Repo:
- ✅ `WORKSPACE_STRUCTURE.md` (this file)
- ✅ `src/tools/README.md` (tool usage)
- ✅ `SELF_IMPROVEMENT_GUIDE.md` (comprehensive guide)

### Optional (can remove after reading):
- `QUICK_START.md` - Getting started guide
- `ARCHITECTURE_DIAGRAM.md` - Visual architecture
- `IMPLEMENTATION_SUMMARY.md` - What was built

These are valuable but can be condensed into README sections.

## ✅ Final Checklist

- [x] Test artifacts removed from git
- [x] `.gitignore` properly configured
- [x] Workspace created outside source tree
- [x] Database path configurable
- [x] Security validation in place
- [x] Documentation organized
- [x] Clean repo structure

---

**Result:** A clean, organized codebase with self-improvement capabilities that don't bloat the repository.
