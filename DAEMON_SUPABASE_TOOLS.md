# Rust Daemon Supabase Tool Integration

## Summary

The Rust daemon now has access to all new Supabase-powered tools for workflow management and email outreach. This enables Telegram and other interfaces to use checkpoint/resume functionality and email approval workflows.

## What Was Added

### 1. **Workflow Checkpoint Tools**

These tools enable workflow recovery and resumption:

#### `resume-workflow`
- **Purpose**: Resume a failed workflow from its last checkpoint
- **Input**: 
  - `userId` (string)
  - `runId` (string)
- **Output**: Success status, run ID, and message
- **Cost**: Cheap ($0.001)

#### `list-resumable-workflows`
- **Purpose**: List all workflows that failed and can be resumed
- **Input**:
  - `userId` (string)
  - `limit` (number, optional, default: 20)
- **Output**: Array of resumable workflows with metadata
- **Cost**: Free

### 2. **Email Approval Tools**

These tools enable the email review and approval workflow:

#### `get-pending-emails`
- **Purpose**: Retrieve all pending email drafts awaiting approval
- **Input**:
  - `userId` (string)
  - `limit` (number, optional, default: 50)
- **Output**: Array of email drafts with subject, body, recipient info
- **Cost**: Free

#### `approve-email`
- **Purpose**: Approve an email draft for sending
- **Input**:
  - `userId` (string)
  - `emailId` (string)
  - `edits` (optional object with `subject` and/or `body`)
- **Output**: Success status and message
- **Cost**: Free

#### `reject-email`
- **Purpose**: Reject an email draft
- **Input**:
  - `userId` (string)
  - `emailId` (string)
  - `reason` (string, optional)
- **Output**: Success status and message
- **Cost**: Free

## Architecture

### How It Works

```
┌─────────────────┐
│  Rust Daemon    │
│  (oneclaw-node) │
└────────┬────────┘
         │
         │ Fetches tools on startup
         │ GET /tools
         ↓
┌─────────────────────────────┐
│  Harness API                │
│  (packages/harness)         │
│                             │
│  ┌─────────────────────┐   │
│  │  Tool Registry      │   │
│  │  - Resume Workflow  │   │
│  │  - List Resumable   │   │
│  │  - Get Pending      │   │
│  │  - Approve Email    │   │
│  │  - Reject Email     │   │
│  └─────────────────────┘   │
└─────────────┬───────────────┘
              │
              │ Calls handlers
              ↓
┌─────────────────────────────┐
│  Tool Handlers              │
│  (/tools/workflow-checkpoint.ts)  │
│  (/tools/email-approval.ts) │
└─────────────┬───────────────┘
              │
              │ Uses
              ↓
┌─────────────────────────────┐
│  Core Modules               │
│  - execution/resume.ts      │
│  - execution/checkpoint-store.ts │
│  - outreach/email-approval.ts    │
└─────────────┬───────────────┘
              │
              ↓
┌─────────────────────────────┐
│  Supabase Database          │
│  - workflow_runs            │
│  - workflow_steps           │
│  - workflow_artifacts       │
│  - crm.email_campaigns      │
└─────────────────────────────┘
```

### Files Modified/Created

#### New Tool Definitions
- `packages/harness/src/tools/workflow-checkpoint.ts` - Workflow resume handlers
- `packages/harness/src/tools/email-approval.ts` - Email approval handlers

#### Registry Updates
- `packages/harness/src/registry/schemas.ts` - Added tool schemas
- `packages/harness/src/registry/index.ts` - Registered new tools

### How the Daemon Gets Tools

The Rust daemon fetches tools from the harness on startup:

```rust
// oneclaw-node/src/daemon.rs (lines 71-106)
let harness_url = std::env::var("HARNESS_URL")
    .unwrap_or_else(|_| {
        if cfg!(debug_assertions) {
            "http://localhost:9000".to_string()
        } else {
            "https://oneclaw.chat".to_string()
        }
    });

let harness_tools = tokio::task::spawn_blocking(move || {
    match reqwest::blocking::get(format!("{}/tools", harness_url_clone)) {
        Ok(resp) => {
            // Parse tools from response
            // Extract: id, description, paramsSchema, costEstimate, tier
        }
    }
}).await;
```

The `/tools` endpoint (in `packages/harness/src/api/routes.ts`) automatically exposes all registered tools.

## Usage Examples

### From Telegram

```
User: "Check if any workflows failed"
Bot calls: list-resumable-workflows { userId: "user_123" }

User: "Resume workflow abc-123"
Bot calls: resume-workflow { userId: "user_123", runId: "abc-123" }

User: "Show pending emails"
Bot calls: get-pending-emails { userId: "user_123", limit: 10 }

User: "Approve email xyz-456"
Bot calls: approve-email { 
  userId: "user_123", 
  emailId: "xyz-456",
  edits: { subject: "Updated subject" }  // optional
}
```

### From API

```bash
# List resumable workflows
curl http://localhost:9000/execute \
  -H "Content-Type: application/json" \
  -d '{
    "toolId": "list-resumable-workflows",
    "input": {
      "userId": "user_123",
      "limit": 20
    }
  }'

# Resume a workflow
curl http://localhost:9000/execute \
  -H "Content-Type: application/json" \
  -d '{
    "toolId": "resume-workflow",
    "input": {
      "userId": "user_123",
      "runId": "run_abc123"
    }
  }'

# Get pending emails
curl http://localhost:9000/execute \
  -H "Content-Type: application/json" \
  -d '{
    "toolId": "get-pending-emails",
    "input": {
      "userId": "user_123",
      "limit": 50
    }
  }'

# Approve an email
curl http://localhost:9000/execute \
  -H "Content-Type: application/json" \
  -d '{
    "toolId": "approve-email",
    "input": {
      "userId": "user_123",
      "emailId": "email_xyz789",
      "edits": {
        "subject": "New Subject",
        "body": "Updated email body"
      }
    }
  }'
```

## Environment Variables Required

All tools require Supabase credentials:

```bash
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_KEY=your-service-key
# or
SUPABASE_KEY=your-anon-key  # fallback
```

## Next Steps

1. **Restart Harness**: `npm run dev` in `packages/harness` to load new tools
2. **Restart Daemon**: The Rust daemon will auto-fetch new tools on next startup
3. **Test via Telegram**: Tools will be available in natural language commands
4. **Monitor Logs**: Check for tool registration in harness startup logs

## Related Documentation

- `WORKFLOW_PERSISTENCE_FIX.md` - Checkpoint system details
- `EMAIL_APPROVAL_FLOW.md` - Email approval process
- `TELEGRAM_SUPABASE_INTEGRATION.md` - Telegram integration guide
