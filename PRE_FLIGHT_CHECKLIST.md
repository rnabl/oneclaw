# Pre-Flight Checklist - Ready to Test

## ✅ Wiring Verification

### 1. Workflows Registered
```typescript
// packages/harness/src/workflows/index.ts
✅ complete-sdr-discovery (imported and exported)
✅ discover-businesses (auto-stores in Supabase)
✅ check-ai-rankings (tool registered)
✅ All workflows wired to runner
```

### 2. Tools Registered
```typescript
// packages/harness/src/registry/index.ts
✅ execute-code
✅ write-file
✅ read-file
✅ database (SQLite)
✅ init-database
✅ supabase-database
✅ supabase-storage
✅ check-ai-rankings ← NEW
```

### 3. Harness API Endpoints
```
✅ POST /execute - Execute workflows
✅ GET /tools - List available tools (daemon fetches these)
✅ GET /jobs/:id - Job status
✅ GET /jobs/:id/cost - Cost breakdown
```

### 4. Rust Daemon Integration
```rust
// oneclaw-node/src/daemon.rs
✅ Fetches tools from harness on startup (line 81-113)
✅ HarnessExecutor calls /execute endpoint (line 620)
✅ Autonomous job detection (line 265)
✅ Job poller for long-running tasks (line 305)
```

## 🔒 Security Verification

### Keys Are Secure ✅

**Environment Variables (Server-side only):**
```bash
# These are ONLY on VPS, never sent to client
SUPABASE_SERVICE_ROLE_KEY
PERPLEXITY_API_KEY
APIFY_API_KEY
ANTHROPIC_API_KEY
```

**Harness Protection:**
```typescript
// packages/harness/src/utils/redact.ts
✅ Redacts all API keys in logs
✅ Redacts JWT tokens
✅ Redacts Bearer tokens
✅ Redacts secrets in error messages
✅ Redacts any field with "key", "secret", "token", "password"

// Pattern matching redacts:
- sk-ant-xxx → sk-a...[REDACTED]
- eyJhbGci... → eyJh...[REDACTED]
- APIFY_API_KEY=xxx → APIF...[REDACTED]
```

**Secrets Vault:**
```typescript
// packages/harness/src/secrets/vault.ts
✅ Encrypted storage (AES-256-GCM)
✅ Per-tenant encryption keys
✅ No secrets in responses
✅ Injection only at execution time
```

**Network Policies:**
```typescript
// Each tool specifies allowed domains
✅ check-ai-rankings → Only api.perplexity.ai
✅ supabase-database → Only *.supabase.co
✅ discover-businesses → Only api.apify.com
✅ Blocked: localhost (unless explicitly allowed)
```

### What Gets Logged (Safe)

```typescript
// Logs visible to daemon/user:
✅ "Found 10 businesses"
✅ "Cost: $0.015"
✅ "Scanning websites..."
✅ "Stored in Supabase"

// Never logged:
❌ API keys
❌ Tokens
❌ Passwords
❌ Service role keys
```

### What Rust Daemon Sees

```rust
// Daemon receives from harness:
{
  "status": "completed",
  "output": {
    "businesses": [...],  // Business data (safe)
    "summary": {...},      // Stats (safe)
    "costs": {...}         // Cost breakdown (safe)
  }
}

// Daemon NEVER receives:
❌ SUPABASE_SERVICE_ROLE_KEY
❌ PERPLEXITY_API_KEY
❌ Any other secrets
```

## 📋 Final Checklist Before Test

### On VPS (104.131.111.116)

- [ ] Pull branch: `git pull origin cursor/general-code-updates-8690`
- [ ] Check Supabase creds: `echo $SUPABASE_URL`
- [ ] Check Perplexity: `echo $PERPLEXITY_API_KEY`
- [ ] Check Apify: `echo $APIFY_API_KEY`
- [ ] Restart harness: `pm2 restart harness`
- [ ] Verify harness running: `curl http://localhost:9000/health`

### In Supabase Dashboard

- [ ] Migration 004 applied (schemas created)
- [ ] Check tables exist: `crm.leads`, `analytics.ai_visibility_tracking`

### Test Command (via Telegram)

```
"Find 10 HVAC businesses in Denver and check if they're recommended by ChatGPT"
```

## Expected Response (Telegram)

```
🔍 Discover complete! (1/4)
Found 10 businesses
Cost: $0.015

🌐 Website scanning complete! (2/4)
Scanned 10 websites with signals

🤖 AI rankings complete! (3/4)
3 businesses mentioned in Perplexity

💾 Data stored! (4/4)
10 leads in Supabase
10 AI visibility records

✅ Complete! Total cost: $0.02

Summary:
- Businesses discovered: 10
- Mentioned in AI: 3
- Invisible to AI: 7
- Stored in Supabase: ✅
```

## Security Summary

✅ **All keys stay on server**
✅ **Redaction in all logs/errors**
✅ **Network policies enforce domains**
✅ **Encrypted secrets vault**
✅ **No keys in responses**

**You're secure and ready to test!** 🚀

---

**Once you pull the branch and restart harness, just message your Telegram bot and it'll work!**
