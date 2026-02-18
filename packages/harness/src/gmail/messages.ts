import { z } from 'zod';

/**
 * Email direction enum
 */
export const EmailDirectionSchema = z.enum(['outbound', 'inbound']);
export type EmailDirection = z.infer<typeof EmailDirectionSchema>;

/**
 * Email Message Schema
 * Represents sent/received emails for Unibox
 */
export const EmailMessageSchema = z.object({
  id: z.string().describe('Unique ID with msg_ prefix'),
  user_id: z.string().describe('User who owns this message'),
  gmail_account_id: z.string().nullable().describe('Gmail account used (if outbound)'),
  business_id: z.string().nullable().describe('Associated business (if any)'),
  
  gmail_message_id: z.string().nullable().describe('Gmail API message ID for threading'),
  gmail_thread_id: z.string().nullable().describe('Gmail API thread ID'),
  
  direction: EmailDirectionSchema.describe('outbound (sent) or inbound (received)'),
  from_email: z.string().email().describe('Sender email address'),
  to_email: z.string().email().describe('Recipient email address'),
  subject: z.string().nullable().describe('Email subject line'),
  body_preview: z.string().nullable().describe('First 200 chars of body'),
  body_full: z.string().nullable().describe('Full email body'),
  
  is_read: z.boolean().default(false).describe('Whether user has read this message'),
  is_replied: z.boolean().default(false).describe('Whether this message has been replied to'),
  
  sent_at: z.string().nullable().describe('ISO timestamp when email was sent'),
  received_at: z.string().nullable().describe('ISO timestamp when email was received'),
  created_at: z.string().describe('ISO timestamp when record was created'),
});

export type EmailMessage = z.infer<typeof EmailMessageSchema>;

/**
 * Schema for inserting new email messages
 */
export const EmailMessageInsertSchema = EmailMessageSchema.omit({
  id: true,
  created_at: true,
  is_read: true,
  is_replied: true,
});

export type EmailMessageInsert = z.infer<typeof EmailMessageInsertSchema>;

/**
 * Schema for updating email messages
 */
export const EmailMessageUpdateSchema = EmailMessageSchema.partial().pick({
  is_read: true,
  is_replied: true,
  gmail_message_id: true,
  gmail_thread_id: true,
});

export type EmailMessageUpdate = z.infer<typeof EmailMessageUpdateSchema>;
