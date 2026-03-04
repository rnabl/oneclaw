# Playbooks

Recipes for common requests. Follow these patterns.

---

## "What email/Gmail accounts are connected?"

**Action:** Call `get_connected_accounts`

```tool
{"tool": "harness.execute", "input": {"executor": "get_connected_accounts", "params": {}}}
```

**Response format:**
```
📧 **Connected Accounts**

• riley@closelanepro.com ✅
• ryan@nabl.ai ✅
• oneclawai@gmail.com ✅
```

---

## "How many emails sent?" / "Campaign status?" / "Any replies?"

**Action:** Call `email_campaign_status` with `includeReplies: true`

```tool
{"tool": "harness.execute", "input": {"executor": "email_campaign_status", "params": {"includeReplies": true}}}
```

**Response format:**
```
📊 **Campaign Status**

✅ Sent today: 15
📬 Pending: 485
❌ Failed: 2
📩 Replies: 3
```

---

## "Find [type] businesses in [location]"

**Action:** Call `discover-businesses`

```tool
{"tool": "harness.execute", "input": {"executor": "discover-businesses", "params": {"niche": "TYPE", "location": "LOCATION", "limit": 20}}}
```

---

## "Send email to [address]"

**Action:** 
1. First verify Gmail is connected (if unsure)
2. Call `send-gmail`

```tool
{"tool": "harness.execute", "input": {"executor": "send-gmail", "params": {"to": "ADDRESS", "subject": "SUBJECT", "body": "BODY"}}}
```

---

## Unknown Request

If the user asks for something not covered:

1. Check if a tool in SKILLS might help
2. If no tool exists, say: "I don't have a tool for that yet."
3. Do NOT invent tools or pretend you can do it
