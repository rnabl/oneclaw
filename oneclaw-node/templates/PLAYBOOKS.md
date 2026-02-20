# OneClaw PLAYBOOKS

## Golf Tee Time Search

### When to Use
User asks for golf tee times, golf courses, booking availability

### Strategy
1. Parse request: location, date, time range, party size
2. Dispatch to `golf-booking` executor
3. Monitor execution (watch for timeouts)
4. Present results with booking links

### Example
```
User: "Find me golf tee times for Saturday in Denver for 4 people between 9-10am"

Parse:
- location: "Denver, CO"
- date: [next Saturday]
- timeRange: "9:00-10:00"
- partySize: 4

Dispatch:
harness.execute("golf-booking", { location, date, timeRange, partySize })

Monitor:
- If timeout > 60s, consider switching to sequential
- If rate limited, wait and retry

Present:
"Found 5 tee times:
1. Cherry Hills - 9:08 AM - $85 - [Book](url)
2. ..."
```

---

## Business Contact Discovery

### When to Use
User asks for business leads, contacts, owner names, phone numbers

### Strategy
1. Parse request: industry, location, count
2. Dispatch to `hvac-contact-discovery` (or similar)
3. Monitor for long execution (this takes 2-3 min)
4. Present results with contact info

### Example
```
User: "Find 50 HVAC companies in Austin with owner names"

Parse:
- industry: "HVAC"
- location: "Austin, TX"
- count: 50
- extractOwners: true

Dispatch:
harness.execute("hvac-contact-discovery", { location, limit: 50, extractOwners: true })

Monitor:
- Expected time: 2-3 minutes
- If stuck > 5 min, abort and report partial results

Present:
"Found 47 HVAC companies:
| Company | Phone | Owner |
| ABC HVAC | 555-1234 | John Smith |
..."
```

---

## Research Mode (Unknown Tasks)

### When to Use
User asks for something not in your tool registry

### Strategy
1. Use `brave_search` to research how to accomplish the task
2. Identify what tools/APIs are needed
3. If tools exist, chain them
4. If tools missing, inform user and offer to connect

### Example
```
User: "Post an update to my Google My Business"

Check registry: No "google_my_business" tool found

Response:
"I don't have Google My Business connected yet. Would you like to:
1. Connect via OAuth [link]
2. Provide an API key
3. Skip for now"
```

---

## Email Sending

### When to Use
User asks to send an email

### Strategy
1. Check if Gmail is connected
2. If yes, dispatch to `gmail.send`
3. If no, prompt to connect

### Example
```
User: "Send an email to john@example.com about the meeting"

Check: Gmail connected? Yes

Dispatch:
harness.execute("gmail.send", {
  to: "john@example.com",
  subject: "Meeting",
  body: "Hi John, ..."
})
```
