# OneClaw Self-Improvement Implementation Guide

## 🎯 Overview

This implementation adds **self-improvement capabilities** to OneClaw (clawd), enabling the AI to:

- **Write and execute code** autonomously
- **Store persistent data** across conversations using SQLite
- **Build and deploy new tools** dynamically
- **Learn and adapt** over time by storing knowledge

## 🏗️ Architecture

### Components Implemented

1. **Security Layer** (`src/security/`)
   - Path validation with allowlist/blocklist
   - Protection against path traversal attacks
   - Sandboxed workspace isolation

2. **Self-Improvement Tools** (`src/tools/`)
   - `execute-code` - Run TypeScript/JavaScript/Bash code safely
   - `write-file` - Create and modify files in workspace
   - `read-file` - Read files from workspace
   - `database` - SQLite operations for persistent storage
   - `init-database` - Initialize database schema

3. **Sandboxed Workspace** (`oneclaw-workspace/`)
   ```
   oneclaw-workspace/
   ├── code/      # AI-generated code
   ├── data/      # SQLite databases
   ├── logs/      # Execution logs
   └── tools/     # Custom tool prototypes
   ```

4. **Autonomous Database Schema** (`database/autonomous-schema.sql`)
   - `businesses` - Discovered business data
   - `campaigns` - Marketing campaigns
   - `outreach` - Email tracking
   - `contacts` - Contact information
   - `autonomous_jobs` - Scheduled tasks
   - `knowledge_base` - AI learning storage

## 🔒 Security Features

### Path Validation

```typescript
// Allowed paths (whitelist)
- /workspace/packages/harness/oneclaw-workspace/*

// Forbidden paths (blacklist)
- /etc/*, /var/*, /usr/* (system directories)
- /.env, /.env.* (secrets)
- /daemon/secrets/ (credential storage)
- /daemon/src/core/ (core system code)
- node_modules/ (dependencies)
```

### Code Execution Safety

```typescript
// Blocked operations
- process.exit() / process.kill()
- require("child_process")
- eval() / Function()
- Crypto private key operations
- Dangerous bash commands (rm -rf /, mkfs, etc.)
```

### Database Security

```typescript
// Blocked SQL patterns
- DROP DATABASE
- ATTACH/DETACH DATABASE
- Direct file system access
```

## 🚀 Usage Examples

### Example 1: Discover Businesses and Store in Database

```typescript
// Step 1: Initialize database
const initResult = await harness.execute("init-database", {
  database: "oneclaw.db",
  force: false
});

// Step 2: Discover businesses
const businesses = await harness.execute("discover-businesses", {
  niche: "hvac",
  location: "Austin, TX",
  limit: 100
});

// Step 3: Store in database
for (const business of businesses.results) {
  await harness.execute("database", {
    action: "insert",
    table: "businesses",
    database: "oneclaw.db",
    data: {
      name: business.name,
      website: business.website,
      phone: business.phone,
      niche: "hvac",
      city: "Austin",
      state: "TX",
      status: "discovered"
    }
  });
}
```

### Example 2: Build a Custom Tool

```typescript
// Step 1: Write tool code
const toolCode = `
export async function customAnalyzer(input: { url: string }) {
  // Custom analysis logic
  const response = await fetch(input.url);
  const html = await response.text();
  
  return {
    hasContactForm: html.includes('<form'),
    hasPhone: /\d{3}-\d{3}-\d{4}/.test(html),
    wordCount: html.split(/\s+/).length
  };
}
`;

await harness.execute("write-file", {
  path: "tools/custom-analyzer.ts",
  content: toolCode,
  overwrite: true
});

// Step 2: Test the tool
const testCode = `
import { customAnalyzer } from './tools/custom-analyzer';
const result = await customAnalyzer({ url: 'https://example.com' });
console.log(JSON.stringify(result));
`;

const testResult = await harness.execute("execute-code", {
  code: testCode,
  language: "typescript",
  timeout: 10000
});
```

### Example 3: Automated Outreach Campaign

```typescript
// Step 1: Create campaign
await harness.execute("database", {
  action: "insert",
  table: "campaigns",
  database: "oneclaw.db",
  data: {
    name: "HVAC SEO Outreach - Austin",
    description: "Offer SEO audits to HVAC companies in Austin",
    target_niche: "hvac",
    target_location: "Austin, TX",
    status: "active"
  }
});

// Step 2: Query businesses needing outreach
const businesses = await harness.execute("database", {
  action: "query",
  sql: "SELECT * FROM businesses WHERE status = 'discovered' LIMIT 10",
  database: "oneclaw.db"
});

// Step 3: Send emails and track
for (const business of businesses.rows) {
  const emailResult = await harness.execute("send-gmail", {
    to: business.email,
    subject: "Free SEO Audit for Your HVAC Business",
    body: generatePersonalizedEmail(business)
  });
  
  // Record outreach
  await harness.execute("database", {
    action: "insert",
    table: "outreach",
    database: "oneclaw.db",
    data: {
      business_id: business.id,
      campaign_id: 1,
      email_type: "initial",
      sent_date: new Date().toISOString(),
      gmail_message_id: emailResult.messageId,
      status: "sent"
    }
  });
}
```

### Example 4: Learn from Success Patterns

```typescript
// Store successful email template
await harness.execute("database", {
  action: "insert",
  table: "knowledge_base",
  database: "oneclaw.db",
  data: {
    topic: "email_templates",
    key: "hvac_initial_outreach",
    value: JSON.stringify({
      subject: "Free SEO Audit for Your HVAC Business",
      openRate: 0.45,
      replyRate: 0.12,
      template: "Hi {name}, I noticed your HVAC business..."
    }),
    source: "campaign_1",
    confidence: 0.9
  }
});

// Retrieve best-performing templates
const bestTemplates = await harness.execute("database", {
  action: "query",
  sql: `
    SELECT * FROM knowledge_base 
    WHERE topic = 'email_templates' 
    ORDER BY confidence DESC 
    LIMIT 5
  `,
  database: "oneclaw.db"
});
```

## 🧪 Testing

Run the comprehensive test suite:

```bash
cd /workspace/packages/harness
npx tsx src/tools/test-self-improvement.ts
```

Expected output:
```
✅ Path validation
✅ File operations
✅ Code execution
✅ Database operations
✅ Self-modifying code
```

## 📊 Database Schema

### Businesses Table
Stores discovered businesses with metadata, audit results, and contact information.

```sql
CREATE TABLE businesses (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  website TEXT,
  phone TEXT,
  email TEXT,
  city TEXT,
  state TEXT,
  niche TEXT,
  google_rating REAL,
  audit_data TEXT,  -- JSON
  contact_data TEXT,  -- JSON
  status TEXT DEFAULT 'discovered',
  created_at DATETIME,
  updated_at DATETIME
);
```

### Campaigns Table
Manages outreach campaigns with targeting and performance metrics.

```sql
CREATE TABLE campaigns (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  target_niche TEXT,
  target_location TEXT,
  emails_sent INTEGER DEFAULT 0,
  emails_replied INTEGER DEFAULT 0,
  status TEXT DEFAULT 'draft',
  created_at DATETIME
);
```

### Outreach Table
Tracks individual email sends with engagement metrics.

```sql
CREATE TABLE outreach (
  id INTEGER PRIMARY KEY,
  business_id INTEGER,
  campaign_id INTEGER,
  email_type TEXT DEFAULT 'initial',
  sent_date DATETIME,
  gmail_message_id TEXT,
  opened BOOLEAN DEFAULT FALSE,
  replied BOOLEAN DEFAULT FALSE,
  next_followup_date DATETIME,
  status TEXT DEFAULT 'pending'
);
```

## 🔄 Progressive Tool Onboarding

As discussed with clawd, the AI can now:

1. **Identify needs**: "I need Slack integration for notifications"
2. **Research APIs**: Study documentation and generate tool specs
3. **Request integration**: Provide exact implementation to developer
4. **Use new tools**: Once added to registry, immediately available

### Flow Example:

```
User: "Send Slack notifications when leads respond"
AI:   "I need Slack integration. Let me research the API..."
AI:   *generates tool spec and OAuth requirements*
AI:   "Here's what I need implemented: [detailed spec]"
User: *implements and adds to registry*
AI:   "Thanks! Now I can send Slack notifications."
```

## 🎯 Next Steps

### Immediate Capabilities
- ✅ Persistent business database
- ✅ Code execution and testing
- ✅ File-based tool development
- ✅ Knowledge accumulation

### Future Enhancements
1. **Scheduling System** - Cron-like autonomous job execution
2. **LinkedIn Integration** - Progressive onboarding when needed
3. **Email Sequence Management** - Automated follow-up workflows
4. **Performance Analytics** - Self-optimization based on results
5. **Tool Hot-Reloading** - Deploy new tools without restart

## 💡 Key Insights from clawd Conversation

From the conversation with Beff Jezos:

1. **Vision**: OneClaw as the automation platform itself (not just a worker)
2. **Goal**: Replace n8n/Zapier with in-house self-improving AI
3. **Architecture**: Database-driven state management for true autonomy
4. **Security**: Sandboxed execution with progressive permission expansion
5. **Learning**: Knowledge base for pattern recognition and improvement

## 📝 Files Modified/Created

### New Files
- `src/security/path-validator.ts` - Path security validation
- `src/security/index.ts` - Security module exports
- `src/tools/execute-code.ts` - Code execution tool
- `src/tools/write-file.ts` - File writing tool
- `src/tools/read-file.ts` - File reading tool
- `src/tools/database.ts` - SQLite database tool
- `src/tools/init-database.ts` - Database initialization
- `src/database/autonomous-schema.sql` - Database schema
- `src/tools/test-self-improvement.ts` - Test suite

### Modified Files
- `src/registry/index.ts` - Registered new tools
- `src/index.ts` - Exported new tools
- `package.json` - Added vm2 dependency

## 🚨 Important Notes

1. **Sandbox Isolation**: All AI-generated code runs in isolated workspace
2. **Permission Model**: Strict path validation prevents system access
3. **Database Persistence**: SQLite enables true stateful operations
4. **Progressive Enhancement**: Tools can be added dynamically as needed
5. **Security First**: Multiple layers of protection against malicious code

## 🎉 Conclusion

OneClaw now has the foundation for true self-improvement! The AI can:
- Build and test code autonomously
- Store knowledge persistently
- Adapt and learn from experience
- Expand its capabilities progressively

This transforms OneClaw from a stateless tool executor into an **autonomous, learning agent platform**.
