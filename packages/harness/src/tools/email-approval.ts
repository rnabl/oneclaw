/**
 * Email Approval Tools
 * 
 * Handles email draft approval/rejection workflow
 */

import { z } from 'zod';
import { createClient } from '@supabase/supabase-js';
import {
  getPendingEmailDrafts,
  approveEmail,
  rejectEmail,
} from '../outreach/email-approval';

// =============================================================================
// SCHEMAS
// =============================================================================

const GetPendingEmailsInput = z.object({
  userId: z.string(),
  limit: z.number().optional().default(50),
});

const GetPendingEmailsOutput = z.object({
  emails: z.array(z.object({
    id: z.string(),
    leadId: z.string(),
    businessName: z.string(),
    ownerEmail: z.string(),
    subject: z.string(),
    body: z.string(),
    createdAt: z.string(),
  })),
  total: z.number(),
});

const ApproveEmailInput = z.object({
  userId: z.string(),
  emailId: z.string(),
  edits: z.object({
    subject: z.string().optional(),
    body: z.string().optional(),
  }).optional(),
});

const ApproveEmailOutput = z.object({
  success: z.boolean(),
  emailId: z.string(),
  message: z.string(),
});

const RejectEmailInput = z.object({
  userId: z.string(),
  emailId: z.string(),
  reason: z.string().optional(),
});

const RejectEmailOutput = z.object({
  success: z.boolean(),
  emailId: z.string(),
  message: z.string(),
});

// =============================================================================
// HANDLERS
// =============================================================================

export async function getPendingEmailsHandler(
  input: z.infer<typeof GetPendingEmailsInput>,
  context: { tenantId: string }
): Promise<z.infer<typeof GetPendingEmailsOutput>> {
  const { userId, limit } = input;

  try {
    const result = await getPendingEmailDrafts(limit);
    
    if (!result.success || !result.drafts) {
      throw new Error(result.error || 'Failed to get pending emails');
    }

    return {
      emails: result.drafts.map((draft: any) => ({
        id: draft.id,
        leadId: draft.lead?.id || '',
        businessName: draft.lead?.company_name || 'Unknown',
        ownerEmail: draft.lead?.email || '',
        subject: draft.subject,
        body: draft.body,
        createdAt: draft.created_at,
      })),
      total: result.drafts.length,
    };
  } catch (error) {
    throw new Error(
      `Failed to get pending emails: ${error instanceof Error ? error.message : 'Unknown error'}`
    );
  }
}

export async function approveEmailHandler(
  input: z.infer<typeof ApproveEmailInput>,
  context: { tenantId: string }
): Promise<z.infer<typeof ApproveEmailOutput>> {
  const { userId, emailId, edits } = input;

  try {
    const result = await approveEmail(emailId, userId);

    if (!result.success) {
      throw new Error(result.error || 'Failed to approve email');
    }

    return {
      success: true,
      emailId,
      message: 'Email approved successfully',
    };
  } catch (error) {
    return {
      success: false,
      emailId,
      message: `Failed to approve email: ${error instanceof Error ? error.message : 'Unknown error'}`,
    };
  }
}

export async function rejectEmailHandler(
  input: z.infer<typeof RejectEmailInput>,
  context: { tenantId: string }
): Promise<z.infer<typeof RejectEmailOutput>> {
  const { userId, emailId, reason } = input;

  try {
    const result = await rejectEmail(emailId, reason || 'No reason provided', userId);

    if (!result.success) {
      throw new Error(result.error || 'Failed to reject email');
    }

    return {
      success: true,
      emailId,
      message: 'Email rejected successfully',
    };
  } catch (error) {
    return {
      success: false,
      emailId,
      message: `Failed to reject email: ${error instanceof Error ? error.message : 'Unknown error'}`,
    };
  }
}

// =============================================================================
// TOOL DEFINITIONS
// =============================================================================

export const GET_PENDING_EMAILS_TOOL = {
  id: 'get-pending-emails',
  name: 'get-pending-emails',
  description: 'Get all pending email drafts awaiting approval',
  version: '1.0.0',
  costClass: 'free' as const,
  estimatedCostUsd: 0,
  requiredSecrets: ['supabase'] as string[],
  tags: ['email', 'outreach', 'approval', 'campaign'],
  inputSchema: GetPendingEmailsInput,
  outputSchema: GetPendingEmailsOutput,
  networkPolicy: {
    allowedDomains: ['*.supabase.co'],
    blockedDomains: [],
    allowLocalhost: false,
  },
  isPublic: true,
  handler: async (input: unknown, context: { tenantId: string }) => {
    const validated = GetPendingEmailsInput.parse(input);
    return getPendingEmailsHandler(validated, context);
  },
};

export const APPROVE_EMAIL_TOOL = {
  id: 'approve-email',
  name: 'approve-email',
  description: 'Approve an email draft for sending',
  version: '1.0.0',
  costClass: 'free' as const,
  estimatedCostUsd: 0,
  requiredSecrets: ['supabase'] as string[],
  tags: ['email', 'outreach', 'approval', 'campaign'],
  inputSchema: ApproveEmailInput,
  outputSchema: ApproveEmailOutput,
  networkPolicy: {
    allowedDomains: ['*.supabase.co'],
    blockedDomains: [],
    allowLocalhost: false,
  },
  isPublic: true,
  handler: async (input: unknown, context: { tenantId: string }) => {
    const validated = ApproveEmailInput.parse(input);
    return approveEmailHandler(validated, context);
  },
};

export const REJECT_EMAIL_TOOL = {
  id: 'reject-email',
  name: 'reject-email',
  description: 'Reject an email draft',
  version: '1.0.0',
  costClass: 'free' as const,
  estimatedCostUsd: 0,
  requiredSecrets: ['supabase'] as string[],
  tags: ['email', 'outreach', 'approval', 'campaign'],
  inputSchema: RejectEmailInput,
  outputSchema: RejectEmailOutput,
  networkPolicy: {
    allowedDomains: ['*.supabase.co'],
    blockedDomains: [],
    allowLocalhost: false,
  },
  isPublic: true,
  handler: async (input: unknown, context: { tenantId: string }) => {
    const validated = RejectEmailInput.parse(input);
    return rejectEmailHandler(validated, context);
  },
};

export {
  GetPendingEmailsInput,
  GetPendingEmailsOutput,
  ApproveEmailInput,
  ApproveEmailOutput,
  RejectEmailInput,
  RejectEmailOutput,
};
