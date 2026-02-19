# Discovery Output Comparison

## Before (Limited Data)

```typescript
{
  businesses: [
    {
      name: "Smile Dental",
      website: "https://smiledental.com",
      phone: "(512) 555-1234",
      address: "123 Main St, Austin, TX 78701",
      rating: 4.5,
      reviewCount: 89
    }
  ],
  totalFound: 1,
  searchTimeMs: 12500
}
```

**Problems:**
- ❌ No way to identify unclaimed GBPs (biggest opportunity)
- ❌ Can't map results (no coordinates)
- ❌ Can't link directly to Google Maps
- ❌ No business category filtering
- ❌ No visual preview (no images)
- ❌ No unique identifier (can't dedupe)
- ❌ Address not parsed (city/state/zip separate)

---

## After (Rich Data)

```typescript
{
  businesses: [
    {
      // Core info
      name: "Smile Dental",
      category: "Dentist",
      
      // Contact
      website: "https://smiledental.com",
      phone: "(512) 555-1234",
      
      // Location (parsed)
      address: "123 Main St, Austin, TX 78701",
      city: "Austin",
      state: "TX",
      zipCode: "78701",
      latitude: 30.2672,
      longitude: -97.7431,
      
      // Google data
      placeId: "ChIJLwPMoJm1RIYRetVp1EtGm10",
      googleMapsUrl: "https://www.google.com/maps/place/?q=place_id:ChIJLwPMoJm1RIYRetVp1EtGm10",
      rating: 4.5,
      reviewCount: 89,
      
      // 🎯 Critical for lead qualification
      isGbpClaimed: false,  // ← UNCLAIMED! High-value lead
      
      // Visual
      imageUrl: "https://lh3.googleusercontent.com/p/AF1QipM..."
    }
  ],
  totalFound: 1,
  searchTimeMs: 12500
}
```

**Solutions:**
- ✅ **Identify unclaimed GBPs** - `isGbpClaimed === false` = hot lead
- ✅ **Map results** - Use `latitude`/`longitude` for geographic display
- ✅ **Direct linking** - `googleMapsUrl` for one-click navigation
- ✅ **Category filtering** - Filter by `category`
- ✅ **Visual previews** - Show business with `imageUrl`
- ✅ **Unique identification** - Use `placeId` for deduplication
- ✅ **Parsed location** - Separate `city`, `state`, `zipCode` fields

---

## Real-World Use Cases

### 1. Unclaimed GBP Discovery (Highest Value)
```typescript
// Find businesses without claimed Google Business Profiles
const hotLeads = results.businesses.filter(b => !b.isGbpClaimed);

console.log(`Found ${hotLeads.length} unclaimed GBPs out of ${results.businesses.length} total`);
// → "Found 23 unclaimed GBPs out of 50 total"

// Sort by review count (more established = better lead)
const qualifiedLeads = hotLeads
  .filter(b => b.reviewCount && b.reviewCount > 10)
  .sort((a, b) => (b.reviewCount || 0) - (a.reviewCount || 0));
```

### 2. Geographic Mapping
```typescript
// Plot results on map using coordinates
const markers = results.businesses.map(b => ({
  lat: b.latitude,
  lng: b.longitude,
  title: b.name,
  claimed: b.isGbpClaimed,
  rating: b.rating,
  url: b.googleMapsUrl
}));

// Color-code markers: Red = unclaimed, Green = claimed
```

### 3. Category-Based Filtering
```typescript
// Find only specific categories
const hvacOnly = results.businesses.filter(b => 
  b.category?.toLowerCase().includes('hvac') ||
  b.category?.toLowerCase().includes('air conditioning')
);

// Exclude certain categories
const noChains = results.businesses.filter(b => 
  !b.category?.toLowerCase().includes('chain')
);
```

### 4. Distance-Based Sorting
```typescript
// Sort by distance from target location
const targetLat = 30.2672;
const targetLng = -97.7431;

const sorted = results.businesses
  .map(b => ({
    ...b,
    distance: calculateDistance(
      targetLat, targetLng,
      b.latitude, b.longitude
    )
  }))
  .sort((a, b) => a.distance - b.distance);
```

### 5. Rich Display
```typescript
// Show business cards with images
{results.businesses.map(business => (
  <BusinessCard
    name={business.name}
    image={business.imageUrl}
    category={business.category}
    rating={business.rating}
    reviewCount={business.reviewCount}
    claimed={business.isGbpClaimed}
    googleUrl={business.googleMapsUrl}
    phone={business.phone}
    website={business.website}
  />
))}
```

---

## API Usage Example

```bash
curl -X POST http://localhost:9000/execute \
  -H "Content-Type: application/json" \
  -d '{
    "workflowId": "discover-businesses",
    "tenantId": "user_123",
    "input": {
      "niche": "dentist",
      "location": "Austin, TX",
      "limit": 50
    }
  }'
```

Returns full rich data for all 50 businesses including GBP claim status, coordinates, images, and more.

---

## Next Steps

Consider these enhancements based on your Next.js app:

1. **State Normalization** - `normalizeState("Texas") → "TX"`
2. **Address Parsing** - Extract city/state from addresses when not provided
3. **Batch Fetching** - `fetchByPlaceIds()` for efficient multi-business updates
4. **Exclusion Lists** - "Load More" with `excludePlaceIds` to avoid duplicates
5. **Signal Generation** - Calculate initial business signals from discovery data

See `lib/apify/client.ts` in your Next.js app for reference implementations.
