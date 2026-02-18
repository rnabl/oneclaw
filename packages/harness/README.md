# OneClaw Harness

**Durable, policy-enforced execution runtime for AI agent workflows.**

The Harness wraps your existing nabl services with enterprise-grade infrastructure:

- **Policy Engine**: Rate limits, quotas, tier-based permissions
- **Secrets Vault**: Encrypted per-tenant API key storage
- **Cost Metering**: Per-step cost tracking for billing
- **Artifact Store**: Logs, reports, API responses for replay/debugging

## Your Architecture (What Harness Wraps)

```
┌─────────────────────────────────────────────────────────────────┐
│  HARNESS (this package)                                         │
│                                                                 │
│  • Policy enforcement (rate limits, quotas)                     │
│  • Secret injection (tenant API keys)                           │
│  • Cost metering (track $/request)                              │
│  • Artifact capture (logs, reports)                             │
└─────────────────────────────────────────────────────────────────┘
          │                              │
          ▼                              ▼
┌─────────────────────┐      ┌─────────────────────────────────────┐
│  Discovery (TS)     │      │  Audit/Analysis (Python)            │
│  Vercel             │      │  Digital Ocean                      │
│                     │      │                                     │
│  • Apify Google Maps│      │  • DataForSEO (Maps, Keywords)     │
│  • Website scanning │      │  • Perplexity (AI citations)       │
│  • Light enrichment │      │  • OpenAI (LLM analysis)           │
└─────────────────────┘      └─────────────────────────────────────┘
```

## Quick Start

### 1. Run the Harness Server

```bash
cd packages/harness
pnpm install
pnpm dev
```

Server starts on `http://localhost:9000`

### 2. Configure Environment

```env
# nabl Python service (Digital Ocean)
NABL_AUDIT_URL=https://your-do-app.ondigitalocean.app
NABL_ANALYSIS_URL=https://your-do-app.ondigitalocean.app
NABL_API_SECRET=your-api-secret

# Apify (for discovery)
APIFY_API_TOKEN=apify_api_xxxxx

# Platform keys (fallback if tenant doesn't provide)
DATAFORSEO_LOGIN=your-login
DATAFORSEO_PASSWORD=your-password
PERPLEXITY_API_KEY=pplx-xxxxx

# Harness config
HARNESS_PORT=9000
HARNESS_PEPPER=your-secret-pepper
```

### 3. Test the Endpoints

```bash
# List registered workflows
curl http://localhost:9000/tools

# Dry-run an audit
curl -X POST http://localhost:9000/execute \
  -H "Content-Type: application/json" \
  -d '{
    "workflowId": "audit-website",
    "tenantId": "user_123",
    "tier": "pro",
    "dryRun": true,
    "input": {
      "url": "https://example.com",
      "businessName": "Test Business",
      "locations": [{ "city": "Denver", "state": "CO", "serviceArea": "plumbing" }]
    }
  }'

# Run discovery
curl -X POST http://localhost:9000/execute \
  -H "Content-Type: application/json" \
  -d '{
    "workflowId": "discover-businesses",
    "tenantId": "user_123",
    "tier": "pro",
    "input": {
      "niche": "hvac",
      "location": "Austin, TX",
      "limit": 20
    }
  }'
```

## Workflows

### 1. audit-website

Calls your Python `public_audit_runner_v3.py` via HTTP.

**Input:**
```typescript
{
  url: string;           // Website to audit
  businessName: string;  // Business name
  locations: [{
    city: string;
    state: string;
    serviceArea: string;
  }];
}
```

**Output:**
```typescript
{
  score: number;         // 0-100
  citationsFound: number;
  totalQueries: number;
  categoryScores: {
    seo: number;
    aiVisibility: number;
    localPresence: number;
    technical: number;
  };
  issues: Array<{
    type: 'critical' | 'warning' | 'info';
    category: string;
    message: string;
    recommendation?: string;
  }>;
  htmlReport: string;
  analyzedAt: string;
}
```

**Cost Breakdown:**
- DataForSEO Google Maps: $0.002/SERP × locations
- DataForSEO Keywords: $0.05/request
- Perplexity Sonar Pro: $0.005/search × (4 queries × locations)
- **Estimated Total**: ~$0.10-0.20 per audit

### 2. discover-businesses

Calls Apify Google Maps scraper directly.

**Input:**
```typescript
{
  niche: string;    // e.g., "hvac"
  location: string; // e.g., "Austin, TX"
  limit?: number;   // Default: 50
}
```

**Output:**
```typescript
{
  businesses: Array<{
    name: string;
    website?: string;
    phone?: string;
    address?: string;
    rating?: number;
    reviewCount?: number;
  }>;
  totalFound: number;
  searchTimeMs: number;
}
```

**Cost:** $0.004/result via Apify

### 3. analyze-business

Calls your Python `analysis.py` service.

**Input:**
```typescript
{
  businessId: string;
  type: 'quick_intelligence' | 'opportunity_analysis';
}
```

**Output:**
```typescript
{
  id: string;
  businessId: string;
  type: string;
  overallScore: number;
  dimensionScores: {
    websiteQuality: number;
    localSeo: number;
    adPresence: number;
    socialEngagement: number;
  };
  summary: string;
  insights: Array<{
    type: 'opportunity' | 'strength' | 'weakness' | 'recommendation';
    dimension: string;
    title: string;
    description: string;
    priority: 'high' | 'medium' | 'low';
  }>;
  analyzedAt: string;
}
```

## Secrets Management

### Store a Tenant's API Key

```bash
curl -X POST http://localhost:9000/secrets \
  -H "Content-Type: application/json" \
  -d '{
    "tenantId": "user_123",
    "password": "vault-password",
    "provider": "apify",
    "secret": "apify_api_xxxxx",
    "scopes": ["discover-businesses"]
  }'
```

### Create Session Key (Like Wallet Unlock)

```bash
curl -X POST http://localhost:9000/secrets/session \
  -H "Content-Type: application/json" \
  -d '{
    "tenantId": "user_123",
    "password": "vault-password",
    "expiresInMs": 3600000
  }'
# Returns: { "sessionKey": "...", "expiresAt": "..." }
```

### Execute with Session Key

```bash
curl -X POST http://localhost:9000/execute \
  -H "Content-Type: application/json" \
  -d '{
    "workflowId": "discover-businesses",
    "tenantId": "user_123",
    "tier": "pro",
    "sessionKey": "XAj/nY/Of/...",
    "input": { ... }
  }'
```

When `sessionKey` is provided, the Harness:
1. Decrypts the master key from the session
2. Retrieves the tenant's `apify` secret
3. Uses their key instead of the platform key
4. Tracks usage to their account

## Policy Engine

### Tier Limits

| Tier | Rate/min | Rate/hour | Rate/day | Max Cost/Job | Max Cost/Day | Concurrent |
|------|----------|-----------|----------|--------------|--------------|------------|
| free | 5 | 20 | 50 | $0.50 | $2 | 1 |
| starter | 20 | 100 | 500 | $2 | $20 | 3 |
| pro | 60 | 500 | 2000 | $10 | $100 | 10 |
| enterprise | 200 | 2000 | 10000 | $100 | $1000 | 50 |

### Check Usage

```bash
curl "http://localhost:9000/usage?tenantId=user_123"
```

## Cost Tracking

### Get Job Cost Breakdown

```bash
curl "http://localhost:9000/jobs/{jobId}/cost"
```

Returns:
```json
{
  "summary": {
    "jobId": "abc123",
    "tenantId": "user_123",
    "totalCostUsd": 0.15,
    "breakdown": [
      { "provider": "perplexity", "eventType": "api_call", "quantity": 4, "costUsd": 0.02 },
      { "provider": "dataforseo", "eventType": "api_call", "quantity": 2, "costUsd": 0.054 }
    ],
    "totalDurationMs": 45000,
    "stepsCompleted": 5
  },
  "steps": [
    { "stepIndex": 1, "stepName": "Scan website", "costUsd": 0, "durationMs": 1200 },
    { "stepIndex": 2, "stepName": "Check citations", "costUsd": 0.02, "durationMs": 12000 }
  ]
}
```

## Artifacts (For Debugging)

### Get Job Artifacts

```bash
curl "http://localhost:9000/jobs/{jobId}/artifacts"
```

Returns logs, API requests/responses, HTML reports, errors.

## Self-Hosted vs Platform

### Self-Hosted (Full Control)

```
User runs on their VPS:
├── Full control over data
├── Bring your own API keys
├── No platform fee
├── SQLite for local storage
└── Run: pnpm dev
```

### Platform-Managed (OneClaw Cloud)

```
Deploy via OneClaw:
├── One-click Fly.io deploy
├── Managed secrets (encrypted in Supabase)
├── Platform handles billing
├── Subscription + pay-per-use
└── We handle the infrastructure
```

## File Structure

```
packages/harness/
├── src/
│   ├── index.ts              # Main exports
│   ├── server.ts             # Standalone server
│   ├── registry/
│   │   ├── schemas.ts        # Zod schemas + tool definitions
│   │   └── index.ts          # Registry class
│   ├── secrets/
│   │   └── vault.ts          # AES-256-GCM encrypted storage
│   ├── policy/
│   │   └── engine.ts         # Rate limits, quotas, tiers
│   ├── execution/
│   │   └── runner.ts         # Workflow orchestration
│   ├── metering/
│   │   └── tracker.ts        # Cost tracking per step
│   ├── artifacts/
│   │   └── store.ts          # Logs, screenshots, API responses
│   ├── workflows/
│   │   ├── audit.ts          # → Calls nabl Python service
│   │   ├── discovery.ts      # → Calls Apify directly
│   │   └── analysis.ts       # → Calls nabl Python service
│   └── api/
│       └── routes.ts         # Hono HTTP API
├── package.json
└── README.md
```

## Next Steps

1. **Wire to nabl**: Set `NABL_AUDIT_URL` and `NABL_API_SECRET` to connect to your DO service
2. **Add Restate**: For durable checkpointing (currently in-memory)
3. **Add Supabase storage**: For production secrets and artifact storage
4. **Stripe integration**: For subscription + overage billing
