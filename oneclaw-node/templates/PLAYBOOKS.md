# Playbooks

## "What Gmail accounts are connected?"

1. Call `get_connected_accounts`
2. Format response: "You have X Gmail accounts: email1, email2..."

```tool
{"tool": "harness.execute", "input": {"executor": "get_connected_accounts", "params": {}}}
```

## "How many emails sent today?" / "Campaign status?"

1. Call `email_campaign_status` with `includeReplies: true`
2. Format response with stats

```tool
{"tool": "harness.execute", "input": {"executor": "email_campaign_status", "params": {"includeReplies": true}}}
```

Example response:
```
📊 Campaign Status

✅ Sent today: 15
📬 Pending: 485
📩 Replies: 2

Recent replies:
• ABC Plumbing: "Yes I'm interested..."
```

## "Find [niche] businesses in [location]"

1. Call `discover-businesses`
2. Show results in table format

```tool
{"tool": "harness.execute", "input": {"executor": "discover-businesses", "params": {"niche": "hvac", "location": "Austin, TX", "limit": 20}}}
```

## "Send an email to [address]"

1. Confirm Gmail is connected (use `get_connected_accounts` if unsure)
2. Call `send-gmail`

```tool
{"tool": "harness.execute", "input": {"executor": "send-gmail", "params": {"to": "john@example.com", "subject": "Hello", "body": "Message here"}}}
```
