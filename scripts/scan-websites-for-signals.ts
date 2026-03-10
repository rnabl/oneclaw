/**
 * Scan Websites for All Leads with Reviews
 * 
 * Scans 996 leads with reviews to extract:
 * - Ads signals (Facebook, Google, LinkedIn, TikTok pixels)
 * - Social profiles (Facebook, Instagram, LinkedIn, etc.)
 * - Chatbot detection
 * - Booking systems
 * - AI readability
 * - Email fallback from website
 * 
 * Updates leads table with website_scan_data
 */

import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';
import { scanWebsite } from '../packages/harness/src/scanners/website-scanner';

dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// Configuration
const BATCH_SIZE = 10; // Scan 10 at a time
const DELAY_BETWEEN_BATCHES = 2000; // 2 seconds between batches
const TIMEOUT_PER_SCAN = 15000; // 15 seconds per website

interface Lead {
  id: string;
  company_name: string;
  website: string;
  email?: string;
  city?: string;
  state?: string;
}

async function getLeadsToScan(): Promise<Lead[]> {
  console.log('📊 Fetching leads with reviews...\n');
  
  const { data: leads, error } = await supabase
    .schema('crm')
    .from('leads')
    .select('id, company_name, website, email, city, state')
    .not('source_metadata->reviews', 'is', null)
    .not('website', 'is', null)
    .order('google_rating', { ascending: false });
  
  if (error) {
    console.error('❌ Error fetching leads:', error);
    return [];
  }
  
  console.log(`✅ Found ${leads?.length || 0} leads with reviews and websites\n`);
  
  return leads as Lead[];
}

async function scanAndUpdateLead(lead: Lead): Promise<boolean> {
  console.log(`\n🔍 Scanning: ${lead.company_name}`);
  console.log(`   URL: ${lead.website}`);
  
  try {
    const scanResult = await scanWebsite(lead.website, TIMEOUT_PER_SCAN);
    
    // Extract ads signal
    const adsSignal = {
      running_ads: scanResult.pixels.hasFacebookPixel || 
                   scanResult.pixels.hasGoogleAnalytics ||
                   scanResult.pixels.hasLinkedInInsight ||
                   scanResult.pixels.hasTikTokPixel,
      platforms: [
        scanResult.pixels.hasFacebookPixel && 'Facebook/Meta',
        scanResult.pixels.hasGoogleAnalytics && 'Google',
        scanResult.pixels.hasLinkedInInsight && 'LinkedIn',
        scanResult.pixels.hasTikTokPixel && 'TikTok'
      ].filter(Boolean),
      detected_date: new Date().toISOString()
    };
    
    // Extract email from website if we don't have one
    let websiteEmail = null;
    if (!lead.email && scanResult.contact.hasEmail) {
      // Try to extract email from scan
      // Note: The scanner detects email presence but doesn't extract it
      // We'd need to enhance the scanner or use a different method
      websiteEmail = null; // TODO: Implement email extraction
    }
    
    // Prepare website scan data
    const websiteScanData = {
      scanned_at: new Date().toISOString(),
      accessible: scanResult.accessible,
      
      // Ads signal
      ads_signal: adsSignal,
      
      // SEO
      seo: {
        has_ssl: scanResult.hasSSL,
        has_h1: scanResult.hasH1,
        has_meta_description: scanResult.hasMetaDescription,
        has_structured_data: scanResult.hasStructuredData,
        has_sitemap: scanResult.hasSitemap
      },
      
      // Social
      social_profiles: {
        has_social: scanResult.hasSocialLinks,
        facebook: scanResult.social.facebook,
        instagram: scanResult.social.instagram,
        linkedin: scanResult.social.linkedin,
        twitter: scanResult.social.twitter,
        youtube: scanResult.social.youtube,
        tiktok: scanResult.social.tiktok
      },
      
      // Chatbot
      chatbot: {
        has_chatbot: scanResult.chatbot.hasChatbot,
        platforms: scanResult.chatbot.chatbotPlatforms
      },
      
      // Booking
      booking: {
        has_booking: scanResult.booking.hasBookingSystem,
        platforms: scanResult.booking.bookingPlatforms
      },
      
      // AI readiness
      ai_readiness: {
        is_ai_readable: scanResult.aiReadable,
        score: scanResult.aiReadabilityScore,
        factors: scanResult.aiReadabilityFactors
      },
      
      // Contact
      contact: {
        has_contact_page: scanResult.contact.hasContactPage,
        has_phone: scanResult.contact.hasPhoneNumber,
        has_email: scanResult.contact.hasEmail,
        has_form: scanResult.contact.hasContactForm
      },
      
      // Tech
      tech: {
        cms: scanResult.tech.cms,
        has_wordpress: scanResult.tech.hasWordPress,
        has_shopify: scanResult.tech.hasShopify,
        has_wix: scanResult.tech.hasWix
      }
    };
    
    // Update lead with scan data
    // First get existing metadata
    const { data: existingLead } = await supabase
      .schema('crm')
      .from('leads')
      .select('source_metadata')
      .eq('id', lead.id)
      .single();
    
    const updatedMetadata = {
      ...(existingLead?.source_metadata || {}),
      website_scan: websiteScanData
    };
    
    const { error: updateError } = await supabase
      .schema('crm')
      .from('leads')
      .update({
        source_metadata: updatedMetadata
      })
      .eq('id', lead.id);
    
    if (updateError) {
      console.error(`   ❌ Error updating lead: ${updateError.message}`);
      return false;
    }
    
    // Log results
    console.log(`   ✅ Scan complete`);
    console.log(`   📊 Ads: ${adsSignal.running_ads ? `Yes (${adsSignal.platforms.join(', ')})` : 'No'}`);
    console.log(`   📱 Social: ${scanResult.hasSocialLinks ? 'Yes' : 'No'}`);
    console.log(`   💬 Chatbot: ${scanResult.chatbot.hasChatbot ? 'Yes' : 'No'}`);
    console.log(`   📅 Booking: ${scanResult.booking.hasBookingSystem ? 'Yes' : 'No'}`);
    console.log(`   🤖 AI Score: ${scanResult.aiReadabilityScore}/100`);
    
    return true;
    
  } catch (error: any) {
    console.error(`   ❌ Scan failed: ${error.message}`);
    return false;
  }
}

async function main() {
  console.log('🌐 Website Scanner for Lead Enrichment\n');
  console.log('='.repeat(60));
  console.log(`Batch size: ${BATCH_SIZE}`);
  console.log(`Timeout per scan: ${TIMEOUT_PER_SCAN}ms`);
  console.log(`Delay between batches: ${DELAY_BETWEEN_BATCHES}ms`);
  console.log('='.repeat(60));
  
  const leads = await getLeadsToScan();
  
  if (leads.length === 0) {
    console.log('\n❌ No leads to scan');
    return;
  }
  
  let scanned = 0;
  let failed = 0;
  
  // Process in batches
  for (let i = 0; i < leads.length; i += BATCH_SIZE) {
    const batch = leads.slice(i, i + BATCH_SIZE);
    const batchNum = Math.floor(i / BATCH_SIZE) + 1;
    const totalBatches = Math.ceil(leads.length / BATCH_SIZE);
    
    console.log(`\n\n📦 Batch ${batchNum}/${totalBatches} (${batch.length} leads)`);
    console.log('='.repeat(60));
    
    // Scan batch sequentially (to avoid rate limits)
    for (const lead of batch) {
      const success = await scanAndUpdateLead(lead);
      
      if (success) {
        scanned++;
      } else {
        failed++;
      }
      
      // Small delay between scans
      await new Promise(resolve => setTimeout(resolve, 500));
    }
    
    // Progress update
    const progress = ((i + batch.length) / leads.length * 100).toFixed(1);
    console.log(`\n📊 Progress: ${scanned + failed}/${leads.length} (${progress}%)`);
    console.log(`   ✅ Success: ${scanned}`);
    console.log(`   ❌ Failed: ${failed}`);
    
    // Delay between batches
    if (i + BATCH_SIZE < leads.length) {
      console.log(`\n⏸️  Waiting ${DELAY_BETWEEN_BATCHES}ms before next batch...`);
      await new Promise(resolve => setTimeout(resolve, DELAY_BETWEEN_BATCHES));
    }
  }
  
  // Final summary
  console.log('\n\n' + '='.repeat(60));
  console.log('📊 Final Summary');
  console.log('='.repeat(60));
  console.log(`Total leads: ${leads.length}`);
  console.log(`✅ Successfully scanned: ${scanned}`);
  console.log(`❌ Failed: ${failed}`);
  console.log(`📈 Success rate: ${(scanned / leads.length * 100).toFixed(1)}%`);
  console.log('='.repeat(60));
  
  console.log('\n✅ Website scanning complete!');
  console.log('\n💡 Next steps:');
  console.log('   1. Run: pnpm campaign:status');
  console.log('   2. Generate campaigns with ads signals');
  console.log('   3. Review and send!');
}

main().catch(console.error);
