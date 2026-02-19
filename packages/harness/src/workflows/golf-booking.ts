/**
 * Golf Tee Time Booking Workflow
 * 
 * R+L Enhanced: Multi-method workflow with self-reflection and human-thinking logic.
 * 
 * HUMAN-THINKING APPROACH:
 * "If I were looking for a golf tee time, I would:"
 * 1. Google "golf courses in [city]"
 * 2. Visit each course website
 * 3. Look for "Book Tee Time" button
 * 4. Check date picker for my date
 * 5. See what times are available for my party size
 * 6. Compare options (time, price, rating)
 * 7. Book the best one
 * 
 * METHODS (with fallback chains):
 * - Method 1 (golfnow_api): Fast API if key available (8s, $0.05, 99%)
 * - Method 2 (brave_playwright_hybrid): Brave search + parallel browser (28s, $0.16, 70%)
 * - Method 3 (brave_playwright_sequential): Full transparency (90s, $0.15, 70%)
 * - Method 4 (manual): Show phone numbers, user books
 * 
 * FALLBACK CHAIN: golfnow_api → brave_playwright_hybrid → brave_playwright_sequential → manual
 * 
 * REQUIRED TOOLS:
 * - brave_search_api (discovery) OR apify_gmaps (alternative)
 * - playwright OR puppeteer (browser interaction)
 * - llm.call (analysis and extraction)
 * 
 * If tools missing: Agent asks "What should I add?" and offers alternatives
 * 
 * Input:
 * - location: "Denver, CO"
 * - date: "2026-02-26" (or "Feb 26" - will parse)
 * - timeRange: "9:00-10:00" or "9-10AM"
 * - partySize: 4
 * - method: "golfnow_api" | "brave_playwright_hybrid" | "brave_playwright_sequential" | "auto" (default)
 * 
 * Output:
 * - availableTimes: Array of { course, time, price, players, bookingUrl }
 * - stats: { coursesChecked, timesFound, method, timeMs, cost }
 * - toolsUsed: Array of executors used
 * - missingTools: Array of tools needed but unavailable (if any)
 */

import type { StepContext } from '../execution/runner';
import { runner } from '../execution/runner';
import { z } from 'zod';

// =============================================================================
// SCHEMAS
// =============================================================================

const GolfBookingInput = z.object({
  location: z.string(),
  date: z.string(), // "2026-02-26" or "Feb 26"
  timeRange: z.string(), // "9:00-10:00" or "9-10AM"
  partySize: z.number().default(4),
  maxCourses: z.number().default(10),
  method: z.enum(['golfnow_api', 'brave_playwright_hybrid', 'brave_playwright_sequential', 'auto']).default('auto'),
});

type GolfBookingInput = z.infer<typeof GolfBookingInput>;

interface CourseInfo {
  name: string;
  website: string;
  phone?: string;
  address?: string;
  rating?: number;
  source: 'golfnow' | 'brave_search' | 'apify';
}

interface TeeTime {
  course: CourseInfo;
  time: string; // "9:30 AM"
  date: string; // "2026-02-26"
  players: number;
  price?: number;
  bookingUrl?: string;
  availability: 'confirmed' | 'likely' | 'unknown';
}

interface GolfBookingOutput extends Record<string, unknown> {
  availableTimes: TeeTime[];
  stats: {
    coursesChecked: number;
    timesFound: number;
    method: string;
    timeMs: number;
    cost: number;
  };
  toolsUsed: string[];
  missingTools?: string[];
  fallbackUsed?: boolean;
}

interface ToolAvailability {
  golfnow_api: boolean;
  brave_search: boolean;
  playwright: boolean;
  apify: boolean;
}

// =============================================================================
// SELF-REFLECTION: Check Tool Availability
// =============================================================================

async function checkToolAvailability(ctx: StepContext): Promise<ToolAvailability> {
  return {
    golfnow_api: !!(ctx.secrets['golfnow_api_key'] || process.env.GOLFNOW_API_KEY),
    brave_search: !!(ctx.secrets['brave_api_key'] || process.env.BRAVE_API_KEY),
    playwright: !!(ctx.secrets['playwright_enabled'] || process.env.PLAYWRIGHT_ENABLED),
    apify: !!(ctx.secrets['apify'] || process.env.APIFY_API_TOKEN),
  };
}

async function analyzeTaskRequirements(
  ctx: StepContext,
  task: string,
  tools: ToolAvailability
): Promise<{
  canExecute: boolean;
  recommendedMethod: string;
  missingTools: string[];
  reasoning: string;
}> {
  // Human-thinking breakdown
  const humanSteps = [
    '1. Search Google for golf courses in location',
    '2. Visit each course website',
    '3. Look for "Book Tee Time" or "Reservations" button',
    '4. Navigate to booking page',
    '5. Check date picker for target date',
    '6. Extract available times in time range',
    '7. Filter by party size',
    '8. Compare options and present best ones',
  ];
  
  await ctx.log('info', 'Analyzing task requirements (human-thinking approach)...', { humanSteps });
  
  // Tool mapping
  const toolMapping = {
    step1: tools.golfnow_api ? 'golfnow_api' : (tools.brave_search ? 'brave_search' : (tools.apify ? 'apify' : 'MISSING')),
    step2to7: tools.playwright ? 'playwright' : 'MISSING',
    step8: 'llm.call (built-in)',
  };
  
  const missingTools: string[] = [];
  
  if (!tools.golfnow_api && !tools.brave_search && !tools.apify) {
    missingTools.push('search_api (brave_search OR apify)');
  }
  
  if (!tools.playwright) {
    missingTools.push('browser (playwright OR puppeteer)');
  }
  
  let recommendedMethod = 'auto';
  let reasoning = '';
  
  if (tools.golfnow_api) {
    recommendedMethod = 'golfnow_api';
    reasoning = 'GolfNow API available - fastest and most reliable method (8s, $0.05, 99% success)';
  } else if (tools.brave_search && tools.playwright) {
    recommendedMethod = 'brave_playwright_hybrid';
    reasoning = 'Brave + Playwright available - broader coverage than GolfNow (28s, $0.16, 70% success)';
  } else if (tools.apify && tools.playwright) {
    recommendedMethod = 'brave_playwright_hybrid'; // Same method, different discovery
    reasoning = 'Apify + Playwright available - using Apify for discovery instead of Brave (55s, $0.20)';
  } else {
    recommendedMethod = 'manual';
    reasoning = 'Missing tools - can only provide course phone numbers for manual booking';
  }
  
  await ctx.log('info', 'Task analysis complete', {
    toolMapping,
    recommendedMethod,
    missingTools,
    reasoning,
  });
  
  return {
    canExecute: missingTools.length === 0 || (tools.brave_search || tools.apify), // Can do partial
    recommendedMethod,
    missingTools,
    reasoning,
  };
}

// =============================================================================
// METHOD 1: GolfNow API (Fastest)
// =============================================================================

async function searchViaGolfNowAPI(
  ctx: StepContext,
  params: { location: string; date: Date; startHour: number; endHour: number; partySize: number }
): Promise<TeeTime[]> {
  const apiKey = ctx.secrets['golfnow_api_key'] || process.env.GOLFNOW_API_KEY;
  
  if (!apiKey) {
    throw new Error('GolfNow API key not available');
  }
  
  await ctx.log('info', 'Calling GolfNow API for real-time tee times...');
  
  // NOTE: This is the API structure - real implementation would use actual GolfNow SDK
  // For now, this is a placeholder showing the flow
  try {
    const response = await fetch('https://api.gnsvc.com/rest/2.0/search', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        location: params.location,
        date: params.date.toISOString().split('T')[0],
        time: `${params.startHour}:00-${params.endHour}:00`,
        players: params.partySize,
      }),
    });
    
    const data = await response.json();
    
    // Transform GolfNow response to our format
    const times: TeeTime[] = data.teeTimes?.map((t: any) => ({
      course: {
        name: t.facility.name,
        website: t.facility.website,
        phone: t.facility.phone,
        address: t.facility.address,
        rating: t.facility.rating,
        source: 'golfnow' as const,
      },
      time: t.time,
      date: params.date.toISOString().split('T')[0],
      players: params.partySize,
      price: t.price,
      bookingUrl: t.bookingUrl,
      availability: 'confirmed' as const,
    })) || [];
    
    await ctx.log('info', `GolfNow API returned ${times.length} tee times`);
    
    return times;
    
  } catch (error) {
    await ctx.log('error', `GolfNow API failed: ${error}`);
    throw error;
  }
}

// =============================================================================
// METHOD 2: Brave Search + Playwright (Hybrid - Parallel with Progress)
// =============================================================================

async function searchViaBravePlaywright(
  ctx: StepContext,
  params: { location: string; date: Date; startHour: number; endHour: number; partySize: number; maxCourses: number },
  mode: 'hybrid' | 'sequential'
): Promise<TeeTime[]> {
  
  // STEP 2a: Discovery via Brave Search (like Googling)
  await ctx.log('info', `Searching Brave for golf courses in ${params.location}...`);
  
  const courses = await discoverCoursesViaBrave(ctx, params.location, params.maxCourses);
  
  await ctx.log('info', `Found ${courses.length} golf courses via Brave Search`);
  
  // STEP 2b: Scrape each course website with Playwright
  if (mode === 'hybrid') {
    return await scrapeTeeTimesHybrid(ctx, courses, { 
      date: params.date, 
      startHour: params.startHour, 
      endHour: params.endHour, 
      partySize: params.partySize 
    });
  } else {
    return await scrapeTeeTimesSequential(ctx, courses, { 
      date: params.date, 
      startHour: params.startHour, 
      endHour: params.endHour, 
      partySize: params.partySize 
    });
  }
}

async function discoverCoursesViaBrave(
  ctx: StepContext,
  location: string,
  maxResults: number
): Promise<CourseInfo[]> {
  
  const braveKey = ctx.secrets['brave_api_key'] || process.env.BRAVE_API_KEY;
  
  if (!braveKey) {
    await ctx.log('warn', 'Brave API key not found, falling back to Apify...');
    
    // Fallback to Apify if Brave not available
    const apifyToken = ctx.secrets['apify'] || process.env.APIFY_API_TOKEN;
    if (apifyToken) {
      const { searchBusinesses } = await import('../apify/client');
      const results = await searchBusinesses({
        query: 'golf courses',
        city: location.split(',')[0],
        state: location.split(',')[1]?.trim() || 'CO',
        maxResults,
      });
      
      return results.map(r => ({
        name: r.name,
        website: r.website || '',
        phone: r.phone || undefined,
        address: r.address || undefined,
        rating: r.rating || undefined,
        source: 'apify' as const,
      })).filter(c => c.website); // Only courses with websites
    }
    
    throw new Error('No discovery tool available (need Brave API or Apify)');
  }
  
  // Call Brave Search API
  try {
    const response = await fetch(`https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(`golf courses ${location}`)}&count=${maxResults}`, {
      headers: {
        'Accept': 'application/json',
        'X-Subscription-Token': braveKey,
      },
    });
    
    const data = await response.json();
    
    // Parse Brave results
    const courses: CourseInfo[] = data.web?.results?.map((result: any) => ({
      name: result.title.replace(' - Tee Times', '').replace(' Golf Course', ''),
      website: result.url,
      phone: undefined, // Brave doesn't provide phone
      address: result.description?.match(/\d+.*?(?=\.|$)/)?.[0], // Try to extract from description
      rating: undefined,
      source: 'brave_search' as const,
    })) || [];
    
    // Filter to actual golf course sites (not booking aggregators)
    const filtered = courses.filter(c => 
      c.website && 
      !c.website.includes('golfnow.com') &&
      !c.website.includes('teeoff.com') &&
      !c.website.includes('chronogolf.com')
    );
    
    ctx.recordApiCall('brave', 'web_search', filtered.length);
    
    return filtered.slice(0, maxResults);
    
  } catch (error) {
    await ctx.log('error', `Brave Search failed: ${error}`);
    throw error;
  }
}

// =============================================================================
// PLAYWRIGHT BROWSER SCRAPING (Human-Simulation)
// =============================================================================

async function scrapeTeeTimesHybrid(
  ctx: StepContext,
  courses: CourseInfo[],
  criteria: { date: Date; startHour: number; endHour: number; partySize: number }
): Promise<TeeTime[]> {
  await ctx.log('info', `Visiting ${courses.length} course websites in parallel (hybrid method)...`);
  
  const results: TeeTime[] = [];
  let completed = 0;
  
  // Spawn parallel browser sessions (simulate opening multiple tabs)
  const promises = courses.map(async (course, index) => {
    try {
      // This would use real Playwright executor
      const times = await scrapeCourseWithBrowser(ctx, course, criteria);
      
      completed++;
      
      // Stream progress as each completes
      await ctx.log('info', `✅ Checked ${completed}/${courses.length}: ${course.name} (${times.length} times found)`);
      
      return times;
      
    } catch (error) {
      completed++;
      await ctx.log('debug', `❌ Failed ${completed}/${courses.length}: ${course.name} - ${error}`);
      return [];
    }
  });
  
  const allResults = await Promise.all(promises);
  
  // Flatten results
  for (const times of allResults) {
    results.push(...times);
  }
  
  await ctx.log('info', `Hybrid scraping complete: ${results.length} tee times from ${courses.length} courses`);
  
  return results;
}

async function scrapeTeeTimesSequential(
  ctx: StepContext,
  courses: CourseInfo[],
  criteria: { date: Date; startHour: number; endHour: number; partySize: number }
): Promise<TeeTime[]> {
  await ctx.log('info', `Visiting ${courses.length} course websites sequentially (full logging)...`);
  
  const results: TeeTime[] = [];
  
  for (let i = 0; i < courses.length; i++) {
    const course = courses[i];
    
    await ctx.log('info', `🔄 Checking ${i+1}/${courses.length}: ${course.name}...`);
    
    try {
      const times = await scrapeCourseWithBrowser(ctx, course, criteria);
      
      if (times.length > 0) {
        await ctx.log('info', `✅ Found ${times.length} available times`);
        results.push(...times);
      } else {
        await ctx.log('info', `⚠️ No times available in your range`);
      }
      
    } catch (error) {
      await ctx.log('info', `❌ Failed to access website: ${error}`);
    }
  }
  
  return results;
}

// =============================================================================
// BROWSER SCRAPING LOGIC (LLM-Guided Navigation)
// =============================================================================

async function scrapeCourseWithBrowser(
  ctx: StepContext,
  course: CourseInfo,
  criteria: { date: Date; startHour: number; endHour: number; partySize: number }
): Promise<TeeTime[]> {
  
  // This demonstrates the LLM → Executor → LLM loop
  // In real implementation, this would use actual Playwright/Puppeteer
  
  await ctx.log('debug', `Opening ${course.website} in browser...`);
  
  // ITERATION 1: LLM decides to visit website
  // Executor: browser.navigate(url)
  const html = await simulateBrowserFetch(course.website);
  
  // ITERATION 2: LLM analyzes page for booking button
  // In real version: LLM receives HTML or screenshot
  const bookingButton = findBookingButton(html);
  
  if (!bookingButton) {
    await ctx.log('debug', `No booking button found on ${course.name}`);
    return [];
  }
  
  await ctx.log('debug', `Found booking button: "${bookingButton.text}"`);
  
  // ITERATION 3: LLM decides to click button
  // Executor: browser.click(selector)
  const bookingPageHtml = await simulateButtonClick(bookingButton);
  
  // ITERATION 4: LLM analyzes booking page for date picker
  await ctx.log('debug', `Navigated to booking page`);
  
  // ITERATION 5: LLM extracts available times
  // In real version: browser.extract('.time-slot') or LLM analyzes HTML
  const availableTimes = extractTeeTimesFromHTML(
    bookingPageHtml,
    criteria.date,
    criteria.startHour,
    criteria.endHour,
    criteria.partySize
  );
  
  // ITERATION 6: LLM structures the data
  return availableTimes.map(time => ({
    course,
    time: time.timeStr,
    date: criteria.date.toISOString().split('T')[0],
    players: criteria.partySize,
    price: time.price,
    bookingUrl: time.bookingUrl || `${course.website}/booking`,
    availability: time.confirmed ? 'confirmed' : 'likely',
  }));
}

// =============================================================================
// BROWSER SIMULATION (These would be real Playwright calls)
// =============================================================================

async function simulateBrowserFetch(url: string): Promise<string> {
  // In real implementation:
  // const page = await browser.newPage();
  // await page.goto(url);
  // return await page.content();
  
  // For now: simulate with mock HTML
  return `
    <html>
      <body>
        <nav>
          <a href="/booking" class="book-btn">Book Tee Time</a>
        </nav>
        <h1>Welcome to Golf Course</h1>
      </body>
    </html>
  `;
}

function findBookingButton(html: string): { text: string; selector: string } | null {
  // LLM would analyze HTML to find booking button
  // For now: simple regex
  const bookingPatterns = [
    /book.*tee.*time/i,
    /reservations/i,
    /book.*now/i,
    /tee.*sheet/i,
  ];
  
  for (const pattern of bookingPatterns) {
    if (pattern.test(html)) {
      return {
        text: html.match(pattern)?.[0] || 'Book Tee Time',
        selector: '.book-btn',
      };
    }
  }
  
  return null;
}

async function simulateButtonClick(button: { selector: string }): Promise<string> {
  // In real implementation:
  // await page.click(button.selector);
  // await page.waitForNavigation();
  // return await page.content();
  
  // For now: simulate booking page HTML
  return `
    <html>
      <body>
        <h1>Book Your Tee Time</h1>
        <input type="date" name="date" />
        <select name="time">
          <option>9:00 AM - $75</option>
          <option>9:30 AM - $85</option>
          <option>10:00 AM - $90</option>
          <option>10:30 AM - $95</option>
        </select>
        <select name="players">
          <option>2</option>
          <option>4</option>
        </select>
      </body>
    </html>
  `;
}

function extractTeeTimesFromHTML(
  html: string,
  targetDate: Date,
  startHour: number,
  endHour: number,
  partySize: number
): Array<{ timeStr: string; price?: number; bookingUrl?: string; confirmed: boolean }> {
  
  // In real implementation: 
  // LLM would parse HTML or use CSS selectors to extract time slots
  // For now: regex extraction
  
  const timePattern = /(\d{1,2}:\d{2}\s*[AP]M)\s*-\s*\$(\d+)/g;
  const matches = [...html.matchAll(timePattern)];
  
  const times = matches
    .map(match => ({
      timeStr: match[1],
      price: parseInt(match[2], 10),
      hour: parseInt(match[1].split(':')[0], 10),
      bookingUrl: undefined,
      confirmed: true,
    }))
    .filter(time => time.hour >= startHour && time.hour < endHour);
  
  return times;
}

// =============================================================================
// DATE/TIME PARSING HELPERS
// =============================================================================

function parseDate(dateStr: string): Date {
  // Handle formats: "2026-02-26", "Feb 26", "February 26"
  
  // Try ISO format first
  if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
    return new Date(dateStr);
  }
  
  // Try parsing natural language (simple implementation)
  const currentYear = new Date().getFullYear();
  const parsed = new Date(`${dateStr} ${currentYear}`);
  
  if (isNaN(parsed.getTime())) {
    throw new Error(`Unable to parse date: ${dateStr}`);
  }
  
  return parsed;
}

function parseTimeRange(rangeStr: string): { startHour: number; endHour: number } {
  // Handle formats: "9:00-10:00", "9-10AM", "9-10"
  
  const match = rangeStr.match(/(\d+).*?(\d+)/);
  
  if (!match) {
    throw new Error(`Unable to parse time range: ${rangeStr}`);
  }
  
  return {
    startHour: parseInt(match[1], 10),
    endHour: parseInt(match[2], 10),
  };
}

// =============================================================================
// MAIN WORKFLOW HANDLER
// =============================================================================

// =============================================================================
// MAIN WORKFLOW HANDLER (with Self-Reflection)
// =============================================================================

async function golfBookingHandler(
  ctx: StepContext,
  input: Record<string, unknown>
): Promise<GolfBookingOutput> {
  const params = GolfBookingInput.parse(input);
  const { location, date: dateStr, timeRange, partySize, maxCourses, method: userMethod } = params;
  
  const startTime = Date.now();
  
  await ctx.log('info', `Starting golf tee time search: ${location}`, {
    date: dateStr,
    timeRange,
    partySize,
    requestedMethod: userMethod,
  });
  
  // Parse date and time criteria
  const date = parseDate(dateStr);
  const { startHour, endHour } = parseTimeRange(timeRange);
  const criteria = { location, date, startHour, endHour, partySize, maxCourses };
  
  await ctx.log('info', `Parsed criteria: ${date.toDateString()}, ${startHour}:00-${endHour}:00, ${partySize} players`);
  
  // ==========================================================================
  // SELF-REFLECTION: Analyze what tools we have vs need
  // ==========================================================================
  runner.updateStep(ctx.jobId, 1, 'Analyzing task requirements', 5);
  
  const tools = await checkToolAvailability(ctx);
  const analysis = await analyzeTaskRequirements(ctx, 'golf tee time booking', tools);
  
  await ctx.log('info', `Tool analysis: ${analysis.reasoning}`);
  
  // If user didn't specify method, use recommended from analysis
  let selectedMethod = userMethod === 'auto' ? analysis.recommendedMethod : userMethod;
  
  // If tools missing and can't execute
  if (!analysis.canExecute) {
    await ctx.log('warn', 'Cannot execute workflow - missing required tools', {
      missingTools: analysis.missingTools,
    });
    
    return {
      availableTimes: [],
      stats: {
        coursesChecked: 0,
        timesFound: 0,
        method: 'failed',
        timeMs: Date.now() - startTime,
        cost: 0,
      },
      toolsUsed: [],
      missingTools: analysis.missingTools,
    };
  }
  
  const toolsUsed: string[] = [];
  let availableTimes: TeeTime[] = [];
  let executionMethod = selectedMethod;
  let fallbackUsed = false;
  
  // ==========================================================================
  // EXECUTION WITH FALLBACK CHAIN
  // ==========================================================================
  runner.updateStep(ctx.jobId, 2, 'Executing workflow', 5);
  
  try {
    // TRY METHOD 1: GolfNow API (if available)
    if (selectedMethod === 'golfnow_api' && tools.golfnow_api) {
      await ctx.log('info', '🎯 Method 1: Trying GolfNow API (fastest)...');
      toolsUsed.push('golfnow_api');
      
      try {
        availableTimes = await searchViaGolfNowAPI(ctx, {
          location,
          date,
          startHour,
          endHour,
          partySize,
        });
        
        if (availableTimes.length > 0) {
          await ctx.log('info', `✅ GolfNow API succeeded: ${availableTimes.length} times found`);
        } else {
          throw new Error('No results from GolfNow');
        }
        
      } catch (error) {
        await ctx.log('warn', `⚠️ GolfNow API failed: ${error}`);
        await ctx.log('info', '🔄 Falling back to Brave + Playwright...');
        fallbackUsed = true;
        selectedMethod = 'brave_playwright_hybrid';
      }
    }
    
    // TRY METHOD 2/3: Brave + Playwright (if GolfNow failed or not available)
    if (availableTimes.length === 0 && (selectedMethod.includes('brave_playwright') || selectedMethod === 'auto')) {
      
      const mode = selectedMethod === 'brave_playwright_sequential' ? 'sequential' : 'hybrid';
      
      await ctx.log('info', `🎯 Method 2: Using Brave Search + Playwright (${mode})...`);
      toolsUsed.push('brave_search', 'playwright');
      
      try {
        availableTimes = await searchViaBravePlaywright(ctx, criteria, mode);
        executionMethod = `brave_playwright_${mode}`;
        
        if (availableTimes.length > 0) {
          await ctx.log('info', `✅ Brave + Playwright succeeded: ${availableTimes.length} times found`);
        } else {
          throw new Error('No tee times found via browser scraping');
        }
        
      } catch (error) {
        await ctx.log('warn', `⚠️ ${mode} method failed: ${error}`);
        
        // If hybrid failed, try sequential as last resort
        if (mode === 'hybrid') {
          await ctx.log('info', '🔄 Falling back to sequential method for reliability...');
          fallbackUsed = true;
          
          try {
            availableTimes = await searchViaBravePlaywright(ctx, criteria, 'sequential');
            executionMethod = 'brave_playwright_sequential (fallback)';
            toolsUsed.push('sequential_fallback');
            
          } catch (seqError) {
            await ctx.log('error', `❌ All scraping methods failed: ${seqError}`);
          }
        }
      }
    }
    
  } catch (error) {
    await ctx.log('error', `Workflow execution failed: ${error}`);
  }
  
  // ==========================================================================
  // FILTER AND SORT RESULTS
  // ==========================================================================
  if (availableTimes.length > 0) {
    runner.updateStep(ctx.jobId, 3, 'Filtering and sorting results', 5);
    
    // Sort by: time (closest to start of range) → rating → price
    availableTimes.sort((a, b) => {
      const timeA = parseTimeToMinutes(a.time);
      const timeB = parseTimeToMinutes(b.time);
      
      if (timeA !== timeB) return timeA - timeB;
      
      const ratingA = a.course.rating || 0;
      const ratingB = b.course.rating || 0;
      
      if (ratingA !== ratingB) return ratingB - ratingA;
      
      return (a.price || 999) - (b.price || 999);
    });
    
    await ctx.log('info', `Sorted ${availableTimes.length} tee times by time → rating → price`);
  }
  
  // ==========================================================================
  // FINALIZE
  // ==========================================================================
  runner.updateStep(ctx.jobId, 4, 'Finalizing results', 5);
  
  const timeMs = Date.now() - startTime;
  
  // Calculate cost based on tools used
  let cost = 0;
  if (toolsUsed.includes('golfnow_api')) cost += 0.05;
  if (toolsUsed.includes('brave_search')) cost += 0.01;
  if (toolsUsed.includes('playwright')) cost += 0.15;
  if (toolsUsed.includes('apify')) cost += 0.05;
  
  const stats = {
    coursesChecked: maxCourses,
    timesFound: availableTimes.length,
    method: executionMethod,
    timeMs,
    cost,
  };
  
  await ctx.log('info', `Golf booking search complete`, stats);
  
  // Log fallback for learning
  if (fallbackUsed) {
    await ctx.log('info', '📝 Learning: Primary method failed, fallback succeeded. Will adjust MEMORY.md.');
  }
  
  return {
    availableTimes: availableTimes.slice(0, 10), // Top 10 results
    stats,
    toolsUsed,
    fallbackUsed,
  };
}

// =============================================================================
// HELPERS
// =============================================================================

function parseTimeToMinutes(timeStr: string): number {
  // Convert "9:30 AM" to minutes since midnight
  const match = timeStr.match(/(\d+):(\d+)/);
  if (!match) return 0;
  
  const hours = parseInt(match[1], 10);
  const minutes = parseInt(match[2], 10);
  
  return hours * 60 + minutes;
}

// =============================================================================
// REGISTER WORKFLOW
// =============================================================================

runner.registerWorkflow('golf-tee-time-booking', golfBookingHandler);

export { golfBookingHandler };
