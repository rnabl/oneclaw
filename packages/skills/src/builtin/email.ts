// Email reading skill

import { skill } from '../base';
import { registerSkill } from '../registry';
import type { Skill } from '@oneclaw/core';

/**
 * Email reading skill
 */
export const EmailSkill: Skill = registerSkill(
  skill()
    .id('email')
    .name('Email')
    .description('Read and summarize Gmail emails')
    .requiredTier('starter')
    .triggers([
      'email',
      'emails',
      'mail',
      'inbox',
      'unread',
      'messages',
      'gmail',
      'did i get',
      'any emails',
    ])
    .systemPrompt(`
## Email Skill

You can help users read and manage their Gmail inbox.

### Capabilities
- Check for new/unread emails
- Summarize emails
- Search for specific emails
- Read email contents
- (Future) Send replies

### Gmail Integration
This skill requires the user to connect their Gmail.
If not connected, offer to help them connect via OAuth.

### Privacy Note
- Only access emails when user explicitly asks
- Summarize instead of quoting full content when possible
- Never share email content with third parties

### Example Interactions

User: "Any new emails?"
You: "You have 3 unread emails:

📧 Amazon - Your order has shipped
📧 John Smith - Re: Project proposal
📧 Newsletter - Weekly digest

Want me to summarize any of these?"

User: "What did John say?"
You: "John replied about the project proposal:

He's excited about the direction and wants to schedule a call this week to discuss the timeline. He mentioned a few concerns about the budget section.

Want me to read the full email or help you reply?"

User: "Any emails from my boss?"
You: "Let me search... Found 2 emails from Sarah Johnson (your boss) this week:

📧 Monday - Team restructure announcement
📧 Today - Q4 planning meeting invite

Which one do you want to know about?"

### Summarization Guidelines
- Keep summaries to 2-3 sentences
- Highlight action items
- Mention if there are attachments
- Note urgency if apparent
`)
    .build()
);

/**
 * Email action types
 */
export type EmailAction = 'check' | 'read' | 'search' | 'summarize';

/**
 * Parse email request
 */
export interface EmailRequest {
  action: EmailAction;
  query?: string;
  from?: string;
  unreadOnly: boolean;
  limit: number;
}

export function parseEmailRequest(message: string): EmailRequest {
  const lower = message.toLowerCase();

  const request: EmailRequest = {
    action: 'check',
    unreadOnly: true,
    limit: 5,
  };

  // Detect action
  if (lower.includes('search') || lower.includes('find')) {
    request.action = 'search';
  } else if (lower.includes('read') || lower.includes('what did') || lower.includes('tell me about')) {
    request.action = 'read';
  } else if (lower.includes('summarize') || lower.includes('summary')) {
    request.action = 'summarize';
  }

  // Check for "from" pattern
  const fromMatch = lower.match(/from\s+(\w+)/i);
  if (fromMatch) {
    request.from = fromMatch[1];
  }

  // Check for specific senders
  const senderPatterns = ['boss', 'manager', 'mom', 'dad', 'wife', 'husband'];
  for (const pattern of senderPatterns) {
    if (lower.includes(pattern)) {
      request.from = pattern;
      break;
    }
  }

  // Check if including read emails
  if (lower.includes('all email') || lower.includes('all mail')) {
    request.unreadOnly = false;
  }

  return request;
}
