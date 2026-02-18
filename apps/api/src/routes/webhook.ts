// BlueBubbles webhook handler

import type { Context } from 'hono';
import { createLogger } from '@oneclaw/core';
import {
  parseWebhookPayload,
  isNewMessageEvent,
  toIncomingMessage,
  createBlueBubblesClient,
} from '@oneclaw/bluebubbles';
import type { MessageData } from '@oneclaw/bluebubbles';
import { processMessage } from '../services/message-processor';

const log = createLogger('Webhook');

export async function webhookHandler(c: Context) {
  try {
    const body = await c.req.json();
    
    // Parse the webhook payload
    const payload = parseWebhookPayload(body);
    
    if (!payload) {
      log.warn('Invalid webhook payload');
      return c.json({ error: 'Invalid payload' }, 400);
    }

    // Only handle new messages
    if (!isNewMessageEvent(payload)) {
      log.debug('Ignoring non-message event', { type: payload.type });
      return c.json({ received: true, processed: false });
    }

    const messageData = payload.data as MessageData;
    
    // Convert to our message format
    const message = toIncomingMessage(messageData);
    
    if (!message) {
      log.debug('Message not processable (from self or system)');
      return c.json({ received: true, processed: false });
    }

    log.info('Processing message', {
      sender: message.sender.substring(0, 6) + '***',
      chatGuid: message.chatGuid,
    });

    // Process the message asynchronously
    // Don't await - return immediately to BlueBubbles
    processMessage(message).catch((error) => {
      log.error('Error processing message', error);
    });

    return c.json({ received: true, processing: true });
  } catch (error) {
    log.error('Webhook error', error);
    return c.json({ error: 'Internal server error' }, 500);
  }
}
