/**
 * Email Queue Processor
 * 
 * Background job that processes scheduled emails from the email_queue table.
 * Runs every minute via cron to send pending emails.
 * 
 * Can be triggered by:
 * - Vercel Cron: /api/cron/email-queue
 * - Manual: tsx scripts/process-email-queue.ts
 * - External cron: curl -X POST https://api.oneclaw.chat/api/cron/email-queue
 */

import { createGmailClient } from '@oneclaw/harness/gmail/client';

/**
 * Process email queue
 * Sends emails that are scheduled for now or earlier
 */
export async function processEmailQueue(): Promise<{
  processed: number;
  sent: number;
  failed: number;
  errors: string[];
}> {
  const stats = {
    processed: 0,
    sent: 0,
    failed: 0,
    errors: [] as string[],
  };
  
  try {
    // TODO: Implement with Supabase
    console.log('[Email Queue] Starting processor...');
    
    // FUTURE IMPLEMENTATION:
    // const supabase = createServiceClient();
    //
    // // Get pending emails scheduled for now or earlier
    // const { data: pendingEmails, error } = await supabase
    //   .from('email_queue')
    //   .select('*, gmail_accounts(*)')
    //   .eq('status', 'pending')
    //   .lte('scheduled_for', new Date().toISOString())
    //   .order('scheduled_for', { ascending: true })
    //   .limit(10);
    //
    // if (error) {
    //   console.error('[Email Queue] Query error:', error);
    //   stats.errors.push(error.message);
    //   return stats;
    // }
    //
    // if (!pendingEmails || pendingEmails.length === 0) {
    //   console.log('[Email Queue] No pending emails');
    //   return stats;
    // }
    //
    // const gmailClient = createGmailClient();
    //
    // for (const email of pendingEmails) {
    //   stats.processed++;
    //
    //   try {
    //     // Mark as sending
    //     await supabase
    //       .from('email_queue')
    //       .update({ status: 'sending' })
    //       .eq('id', email.id);
    //
    //     // Send email
    //     const result = await gmailClient.sendEmail(
    //       email.gmail_accounts,
    //       {
    //         to: email.to_email,
    //         subject: email.subject,
    //         body: email.body,
    //         fromName: email.to_name,
    //       }
    //     );
    //
    //     // Mark as sent
    //     await supabase
    //       .from('email_queue')
    //       .update({
    //         status: 'sent',
    //         sent_at: result.sent_at,
    //       })
    //       .eq('id', email.id);
    //
    //     // Record in email_messages
    //     await supabase
    //       .from('email_messages')
    //       .insert({
    //         user_id: email.user_id,
    //         gmail_account_id: email.gmail_account_id,
    //         business_id: email.business_id,
    //         gmail_message_id: result.gmail_message_id,
    //         gmail_thread_id: result.gmail_thread_id,
    //         direction: 'outbound',
    //         from_email: email.gmail_accounts.email,
    //         to_email: email.to_email,
    //         subject: email.subject,
    //         body_preview: email.body.substring(0, 200),
    //         body_full: email.body,
    //         sent_at: result.sent_at,
    //       });
    //
    //     // Increment daily send count
    //     await supabase.rpc('increment_daily_send_count', {
    //       account_id: email.gmail_account_id,
    //     });
    //
    //     stats.sent++;
    //     console.log(`[Email Queue] Sent email ${email.id} to ${email.to_email}`);
    //
    //   } catch (error) {
    //     stats.failed++;
    //     const errorMsg = error instanceof Error ? error.message : 'Unknown error';
    //     stats.errors.push(`${email.id}: ${errorMsg}`);
    //
    //     // Mark as failed
    //     await supabase
    //       .from('email_queue')
    //       .update({
    //         status: 'failed',
    //         error_message: errorMsg,
    //       })
    //       .eq('id', email.id);
    //
    //     console.error(`[Email Queue] Failed to send ${email.id}:`, error);
    //   }
    // }
    //
    // console.log('[Email Queue] Processor complete', stats);
    
    return stats;
    
  } catch (error) {
    console.error('[Email Queue] Processor error:', error);
    stats.errors.push(error instanceof Error ? error.message : 'Unknown error');
    return stats;
  }
}

/**
 * Hono route handler for cron endpoint
 */
export async function emailQueueCronHandler(c: any) {
  // Verify cron secret to prevent unauthorized triggers
  const cronSecret = c.req.header('x-cron-secret');
  const expectedSecret = process.env.CRON_SECRET || 'dev-secret';
  
  if (cronSecret !== expectedSecret) {
    return c.json({ error: 'Unauthorized' }, 401);
  }
  
  const stats = await processEmailQueue();
  return c.json(stats);
}
