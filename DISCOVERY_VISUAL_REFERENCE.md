# Discovery Output - Visual Reference

## What Users Will See

### Initial Search Response

```
🔥 Found 20 dentist businesses in Austin, TX
Search completed in 12.5s

📊 Quick Stats: ⭐ 4.2 avg | 🌐 15 websites | 🎯 5 unclaimed GBPs

Results:
```
```
1. Smile Dental                | ⭐4.5  |  89r  | 🎯      
2. Austin Family Dentistry     | ⭐4.8  | 156r  |         
3. Perfect Teeth               | ⭐3.9  |  23r  | 🎯❌📉  
4. Downtown Dental             | ⭐4.6  | 201r  |         
5. Bright Smiles               | ⭐4.3  |  67r  |         
6. Lakeway Dental Care         | ⭐4.7  | 134r  | 🎯      
7. Emergency Dental Now        | ⭐2.8  |  12r  | ❌⚠️📉  
8. North Austin Dentist        | ⭐4.1  |  45r  |         
9. South Congress Dental       | ⭐4.9  | 289r  |         
10. Westlake Dental            | ⭐4.4  |  78r  | 🎯      
11. Mueller Dental Clinic      | ⭐4.2  |  56r  |         
12. Hyde Park Dentistry        | ⭐4.6  | 123r  |         
13. Brentwood Family Dental    | ⭐3.5  |   8r  | 🎯❌⚠️📉
14. Tarrytown Dental Group     | ⭐4.8  | 167r  |         
15. Zilker Dental Studio       | ⭐4.3  |  92r  |         
16. Barton Hills Dentist       | ⭐4.1  |  34r  | 🎯      
17. Rosedale Dental Care       | ⭐4.5  | 101r  |         
18. Windsor Park Dental        | ⭐4.0  |  29r  |         
19. Montopolis Dental          | ⭐3.8  |  15r  | ❌📉    
20. East Austin Dentistry      | ⭐4.7  | 178r  |         
```
```

Signals: 🎯=Unclaimed GBP | ❌=No Website | ⚠️=Low Rating | 📉=Few Reviews

💡 Actions:
• `audit <number>` - Analyze a business (e.g., "audit 1")
• `details <number>` - View full details
• `export` - Download as CSV

[📥 View Interactive List →](https://oneclaw.chat/lists/discovery-abc123)
```

---

### User Types: `details 3`

```
**#3: Perfect Teeth**

📂 Category: Dentist
⭐ Rating: 3.9 (23 reviews)

Contact & Location:
🌐 Website: ❌ None found
📞 Phone: (512) 555-3456
📍 Address: 456 Oak St, Austin, TX 78701

Google Business Profile:
🎯 **UNCLAIMED** (Hot Lead!)
🗺️ [View on Google Maps](https://maps.google.com/...)

Lead Quality Signals:
• 🎯 **Unclaimed GBP** - High value opportunity
• ❌ **No website** - Needs digital presence
• 📉 **Few reviews** - Review generation opportunity

Actions:
• `contact 3` - Get contact script
```

---

### User Types: `audit 1`

```
🔍 Running full audit on Smile Dental...

[... audit runs ...]

**Website Audit: Smile Dental**
🌐 https://smiledental.com

Overall Score: 72/100 🟨

Issues Found:
🔴 **Critical (2)**
• Not appearing in AI citations for "dentist in Austin"
• Missing schema markup for LocalBusiness

🟡 **Warnings (5)**
• Page speed could be improved (4.2s load time)
• No blog content for SEO
• Missing service pages for key procedures
• No FAQ schema for voice search
• Mobile usability issues detected

📊 Category Breakdown:
• SEO: 65/100
• AI Visibility: 45/100 ⚠️
• Local Presence: 85/100
• Technical: 75/100

💡 Quick Wins:
1. Add LocalBusiness schema (1 hr, high impact)
2. Create 5 service pages (2 days, high impact)
3. Optimize images (2 hrs, medium impact)

[📄 View Full Report →](https://oneclaw.chat/audits/abc123)
```

---

## Why This Format Works

### 1. Information Density
**Before:** 5 businesses in ~25 lines
**After:** 20 businesses in ~25 lines
**Result:** 4x more information in same space

### 2. Signal Clarity
- 🎯 = **Immediate eye-catcher** for hot leads
- Quick pattern recognition: more emojis = more opportunities
- No need to read details to identify quality

### 3. Progressive Disclosure
```
Quick List → Details View → Full Audit
(1 second)  (5 seconds)   (2 minutes)
```

Users can:
1. Scan entire list instantly
2. Dig into specific businesses
3. Run full audits on best prospects

### 4. Actionable
Every view has clear next steps:
- `details X` - Learn more
- `audit X` - Deep analysis
- `export` - Take data elsewhere

### 5. Mobile Friendly
- Monospace font (`code blocks`) ensures alignment
- Short lines work on small screens
- Emojis are large/visible on mobile

---

## Real Conversation Flow

**User:** `discover dentist Austin, TX`

**Bot:** [Shows 20 businesses in clean list]

**User:** `show hot leads`

**Bot:** 
```
🎯 **5 Hot Leads (Unclaimed GBPs)**

1. Smile Dental                | ⭐4.5  |  89r  | 🎯      
3. Perfect Teeth               | ⭐3.9  |  23r  | 🎯❌📉  
6. Lakeway Dental Care         | ⭐4.7  | 134r  | 🎯      
10. Westlake Dental            | ⭐4.4  |  78r  | 🎯      
13. Brentwood Family Dental    | ⭐3.5  |   8r  | 🎯❌⚠️📉

These businesses don't control their Google listings - prime opportunities!
```

**User:** `details 3`

**Bot:** [Shows detailed breakdown of Perfect Teeth]

**User:** `contact 3`

**Bot:**
```
**Contact Script for Perfect Teeth**

📞 Phone: (512) 555-3456
🎯 **Key Hook:** "I noticed your Google Business Profile is unclaimed..."

**Opening:**
"Hi, I was looking for dentists in Austin and came across Perfect Teeth. 
I noticed something that could be costing you business - your Google 
Business Profile isn't claimed yet. Mind if I explain what that means?"

**Value Points:**
• You're showing up in Google Maps but don't control the listing
• Competitors can see your reviews but you can't respond
• Missing out on Google Search features (booking, messaging, etc.)

**Next Steps:**
• Offer free claim service + optimization
• Show examples of optimized profiles
• Mention other opportunities (website, reviews)

**Close:**
"I help local dentists like you show up better in Google searches. Can we 
schedule a quick 15-minute call to discuss?"
```

---

## Technical Details

### Format Explanation
```typescript
// Each line is exactly 70 characters wide
// This ensures clean alignment in code blocks

const name = business.name.substring(0, 30).padEnd(30);
// "Smile Dental                " (30 chars)

const rating = business.rating 
  ? `⭐${business.rating.toFixed(1)}`.padEnd(6) 
  : '      ';
// "⭐4.5  " (6 chars)

const reviews = business.review_count 
  ? `${business.review_count}r`.padStart(5) 
  : '     ';
// " 89r  " (5 chars)

const signals = ['🎯', '❌', '⚠️', '📉']
  .filter(shouldShow)
  .join('')
  .padEnd(8);
// "🎯      " (8 chars, emojis count as 2)

// Total: 30 + 3 + 6 + 3 + 5 + 3 + 8 = 58 chars
// Plus "1. " prefix and " | " separators = ~70 chars
```

### Color Coding (Future)
Could add ANSI colors or Discord markdown:
```
🎯 = Green (hot lead)
⚠️ = Yellow (warning)
❌ = Red (missing feature)
```

### Sorting Options
Users can request:
- `sort by rating` - Highest rated first
- `sort by reviews` - Most reviewed first
- `sort by opportunity` - Best leads first (unclaimed GBP, no website)
- `filter no website` - Only businesses without sites
- `filter unclaimed` - Only unclaimed GBPs

---

## Implementation Notes

1. **Code blocks are essential** - They preserve monospace formatting
2. **Emoji width** - Count as 2 characters in most fonts
3. **Line length** - Keep under 70 chars for mobile
4. **Padding** - Use `.padEnd()` and `.padStart()` for alignment
5. **Truncation** - Long names get `...` after 27 chars

All implemented in:
- `apps/api/src/workflows/discovery.ts`
- Functions: `formatDiscoveryForChat()`, `formatBusinessDetails()`
