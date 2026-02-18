/**
 * Audit Website Workflow Configuration
 */

import { z } from 'zod';
import { AuditInputSchema, AuditResultSchema } from './types';
import type { WorkflowDefinition } from '@oneclaw/engine';

export const auditWorkflowConfig: WorkflowDefinition<
  z.infer<typeof AuditInputSchema>,
  z.infer<typeof AuditResultSchema>
> = {
  id: 'audit-website',
  name: 'Website Audit',
  version: '1.0.0',
  description: 'Comprehensive website audit including SEO, AI visibility, local presence, and technical analysis',
  
  inputSchema: AuditInputSchema,
  outputSchema: AuditResultSchema,
  
  timeoutMs: 120_000, // 2 minutes max
  
  retryPolicy: {
    maxAttempts: 3,
    initialDelayMs: 1000,
    maxDelayMs: 10000,
    backoffMultiplier: 2,
  },
  
  tags: ['audit', 'seo', 'ai-visibility', 'local-seo'],
};
