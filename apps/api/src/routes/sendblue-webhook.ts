// Sendblue webhook handler

import type { Context } from 'hono';
import { createLogger } from '@oneclaw/core';
import {
  parseWebhookPayload,
  isValidWebhookPayload,
} from '@oneclaw/sendblue';
import { processMessageSendblue } from '../services/message-processor-sendblue';

const log = createLogger('Sendblue:Webhook');

export async function sendblueWebhookHandler(c: Context) {
  try {
    const body = await c.req.json();

    log.debug('Received webhook', { body: JSON.stringify(body).substring(0, 200) });

    // Validate payload
    if (!isValidWebhookPayload(body)) {
      log.warn('Invalid webhook payload');
      return c.json({ error: 'Invalid payload' }, 400);
    }

    // Parse the message
    const message = parseWebhookPayload(body);

    if (!message) {
      // Outbound or non-message event - acknowledge but don't process
      log.debug('Skipping outbound or non-message event');
      return c.json({ received: true, processed: false });
    }

    log.info('Processing inbound message', {
      sender: message.sender.substring(0, 6) + '****',
      textLength: message.text.length,
    });

    // Process the message asynchronously
    // Return immediately to Sendblue to avoid duplicate webhooks
    processMessageSendblue(message).catch((error) => {
      log.error('Error processing message', error);
    });

    return c.json({ received: true, processing: true });
  } catch (error) {
    log.error('Webhook error', error);
    return c.json({ error: 'Internal server error' }, 500);
  }
}
