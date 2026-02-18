// Sendblue webhook handler

import { createLogger, maskPhoneNumber } from '@oneclaw/core';
import type { WebhookPayload, ParsedMessage } from './types';

const log = createLogger('Sendblue:Webhook');

/**
 * Parse incoming Sendblue webhook payload
 */
export function parseWebhookPayload(payload: WebhookPayload): ParsedMessage | null {
  // Skip outbound messages (messages we sent)
  if (payload.is_outbound) {
    log.debug('Skipping outbound message');
    return null;
  }

  // Skip non-message types
  if (payload.message_type !== 'message') {
    log.debug('Skipping non-message type', { type: payload.message_type });
    return null;
  }

  // Skip empty messages
  if (!payload.content && !payload.media_url) {
    log.debug('Skipping empty message');
    return null;
  }

  const parsed: ParsedMessage = {
    sender: payload.from_number || payload.number,
    recipient: payload.to_number || payload.sendblue_number,
    text: payload.content || '',
    mediaUrl: payload.media_url || undefined,
    isOutbound: payload.is_outbound,
    messageId: payload.message_handle,
    timestamp: payload.date_sent,
    service: payload.service,
  };

  log.info('Parsed inbound message', {
    sender: maskPhoneNumber(parsed.sender),
    hasMedia: !!parsed.mediaUrl,
    textLength: parsed.text.length,
  });

  return parsed;
}

/**
 * Validate webhook payload has required fields
 */
export function isValidWebhookPayload(payload: unknown): payload is WebhookPayload {
  if (!payload || typeof payload !== 'object') {
    return false;
  }

  const p = payload as Record<string, unknown>;

  // Check for required fields
  return (
    typeof p.message_handle === 'string' &&
    (typeof p.from_number === 'string' || typeof p.number === 'string') &&
    typeof p.is_outbound === 'boolean'
  );
}
