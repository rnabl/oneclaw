# Execute Code Tool - Deno Migration

## Overview

The `execute-code` tool has been refactored from using the abandoned and insecure `vm2` library to using **Deno** as the sandbox runtime. This provides proper isolation and security for code execution.

## What Changed

### Security Improvements ✅

**Before (vm2 sandbox):**
- Known escape vulnerabilities
- Full access to `process.env` (secrets leak)
- TypeScript required `tsx` + full Node environment
- Naïve bash command blocklist
- Workspace file writes allowed

**After (Deno sandbox):**
- Industry-standard permission model
- `--no-env` flag (zero secret access)
- Native TypeScript support
- OS-level process isolation
- All temp files written to `/tmp`

### API Changes

**New Input Schema:**
```typescript
{
  code: string;              // (unchanged)
  language: 'typescript' | 'javascript' | 'bash';  // (unchanged)
  timeout: number;           // Max 30s (was 60s)
  allowNet?: boolean;        // NEW: network access control
  allowedDomains?: string[]; // NEW: whitelist specific domains
}
```

**Removed:**
- `workingDirectory` parameter (no longer needed - uses /tmp)

### Breaking Changes

1. **Maximum Timeout**: Reduced from 60s to 30s
2. **Network Access**: Now explicitly controlled via `allowNet` flag (default: false)
3. **File System Access**: None by default (Deno `--no-read`, `--no-write`)
4. **Environment Variables**: Code can no longer access `process.env`

## Migration Guide

### If You Were Using Default Settings
✅ **No changes needed** - The tool will work exactly the same way.

### If You Were Using Custom `workingDirectory`
❌ **Breaking Change** - Remove this parameter.

**Before:**
```typescript
await executeTool('execute-code', {
  code: 'console.log("hello")',
  language: 'typescript',
  workingDirectory: './src'  // ❌ No longer supported
});
```

**After:**
```typescript
await executeTool('execute-code', {
  code: 'console.log("hello")',
  language: 'typescript'
  // Runs in isolated /tmp - no workspace access
});
```

### If You Need Network Access

**Before:**
```typescript
// Network was implicitly allowed via Node.js
const code = `
  const res = await fetch('https://api.example.com');
  console.log(await res.text());
`;
```

**After:**
```typescript
await executeTool('execute-code', {
  code: `
    const res = await fetch('https://api.example.com');
    console.log(await res.text());
  `,
  language: 'typescript',
  allowNet: true,  // ✅ Explicitly enable network
  allowedDomains: ['api.example.com']  // ✅ Whitelist specific domains
});
```

## Security Model

### Deno Permission Flags (Always Applied)

```bash
deno run \
  --no-prompt \    # Never ask for permissions
  --no-remote \    # No remote module imports
  --no-read \      # No file system reads
  --no-write \     # No file system writes
  --no-env \       # No process.env access (!!!)
  --no-run \       # Can't spawn subprocesses
  --no-ffi \       # No native plugins
  --no-sys \       # No system info
  --no-net \       # No network (unless allowNet: true)
  /tmp/sandbox-xyz.ts
```

### Bash Execution

Bash runs with a **minimal environment** (no secrets):

```typescript
env: {
  PATH: process.env.PATH,  // Only PATH for basic commands
  HOME: os.tmpdir(),       // Set to /tmp
  TMPDIR: os.tmpdir()      // Set to /tmp
}
```

**Hard-blocked commands:**
- `rm -rf /`
- `rm -rf ~`
- `dd if=`
- `mkfs`
- `:(){:|:&};:` (fork bomb)
- `cat .env`
- `> /dev/sd`

## Installation Requirements

### Install Deno

**macOS/Linux:**
```bash
curl -fsSL https://deno.land/x/install/install.sh | sh
```

**Windows (PowerShell):**
```powershell
irm https://deno.land/install.ps1 | iex
```

**Or use package managers:**
```bash
# macOS
brew install deno

# Linux (Ubuntu/Debian)
curl -fsSL https://deno.land/x/install/install.sh | sh

# Windows
choco install deno
# or
scoop install deno
```

Verify installation:
```bash
deno --version
```

### Remove Old Dependencies

The vm2 package has been removed from `package.json`. Run:

```bash
npm install
# or
pnpm install
```

## Testing

Run the execute-code tests to verify everything works:

```bash
npm run test -- execute-code
```

### Quick Manual Test

```typescript
import { EXECUTE_CODE_TOOL } from '@oneclaw/harness';

// Test 1: TypeScript execution
const result1 = await EXECUTE_CODE_TOOL.handler({
  code: 'console.log("Hello from Deno!")',
  language: 'typescript',
}, { tenantId: 'test' });

console.log(result1);
// Expected: { success: true, stdout: "Hello from Deno!", ... }

// Test 2: Network access (should fail without allowNet)
const result2 = await EXECUTE_CODE_TOOL.handler({
  code: 'const res = await fetch("https://api.github.com"); console.log(res.status)',
  language: 'typescript',
  allowNet: false,
}, { tenantId: 'test' });

console.log(result2);
// Expected: { success: false, error: "Requires net access..." }

// Test 3: Network access (with allowNet)
const result3 = await EXECUTE_CODE_TOOL.handler({
  code: 'const res = await fetch("https://api.github.com"); console.log(res.status)',
  language: 'typescript',
  allowNet: true,
  allowedDomains: ['api.github.com'],
}, { tenantId: 'test' });

console.log(result3);
// Expected: { success: true, stdout: "200" }
```

## Why This Matters

### vm2 Was Fundamentally Broken

- **Abandoned**: No updates since 2022
- **Known CVEs**: Multiple sandbox escapes (CVE-2023-30547, CVE-2023-37466)
- **Production Risk**: Your secrets were accessible via `process.env`

### Deno Provides Real Security

- **Maintained**: Active development by the Deno team
- **Proven Model**: Used in production by Cloudflare, Netlify, etc.
- **Zero Trust**: Everything denied by default, explicit opt-in required

## Rollback Plan (If Needed)

If you absolutely need to rollback (not recommended):

1. Restore `vm2` dependency:
   ```bash
   npm install vm2@^3.9.19
   ```

2. Revert `packages/harness/src/tools/execute-code.ts` to the previous version:
   ```bash
   git checkout HEAD~1 packages/harness/src/tools/execute-code.ts
   ```

⚠️ **Warning**: This will re-introduce known security vulnerabilities.

## Questions?

- Check the [Deno Manual](https://deno.land/manual) for permission details
- Review the [execute-code.ts](./src/tools/execute-code.ts) source code
- File an issue if you encounter problems

---

**Version**: 2.0.0  
**Migration Date**: 2026-03-07  
**Status**: ✅ Production Ready
