const fs = require('fs');
const path = require('path');
const https = require('https');
const { parse } = require('csv-parse/sync');
const { HttpsProxyAgent } = require('https-proxy-agent');
require('dotenv').config({ path: '.env.production' });

const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;
const GOOGLE_MAPS_API_KEY = process.env.GOOGLE_MAPS_API_KEY;
const APIFY_TOKEN = process.env.APIFY_TOKEN;

// Proxy setup with session rotation
const PROXY_SERVER = "http://proxy.apify.com:8000";

function getProxyAgent() {
  // Add session ID for IP rotation
  const sessionId = `session_${Math.floor(Math.random() * 10000)}`;
  const PROXY_USERNAME = `groups-RESIDENTIAL,country-US,session-${sessionId}`;
  const proxyUrl = `http://${PROXY_USERNAME}:${APIFY_TOKEN}@proxy.apify.com:8000`;
  return new HttpsProxyAgent(proxyUrl);
}

const ANALYSES_DIR = path.join(__dirname, '../.data/website-analyses');
const CHECKPOINT_FILE = path.join(__dirname, '../.data/analyze-missing-checkpoint.json');

// Load checkpoint
let checkpoint = { lastProcessedIndex: -1, completed: [] };
if (fs.existsSync(CHECKPOINT_FILE)) {
  checkpoint = JSON.parse(fs.readFileSync(CHECKPOINT_FILE, 'utf-8'));
}

// Load CSV
const csv = fs.readFileSync('.data/hvac-leads-clean.csv', 'utf-8');
const records = parse(csv, { columns: true });
const withOwner = records.filter(r => r.owner_name && r.owner_name.trim());

// Load existing analyses
const existingAnalyses = fs.readdirSync(ANALYSES_DIR).filter(f => f.endsWith('.json'));
const analyzedNames = new Set(existingAnalyses.map(f => {
  const data = JSON.parse(fs.readFileSync(path.join(ANALYSES_DIR, f), 'utf-8'));
  return data.business_name?.toLowerCase().trim();
}));

// Filter businesses that need analysis
const needsAnalysis = withOwner.filter(r => 
  !analyzedNames.has(r.name.toLowerCase().trim()) &&
  !checkpoint.completed.includes(r.id)
);

console.log('=== WEBSITE ANALYSIS FOR MISSING BUSINESSES ===\n');
console.log(`Total businesses with owner names: ${withOwner.length}`);
console.log(`Already analyzed: ${withOwner.length - needsAnalysis.length}`);
console.log(`Need analysis: ${needsAnalysis.length}`);
console.log(`Starting from index: ${checkpoint.lastProcessedIndex + 1}\n`);

// Sleep helper
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// Fetch with retries
async function fetchWithRetry(url, options, retries = 3) {
  for (let i = 0; i < retries; i++) {
    try {
      const response = await fetch(url, options);
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      return response;
    } catch (error) {
      if (i === retries - 1) throw error;
      console.log(`   Retry ${i + 1}/${retries} after error: ${error.message}`);
      await sleep(2000 * (i + 1));
    }
  }
}

// Scrape website HTML
async function scrapeWebsite(url) {
  try {
    const cleanUrl = url.replace(/^\/url\?q=/, '').split('&')[0];
    const response = await fetchWithRetry(cleanUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.5',
        'Connection': 'keep-alive'
      },
      agent: getProxyAgent(), // Get new proxy for each request
      redirect: 'follow'
    }, 2);

    const html = await response.text();
    
    // Extract relevant content
    const titleMatch = html.match(/<title[^>]*>(.*?)<\/title>/i);
    const title = titleMatch ? titleMatch[1].trim() : '';
    
    // Extract meta descriptions
    const metaMatch = html.match(/<meta[^>]*name=["']description["'][^>]*content=["']([^"']+)["']/i);
    const description = metaMatch ? metaMatch[1] : '';
    
    // Check for schema
    const hasSchema = html.includes('application/ld+json') || html.includes('schema.org');
    const detectedSchemas = [];
    if (html.includes('application/ld+json')) detectedSchemas.push('JSON-LD');
    if (html.includes('schema.org')) detectedSchemas.push('Microdata');
    
    // Extract text content (rough)
    const textContent = html
      .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 5000); // First 5000 chars
    
    return { title, description, textContent, hasSchema, detectedSchemas };
  } catch (error) {
    console.log(`   ❌ Scrape failed: ${error.message}`);
    return null;
  }
}

// Get Google Business Profile
async function getGBP(businessName, city, state) {
  try {
    const query = `${businessName} ${city} ${state}`;
    const url = `https://maps.googleapis.com/maps/api/place/findplacefromtext/json?input=${encodeURIComponent(query)}&inputtype=textquery&fields=place_id,name,rating,user_ratings_total,formatted_address&key=${GOOGLE_MAPS_API_KEY}`;
    
    const response = await fetchWithRetry(url, {}, 2);
    const data = await response.json();
    
    if (data.candidates && data.candidates.length > 0) {
      const place = data.candidates[0];
      return {
        found: true,
        rating: place.rating || null,
        review_count: place.user_ratings_total || null,
        address: place.formatted_address || null
      };
    }
    return { found: false };
  } catch (error) {
    console.log(`   ⚠️ GBP lookup failed: ${error.message}`);
    return { found: false };
  }
}

// Analyze with LLM
async function analyzeWithLLM(business, websiteData, gbpData) {
  const prompt = `You are a CMO analyzing a business for AI Search Optimization (AEO).

Business: ${business.name}
Location: ${business.city}, ${business.state}
Website: ${business.website}
Google Rating: ${gbpData.rating || 'N/A'}⭐ (${gbpData.review_count || 0} reviews)

Website Title: ${websiteData?.title || 'N/A'}
Has Schema: ${websiteData?.hasSchema ? 'Yes' : 'No'}
Schema Types: ${websiteData?.detectedSchemas.join(', ') || 'None'}

${websiteData?.textContent ? `Website Content (sample):\n${websiteData.textContent.slice(0, 2000)}` : 'Website content unavailable'}

Analyze this business for AEO readiness and provide a JSON response with:
1. overall_aeo_score (0-100)
2. aeo_readiness: { score, summary, quick_wins (array of 2-3 actionable items) }
3. gbp_analysis: { score, found, summary, critical_issues }
4. nap_citations: { score, summary, action_items }
5. schema_gaps (array of missing schemas)
6. ai_visibility_gap: { primary_gap, invisible_for, low_hanging_fruit, authority_opportunity }

Return ONLY valid JSON, no markdown.`;

  try {
    const response = await fetchWithRetry('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${OPENROUTER_API_KEY}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'https://oneclaw.chat',
        'X-Title': 'OneClaw AI'
      },
      body: JSON.stringify({
        model: 'minimax/minimax-01',
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.3,
        max_tokens: 4000  // Stay well under 40k limit
      })
    }, 2);

    const data = await response.json();
    
    if (!data.choices || !data.choices[0] || !data.choices[0].message) {
      console.log(`   ❌ Invalid LLM response structure:`, JSON.stringify(data).slice(0, 200));
      return null;
    }
    
    const content = data.choices[0].message.content;
    
    // Extract JSON from markdown if needed
    let jsonStr = content;
    if (content.includes('```json')) {
      jsonStr = content.match(/```json\n([\s\S]*?)\n```/)?.[1] || content;
    } else if (content.includes('```')) {
      jsonStr = content.match(/```\n([\s\S]*?)\n```/)?.[1] || content;
    }
    
    const analysis = JSON.parse(jsonStr);
    
    return {
      ...analysis,
      analyzed_at: new Date().toISOString(),
      lead_id: business.id,
      business_name: business.name,
      website: business.website,
      location: `${business.city}, ${business.state}`,
      page_title: websiteData?.title || 'N/A',
      has_schema: websiteData?.hasSchema || false,
      detected_schemas: websiteData?.detectedSchemas || [],
      gbp_rating: gbpData.rating,
      gbp_review_count: gbpData.review_count,
      gbp_found: gbpData.found
    };
  } catch (error) {
    console.log(`   ❌ LLM analysis failed: ${error.message}`);
    return null;
  }
}

// Main processing
async function processBusinesses() {
  const startIndex = checkpoint.lastProcessedIndex + 1;
  
  for (let i = startIndex; i < needsAnalysis.length; i++) {
    const business = needsAnalysis[i];
    
    console.log(`\n[${i + 1}/${needsAnalysis.length}] ${business.name} (${business.city}, ${business.state})`);
    console.log(`   Owner: ${business.owner_name}`);
    console.log(`   Website: ${business.website || 'N/A'}`);
    
    if (!business.website || business.website === 'N/A') {
      console.log(`   ⏭️  Skipping - no website`);
      checkpoint.completed.push(business.id);
      checkpoint.lastProcessedIndex = i;
      fs.writeFileSync(CHECKPOINT_FILE, JSON.stringify(checkpoint, null, 2));
      continue;
    }
    
    try {
      // Step 1: Scrape website
      console.log(`   📄 Scraping website...`);
      const websiteData = await scrapeWebsite(business.website);
      await sleep(1000);
      
      // Step 2: Get GBP data
      console.log(`   📍 Fetching Google Business Profile...`);
      const gbpData = await getGBP(business.name, business.city, business.state);
      await sleep(1000);
      
      // Step 3: Analyze with LLM (only if we have website data)
      if (!websiteData || !websiteData.textContent) {
        console.log(`   ⏭️  Skipping analysis - no website content`);
        checkpoint.completed.push(business.id);
        checkpoint.lastProcessedIndex = i;
        fs.writeFileSync(CHECKPOINT_FILE, JSON.stringify(checkpoint, null, 2));
        continue;
      }
      
      console.log(`   🤖 Analyzing with LLM...`);
      const analysis = await analyzeWithLLM(business, websiteData, gbpData);
      await sleep(2000);
      
      if (analysis) {
        // Save analysis
        const filename = `${business.id}.json`;
        const filepath = path.join(ANALYSES_DIR, filename);
        fs.writeFileSync(filepath, JSON.stringify(analysis, null, 2));
        console.log(`   ✅ Analysis saved (AEO Score: ${analysis.overall_aeo_score}/100)`);
      }
      
      // Update checkpoint
      checkpoint.completed.push(business.id);
      checkpoint.lastProcessedIndex = i;
      fs.writeFileSync(CHECKPOINT_FILE, JSON.stringify(checkpoint, null, 2));
      
      // Rate limiting - increase delay to avoid 429s
      await sleep(5000);
      
    } catch (error) {
      console.log(`   ❌ Error: ${error.message}`);
      // Save checkpoint and continue
      checkpoint.lastProcessedIndex = i;
      fs.writeFileSync(CHECKPOINT_FILE, JSON.stringify(checkpoint, null, 2));
      await sleep(5000);
    }
  }
  
  console.log(`\n✅ Analysis complete! Processed ${needsAnalysis.length} businesses.`);
  console.log(`📁 Results saved to: ${ANALYSES_DIR}`);
}

// Run
processBusinesses().catch(console.error);
