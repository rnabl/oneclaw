# OneClaw - How It Works (Non-Technical Guide)

## 🎯 What is OneClaw?

OneClaw is like having a **smart assistant that lives in your chat apps** (Discord, Telegram, text messages) and can do complex business tasks for you.

Think: **"Hey OneClaw, find me plumbers in Austin"** → OneClaw searches, analyzes websites, and gives you a full report instantly.

---

## 🌟 Simple Example: Finding Plumbers

### **You:**
```
"discover plumbers in Austin, TX"
```

### **OneClaw (Behind the Scenes):**

#### Step 1: Understanding You
```
👤 "Who is this person?"
→ Checks your Discord username
→ Links it to your account
→ Checks your wallet ($2.50 balance)
→ "OK, they can afford this search ($0.50)"
```

#### Step 2: Searching
```
🔍 "Let me find plumbers..."
→ Uses Google Maps data (via Apify)
→ Finds 20 plumbing businesses
→ Gets: name, phone, website, reviews
```

#### Step 3: Analyzing Websites
```
🌐 "Let me check their websites..."
→ Scans 10 business websites
→ Checks: Do they have online booking?
→ Checks: Do they have a chatbot?
→ Checks: Are they on social media?
→ Checks: Is their website good?
```

#### Step 4: Showing Results
```
📊 "Here's what I found..."
→ Shows you a beautiful list
→ Each business has: name, phone, website
→ Shows which ones have booking, chatbots, etc.
→ "Page 1 of 2 (showing 10 of 20)"
```

### **You See:**
```
┌─────────────────────────────────────────────┐
│ 🔵 Found 20 businesses in Austin, TX        │
├─────────────────────────────────────────────┤
│ 1. AAA Plumbing Servic... | (512) 555-0100  │
│    🌐 aaaplumbing.com | SEO:✓ Cal:✓ AI:✓    │
│                                              │
│ 2. Austin Drain Expert... | (512) 555-0200  │
│    🌐 drainexperts.com | SEO:✓ Cal:✗ AI:✓   │
│                                              │
│ ... (8 more businesses)                     │
│                                              │
│ 📄 Page 1/2 | 💰 Cost: $0.50                │
│ [ Show More ] [ Export CSV ]                │
└─────────────────────────────────────────────┘
```

---

## 🏗️ How OneClaw Works (Visual)

```
┌─────────────────────────────────────────────────────────────┐
│                         YOU                                  │
│    (Typing in Discord, Telegram, or Text Messages)          │
└──────────────────────┬──────────────────────────────────────┘
                       │
                       │ "discover plumbers in Austin, TX"
                       │
                       ▼
┌─────────────────────────────────────────────────────────────┐
│              OneClaw (The AI Assistant)                      │
│                                                              │
│  ┌────────────────────────────────────────────────────────┐ │
│  │ 1. Identity Check                                       │ │
│  │    "Who are you? Do you have money?"                   │ │
│  │    ✅ Found: Discord User @alice                       │ │
│  │    ✅ Wallet: $2.50                                    │ │
│  └────────────────────────────────────────────────────────┘ │
│                       │                                      │
│                       ▼                                      │
│  ┌────────────────────────────────────────────────────────┐ │
│  │ 2. Smart Cache Check                                    │ │
│  │    "Has anyone searched this recently?"                │ │
│  │    ❌ No → Need to search                              │ │
│  └────────────────────────────────────────────────────────┘ │
│                       │                                      │
│                       ▼                                      │
│  ┌────────────────────────────────────────────────────────┐ │
│  │ 3. Search Google Maps                                   │ │
│  │    "Let me find plumbers on Google Maps..."            │ │
│  │    🔍 Using Apify (professional scraping service)      │ │
│  │    ✅ Found: 20 businesses                             │ │
│  └────────────────────────────────────────────────────────┘ │
│                       │                                      │
│                       ▼                                      │
│  ┌────────────────────────────────────────────────────────┐ │
│  │ 4. Analyze Websites                                     │ │
│  │    "Let me check their websites..."                    │ │
│  │    🌐 Scanning 10 websites (5 at a time)              │ │
│  │    • Does it have online booking? (Calendly, etc.)    │ │
│  │    • Does it have a chatbot?                          │ │
│  │    • Is it on social media?                           │ │
│  │    • Is the SEO good?                                 │ │
│  │    ✅ Analysis complete                                │ │
│  └────────────────────────────────────────────────────────┘ │
│                       │                                      │
│                       ▼                                      │
│  ┌────────────────────────────────────────────────────────┐ │
│  │ 5. Save Everything                                      │ │
│  │    • Save results to cache (1 hour)                    │ │
│  │    • Charge your wallet ($0.50)                        │ │
│  │    • Store search in history                           │ │
│  └────────────────────────────────────────────────────────┘ │
│                       │                                      │
│                       ▼                                      │
│  ┌────────────────────────────────────────────────────────┐ │
│  │ 6. Send You Beautiful Results                           │ │
│  │    📊 Rich embed with all info                         │ │
│  │    📄 Pagination (Page 1 of 2)                         │ │
│  │    🔘 Buttons (Show More, Export CSV)                  │ │
│  └────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────────────────┐
│                    YOU SEE RESULTS                           │
│         Beautiful list with all the information              │
└─────────────────────────────────────────────────────────────┘
```

---

## 💡 Key Features Explained

### **1. Multi-Channel**
OneClaw works in **any chat app**:
- 💬 Discord (for teams)
- 📱 Telegram (for privacy)
- 📧 Text Messages (for simplicity)
- 📲 iMessage (for Apple users)

**Same AI, different apps!**

---

### **2. Smart Memory**

#### Short-Term Memory (Cache)
```
You: "discover plumbers in Austin, TX"
OneClaw: [Searches... $0.50]

5 minutes later...
You: "discover plumbers in Austin, TX"
OneClaw: [Uses saved results... FREE!]
```

**Searches are cached for 1 hour** so you don't pay twice!

#### Long-Term Memory (Database)
```
Your account information:
- How much money you have
- Your search history
- Your preferences
```

**This is saved forever** (or until you delete it)

---

### **3. Progressive Enhancement**

OneClaw gets **better as you grow**:

#### Day 1: Just Works
```
Install → Add API keys → Start chatting
• Everything works in-memory
• No database needed
• No setup required
```

#### Week 1: Add Persistence
```
Connect Supabase (or SQLite)
• Your data is now saved
• Search history persists
• Wallet survives restarts
```

#### Month 1: Add Speed
```
Connect Upstash (or Valkey/Redis)
• Searches are super fast
• Results are cached
• Better performance
```

#### Month 3: Add Durability
```
Connect Restate
• Long workflows checkpoint
• No progress lost on crashes
• Resume from any point
```

**Start simple, add complexity only when needed!**

---

### **4. Privacy First**

#### Cloud Version
```
Your Data:
• Stored in Supabase (encrypted)
• Your own account
• You control it

Your API Keys:
• Encrypted in database
• Never shared
• Only you can use them
```

#### Self-Hosted Version
```
Your Data:
• Stored in SQLite (on your computer)
• Never leaves your machine
• 100% private

Your API Keys:
• In your .env file
• Never sent anywhere
• Completely secure
```

**You choose: convenience (cloud) or privacy (self-hosted)**

---

## 🔄 Common Workflows

### **Workflow 1: Discovery ($1 per search)**
```
You: "discover dentists in Miami, FL"

OneClaw:
1. Search Google Maps → Find 50 dentists
2. Scan first 10 websites
3. Show you rich results
4. Charge $1.00

Result: 50 businesses with basic info + enrichment
```

### **Workflow 2: Enrichment ($5 per batch)**
```
You: "enrich these businesses"

OneClaw:
1. Deep scan all 50 websites (not just 10)
2. Find owner/decision maker info
3. Check social media engagement
4. Analyze tech stack in detail
5. Generate lead score

Result: Full analysis, ranked by best prospects
```

### **Workflow 3: Analysis (Free)**
```
You: "which ones use Calendly?"

OneClaw:
1. Filter cached results
2. Show businesses with Calendly
3. No external API calls

Result: Instant filtered results, no charge
```

---

## 🎯 What Makes OneClaw Special?

### **1. Flexible**
```
Use it your way:
• Cloud (OneClaw manages everything)
• Self-hosted (you run it yourself)
• Hybrid (some cloud, some local)
```

### **2. Transparent Pricing**
```
Everything costs what it costs:
• Google Maps search: $0.10 via Apify
• Website scan: FREE (we built it)
• AI analysis: $0.02 via OpenAI

You pay EXACTLY what services cost, no markup!
```

### **3. Extensible**
```
Add new workflows:
• "analyze competitor prices"
• "find email addresses"
• "schedule social media posts"

Same framework, infinite possibilities!
```

### **4. Multi-Tenant**
```
Each user gets:
• Their own wallet
• Their own API keys
• Their own data
• Their own rate limits

Perfect for teams or SaaS!
```

---

## 🚀 Getting Started (Simple View)

### **Option 1: Use OneClaw Cloud**
```
1. Sign up at oneclaw.chat
2. Connect Discord (or Telegram, SMS)
3. Add $10 to your wallet
4. Start chatting with @OneClaw bot
```

**That's it! No code, no setup.**

---

### **Option 2: Self-Host OneClaw**
```
1. Download OneClaw from GitHub
2. Add your API keys to .env file:
   • ANTHROPIC_API_KEY (for AI)
   • DISCORD_BOT_TOKEN (for Discord)
   • APIFY_API_TOKEN (for searches)
3. Run: npm start
4. Start chatting with your bot
```

**Your data never leaves your computer!**

---

## 💰 Pricing Examples

### **Discovery Workflow**
```
"discover plumbers in Austin, TX"

Costs:
• Apify search: $0.08 (20 businesses × $0.004)
• Website scans: FREE (10 websites)
• OneClaw fee: $0.42

Total: $0.50 per search
```

### **Enrichment Workflow**
```
"enrich these 50 businesses"

Costs:
• Website scans: FREE (50 websites)
• Owner lookup: $2.00 (AI research)
• Deep analysis: $1.00 (AI processing)
• OneClaw fee: $2.00

Total: $5.00 per batch
```

### **Analysis (Filtering)**
```
"show me businesses with online booking"

Costs:
• Filter cached results: FREE
• No external API calls

Total: $0.00
```

---

## 🎯 Summary

**OneClaw is a smart assistant that:**

1. ✅ Works in your favorite chat apps
2. ✅ Searches and analyzes businesses automatically
3. ✅ Caches results so you don't pay twice
4. ✅ Tracks costs transparently
5. ✅ Grows with you (start simple, add features later)
6. ✅ Respects your privacy (self-host option)
7. ✅ Charges only what services cost (no markup)

**Think of it as:** Your own AI research assistant that lives in Discord/Telegram/SMS and does complex business research tasks in seconds!
