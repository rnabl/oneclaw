# Discovery Workflow Improvements

## Overview
Updated the `discovery.ts` workflow to match the richer data structure from your Next.js app's Apify client, providing comprehensive business data for better lead qualification.

## Key Changes

### 1. Enhanced Apify Result Type (`ApifyGoogleMapsResult`)
**Before:** Only basic fields (placeId, title, address, phone, website, rating, reviewsCount)

**After:** Full comprehensive data structure including:
- Core business info (placeId, title, categoryName, address)
- Location breakdown (street, city, state, postalCode, countryCode)
- Contact details (phone, website)
- Google Maps data (url, location lat/lng)
- Review details (totalScore, reviewsCount, reviewsDistribution)
- Additional metadata (imageUrls, openingHours, additionalInfo)
- **GBP status** (claimThisBusiness - critical for identifying unclaimed businesses)
- Advertisement flag (isAdvertisement)

### 2. Improved Search Configuration
**Before:**
```typescript
searchStringsArray: [`${niche} in ${location}`], // Combined query
```

**After:**
```typescript
searchStringsArray: [niche],    // Just the niche
locationQuery: location,        // Location separate
```

This follows Apify's best practices for more accurate, location-targeted results.

### 3. Enhanced Business Schema
Added new fields to the `BusinessSchema` in `schemas.ts`:
- `city`, `state`, `zipCode` - Parsed location components
- `placeId` - Google Place ID for unique identification
- `category` - Business category from Google
- `googleMapsUrl` - Direct link to Google Maps listing
- `latitude`, `longitude` - Geo coordinates for mapping
- `isGbpClaimed` - **Critical** - indicates if Google Business Profile is claimed
- `imageUrl` - Primary business image

### 4. Better Polling Logic
**Before:**
- Only checked `RUNNING` status
- 2-second poll interval

**After:**
- Checks both `RUNNING` and `READY` statuses
- 5-second poll interval (more stable)
- Tracks both `datasetId` and `defaultDatasetId`
- Uses `defaultDatasetId` as fallback (Apify best practice)
- Better logging with dataset ID tracking

### 5. Enhanced Mock Data
Mock businesses now include all new fields with realistic values:
- Parses location into city/state components
- Generates realistic ZIP codes
- Creates mock Place IDs
- Includes lat/lng coordinates (Austin area)
- Generates random GBP claim status (70% claimed - realistic)
- Includes Picsum photo URLs

### 6. Better Data Transformation
Maps all Apify fields to output:
```typescript
businesses = results.map(r => ({
  name: r.title,
  website: r.website,
  phone: r.phone,
  address: r.address,
  city: r.city,
  state: r.state,
  zipCode: r.postalCode,
  rating: r.totalScore,
  reviewCount: r.reviewsCount ?? undefined,
  placeId: r.placeId,
  category: r.categoryName,
  googleMapsUrl: r.url,
  latitude: r.location?.lat,
  longitude: r.location?.lng,
  isGbpClaimed: !r.claimThisBusiness, // If "claim this business" shows, NOT claimed
  imageUrl: r.imageUrls?.[0],
}));
```

## Business Impact

### Before
Limited data made it hard to qualify leads:
- No GBP claim status (critical indicator)
- No geographic coordinates (can't map)
- No category information
- No direct Google Maps links
- No business images

### After
Rich data enables powerful lead qualification:
- **Identify unclaimed GBPs** - High-value leads (isGbpClaimed)
- **Map businesses** - Show results on interactive maps (lat/lng)
- **Filter by category** - More precise targeting
- **Visual display** - Show business photos (imageUrl)
- **Direct linking** - Quick access to Google Maps listings
- **Location-based sorting** - Find businesses by proximity

## Use Cases Enabled

1. **Unclaimed GBP Discovery** - Filter results where `isGbpClaimed === false`
2. **Geographic Mapping** - Plot results on maps using lat/lng
3. **Category Filtering** - Refine results by specific business types
4. **Visual Previews** - Show business images in results
5. **Quick Navigation** - Link directly to Google Maps profiles
6. **Location Sorting** - Sort by distance from target location

## Configuration

The Apify configuration now includes all minimal scraping settings to save credits:
```typescript
includeWebResults: false,
maxImages: 0,
maximumLeadsEnrichmentRecords: 0,
scrapeContacts: false,
scrapeDirectories: false,
scrapeImageAuthors: false,
scrapePlaceDetailPage: false,
scrapeReviewsPersonalData: false,
scrapeSocialMediaProfiles: { ... all false },
scrapeTableReservationProvider: false,
skipClosedPlaces: false,
```

This keeps costs low while still getting all essential business data.

## Testing

Test the workflow with:
```typescript
await runner.execute('discover-businesses', 'system', {
  niche: 'dentist',
  location: 'Austin, TX',
  limit: 20
});
```

Expected output includes all new fields with real Apify data.

## Next Steps

Consider adding:
1. **State normalization** - Convert "Texas" → "TX" (your Next.js app has this)
2. **Address parsing** - Extract city/state from full address when not provided
3. **Signal generation** - Initial business signals based on discovery data
4. **Batch fetching** - Support for `fetchByPlaceIds` (multiple businesses at once)
5. **Exclusion list** - "Load More" functionality with `excludePlaceIds`

See your Next.js app's `lib/apify/client.ts` for reference implementations.
