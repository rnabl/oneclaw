import { z } from 'zod';

/**
 * Email queue status enum
 */
export const EmailQueueStatusSchema = z.enum([
  'pending',
  'sending',
  'sent',
  'failed',
  'cancelled',
]);

export type EmailQueueStatus = z.infer<typeof EmailQueueStatusSchema>;

/**
 * Email Queue Schema
 * Represents scheduled emails waiting to be sent
 */
export const EmailQueueSchema = z.object({
  id: z.string().describe('Unique ID with emq_ prefix'),
  user_id: z.string().describe('User who created this email'),
  gmail_account_id: z.string().nullable().describe('Gmail account to send from'),
  business_id: z.string().nullable().describe('Associated business (if any)'),
  
  to_email: z.string().email().describe('Recipient email address'),
  to_name: z.string().nullable().describe('Recipient name'),
  subject: z.string().describe('Email subject'),
  body: z.string().describe('Email body (plain text or HTML)'),
  
  scheduled_for: z.string().describe('ISO timestamp when email should be sent'),
  status: EmailQueueStatusSchema.default('pending').describe('Current status of email'),
  error_message: z.string().nullable().describe('Error message if sending failed'),
  
  created_at: z.string().describe('ISO timestamp when queued'),
  sent_at: z.string().nullable().describe('ISO timestamp when actually sent'),
});

export type EmailQueue = z.infer<typeof EmailQueueSchema>;

/**
 * Schema for inserting new queued emails
 */
export const EmailQueueInsertSchema = EmailQueueSchema.omit({
  id: true,
  created_at: true,
  sent_at: true,
  status: true,
  error_message: true,
});

export type EmailQueueInsert = z.infer<typeof EmailQueueInsertSchema>;

/**
 * Schema for updating queued emails
 */
export const EmailQueueUpdateSchema = EmailQueueSchema.partial().pick({
  status: true,
  error_message: true,
  sent_at: true,
  gmail_account_id: true,
});

export type EmailQueueUpdate = z.infer<typeof EmailQueueUpdateSchema>;
