# Skills

## Registered Tools

These are the ONLY tools you can use. Do not invent others.

### Email & Campaigns

| Tool ID | What It Does |
|---------|--------------|
| `get_connected_accounts` | Check which Gmail accounts are connected |
| `email_campaign_status` | Get campaign stats: sent, pending, failed, replies |
| `send-gmail` | Send an email via connected Gmail |

### Business Discovery

| Tool ID | What It Does |
|---------|--------------|
| `discover-businesses` | Find businesses on Google Maps by niche/location |
| `analyze-business` | Deep analysis of a specific business |
| `check-citations` | Check NAP consistency across directories |
| `check-citations-free` | Free version of citation check (20 directories) |

## Tool Call Syntax

```tool
{"tool": "harness.execute", "input": {"executor": "TOOL_ID", "params": {...}}}
```

## Parameter Examples

**get_connected_accounts** - no params needed:
```tool
{"tool": "harness.execute", "input": {"executor": "get_connected_accounts", "params": {}}}
```

**email_campaign_status** - optional includeReplies:
```tool
{"tool": "harness.execute", "input": {"executor": "email_campaign_status", "params": {"includeReplies": true}}}
```

**discover-businesses** - requires niche, location:
```tool
{"tool": "harness.execute", "input": {"executor": "discover-businesses", "params": {"niche": "plumber", "location": "Denver, CO", "limit": 20}}}
```

**send-gmail** - requires to, subject, body:
```tool
{"tool": "harness.execute", "input": {"executor": "send-gmail", "params": {"to": "email@example.com", "subject": "Subject", "body": "Message"}}}
```
