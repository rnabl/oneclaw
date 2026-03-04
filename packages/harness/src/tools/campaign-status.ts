/**
 * Campaign Status Tool
 * 
 * Allows the LLM to query email campaign status.
 * Used by Telegram bot to answer questions like "How many emails sent today?"
 */

import { z } from 'zod';
import { registry } from '../registry';
import { getSupabaseClient } from '../lib/supabase';

// Input schema - no required inputs, just query options
const CampaignStatusInputSchema = z.object({
  includeReplies: z.boolean().optional().describe('Include reply statistics'),
  includePending: z.boolean().optional().describe('Include pending/queued emails'),
});

type CampaignStatusInput = z.infer<typeof CampaignStatusInputSchema>;

// Output schema
const CampaignStatusOutputSchema = z.object({
  success: z.boolean(),
  stats: z.object({
    sentToday: z.number(),
    sentTotal: z.number(),
    pendingApproval: z.number(),
    approved: z.number(),
    failed: z.number(),
    repliesReceived: z.number().optional(),
    recentReplies: z.array(z.object({
      companyName: z.string(),
      snippet: z.string(),
      receivedAt: z.string(),
    })).optional(),
  }).optional(),
  error: z.string().optional(),
});

type CampaignStatusOutput = z.infer<typeof CampaignStatusOutputSchema>;

/**
 * Tool handler
 */
export async function campaignStatusHandler(
  input: CampaignStatusInput,
  _context: { tenantId: string }
): Promise<CampaignStatusOutput> {
  try {
    const supabase = getSupabaseClient();
    if (!supabase) {
      return { success: false, error: 'Database not configured' };
    }
    
    // Get today's date range (UTC)
    const todayStart = new Date();
    todayStart.setUTCHours(0, 0, 0, 0);
    
    // Count sent today
    const { count: sentToday } = await supabase
      .schema('crm')
      .from('email_campaigns')
      .select('*', { count: 'exact', head: true })
      .not('sent_at', 'is', null)
      .gte('sent_at', todayStart.toISOString());
    
    // Count total sent
    const { count: sentTotal } = await supabase
      .schema('crm')
      .from('email_campaigns')
      .select('*', { count: 'exact', head: true })
      .not('sent_at', 'is', null);
    
    // Count pending approval
    const { count: pendingApproval } = await supabase
      .schema('crm')
      .from('email_campaigns')
      .select('*', { count: 'exact', head: true })
      .eq('approval_status', 'pending');
    
    // Count approved (ready to send)
    const { count: approved } = await supabase
      .schema('crm')
      .from('email_campaigns')
      .select('*', { count: 'exact', head: true })
      .eq('approval_status', 'approved')
      .is('sent_at', null);
    
    // Count failed
    const { count: failed } = await supabase
      .schema('crm')
      .from('email_campaigns')
      .select('*', { count: 'exact', head: true })
      .eq('approval_status', 'failed');
    
    const stats: CampaignStatusOutput['stats'] = {
      sentToday: sentToday || 0,
      sentTotal: sentTotal || 0,
      pendingApproval: pendingApproval || 0,
      approved: approved || 0,
      failed: failed || 0,
    };
    
    // Include replies if requested
    if (input.includeReplies) {
      // Count total replies
      const { count: repliesReceived } = await supabase
        .schema('crm')
        .from('email_campaigns')
        .select('*', { count: 'exact', head: true })
        .not('reply_detected_at', 'is', null);
      
      stats.repliesReceived = repliesReceived || 0;
      
      // Get recent replies
      const { data: recentRepliesData } = await supabase
        .schema('crm')
        .from('email_campaigns')
        .select(`
          reply_detected_at,
          reply_snippet,
          lead:leads(company_name)
        `)
        .not('reply_detected_at', 'is', null)
        .order('reply_detected_at', { ascending: false })
        .limit(5);
      
      if (recentRepliesData) {
        stats.recentReplies = recentRepliesData.map(r => ({
          companyName: (Array.isArray(r.lead) ? r.lead[0]?.company_name : r.lead?.company_name) || 'Unknown',
          snippet: r.reply_snippet || '',
          receivedAt: r.reply_detected_at || '',
        }));
      }
    }
    
    return { success: true, stats };
  } catch (error) {
    return {
      success: false,
      error: String(error),
    };
  }
}

// Register the tool
registry.register({
  id: 'email.campaign_status',
  name: 'Get Email Campaign Status',
  description: 'Get statistics about email campaigns including sent counts, pending emails, and replies. Use this to answer questions about campaign progress.',
  category: 'email',
  tier: 'free',
  inputSchema: CampaignStatusInputSchema,
  outputSchema: CampaignStatusOutputSchema,
  handler: campaignStatusHandler,
});

export default campaignStatusHandler;
