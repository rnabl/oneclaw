# Available Tools

## Email & Campaigns

| Tool ID | Description | Use When |
|---------|-------------|----------|
| `get_connected_accounts` | Check connected Gmail accounts | User asks "what accounts", "gmail connected?" |
| `email_campaign_status` | Get campaign stats (sent today, pending, replies) | User asks "how many sent", "campaign status", "any replies" |
| `send-gmail` | Send an email | User wants to send an email |

## Business Discovery

| Tool ID | Description | Use When |
|---------|-------------|----------|
| `discover-businesses` | Find businesses on Google Maps | User wants to find leads, businesses in an area |
| `analyze-business` | Deep analysis of a business website | User wants insights on a specific business |
| `check-citations` | Check NAP consistency across directories | User asks about citations, listings |

## Tool Call Format

```tool
{"tool": "harness.execute", "input": {"executor": "get_connected_accounts", "params": {}}}
```

```tool
{"tool": "harness.execute", "input": {"executor": "email_campaign_status", "params": {"includeReplies": true}}}
```

```tool
{"tool": "harness.execute", "input": {"executor": "discover-businesses", "params": {"niche": "plumber", "location": "Denver, CO", "limit": 20}}}
```

## Common Mistakes to Avoid

- Do NOT invent tool names (no `get_business_data`, `check_gmail`, etc.)
- Do NOT say "Gmail not connected" without checking first
- Do NOT make up stats - use `email_campaign_status` to get real numbers
