# Discovery Output - New Clean Format

## Before (Verbose, Multi-line)
```
🔥 Found 20 dentist businesses in Austin, TX
Search completed in 12.5s

📊 Quick Stats
• Avg Rating: ⭐ 4.2
• With Website: 15/20

Top Results:

**1. Smile Dental** ⭐4.5 (89)
   🌐 https://smiledental.com
   📞 (512) 555-1234

**2. Austin Family Dentistry** ⭐4.8 (156)
   🌐 https://austinfamilydentistry.com
   📞 (512) 555-2345

**3. Perfect Teeth** ⭐3.9 (23)
   📞 (512) 555-3456

**4. Downtown Dental** ⭐4.6 (201)
   🌐 https://downtowndental.com
   📞 (512) 555-4567

**5. Bright Smiles** ⭐4.3 (67)
   🌐 https://brightsmiles.com

...and 15 more results

💡 Next steps:
• Say "audit [website]" to analyze any of these
• Say "export" to download as CSV
```

**Problems:**
- Takes up too much vertical space
- Hard to scan multiple businesses quickly
- Can only show 5 businesses before it's too long
- No signal indicators at a glance

---

## After (Clean, One-line Format) ✨

```
🔥 Found 20 dentist businesses in Austin, TX
Search completed in 12.5s

📊 Quick Stats: ⭐ 4.2 avg | 🌐 15 websites | 🎯 5 unclaimed GBPs

Results:
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

Signals: 🎯=Unclaimed GBP | ❌=No Website | ⚠️=Low Rating | 📉=Few Reviews

💡 Actions:
• `audit <number>` - Analyze a business (e.g., "audit 1")
• `details <number>` - View full details
• `export` - Download as CSV
```

**Improvements:**
- ✅ Shows ALL 20 businesses in compact space
- ✅ Easy to scan - one line per business
- ✅ Signal indicators show problems at a glance
- ✅ 🎯 emoji immediately highlights hot leads (unclaimed GBPs)
- ✅ Takes 50% less vertical space
- ✅ Professional, clean look
- ✅ Quick actions with simple commands

---

## Detailed View (When User Requests)

User types: `details 3`

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
🗺️ View on Google Maps

Lead Quality Signals:
• 🎯 **Unclaimed GBP** - High value opportunity
• ❌ **No website** - Needs digital presence
• 📉 **Few reviews** - Review generation opportunity

Actions:
• `contact 3` - Get contact script
```

---

## Benefits

### For Users
1. **Faster Scanning** - See 4x more businesses in same space
2. **Instant Qualification** - Signals show lead quality at a glance
3. **Hot Leads Stand Out** - 🎯 emoji draws eye to unclaimed GBPs
4. **Simple Commands** - `audit 1`, `details 3`, `export`

### For Conversion
1. **Higher Engagement** - Users see more opportunities
2. **Clear CTAs** - Easy to take next action
3. **Progressive Disclosure** - Quick list → detailed view → full audit
4. **Value Demonstration** - Signals show expertise immediately

### For Scale
1. **Works with ANY list size** - 10 or 100 businesses
2. **Code block formatting** - Clean in Discord/Slack/etc
3. **Mobile friendly** - Monospace formatting works on mobile
4. **Copy-pasteable** - Easy to share/export

---

## Signal Legend

| Signal | Meaning | Why It Matters |
|--------|---------|----------------|
| 🎯 | Unclaimed GBP | **HOT LEAD** - They don't control their Google listing |
| ❌ | No Website | Need digital presence - easy upsell |
| ⚠️ | Low Rating (<3.5) | Reputation management opportunity |
| 📉 | Few Reviews (<10) | Review generation service opportunity |
| _(none)_ | Healthy presence | Still valuable for other services |

---

## Implementation

The new format is in `apps/api/src/workflows/discovery.ts`:

- **`formatDiscoveryForChat()`** - Main list view (shown above)
- **`formatBusinessDetails()`** - Detailed view for single business

Both functions use the rich data from the improved discovery workflow:
- `isGbpClaimed` - Critical for lead qualification
- `rating`, `review_count` - Quality indicators
- `website` - Digital presence check
- `place_id`, `googleMapsUrl` - Direct linking
