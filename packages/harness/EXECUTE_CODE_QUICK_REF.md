# Execute Code Tool - Quick Reference

## 🚀 TL;DR

**What changed:** vm2 → Deno (more secure, no `process.env` leaks)  
**Install:** `brew install deno` or `irm https://deno.land/install.ps1 | iex`  
**Breaking:** No `workingDirectory`, network needs `allowNet: true`, max 30s timeout  

---

## Basic Usage

### TypeScript
```typescript
const result = await EXECUTE_CODE_TOOL.handler({
  code: 'console.log("Hello!");',
  language: 'typescript',
}, { tenantId: 'abc' });
```

### JavaScript
```typescript
const result = await EXECUTE_CODE_TOOL.handler({
  code: 'console.log(2 + 2);',
  language: 'javascript',
}, { tenantId: 'abc' });
```

### Bash
```typescript
const result = await EXECUTE_CODE_TOOL.handler({
  code: 'echo "Hello from bash"',
  language: 'bash',
}, { tenantId: 'abc' });
```

---

## With Network Access

```typescript
const result = await EXECUTE_CODE_TOOL.handler({
  code: `
    const res = await fetch('https://api.github.com');
    console.log(await res.json());
  `,
  language: 'typescript',
  allowNet: true,  // Enable network
  allowedDomains: ['api.github.com'],  // Optional whitelist
}, { tenantId: 'abc' });
```

---

## Input Schema

```typescript
interface ExecuteCodeInput {
  code: string;           // Code to execute (max 50KB)
  language: 'typescript' | 'javascript' | 'bash';
  timeout?: number;       // Default: 30000 (30s max)
  allowNet?: boolean;     // Default: false
  allowedDomains?: string[];  // Optional: ['example.com']
}
```

---

## Output Schema

```typescript
interface ExecuteCodeOutput {
  success: boolean;       // true if no errors
  stdout?: string;        // Console output
  stderr?: string;        // Error output
  exitCode?: number;      // 0 = success
  error?: string;         // Error message if failed
  executionTime?: number; // Duration in ms
}
```

---

## Security Model

| Permission | Allowed? | Flag |
|-----------|----------|------|
| Read `process.env` | ❌ No | `--no-env` |
| Read files | ❌ No | `--no-read` |
| Write files | ❌ No | `--no-write` |
| Network access | ⚠️ Opt-in | `--no-net` (default) |
| Spawn subprocess | ❌ No | `--no-run` |
| Native plugins | ❌ No | `--no-ffi` |

---

## Common Patterns

### Calculate & Return
```typescript
code: `
  function fib(n: number): number {
    if (n <= 1) return n;
    return fib(n - 1) + fib(n - 2);
  }
  console.log(fib(10));
`
// Output: 55
```

### JSON Processing
```typescript
code: `
  const data = { name: "test", value: 42 };
  console.log(JSON.stringify(data));
`
// Output: {"name":"test","value":42}
```

### Async/Await
```typescript
code: `
  const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));
  await sleep(100);
  console.log("Done");
`
// Output: Done
```

### API Call (with network)
```typescript
code: `
  const res = await fetch('https://api.github.com/users/github');
  const data = await res.json();
  console.log(data.login);
`,
allowNet: true,
allowedDomains: ['api.github.com']
// Output: github
```

---

## Error Handling

### Syntax Error
```typescript
{ 
  success: false, 
  error: "SyntaxError: Unexpected token" 
}
```

### Runtime Error
```typescript
{ 
  success: false, 
  stderr: "Error: Something went wrong",
  exitCode: 1 
}
```

### Timeout
```typescript
{ 
  success: false, 
  error: "Command failed...",
  executionTime: 30000 
}
```

### Network Denied
```typescript
code: 'await fetch("https://example.com")',
allowNet: false  // default
// Result: { success: false, stderr: "Requires net access" }
```

---

## Migration Checklist

- [ ] Install Deno (`brew install deno` or PowerShell script)
- [ ] Remove `vm2` from package.json (`npm install`)
- [ ] Remove `workingDirectory` parameter (if used)
- [ ] Add `allowNet: true` for network access (if needed)
- [ ] Ensure timeout ≤ 30s (was 60s)
- [ ] Test: `npm run test -- execute-code-deno`

---

## Blocked Commands (Bash)

These are hard-blocked for safety:

- `rm -rf /`
- `rm -rf ~`
- `dd if=`
- `mkfs`
- `:(){:|:&};:` (fork bomb)
- `cat .env`
- `> /dev/sd`

---

## Performance

| Operation | Typical Time |
|-----------|--------------|
| Simple JS/TS | 50-200ms |
| TypeScript with types | 100-300ms |
| Bash commands | 50-150ms |
| Network requests | 500-2000ms |

---

## Links

- 📖 [Full Setup Guide](./EXECUTE_CODE_SETUP.md)
- 🔄 [Migration Guide](./EXECUTE_CODE_MIGRATION.md)
- 📊 [Refactor Summary](./EXECUTE_CODE_REFACTOR_SUMMARY.md)
- 📝 [Changelog](./EXECUTE_CODE_CHANGELOG.md)
- 🧪 [Tests](./tests/execute-code-deno.test.ts)

---

## Support

**Quick Fixes:**

- `deno: command not found` → Restart terminal or add to PATH
- Permission denied in tests → Expected behavior (sandbox working!)
- Network errors → Add `allowNet: true`
- Timeout errors → Optimize code or split into smaller tasks

**Deno Docs:** https://deno.land/manual  
**File Issues:** Your repository's issue tracker

---

**Version:** 2.0.0 | **Status:** ✅ Production Ready
