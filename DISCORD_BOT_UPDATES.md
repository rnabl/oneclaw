# Discord Bot Updates - Rich Embeds & Button Interactions

## ✅ Completed Changes

### 1. **Compact Table Format**
- Combined business name and phone number in one column: `Business (Phone)`
- Format: `Business Name (720) 123-4567`
- Added all signal columns: Web, SEO, Ads, Cal (Calendar), Bot (Chatbot), AI (AI Readable)
- Removed Soc (Socials) to save space
- Shows 10 businesses per page

### 2. **Rich Discord Embeds**
- Converted from plain text to Discord's rich embed format
- Discord Blurple color (`0x5865F2`)
- Structured fields:
  - **Quick Stats**: Average rating, websites, phones
  - **Results Table**: Formatted in code block with all columns
  - **Signal Key**: Explains ✓ (Yes), ✗ (No), ? (Unknown)
  - **Actions**: Command hints for enrich, details, export
- Footer with timestamp and pagination hint

### 3. **Interactive Buttons**
- **Export CSV** button (blue primary) - Shows "coming soon" message
- **Show More** button (gray secondary) - Shows "coming soon" message, disabled if ≤10 results
- **Full List** link button - Links to full results page
- Button interactions are acknowledged with ephemeral messages

### 4. **Apify Configuration Fixed**
Added missing fields from working config:
```javascript
searchMatching: 'all',
placeMinimumStars: '',
website: 'allPlaces',
maxQuestions: 0,
maxReviews: 0,
reviewsSort: 'newest',
reviewsFilterString: '',
reviewsOrigin: 'all',
allPlacesNoSearchAction: '',
```

## 📋 Files Modified

1. **`apps/api/src/workflows/discovery.ts`**
   - Updated `formatDiscoveryAsEmbed()` with compact table format
   - Combined name + phone in single column with proper formatting
   - Added all signal columns (Web, SEO, Ads, Cal, Bot, AI)

2. **`apps/api/src/services/discord-bot.ts`**
   - Added `INTERACTION_CREATE` event handler
   - Implemented `handleInteraction()` method
   - Added button handlers: `handleExportButton()`, `handleMoreButton()`
   - Added `editInteractionResponse()` for interaction follow-ups
   - Updated message handler to detect and send embeds

3. **`packages/harness/src/apify/client.ts`**
   - Added missing Apify actor input fields
   - Matches working configuration that returns review counts

## 🎯 How to Test

### In Discord:
```
find me med spas in boulder, co
```

### Expected Output:
- Rich embed with Discord Blurple color
- Table showing businesses with phone numbers inline
- All signal columns visible (Web, SEO, Ads, Cal, Bot, AI)
- Three interactive buttons at the bottom
- Quick stats showing average rating, website count, phone count

### Button Interactions:
- Click **Export CSV**: Shows "CSV export is coming soon!" (ephemeral)
- Click **Show More**: Shows "Pagination is coming soon!" (ephemeral)
- Click **Full List**: Opens link to full results

## 📊 Table Format Example
```
# | Business (Phone)          | Web | SEO | Ads | Cal | Bot | AI |
--|---------------------------|-----|-----|-----|-----|-----|----| 
1 | Aspire Medical... (720... | ✓  | ?  | ?  | ?  | ?  | ? |
2 | 4Ever Young Med... (720.. | ✓  | ?  | ?  | ?  | ?  | ? |
```

## 🔜 Next Steps

### To Fully Implement Buttons:
1. **Export CSV**: Generate and upload CSV file, return download link
2. **Show More**: Implement pagination with offset/limit
3. **Store search context**: Save search params to handle "more" requests

### To Add Real Signals:
1. Implement enrichment workflow that checks:
   - SEO optimization (meta tags, structure)
   - Running ads (Google Ads API)
   - Calendar booking (Calendly, Acuity detection)
   - Chatbot (common chatbot script detection)
   - AI readability (structured data, schema.org)
2. Update `BusinessSchema` with real values instead of `?`

## 🚀 Server Status
- ✅ Discord bot connected
- ✅ WebSocket active
- ✅ Port 3000 running
- ✅ Embed format working
- ✅ Button interactions acknowledged

## 📝 Notes
- Buttons show "coming soon" messages - not yet fully functional for CSV export or pagination
- Signal columns show `?` for unknowns - need enrichment workflow
- Review counts should now appear (Apify config fixed)
- Table is compact and fits Discord's character limits
