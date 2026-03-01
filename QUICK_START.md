# Quick Start: OneClaw Self-Improvement

## 🚀 5-Minute Quick Start

### 1. Install Dependencies (if not already done)

```bash
cd /workspace
pnpm install
```

### 2. Run the Test Suite

```bash
cd /workspace/packages/harness
npx tsx src/tools/test-self-improvement.ts
```

**Expected Output:**
```
✅ Path validation: PASS
✅ File operations: PASS
✅ Code execution: PASS
✅ Database: PASS
✅ Self-modifying code: PASS
```

### 3. Try It Yourself

#### Example 1: Write and Execute Code

```typescript
import { executeCodeHandler } from '@oneclaw/harness';

// Execute JavaScript
const result = await executeCodeHandler({
  code: 'const x = 10; console.log(x * 2);',
  language: 'javascript',
  timeout: 5000
}, { tenantId: 'demo' });

console.log(result.stdout); // "20"
```

#### Example 2: Initialize Database

```typescript
import { initDatabaseHandler } from '@oneclaw/harness';

// Create autonomous database
const db = await initDatabaseHandler({
  database: 'my-campaign.db',
  force: false
}, { tenantId: 'demo' });

console.log(`Created ${db.tablesCreated.length} tables`);
```

#### Example 3: Store Business Data

```typescript
import { databaseHandler } from '@oneclaw/harness';

// Insert a business
await databaseHandler({
  action: 'insert',
  table: 'businesses',
  database: 'my-campaign.db',
  data: {
    name: 'ABC Plumbing',
    website: 'https://abcplumbing.com',
    phone: '555-1234',
    niche: 'plumbing',
    city: 'Austin',
    state: 'TX',
    status: 'discovered'
  }
}, { tenantId: 'demo' });

// Query it back
const results = await databaseHandler({
  action: 'query',
  sql: 'SELECT * FROM businesses WHERE niche = "plumbing"',
  database: 'my-campaign.db'
}, { tenantId: 'demo' });

console.log(results.rows);
```

## 🧪 Available Tools

### File System Tools

| Tool | Action | Example |
|------|--------|---------|
| `write-file` | Create/modify files | Write new tool code |
| `read-file` | Read files | Load configuration |

### Code Execution

| Tool | Languages | Security |
|------|-----------|----------|
| `execute-code` | TypeScript, JavaScript, Bash | VM2 sandbox, timeout |

### Database

| Tool | Purpose | Tables Created |
|------|---------|----------------|
| `init-database` | Setup schema | 6 core tables |
| `database` | CRUD operations | Query/Insert/Update/Delete |

## 📊 Database Tables

After running `init-database`, you get:

1. **businesses** - Store discovered prospects
2. **campaigns** - Track marketing campaigns
3. **outreach** - Email engagement tracking
4. **contacts** - Enriched contact information
5. **autonomous_jobs** - Scheduled tasks
6. **knowledge_base** - AI learning storage

## 🔒 Security

### What's Allowed ✅

- Read/write in `/workspace/packages/harness/oneclaw-workspace/`
- Execute code in sandboxed environment
- SQLite operations on workspace databases
- Create files and directories in workspace

### What's Blocked ❌

- Access to `/etc/`, `/usr/`, `/var/`, `/home/`
- Reading `.env` or secrets
- Modifying core daemon code
- Dangerous operations (process.exit, eval, etc.)
- DROP DATABASE or ATTACH DATABASE

## 💡 Common Use Cases

### Use Case 1: Automated Lead Discovery

```typescript
// 1. Discover businesses
const businesses = await harness.execute('discover-businesses', {
  niche: 'hvac',
  location: 'Austin, TX',
  limit: 50
});

// 2. Store in database
await harness.execute('init-database', { database: 'leads.db' });

for (const biz of businesses.results) {
  await harness.execute('database', {
    action: 'insert',
    table: 'businesses',
    database: 'leads.db',
    data: {
      name: biz.name,
      website: biz.website,
      phone: biz.phone,
      niche: 'hvac',
      city: 'Austin',
      state: 'TX'
    }
  });
}

// 3. Query later
const leads = await harness.execute('database', {
  action: 'query',
  sql: 'SELECT * FROM businesses WHERE status = "discovered"',
  database: 'leads.db'
});
```

### Use Case 2: Build Custom Analysis Tool

```typescript
// 1. Write the tool
const toolCode = `
export async function analyzeWebsite(url: string) {
  const response = await fetch(url);
  const html = await response.text();
  
  return {
    hasSSL: url.startsWith('https'),
    hasContactForm: html.includes('<form'),
    wordCount: html.split(/\\s+/).length,
    title: html.match(/<title>(.*?)<\\/title>/)?.[1] || 'No title'
  };
}
`;

await harness.execute('write-file', {
  path: 'tools/website-analyzer.ts',
  content: toolCode
});

// 2. Test it
const testCode = `
import { analyzeWebsite } from './tools/website-analyzer';
const result = await analyzeWebsite('https://example.com');
console.log(JSON.stringify(result, null, 2));
`;

const testResult = await harness.execute('execute-code', {
  code: testCode,
  language: 'typescript',
  timeout: 10000
});

console.log(testResult.stdout);
```

### Use Case 3: Learning from Campaigns

```typescript
// Store successful email template
await harness.execute('database', {
  action: 'insert',
  table: 'knowledge_base',
  database: 'oneclaw.db',
  data: {
    topic: 'email_templates',
    key: 'hvac_cold_outreach_v1',
    value: JSON.stringify({
      subject: 'Quick question about your HVAC business',
      openRate: 0.52,
      replyRate: 0.15,
      sampleSize: 100
    }),
    confidence: 0.9,
    source: 'campaign_austin_hvac_q1_2026'
  }
});

// Retrieve best templates later
const bestTemplates = await harness.execute('database', {
  action: 'query',
  sql: `
    SELECT * FROM knowledge_base 
    WHERE topic = 'email_templates' 
    AND confidence > 0.8
    ORDER BY confidence DESC 
    LIMIT 5
  `,
  database: 'oneclaw.db'
});

console.log('Best performing templates:', bestTemplates.rows);
```

## 🐛 Troubleshooting

### Issue: "Cannot access before initialization"

**Solution:** Make sure you're importing from the package exports:

```typescript
// ✅ Correct
import { databaseHandler } from '@oneclaw/harness';

// ❌ Wrong
import { databaseHandler } from './tools/database';
```

### Issue: "Path validation failed"

**Solution:** All paths must be relative to workspace or within it:

```typescript
// ✅ Correct
await harness.execute('write-file', { 
  path: 'code/my-script.ts',  // Relative to workspace
  content: '...' 
});

// ❌ Wrong
await harness.execute('write-file', { 
  path: '/etc/config',  // System path
  content: '...' 
});
```

### Issue: "Operation blocked"

**Solution:** Check that you're not using forbidden operations:

```typescript
// ❌ Blocked
process.exit(0);
eval('code');
require('child_process').exec('rm -rf /');

// ✅ Allowed
console.log('Safe operation');
const data = JSON.parse('{"key": "value"}');
```

## 📚 Learn More

- **Full Guide:** See [SELF_IMPROVEMENT_GUIDE.md](./SELF_IMPROVEMENT_GUIDE.md)
- **Architecture:** See [ARCHITECTURE_DIAGRAM.md](./ARCHITECTURE_DIAGRAM.md)
- **Implementation:** See [IMPLEMENTATION_SUMMARY.md](./IMPLEMENTATION_SUMMARY.md)
- **Tool Docs:** See [packages/harness/src/tools/README.md](./packages/harness/src/tools/README.md)

## 🎯 Next Steps

1. ✅ Run the test suite
2. ✅ Initialize your first database
3. ✅ Store some test data
4. ✅ Build a custom tool
5. ✅ Learn from campaign results

## 💬 Questions?

The system is fully tested and ready to use. If you encounter issues:

1. Check the test suite output
2. Review security restrictions
3. Verify paths are within workspace
4. Check that database is initialized

---

**Happy building! OneClaw is now a self-improving AI platform.** 🚀
