import * as cheerio from 'cheerio';

interface ContactInfo {
  hasContactPage: boolean;
  contactMethods: string[];
  hasPhoneNumber: boolean;
  hasEmail: boolean;
  hasContactForm: boolean;
}

interface SocialLinks {
  facebook?: string;
  instagram?: string;
  twitter?: string;
  linkedin?: string;
  youtube?: string;
  tiktok?: string;
  pinterest?: string;
}

interface BookingInfo {
  hasBookingSystem: boolean;
  bookingPlatforms: string[];
  hasCalendly: boolean;
  hasAcuity: boolean;
  hasSquareAppointments: boolean;
  hasCustomBooking: boolean;
}

interface ChatbotInfo {
  hasChatbot: boolean;
  chatbotPlatforms: string[];
  hasTawk: boolean;
  hasIntercom: boolean;
  hasDrift: boolean;
  hasZendesk: boolean;
}

interface PixelInfo {
  hasFacebookPixel: boolean;
  hasGoogleAnalytics: boolean;
  hasGoogleTagManager: boolean;
  hasLinkedInInsight: boolean;
  hasTikTokPixel: boolean;
}

interface TechStack {
  cms?: string;
  framework?: string;
  hosting?: string;
  hasWordPress: boolean;
  hasShopify: boolean;
  hasWix: boolean;
  hasSquarespace: boolean;
  hasWebflow: boolean;
}

export interface WebsiteScanResult {
  url: string;
  accessible: boolean;
  statusCode?: number;
  redirectUrl?: string;
  
  // SEO
  hasSSL: boolean;
  title?: string;
  description?: string;
  hasH1: boolean;
  h1Text?: string;
  hasMetaDescription: boolean;
  hasMetaKeywords: boolean;
  hasOpenGraph: boolean;
  hasTwitterCard: boolean;
  hasStructuredData: boolean;
  hasSitemap: boolean;
  hasRobotsTxt: boolean;
  
  // Contact
  contact: ContactInfo;
  
  // Social
  social: SocialLinks;
  hasSocialLinks: boolean;
  
  // Booking
  booking: BookingInfo;
  
  // Chatbot
  chatbot: ChatbotInfo;
  
  // Pixels
  pixels: PixelInfo;
  
  // Tech Stack
  tech: TechStack;
  
  // AI Readability
  aiReadable: boolean;
  aiReadabilityScore: number;
  aiReadabilityFactors: string[];
  
  // Performance
  loadTimeMs?: number;
  
  // Error
  error?: string;
}

/**
 * Comprehensive website scanner for business discovery enrichment.
 * Extracts SEO, contact info, social links, booking systems, chatbots, pixels, tech stack, and AI readability.
 * 
 * @param url - The website URL to scan (with or without protocol)
 * @param timeout - Request timeout in milliseconds (default: 10000)
 * @returns Promise<WebsiteScanResult>
 */
export async function scanWebsite(
  url: string,
  timeout: number = 10000
): Promise<WebsiteScanResult> {
  const startTime = Date.now();
  
  // Ensure URL has protocol
  if (!url.startsWith('http://') && !url.startsWith('https://')) {
    url = `https://${url}`;
  }
  
  const result: WebsiteScanResult = {
    url,
    accessible: false,
    hasSSL: url.startsWith('https://'),
    contact: {
      hasContactPage: false,
      contactMethods: [],
      hasPhoneNumber: false,
      hasEmail: false,
      hasContactForm: false,
    },
    social: {},
    hasSocialLinks: false,
    booking: {
      hasBookingSystem: false,
      bookingPlatforms: [],
      hasCalendly: false,
      hasAcuity: false,
      hasSquareAppointments: false,
      hasCustomBooking: false,
    },
    chatbot: {
      hasChatbot: false,
      chatbotPlatforms: [],
      hasTawk: false,
      hasIntercom: false,
      hasDrift: false,
      hasZendesk: false,
    },
    pixels: {
      hasFacebookPixel: false,
      hasGoogleAnalytics: false,
      hasGoogleTagManager: false,
      hasLinkedInInsight: false,
      hasTikTokPixel: false,
    },
    tech: {
      hasWordPress: false,
      hasShopify: false,
      hasWix: false,
      hasSquarespace: false,
      hasWebflow: false,
    },
    hasH1: false,
    hasMetaDescription: false,
    hasMetaKeywords: false,
    hasOpenGraph: false,
    hasTwitterCard: false,
    hasStructuredData: false,
    hasSitemap: false,
    hasRobotsTxt: false,
    aiReadable: false,
    aiReadabilityScore: 0,
    aiReadabilityFactors: [],
  };
  
  try {
    // Fetch the webpage
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);
    
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; OneClawBot/1.0; +https://oneclaw.chat)',
      },
      redirect: 'follow',
    });
    
    clearTimeout(timeoutId);
    
    result.statusCode = response.status;
    result.accessible = response.ok;
    
    if (response.redirected) {
      result.redirectUrl = response.url;
    }
    
    if (!response.ok) {
      result.error = `HTTP ${response.status} ${response.statusText}`;
      return result;
    }
    
    const html = await response.text();
    const $ = cheerio.load(html);
    
    // SEO Analysis
    result.title = $('title').first().text().trim();
    result.description = $('meta[name="description"]').attr('content')?.trim();
    result.hasMetaDescription = !!result.description;
    result.hasMetaKeywords = !!$('meta[name="keywords"]').attr('content');
    
    const h1 = $('h1').first();
    result.hasH1 = h1.length > 0;
    result.h1Text = h1.text().trim();
    
    result.hasOpenGraph = $('meta[property^="og:"]').length > 0;
    result.hasTwitterCard = $('meta[name^="twitter:"]').length > 0;
    result.hasStructuredData = $('script[type="application/ld+json"]').length > 0;
    
    // Check for sitemap and robots.txt (these require separate requests)
    try {
      const sitemapUrl = new URL('/sitemap.xml', url).href;
      const sitemapRes = await fetch(sitemapUrl, { method: 'HEAD', signal: AbortSignal.timeout(5000) });
      result.hasSitemap = sitemapRes.ok;
    } catch {
      result.hasSitemap = false;
    }
    
    try {
      const robotsUrl = new URL('/robots.txt', url).href;
      const robotsRes = await fetch(robotsUrl, { method: 'HEAD', signal: AbortSignal.timeout(5000) });
      result.hasRobotsTxt = robotsRes.ok;
    } catch {
      result.hasRobotsTxt = false;
    }
    
    // Contact Info
    const bodyText = $('body').text().toLowerCase();
    const links = $('a[href]').map((_, el) => $(el).attr('href')?.toLowerCase() || '').get();
    
    result.contact.hasContactPage = links.some(href => 
      href.includes('contact') || href.includes('get-in-touch') || href.includes('reach-us')
    );
    
    result.contact.hasPhoneNumber = /\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}/.test(bodyText);
    result.contact.hasEmail = /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/i.test(bodyText);
    result.contact.hasContactForm = $('form').length > 0 && (
      $('input[type="email"]').length > 0 || 
      $('input[name*="email"]').length > 0 ||
      $('textarea[name*="message"]').length > 0
    );
    
    if (result.contact.hasContactPage) result.contact.contactMethods.push('contact-page');
    if (result.contact.hasPhoneNumber) result.contact.contactMethods.push('phone');
    if (result.contact.hasEmail) result.contact.contactMethods.push('email');
    if (result.contact.hasContactForm) result.contact.contactMethods.push('form');
    
    // Social Links
    const allLinks = $('a[href]').map((_, el) => $(el).attr('href') || '').get();
    
    result.social.facebook = allLinks.find(href => href.includes('facebook.com'));
    result.social.instagram = allLinks.find(href => href.includes('instagram.com'));
    result.social.twitter = allLinks.find(href => href.includes('twitter.com') || href.includes('x.com'));
    result.social.linkedin = allLinks.find(href => href.includes('linkedin.com'));
    result.social.youtube = allLinks.find(href => href.includes('youtube.com'));
    result.social.tiktok = allLinks.find(href => href.includes('tiktok.com'));
    result.social.pinterest = allLinks.find(href => href.includes('pinterest.com'));
    
    result.hasSocialLinks = Object.values(result.social).some(link => !!link);
    
    // Booking Systems
    const scripts = $('script[src]').map((_, el) => $(el).attr('src') || '').get();
    const allText = html.toLowerCase();
    
    result.booking.hasCalendly = scripts.some(src => src.includes('calendly.com')) || allText.includes('calendly');
    result.booking.hasAcuity = scripts.some(src => src.includes('acuityscheduling.com')) || allText.includes('acuity');
    result.booking.hasSquareAppointments = scripts.some(src => src.includes('square')) && allText.includes('appointment');
    result.booking.hasCustomBooking = allLinks.some(href => 
      href.includes('book') || href.includes('appointment') || href.includes('schedule')
    ) && !result.booking.hasCalendly && !result.booking.hasAcuity;
    
    if (result.booking.hasCalendly) result.booking.bookingPlatforms.push('calendly');
    if (result.booking.hasAcuity) result.booking.bookingPlatforms.push('acuity');
    if (result.booking.hasSquareAppointments) result.booking.bookingPlatforms.push('square');
    if (result.booking.hasCustomBooking) result.booking.bookingPlatforms.push('custom');
    
    result.booking.hasBookingSystem = result.booking.bookingPlatforms.length > 0;
    
    // Chatbots
    result.chatbot.hasTawk = scripts.some(src => src.includes('tawk.to'));
    result.chatbot.hasIntercom = scripts.some(src => src.includes('intercom'));
    result.chatbot.hasDrift = scripts.some(src => src.includes('drift.com'));
    result.chatbot.hasZendesk = scripts.some(src => src.includes('zendesk'));
    
    if (result.chatbot.hasTawk) result.chatbot.chatbotPlatforms.push('tawk');
    if (result.chatbot.hasIntercom) result.chatbot.chatbotPlatforms.push('intercom');
    if (result.chatbot.hasDrift) result.chatbot.chatbotPlatforms.push('drift');
    if (result.chatbot.hasZendesk) result.chatbot.chatbotPlatforms.push('zendesk');
    
    result.chatbot.hasChatbot = result.chatbot.chatbotPlatforms.length > 0;
    
    // Pixels & Analytics
    result.pixels.hasFacebookPixel = allText.includes('fbq(') || allText.includes('facebook.com/tr');
    result.pixels.hasGoogleAnalytics = allText.includes('google-analytics.com/analytics.js') || 
                                       allText.includes('googletagmanager.com/gtag/js') ||
                                       allText.includes('gtag(');
    result.pixels.hasGoogleTagManager = allText.includes('googletagmanager.com/gtm.js');
    result.pixels.hasLinkedInInsight = allText.includes('snap.licdn.com/li.lms-analytics');
    result.pixels.hasTikTokPixel = allText.includes('tiktok.com/i18n/pixel');
    
    // Tech Stack Detection
    const metaGenerator = $('meta[name="generator"]').attr('content')?.toLowerCase() || '';
    
    result.tech.hasWordPress = allText.includes('wp-content') || 
                               allText.includes('wp-includes') || 
                               metaGenerator.includes('wordpress');
    result.tech.hasShopify = allText.includes('shopify.com') || 
                             allText.includes('cdn.shopify.com') ||
                             metaGenerator.includes('shopify');
    result.tech.hasWix = allText.includes('wix.com') || 
                         allText.includes('_wix') ||
                         metaGenerator.includes('wix');
    result.tech.hasSquarespace = allText.includes('squarespace.com') || 
                                 metaGenerator.includes('squarespace');
    result.tech.hasWebflow = allText.includes('webflow.io') || 
                             allText.includes('webflow.com') ||
                             metaGenerator.includes('webflow');
    
    if (result.tech.hasWordPress) result.tech.cms = 'wordpress';
    else if (result.tech.hasShopify) result.tech.cms = 'shopify';
    else if (result.tech.hasWix) result.tech.cms = 'wix';
    else if (result.tech.hasSquarespace) result.tech.cms = 'squarespace';
    else if (result.tech.hasWebflow) result.tech.cms = 'webflow';
    
    // AI Readability Score (0-100)
    let aiScore = 0;
    const factors: string[] = [];
    
    // Structured data helps AI understand content (+20)
    if (result.hasStructuredData) {
      aiScore += 20;
      factors.push('structured-data');
    }
    
    // Clear headings help AI parse content (+15)
    if (result.hasH1 && $('h2').length > 0) {
      aiScore += 15;
      factors.push('clear-headings');
    }
    
    // Semantic HTML (+10)
    if ($('nav').length > 0 && $('main, article, section').length > 0) {
      aiScore += 10;
      factors.push('semantic-html');
    }
    
    // Good meta descriptions (+10)
    if (result.hasMetaDescription && result.description && result.description.length > 50) {
      aiScore += 10;
      factors.push('meta-description');
    }
    
    // Open Graph helps with context (+10)
    if (result.hasOpenGraph) {
      aiScore += 10;
      factors.push('open-graph');
    }
    
    // Contact info makes business identifiable (+10)
    if (result.contact.contactMethods.length >= 2) {
      aiScore += 10;
      factors.push('contact-info');
    }
    
    // Clean URL structure (+5)
    if (result.hasSSL && !url.includes('?')) {
      aiScore += 5;
      factors.push('clean-urls');
    }
    
    // Sitemap helps discoverability (+10)
    if (result.hasSitemap) {
      aiScore += 10;
      factors.push('sitemap');
    }
    
    // Accessible images with alt text (+10)
    const imagesWithAlt = $('img[alt]').length;
    const totalImages = $('img').length;
    if (totalImages > 0 && (imagesWithAlt / totalImages) > 0.5) {
      aiScore += 10;
      factors.push('image-alt-text');
    }
    
    result.aiReadabilityScore = Math.min(aiScore, 100);
    result.aiReadabilityFactors = factors;
    result.aiReadable = aiScore >= 50;
    
    result.loadTimeMs = Date.now() - startTime;
    
  } catch (error: any) {
    result.error = error.message || 'Unknown error';
    if (error.name === 'AbortError') {
      result.error = 'Request timeout';
    }
  }
  
  return result;
}

/**
 * Scan multiple websites in parallel with concurrency limit.
 * 
 * @param urls - Array of website URLs to scan
 * @param concurrency - Max number of concurrent scans (default: 5)
 * @param timeout - Request timeout per scan in ms (default: 10000)
 * @returns Promise<WebsiteScanResult[]>
 */
export async function scanWebsitesBatch(
  urls: string[],
  concurrency: number = 5,
  timeout: number = 10000
): Promise<WebsiteScanResult[]> {
  const results: WebsiteScanResult[] = [];
  
  for (let i = 0; i < urls.length; i += concurrency) {
    const batch = urls.slice(i, i + concurrency);
    const batchResults = await Promise.all(
      batch.map(url => scanWebsite(url, timeout))
    );
    results.push(...batchResults);
  }
  
  return results;
}
