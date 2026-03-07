/**
 * Bounce Audit Tool
 * 
 * One-time script to retroactively scan Gmail for bounced emails
 * and update the database with accurate bounce tracking.
 */

import { z } from 'zod';
import { registry } from '../registry';
import { getSupabaseClient } from '../lib/supabase';

const AuditBouncesInputSchema = z.object({
  dryRun: z.boolean().optional().describe('If true, only report bounces without updating database'),
  maxCampaigns: z.number().optional().describe('Maximum number of campaigns to check (default: all)'),
});

type AuditBouncesInput = z.infer<typeof AuditBouncesInputSchema>;

const AuditBouncesOutputSchema = z.object({
  success: z.boolean(),
  scanned: z.number(),
  bouncesFound: z.number(),
  updated: z.number(),
  bounces: z.array(z.object({
    campaignId: z.string(),
    companyName: z.string(),
    email: z.string(),
    bounceReason: z.string(),
  })),
  error: z.string().optional(),
});

type AuditBouncesOutput = z.infer<typeof AuditBouncesOutputSchema>;

/**
 * Check if a message is a bounce/automated response
 */
function isBounceOrAutomated(fromHeader: string, subject: string, body: string, snippet: string): boolean {
  const from = fromHeader.toLowerCase();
  const subjectLower = subject.toLowerCase();
  const bodyLower = body.toLowerCase();
  const snippetLower = snippet.toLowerCase();

  // Check sender patterns
  const bouncePatterns = [
    'mailer-daemon',
    'postmaster',
    'no-reply',
    'noreply',
    'do-not-reply',
    'bounce',
    'undeliverable',
    'mail delivery',
    'delivery status notification',
    'automatic reply',
    'auto-reply',
    'out of office',
    'out-of-office',
  ];
  
  for (const pattern of bouncePatterns) {
    if (from.includes(pattern)) {
      return true;
    }
  }

  // Check subject patterns
  const bounceSubjects = [
    'undeliverable',
    'delivery failed',
    'failure notice',
    'returned mail',
    'delivery status notification',
    'mail delivery failed',
    'address not found',
    'domain not found',
    'user unknown',
    'out of office',
    'automatic reply',
    'auto-reply',
  ];
  
  for (const pattern of bounceSubjects) {
    if (subjectLower.includes(pattern)) {
      return true;
    }
  }

  // Check body patterns
  const bounceBodyPatterns = [
    'address not found',
    'domain not found',
    'does not exist',
    'user unknown',
    'mailbox unavailable',
    'recipient address rejected',
    'delivery has failed',
    'message could not be delivered',
    'permanent error',
    'mail system error',
  ];
  
  for (const pattern of bounceBodyPatterns) {
    if (bodyLower.includes(pattern) || snippetLower.includes(pattern)) {
      return true;
    }
  }

  return false;
}

/**
 * Tool handler
 */
export async function auditBouncesHandler(
  input: AuditBouncesInput,
  _context: { tenantId: string }
): Promise<AuditBouncesOutput> {
  const dryRun = input.dryRun ?? false;
  const maxCampaigns = input.maxCampaigns;
  
  console.log(`\n🔍 Starting Bounce Audit${dryRun ? ' (DRY RUN)' : ''}...\n`);
  
  try {
    const supabase = getSupabaseClient();
    if (!supabase) {
      return { success: false, scanned: 0, bouncesFound: 0, updated: 0, bounces: [], error: 'Database not configured' };
    }
    
    // Get all sent campaigns with Gmail thread IDs
    let query = supabase
      .schema('crm')
      .from('email_campaigns')
      .select(`
        id,
        gmail_thread_id,
        gmail_message_id,
        sent_from_email,
        sent_at,
        approval_status,
        lead:leads(company_name, email)
      `)
      .not('sent_at', 'is', null)
      .not('gmail_thread_id', 'is', null)
      .order('sent_at', { ascending: false });
    
    if (maxCampaigns) {
      query = query.limit(maxCampaigns);
    }
    
    const { data: campaigns, error: fetchError } = await query;
    
    if (fetchError || !campaigns) {
      return { success: false, scanned: 0, bouncesFound: 0, updated: 0, bounces: [], error: `Failed to fetch campaigns: ${fetchError?.message}` };
    }
    
    console.log(`📊 Found ${campaigns.length} sent campaigns to check\n`);
    
    const bounces: AuditBouncesOutput['bounces'] = [];
    let scanned = 0;
    let updated = 0;
    
    // Group campaigns by sender email to batch Gmail API calls
    const bySender = new Map<string, typeof campaigns>();
    for (const campaign of campaigns) {
      const sender = campaign.sent_from_email || 'unknown';
      if (!bySender.has(sender)) {
        bySender.set(sender, []);
      }
      bySender.get(sender)!.push(campaign);
    }
    
    console.log(`📧 Checking ${bySender.size} sender account(s)...\n`);
    
    // Check each sender's campaigns
    for (const [senderEmail, senderCampaigns] of bySender.entries()) {
      console.log(`\n🔍 Checking ${senderCampaigns.length} campaigns from ${senderEmail}...`);
      
      try {
        // Get OAuth token for this sender
        const senderUser = senderEmail.split('@')[0];
        const tenantId = `sender-${senderUser}`;
        
        const { data: integration } = await supabase
          .from('node_integrations')
          .select('*')
          .eq('node_id', tenantId)
          .eq('provider', 'google')
          .single();
        
        if (!integration) {
          console.log(`⚠️  No Gmail OAuth found for ${senderEmail}, skipping...`);
          continue;
        }
        
        // Create Gmail API client with googleapis
        const { google } = await import('googleapis');
        const oauth2Client = new google.auth.OAuth2();
        oauth2Client.setCredentials({ access_token: integration.access_token });
        const gmail = google.gmail({ version: 'v1', auth: oauth2Client });
        
        // Check each campaign
        for (const campaign of senderCampaigns) {
          scanned++;
          
          // Skip if already marked as rejected/bounced
          if (campaign.approval_status === 'rejected') {
            continue;
          }
          
          try {
            // Get the Gmail thread
            const thread = await gmail.users.threads.get({
              userId: 'me',
              id: campaign.gmail_thread_id,
              format: 'full',
            });
            
            // Check all messages in the thread
            const messages = thread.data.messages || [];
            for (const msg of messages) {
              // Skip our original sent message
              if (msg.id === campaign.gmail_message_id) {
                continue;
              }
              
              const headers = msg.payload?.headers || [];
              const fromHeader = headers.find(h => h.name?.toLowerCase() === 'from')?.value || '';
              const subjectHeader = headers.find(h => h.name?.toLowerCase() === 'subject')?.value || '';
              const snippet = msg.snippet || '';
              
              // Check if this is a bounce
              if (isBounceOrAutomated(fromHeader, subjectHeader, '', snippet)) {
                const lead = Array.isArray(campaign.lead) ? campaign.lead[0] : campaign.lead;
                const bounceInfo = {
                  campaignId: campaign.id,
                  companyName: lead?.company_name || 'Unknown',
                  email: lead?.email || 'Unknown',
                  bounceReason: snippet.substring(0, 200),
                };
                
                bounces.push(bounceInfo);
                console.log(`  ❌ BOUNCE: ${bounceInfo.companyName} (${bounceInfo.email})`);
                console.log(`     Reason: ${bounceInfo.bounceReason.substring(0, 80)}...`);
                
                // Update database if not dry run
                if (!dryRun) {
                  await supabase
                    .schema('crm')
                    .from('email_campaigns')
                    .update({
                      approval_status: 'rejected',
                      rejection_reason: `Bounced: ${snippet.substring(0, 200)}`,
                    })
                    .eq('id', campaign.id);
                  
                  updated++;
                }
                
                break; // Found bounce, no need to check other messages in thread
              }
            }
            
            // Rate limiting - small delay between API calls
            await new Promise(resolve => setTimeout(resolve, 100));
            
          } catch (threadError: any) {
            console.error(`  ⚠️  Error checking thread ${campaign.gmail_thread_id}:`, threadError.message);
          }
          
          // Progress indicator
          if (scanned % 10 === 0) {
            console.log(`  ... checked ${scanned}/${campaigns.length} campaigns`);
          }
        }
        
      } catch (gmailError: any) {
        console.error(`❌ Error with Gmail client for ${senderEmail}:`, gmailError.message);
      }
    }
    
    console.log(`\n✅ Audit Complete!\n`);
    console.log(`📊 Summary:`);
    console.log(`   Scanned: ${scanned} campaigns`);
    console.log(`   Bounces Found: ${bounces.length}`);
    if (!dryRun) {
      console.log(`   Database Updated: ${updated} records`);
    } else {
      console.log(`   (DRY RUN - No database changes made)`);
    }
    
    return {
      success: true,
      scanned,
      bouncesFound: bounces.length,
      updated,
      bounces,
    };
    
  } catch (error: any) {
    console.error('❌ Audit failed:', error);
    return {
      success: false,
      scanned: 0,
      bouncesFound: 0,
      updated: 0,
      bounces: [],
      error: String(error),
    };
  }
}

// Register the tool
registry.register({
  id: 'audit_email_bounces',
  name: 'Audit Email Bounces',
  description: 'Retroactively scan Gmail threads to find and log bounced emails that were previously untracked. Use dryRun=true to preview without database changes.',
  category: 'email',
  tier: 'pro',
  inputSchema: AuditBouncesInputSchema,
  outputSchema: AuditBouncesOutputSchema,
  handler: auditBouncesHandler,
});

export default auditBouncesHandler;
