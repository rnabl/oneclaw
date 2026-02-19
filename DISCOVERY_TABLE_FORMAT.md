# Discovery Output - New Table Format

## What You'll See in Discord

When you type: `find dentist in Austin, TX`

```
🔥 Found 20 dentist businesses in Austin, TX
Search completed in 45.2s

📊 Quick Stats: ⭐ 4.2 avg | 🌐 15/20 websites | 📞 18/20 phones

Results (20 total):
```
#  | Name                      | Phone         | Web | SEO | Ads | Soc | Cal | Bot | AI  | Action
---|---------------------------|---------------|-----|-----|-----|-----|-----|-----|-----|-------
 1 | Smile Dental Center       | (512)555-1234 |  ✓  |  ?  |  ?  |  ?  |  ?  |  ?  |  ?  | enrich
 2 | Austin Family Dentistry   | (512)555-2345 |  ✓  |  ?  |  ?  |  ?  |  ?  |  ?  |  ?  | enrich
 3 | Perfect Teeth             | ---           |  ✗  |  ?  |  ?  |  ?  |  ?  |  ?  |  ?  | enrich
 4 | Downtown Dental           | (512)555-4567 |  ✓  |  ?  |  ?  |  ?  |  ?  |  ?  |  ?  | enrich
 5 | Bright Smiles Dentistry   | (512)555-5678 |  ✓  |  ?  |  ?  |  ?  |  ?  |  ?  |  ?  | enrich
...
```

Signals: ✓=Yes | ✗=No | ?=Unknown (needs enrichment)
• **Web** = Website exists
• **SEO** = SEO optimized (title, meta, schema)
• **Ads** = Running ads (Google/Facebook)
• **Soc** = Social media presence
• **Cal** = Calendar/booking system
• **Bot** = Chatbot installed
• **AI** = AI-readable (schema markup)

💡 **Actions:**
• `enrich <number>` - Fetch owner info + deep signals (e.g., "enrich 1")
• `audit <number>` - Full website audit
• `details <number>` - View all details
• `export` - Download as CSV
```

---

## What Changed

### ✅ Fixed Issues

1. **Phone numbers now shown** - Visible in table for quick contact
2. **Count is accurate** - Shows "Results (20 total)" from Apify
3. **New signals added** - Web, SEO, Ads, Soc, Cal, Bot, AI columns
4. **Removed fake isGbpClaimed** - Was showing wrong data, removed until enrichment
5. **Added enrich action** - Last column links to fetch owner info + signals

### 📊 Table Columns

| Column | Description | Status |
|--------|-------------|--------|
| # | Row number | ✅ Working |
| Name | Business name (25 chars) | ✅ Working |
| Phone | Phone number (13 chars) | ✅ Working |
| Web | Website exists | ✅ Working (from Apify) |
| SEO | SEO optimized | ⏳ Needs enrichment |
| Ads | Running ads | ⏳ Needs enrichment |
| Soc | Social media | ⏳ Needs enrichment |
| Cal | Booking system | ⏳ Needs enrichment |
| Bot | Chatbot exists | ⏳ Needs enrichment |
| AI | AI-readable | ⏳ Needs enrichment |
| Action | enrich link | ✅ Working |

---

## Enrichment Workflow (Next Step)

When user types: `enrich 3`

The system will:
1. Take business #3 (Perfect Teeth)
2. Run deep analysis on their website
3. Check for:
   - **Owner info** (name, email, phone from WHOIS/LinkedIn/etc)
   - **SEO** - Title tags, meta descriptions, schema markup
   - **Ads** - Check Google Ads, Facebook Ads Library
   - **Socials** - Find Facebook, Instagram, LinkedIn pages
   - **Calendar** - Detect Calendly, Acuity, custom booking
   - **Chatbot** - Find Intercom, Drift, custom chat widgets
   - **AI** - Check for proper schema.org markup
4. Update the table with ✓ or ✗ for each signal
5. Return owner contact info for outreach

### Example Enriched Response

```
🔍 **Enriched: Perfect Teeth**

👤 **Owner/Decision Maker:**
• Name: Dr. Sarah Johnson
• Email: sjohnson@perfectteeth.com
• Phone: (512) 555-9876 (direct)
• LinkedIn: linkedin.com/in/drsarahjohnson

🌐 **Digital Presence:**
Website      | ✗ NO - Domain not claimed
SEO          | ✗ NO - No website to optimize
Ads          | ✗ NO - Not running any ads  
Social Media | ✓ YES - Facebook (2.3K followers), Instagram (890)
Calendar     | ✗ NO - No online booking
Chatbot      | ✗ NO - No chat system
AI-Readable  | ✗ NO - No website

💰 **Opportunity Score: 95/100** ⭐⭐⭐⭐⭐

🎯 **Key Opportunities:**
1. Build website + claim domain
2. Set up online booking (huge for dental)
3. Add chatbot for after-hours questions
4. Implement local SEO (they have good socials)
5. Start Google Ads campaign

📞 **Contact Script:**
"Hi Dr. Johnson, I found Perfect Teeth on Google and noticed you have great social media 
but no website. Your competitors with websites are getting 3x more bookings. 
Can we schedule a quick call to discuss?"
```

---

## Technical Notes

### Current Data Flow

```
User types command
    ↓
Discord Bot → parseIntent()
    ↓
runner.execute('discover-businesses', { niche, location, limit })
    ↓
Harness → Apify Google Maps Scraper
    ↓
Returns: name, phone, website, address, rating, reviews, place_id, category
    ↓
formatDiscoveryForChat() → Table with Web column ✓/✗
    ↓
Shows "?" for SEO/Ads/Soc/Cal/Bot/AI (needs enrichment)
    ↓
User types: enrich <number>
    ↓
[TODO] Run enrichment workflow on that business
```

### Enrichment Workflow (To Build)

```typescript
// apps/api/src/workflows/enrich.ts
export async function enrichBusiness(business: Business): Promise<EnrichedBusiness> {
  const enriched = { ...business, enriched: true };
  
  // 1. Website Analysis (if exists)
  if (business.website) {
    const seo = await analyzeSEO(business.website);
    enriched.seoOptimized = seo.hasTitle && seo.hasMeta && seo.hasSchema;
    enriched.hasBooking = detectBookingSystem(business.website);
    enriched.hasChatbot = detectChatbot(business.website);
    enriched.aiReadable = seo.hasSchema && seo.hasLocalBusinessMarkup;
  }
  
  // 2. Ads Detection
  enriched.hasAds = await checkAds(business.name, business.website);
  
  // 3. Social Media
  enriched.hasSocials = await findSocialProfiles(business.name, business.city, business.state);
  
  // 4. Owner Info (WHOIS, LinkedIn, etc)
  const owner = await findOwnerInfo(business);
  enriched.ownerName = owner.name;
  enriched.ownerEmail = owner.email;
  enriched.ownerPhone = owner.phone;
  
  return enriched;
}
```

---

## What to Test in Discord

1. **Basic Discovery:**
   ```
   find dentist in Austin, TX
   ```
   Should show table with phone numbers and Web column

2. **No Website Detection:**
   Look for businesses with ✗ in Web column (high-value leads!)

3. **Phone Numbers:**
   Verify all phone numbers are visible and properly formatted

4. **Count Accuracy:**
   Check that "Results (X total)" matches actual rows

5. **Future: Enrichment**
   ```
   enrich 3
   ```
   (Will build this next - returns owner info + all signals)

---

## Benefits of Table Format

✅ **More Data Visible** - Phone, website, 7 signals all in one view
✅ **Quick Scanning** - See patterns at a glance (who has websites, phones, etc)
✅ **Action-Oriented** - "enrich" link in last column for next step
✅ **Mobile-Friendly** - Code block preserves table alignment
✅ **Scalable** - Works with 10 or 100 businesses
✅ **Clear Gaps** - "?" shows exactly what needs enrichment
