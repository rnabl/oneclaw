// Discovery Workflow Handler
// Uses existing @oneclaw/harness discovery workflow with Apify Google Maps

import { runner } from '@oneclaw/harness';

// Re-export types for convenience
export interface DiscoveryParams {
  niche: string;
  location: string;
  limit?: number;
}

export interface Business {
  name: string;
  website?: string;
  phone?: string;
  address?: string;
  city?: string;
  state?: string;
  zipCode?: string;
  rating?: number;
  review_count?: number;
  place_id?: string;
  category?: string;
  googleMapsUrl?: string;
  latitude?: number;
  longitude?: number;
  imageUrl?: string;
  // Enrichment fields
  enriched?: boolean;
  ownerName?: string;
  ownerEmail?: string;
  ownerPhone?: string;
  seoOptimized?: boolean;
  hasAds?: boolean;
  hasSocials?: boolean;
  hasBooking?: boolean;
  hasChatbot?: boolean;
  aiReadable?: boolean;
}

export interface DiscoveryResult {
  niche: string;
  location: string;
  businesses: Business[];
  total_found: number;
  limited_to: number;
  search_time_ms: number;
  list_url?: string;
  source?: string;
}

/**
 * Handle discovery workflow
 * Uses the @oneclaw/harness runner which has the real Apify integration
 */
export async function handleDiscoveryWorkflow(params: Record<string, unknown>): Promise<DiscoveryResult> {
  const { niche, location, limit = 100 } = params as DiscoveryParams;
  
  if (!niche) {
    throw new Error('Missing required parameter: niche');
  }
  
  if (!location) {
    throw new Error('Missing required parameter: location');
  }
  
  console.log(`[discovery] Starting discovery: ${niche} in ${location} (limit: ${limit})`);
  
  const startTime = Date.now();
  
  try {
    // Use the harness runner to execute the registered discovery workflow
    const job = await runner.execute(
      'discover-businesses',
      { niche, location, limit },
      { 
        tenantId: 'system',
        tier: 'pro'
      }
    );
    
    // Job completes synchronously in harness - result is in job.output
    if (job.status !== 'completed' || !job.output) {
      throw new Error(`Discovery workflow failed: ${job.error || 'No output'}`);
    }
    
    const harnessResult = job.output as {
      businesses: Array<{
        name: string;
        website?: string;
        phone?: string;
        address?: string;
        city?: string;
        state?: string;
        zipCode?: string;
        rating?: number;
        reviewCount?: number;
        placeId?: string;
        category?: string;
        googleMapsUrl?: string;
        latitude?: number;
        longitude?: number;
        imageUrl?: string;
      }>;
      totalFound: number;
      searchTimeMs: number;
    };
    
    // Map harness result to our API format (camelCase to snake_case)
    const businesses: Business[] = harnessResult.businesses.map(b => ({
      name: b.name,
      website: b.website,
      phone: b.phone,
      address: b.address,
      city: b.city,
      state: b.state,
      zipCode: b.zipCode,
      rating: b.rating,
      review_count: b.reviewCount, // Convert camelCase to snake_case
      place_id: b.placeId,
      category: b.category,
      googleMapsUrl: b.googleMapsUrl,
      latitude: b.latitude,
      longitude: b.longitude,
      imageUrl: b.imageUrl,
    }));
    
    return {
      niche,
      location,
      businesses,
      total_found: harnessResult.totalFound,
      limited_to: limit,
      search_time_ms: harnessResult.searchTimeMs,
      list_url: `https://oneclaw.chat/lists/discovery-${job.id}`,
      source: 'harness-apify',
    };
    
  } catch (error) {
    console.error('[discovery] Harness workflow failed:', error);
    
    // Fallback: call Apify directly if harness fails
    return await callApifyDirect(niche, location, limit, startTime);
  }
}

/**
 * Direct Apify call as fallback
 */
async function callApifyDirect(
  niche: string,
  location: string,
  limit: number,
  startTime: number
): Promise<DiscoveryResult> {
  const apifyToken = process.env.APIFY_API_TOKEN || process.env.APIFY_API_KEY || process.env.APIFY_TOKEN;
  const actorId = process.env.APIFY_ACTOR_ID || 'compass~crawler-google-places';
  
  if (!apifyToken) {
    console.log('[discovery] No Apify token, returning mock data');
    return getMockResult(niche, location, limit, startTime);
  }
  
  console.log(`[discovery] Calling Apify directly: ${niche} in ${location}`);
  
  try {
    // Start the actor run
    const runResponse = await fetch(
      `https://api.apify.com/v2/acts/${actorId}/runs?token=${apifyToken}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          searchStringsArray: [`${niche} in ${location}`],
          maxCrawledPlacesPerSearch: limit,
          language: 'en',
          maxImages: 0,
          maxReviews: 0,
          includeHistogram: false,
          includeOpeningHours: false,
          includePeopleAlsoSearch: false,
        }),
      }
    );
    
    if (!runResponse.ok) {
      throw new Error(`Apify start failed: ${runResponse.status}`);
    }
    
    const runData = await runResponse.json();
    const runId = runData.data?.id;
    
    if (!runId) {
      throw new Error('No run ID from Apify');
    }
    
    console.log(`[discovery] Apify run started: ${runId}`);
    
    // Poll for completion
    const maxWaitMs = 120000;
    const pollIntervalMs = 3000;
    let elapsed = 0;
    
    while (elapsed < maxWaitMs) {
      await new Promise(resolve => setTimeout(resolve, pollIntervalMs));
      elapsed += pollIntervalMs;
      
      const statusResponse = await fetch(
        `https://api.apify.com/v2/actor-runs/${runId}?token=${apifyToken}`
      );
      const statusData = await statusResponse.json();
      const status = statusData.data?.status;
      
      console.log(`[discovery] Apify status: ${status} (${elapsed}ms)`);
      
      if (status === 'SUCCEEDED') {
        // Get results
        const datasetId = statusData.data?.defaultDatasetId;
        const resultsResponse = await fetch(
          `https://api.apify.com/v2/datasets/${datasetId}/items?token=${apifyToken}&limit=${limit}`
        );
        
        if (!resultsResponse.ok) {
          throw new Error('Failed to fetch results');
        }
        
        const results = await resultsResponse.json();
        
        const businesses: Business[] = results.map((r: any) => ({
          name: r.title || 'Unknown',
          website: r.website || undefined,
          phone: r.phone || undefined,
          address: r.address || undefined,
          rating: r.totalScore || undefined,
          review_count: r.reviewsCount || undefined,
          place_id: r.placeId || undefined,
          category: r.categoryName || undefined,
        }));
        
        return {
          niche,
          location,
          businesses,
          total_found: businesses.length,
          limited_to: limit,
          search_time_ms: Date.now() - startTime,
          list_url: `https://oneclaw.chat/lists/discovery-${Date.now()}`,
          source: 'apify-direct',
        };
      }
      
      if (status === 'FAILED' || status === 'ABORTED' || status === 'TIMED-OUT') {
        throw new Error(`Apify run ${status}`);
      }
    }
    
    throw new Error('Apify run timed out');
    
  } catch (error) {
    console.error('[discovery] Apify direct call failed:', error);
    return getMockResult(niche, location, limit, startTime);
  }
}

/**
 * Mock data fallback
 */
function getMockResult(
  niche: string,
  location: string,
  limit: number,
  startTime: number
): DiscoveryResult {
  console.log('[discovery] Using mock data');
  
  const mockBusinesses: Business[] = [];
  const count = Math.min(limit, 10);
  
  for (let i = 0; i < count; i++) {
    mockBusinesses.push({
      name: `${niche.charAt(0).toUpperCase() + niche.slice(1)} Business ${i + 1}`,
      website: `https://example${i + 1}.com`,
      phone: `(555) 000-${String(i + 1).padStart(4, '0')}`,
      address: `${100 + i} Main St, ${location}`,
      rating: Math.round((3.5 + Math.random() * 1.5) * 10) / 10,
      review_count: Math.floor(Math.random() * 200) + 10,
    });
  }
  
  return {
    niche,
    location,
    businesses: mockBusinesses,
    total_found: mockBusinesses.length,
    limited_to: limit,
    search_time_ms: Date.now() - startTime,
    list_url: `https://oneclaw.chat/lists/discovery-${Date.now()}`,
    source: 'mock',
  };
}

/**
 * Format discovery result for chat display (text version)
 * Table format with business signals - LIMITED TO 10 FOR DISCORD
 */
export function formatDiscoveryForChat(result: DiscoveryResult): string {
  const sourceEmoji = result.source === 'harness-apify' ? '🔥' :
                      result.source === 'apify-direct' ? '📍' : 
                      result.source === 'mock' ? '📋' : '🔍';
  
  let message = `${sourceEmoji} **Found ${result.total_found} ${result.niche} businesses in ${result.location}**\n`;
  message += `_Search completed in ${(result.search_time_ms / 1000).toFixed(1)}s_\n\n`;
  
  // Calculate quick stats
  const ratings = result.businesses.filter(b => b.rating).map(b => b.rating!);
  const avgRating = ratings.length > 0 
    ? (ratings.reduce((a, b) => a + b, 0) / ratings.length).toFixed(1) 
    : 'N/A';
  const withWebsite = result.businesses.filter(b => b.website).length;
  const withPhone = result.businesses.filter(b => b.phone).length;
  
  message += `📊 **Stats:** ⭐${avgRating} | 🌐 ${withWebsite}/${result.total_found} sites | 📞 ${withPhone}/${result.total_found} phones\n\n`;
  
  // LIMIT TO 10 FOR DISCORD (2000 char limit)
  const displayCount = Math.min(10, result.businesses.length);
  
  message += `**Results (showing ${displayCount} of ${result.total_found}):**\n`;
  message += '```\n';
  
  // Compact table header
  message += '#  | Name                | Phone        | Web |\n';
  message += '---|---------------------|--------------|-----|\n';
  
  // Show businesses in compact table format
  for (let i = 0; i < displayCount; i++) {
    const biz = result.businesses[i];
    
    // Column 1: Row number
    const num = String(i + 1).padStart(2);
    
    // Column 2: Name (truncated to 19 chars)
    const name = biz.name.length > 19 
      ? biz.name.substring(0, 16) + '...' 
      : biz.name.padEnd(19);
    
    // Column 3: Phone (truncated to 12 chars)
    const phone = biz.phone 
      ? (biz.phone.length > 12 ? biz.phone.substring(0, 12) : biz.phone.padEnd(12))
      : '---'.padEnd(12);
    
    // Column 4: Has website
    const hasWebsite = biz.website ? ' ✓ ' : ' ✗ ';
    
    message += `${num} | ${name} | ${phone} | ${hasWebsite}|\n`;
  }
  
  message += '```\n';
  
  if (result.businesses.length > displayCount) {
    message += `\n_+ ${result.businesses.length - displayCount} more businesses (type \`more\` to see next 10)_\n`;
  }
  
  // Action buttons
  message += `\n💡 **Actions:**\n`;
  message += `• \`enrich <#>\` - Get owner info + signals\n`;
  message += `• \`details <#>\` - Full business info\n`;
  message += `• \`export\` - Download CSV\n`;
  
  if (result.list_url) {
    message += `\n[📥 Full List →](${result.list_url})`;
  }
  
  return message;
}

/**
 * Format discovery result as Discord embed (for richer display)
 * Uses Discord's rich embed format with full signal table
 */
export function formatDiscoveryAsEmbed(result: DiscoveryResult): object {
  const businesses = result.businesses.slice(0, 10);
  
  // Calculate stats
  const ratings = result.businesses.filter(b => b.rating).map(b => b.rating!);
  const avgRating = ratings.length > 0 
    ? (ratings.reduce((a, b) => a + b, 0) / ratings.length).toFixed(1) 
    : 'N/A';
  const withWebsite = result.businesses.filter(b => b.website).length;
  const withPhone = result.businesses.filter(b => b.phone).length;
  
  // Build list text with phone numbers next to business names
  let listItems: string[] = [];
  
  for (let i = 0; i < businesses.length; i++) {
    const biz = businesses[i];
    // Use actual index if provided (for pagination), otherwise use i
    const num = (biz._actualIndex !== undefined ? biz._actualIndex : i) + 1;
    
    // Truncate business name to 20 chars max
    let bizName = biz.name.length > 20 ? biz.name.substring(0, 17) + '...' : biz.name;
    
    // Format phone nicely
    let phoneFormatted = '';
    if (biz.phone) {
      const phone = biz.phone.replace(/\D/g, '');
      const shortPhone = phone.length >= 10 ? phone.slice(-10) : phone;
      phoneFormatted = shortPhone.length === 10 
        ? `(${shortPhone.slice(0,3)}) ${shortPhone.slice(3,6)}-${shortPhone.slice(6)}`
        : shortPhone;
    }
    
    // First line: Business Name | Phone Number
    const firstLine = phoneFormatted 
      ? `**${num}. ${bizName}** | ${phoneFormatted}`
      : `**${num}. ${bizName}**`;
    
    // Create clickable website link if exists (no "Web:" label)
    let websiteLink = '✗';
    if (biz.website) {
      try {
        const domain = new URL(biz.website.startsWith('http') ? biz.website : `https://${biz.website}`).hostname.replace('www.', '');
        websiteLink = `[${domain}](${biz.website.startsWith('http') ? biz.website : `https://${biz.website}`})`;
      } catch {
        websiteLink = '✓';
      }
    }
    
    // Build signals line (removed "Web:" label)
    const signals = `${websiteLink} | SEO: ${biz.seoOptimized ? '✓' : '?'} | Ads: ${biz.hasAds ? '✓' : '?'} | Cal: ${biz.hasBooking ? '✓' : '?'} | Bot: ${biz.hasChatbot ? '✓' : '?'} | AI: ${biz.aiReadable ? '✓' : '?'}`;
    
    const item = `${firstLine}\n   ${signals}`;
    listItems.push(item);
  }
  
  // Split into chunks that fit Discord's 1024 char limit per field
  const fields: Array<{ name: string; value: string; inline: boolean }> = [];
  let currentChunk: string[] = [];
  let currentLength = 0;
  
  for (const item of listItems) {
    const itemLength = item.length + 2; // +2 for \n\n
    
    if (currentLength + itemLength > 1000) { // 1000 to leave some buffer
      // Save current chunk
      fields.push({
        name: fields.length === 0 ? `📋 Results (showing ${businesses.length} of ${result.total_found})` : '📋 (continued)',
        value: currentChunk.join('\n\n'),
        inline: false,
      });
      currentChunk = [item];
      currentLength = itemLength;
    } else {
      currentChunk.push(item);
      currentLength += itemLength;
    }
  }
  
  // Add remaining chunk
  if (currentChunk.length > 0) {
    fields.push({
      name: fields.length === 0 ? `📋 Results (showing ${businesses.length} of ${result.total_found})` : '📋 (continued)',
      value: currentChunk.join('\n\n'),
      inline: false,
    });
  }
  
  return {
    embeds: [{
      title: `🔍 Found ${result.total_found} ${result.niche} businesses`,
      description: `**Location:** ${result.location}\n**Search time:** ${(result.search_time_ms / 1000).toFixed(1)}s\n**Source:** ${result.source || 'discovery'}`,
      color: 0x5865F2, // Discord Blurple
      fields: [
        {
          name: '📊 Quick Stats',
          value: `⭐ Avg: ${avgRating} | 🌐 Sites: ${withWebsite}/${result.total_found} | 📞 Phones: ${withPhone}/${result.total_found}`,
          inline: false,
        },
        ...fields, // Spread the result fields (may be multiple if list is long)
        {
          name: '💡 Next Steps',
          value: `Type \`more\` to see next ${Math.min(10, result.total_found - businesses.length)} businesses\nType \`enrich\` to analyze all websites ($5)`,
          inline: false,
        },
      ],
      footer: {
        text: `OneClaw Discovery${(result as any)._pagination ? ` • Page ${(result as any)._pagination.current}/${(result as any)._pagination.total}` : result.businesses.length < result.total_found ? ` • Showing 1-${businesses.length} of ${result.total_found} (type "more")` : ` • ${result.total_found} results`}`,
        icon_url: 'https://cdn.discordapp.com/emojis/1234567890.png', // Optional: Add your bot icon
      },
      timestamp: new Date().toISOString(),
    }],
    // Buttons work via Discord Interactions endpoint
    components: [{
      type: 1, // Action Row
      components: [
        {
          type: 2, // Button
          style: 5, // Link button
          label: 'Full List',
          url: result.list_url || 'https://oneclaw.chat',
          emoji: { name: '🔗' }
        },
      ],
    }],
  };
}

/**
 * Format a single business with full details
 * Use when user requests "details <number>"
 */
export function formatBusinessDetails(business: Business, index: number): string {
  let message = `**#${index + 1}: ${business.name}**\n\n`;
  
  // Core info
  if (business.category) {
    message += `📂 **Category:** ${business.category}\n`;
  }
  if (business.rating) {
    message += `⭐ **Rating:** ${business.rating.toFixed(1)}`;
    if (business.review_count) {
      message += ` (${business.review_count} reviews)`;
    }
    message += '\n';
  }
  
  // Contact & Location
  message += '\n**Contact & Location:**\n';
  if (business.website) {
    message += `🌐 Website: ${business.website}\n`;
  } else {
    message += `🌐 Website: ❌ None found\n`;
  }
  if (business.phone) {
    message += `📞 Phone: ${business.phone}\n`;
  }
  if (business.address) {
    message += `📍 Address: ${business.address}\n`;
  }
  
  // Google Business Profile Status
  message += '\n**Google Business Profile:**\n';
  if (business.place_id) {
    const claimStatus = business.isGbpClaimed ? '✅ Claimed' : '🎯 **UNCLAIMED** (Hot Lead!)';
    message += `${claimStatus}\n`;
    if (business.googleMapsUrl) {
      message += `🗺️ [View on Google Maps](${business.googleMapsUrl})\n`;
    }
  } else {
    message += `❌ No Google listing found\n`;
  }
  
  // Lead Quality Signals
  message += '\n**Lead Quality Signals:**\n';
  const signals: string[] = [];
  
  if (!business.isGbpClaimed && business.place_id) {
    signals.push('🎯 **Unclaimed GBP** - High value opportunity');
  }
  if (!business.website) {
    signals.push('❌ **No website** - Needs digital presence');
  }
  if (business.rating && business.rating < 3.5) {
    signals.push('⚠️ **Low rating** - Reputation management needed');
  }
  if (business.review_count && business.review_count < 10) {
    signals.push('📉 **Few reviews** - Review generation opportunity');
  }
  if (business.website && !business.website.startsWith('https')) {
    signals.push('🔓 **No HTTPS** - Security upgrade needed');
  }
  
  if (signals.length > 0) {
    signals.forEach(s => message += `• ${s}\n`);
  } else {
    message += '✨ Well-established online presence\n';
  }
  
  // Quick actions
  message += '\n**Actions:**\n';
  if (business.website) {
    message += `• \`audit ${business.website}\` - Run full website audit\n`;
  }
  message += `• \`contact ${index + 1}\` - Get contact script\n`;
  
  return message;
}
