// Example: Using the new discovery formatting in your Discord bot or API

import { 
  handleDiscoveryWorkflow, 
  formatDiscoveryForChat,
  formatBusinessDetails,
  type DiscoveryResult 
} from './workflows';

// =============================================================================
// Example 1: Discord Bot Command Handler
// =============================================================================

async function handleDiscoverCommand(message: any, args: string[]) {
  // Parse: !discover dentist Austin, TX
  const niche = args[0]; // "dentist"
  const location = args.slice(1).join(' '); // "Austin, TX"
  
  await message.reply('🔍 Searching for businesses...');
  
  // Run discovery workflow
  const result: DiscoveryResult = await handleDiscoveryWorkflow({
    niche,
    location,
    limit: 50
  });
  
  // Format as clean list
  const formatted = formatDiscoveryForChat(result);
  
  // Send to Discord
  await message.reply(formatted);
  
  // Store result for follow-up commands
  userSessions.set(message.author.id, { lastDiscovery: result });
}

// =============================================================================
// Example 2: Handle "details <number>" command
// =============================================================================

async function handleDetailsCommand(message: any, args: string[]) {
  const session = userSessions.get(message.author.id);
  if (!session?.lastDiscovery) {
    return message.reply('❌ Run a discovery search first!');
  }
  
  const index = parseInt(args[0]) - 1; // User types "details 3", we need index 2
  const business = session.lastDiscovery.businesses[index];
  
  if (!business) {
    return message.reply(`❌ Invalid business number. Choose 1-${session.lastDiscovery.businesses.length}`);
  }
  
  // Format detailed view
  const details = formatBusinessDetails(business, index);
  
  await message.reply(details);
}

// =============================================================================
// Example 3: Handle "audit <number>" command
// =============================================================================

async function handleAuditCommand(message: any, args: string[]) {
  const session = userSessions.get(message.author.id);
  if (!session?.lastDiscovery) {
    return message.reply('❌ Run a discovery search first!');
  }
  
  const index = parseInt(args[0]) - 1;
  const business = session.lastDiscovery.businesses[index];
  
  if (!business || !business.website) {
    return message.reply('❌ This business has no website to audit');
  }
  
  await message.reply(`🔍 Running full audit on ${business.name}...`);
  
  // Run audit workflow
  const auditResult = await handleAuditWorkflow({
    url: business.website,
    businessName: business.name,
    locations: [{
      city: business.city || 'Unknown',
      state: business.state || 'Unknown',
      serviceArea: session.lastDiscovery.niche
    }]
  });
  
  // Format and send audit results
  const formatted = formatAuditForChat(auditResult);
  await message.reply(formatted);
}

// =============================================================================
// Example 4: API Endpoint (Next.js)
// =============================================================================

// app/api/chat/route.ts
export async function POST(request: Request) {
  const { message, userId } = await request.json();
  
  // Parse user message
  if (message.startsWith('discover ')) {
    const parts = message.replace('discover ', '').split(' in ');
    const niche = parts[0];
    const location = parts[1];
    
    const result = await handleDiscoveryWorkflow({ niche, location, limit: 50 });
    const formatted = formatDiscoveryForChat(result);
    
    // Store in session for follow-ups
    await storeSession(userId, { lastDiscovery: result });
    
    return Response.json({ reply: formatted });
  }
  
  if (message.startsWith('details ')) {
    const index = parseInt(message.replace('details ', '')) - 1;
    const session = await getSession(userId);
    const business = session.lastDiscovery?.businesses[index];
    
    if (!business) {
      return Response.json({ reply: '❌ Invalid business number' });
    }
    
    const details = formatBusinessDetails(business, index);
    return Response.json({ reply: details });
  }
  
  // ... handle other commands
}

// =============================================================================
// Example 5: Filter for Hot Leads (Unclaimed GBPs)
// =============================================================================

async function showHotLeads(message: any) {
  const session = userSessions.get(message.author.id);
  if (!session?.lastDiscovery) {
    return message.reply('❌ Run a discovery search first!');
  }
  
  // Filter for unclaimed GBPs
  const hotLeads = session.lastDiscovery.businesses
    .map((b, i) => ({ ...b, originalIndex: i }))
    .filter(b => !b.isGbpClaimed && b.place_id);
  
  if (hotLeads.length === 0) {
    return message.reply('✅ All businesses have claimed their Google profiles!');
  }
  
  // Create filtered result
  const filteredResult: DiscoveryResult = {
    ...session.lastDiscovery,
    businesses: hotLeads,
    total_found: hotLeads.length
  };
  
  const formatted = formatDiscoveryForChat(filteredResult);
  await message.reply(`🎯 **${hotLeads.length} Hot Leads (Unclaimed GBPs)**\n\n${formatted}`);
}

// =============================================================================
// Example 6: Export to CSV
// =============================================================================

function exportToCSV(result: DiscoveryResult): string {
  const rows = [
    ['#', 'Name', 'Rating', 'Reviews', 'Website', 'Phone', 'Address', 'GBP Claimed', 'Google Maps URL']
  ];
  
  result.businesses.forEach((b, i) => {
    rows.push([
      String(i + 1),
      b.name,
      b.rating?.toString() || '',
      b.review_count?.toString() || '',
      b.website || '',
      b.phone || '',
      b.address || '',
      b.isGbpClaimed ? 'Yes' : 'No',
      b.googleMapsUrl || ''
    ]);
  });
  
  return rows.map(row => row.map(cell => `"${cell}"`).join(',')).join('\n');
}

async function handleExportCommand(message: any) {
  const session = userSessions.get(message.author.id);
  if (!session?.lastDiscovery) {
    return message.reply('❌ Run a discovery search first!');
  }
  
  const csv = exportToCSV(session.lastDiscovery);
  const buffer = Buffer.from(csv);
  
  await message.reply({
    content: '📥 Here\'s your export:',
    files: [{
      attachment: buffer,
      name: `discovery-${session.lastDiscovery.niche}-${Date.now()}.csv`
    }]
  });
}

// =============================================================================
// Example 7: Sort by Quality Score
// =============================================================================

function calculateQualityScore(business: any): number {
  let score = 0;
  
  // Unclaimed GBP = highest priority
  if (!business.isGbpClaimed && business.place_id) score += 50;
  
  // No website = opportunity
  if (!business.website) score += 30;
  
  // Review count (more = more established)
  if (business.review_count) {
    if (business.review_count > 100) score += 10;
    else if (business.review_count > 50) score += 5;
  }
  
  // Rating penalties
  if (business.rating) {
    if (business.rating < 3.5) score += 20; // Reputation help needed
    else if (business.rating > 4.5) score -= 10; // Already good
  }
  
  return score;
}

async function showTopOpportunities(message: any, limit = 10) {
  const session = userSessions.get(message.author.id);
  if (!session?.lastDiscovery) {
    return message.reply('❌ Run a discovery search first!');
  }
  
  // Sort by quality score
  const scored = session.lastDiscovery.businesses
    .map((b, i) => ({ 
      ...b, 
      originalIndex: i,
      qualityScore: calculateQualityScore(b)
    }))
    .sort((a, b) => b.qualityScore - a.qualityScore)
    .slice(0, limit);
  
  // Format result
  const topResult: DiscoveryResult = {
    ...session.lastDiscovery,
    businesses: scored,
    total_found: scored.length
  };
  
  const formatted = formatDiscoveryForChat(topResult);
  await message.reply(`🏆 **Top ${limit} Opportunities**\n\n${formatted}`);
}

// =============================================================================
// Session Storage (simple in-memory example)
// =============================================================================

const userSessions = new Map<string, {
  lastDiscovery?: DiscoveryResult;
  lastAudit?: any;
}>();

export {
  handleDiscoverCommand,
  handleDetailsCommand,
  handleAuditCommand,
  showHotLeads,
  exportToCSV,
  showTopOpportunities
};
