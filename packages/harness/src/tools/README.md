# OneClaw Self-Improvement Tools

This directory contains tools that enable OneClaw to improve itself autonomously.

## Tools

### Core Self-Improvement Tools

#### 1. `execute-code`
Execute TypeScript, JavaScript, or Bash code in a secure sandbox.

```typescript
await harness.execute("execute-code", {
  code: "console.log('Hello, World!');",
  language: "javascript",
  timeout: 5000
});
```

**Security:**
- Blocks dangerous operations (process.exit, eval, etc.)
- Runs in VM2 sandbox for JavaScript
- Timeout protection
- Working directory restricted to workspace

#### 2. `write-file`
Create or modify files within the sandboxed workspace.

```typescript
await harness.execute("write-file", {
  path: "code/my-tool.ts",
  content: "export const myFunction = () => { ... }",
  overwrite: true,
  createDirectories: true
});
```

**Security:**
- Path validation against allowlist/blocklist
- Cannot write outside workspace
- Cannot access secrets or system files

#### 3. `read-file`
Read files from the sandboxed workspace.

```typescript
await harness.execute("read-file", {
  path: "code/my-tool.ts",
  encoding: "utf-8",
  maxSize: 1000000
});
```

**Security:**
- Path validation
- Size limits to prevent memory exhaustion
- Cannot read secrets or sensitive files

#### 4. `database`
Execute SQLite database operations for persistent storage.

```typescript
// Insert
await harness.execute("database", {
  action: "insert",
  table: "businesses",
  data: {
    name: "ABC Company",
    niche: "hvac"
  }
});

// Query
await harness.execute("database", {
  action: "query",
  sql: "SELECT * FROM businesses WHERE niche = 'hvac'"
});

// Update
await harness.execute("database", {
  action: "update",
  table: "businesses",
  data: { status: "contacted" },
  where: { id: 1 }
});
```

**Security:**
- Blocks DROP DATABASE and ATTACH DATABASE
- Requires WHERE clause for DELETE operations
- All databases stored in sandboxed workspace

#### 5. `init-database`
Initialize the autonomous database schema.

```typescript
await harness.execute("init-database", {
  database: "oneclaw.db",
  force: false
});
```

Creates tables:
- `businesses` - Discovered businesses
- `campaigns` - Marketing campaigns
- `outreach` - Email tracking
- `contacts` - Contact information
- `autonomous_jobs` - Scheduled tasks
- `knowledge_base` - AI learning storage

## Workspace Structure

```
oneclaw-workspace/
├── code/       # AI-generated code and tools
├── data/       # SQLite databases
├── logs/       # Execution logs
└── tools/      # Custom tool prototypes
```

## Security Model

### Sandboxing
All operations are restricted to the `oneclaw-workspace/` directory.

### Forbidden Paths
- System directories: `/etc/`, `/usr/`, `/var/`
- Secrets: `.env`, `secrets/`, `*.key`, `*.pem`
- Core code: `/daemon/src/core/`, `node_modules/`
- User directories: `/home/`

### Forbidden Operations
- `process.exit()`, `process.kill()`
- `eval()`, `Function()`
- File system requires (child_process, fs)
- Dangerous bash commands
- Crypto private key operations

## Usage Pattern: Progressive Tool Development

### 1. Research and Design
AI identifies a need and researches the solution.

### 2. Prototype
```typescript
// Write code
await harness.execute("write-file", {
  path: "tools/linkedin-scraper.ts",
  content: linkedInScraperCode
});

// Test code
await harness.execute("execute-code", {
  code: testLinkedInScraper,
  language: "typescript"
});
```

### 3. Store Knowledge
```typescript
await harness.execute("database", {
  action: "insert",
  table: "knowledge_base",
  data: {
    topic: "integrations",
    key: "linkedin_scraper",
    value: JSON.stringify({
      works: true,
      rateLimit: 100,
      cost: 0.001
    })
  }
});
```

### 4. Request Deployment
AI provides the working code to the developer for production deployment.

## Examples

See `/workspace/SELF_IMPROVEMENT_GUIDE.md` for comprehensive examples including:
- Automated business discovery and storage
- Building custom tools
- Running outreach campaigns
- Learning from success patterns

## Testing

Run the test suite:

```bash
npx tsx src/tools/test-self-improvement.ts
```

## Database Schema

See `/workspace/packages/harness/src/database/autonomous-schema.sql` for complete schema definitions.

Key tables:
- **businesses**: Store discovered prospects
- **campaigns**: Track marketing campaigns
- **outreach**: Email engagement tracking
- **autonomous_jobs**: Scheduled task management
- **knowledge_base**: AI learning and optimization

## Contribution Guidelines

When adding new self-improvement tools:

1. **Security First**: Use `pathValidator` for all file operations
2. **Export Tool Definition**: Export as const, don't register directly
3. **Comprehensive Schemas**: Use Zod for input/output validation
4. **Error Handling**: Return structured errors, never throw
5. **Logging**: Use console.log with clear prefixes
6. **Testing**: Add test cases to test-self-improvement.ts

## Architecture Notes

These tools avoid circular dependencies by:
- Not importing `registry` directly
- Exporting tool definitions as constants
- Letting `registry/index.ts` handle registration

This enables the tools to be imported without triggering premature initialization.
