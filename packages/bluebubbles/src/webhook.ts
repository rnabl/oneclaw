// BlueBubbles webhook parsing utilities

import { extractPhoneFromSender } from '@oneclaw/core';
import type { IncomingMessage } from '@oneclaw/core';
import type { WebhookPayload, MessageData } from './types';

/**
 * Parse a BlueBubbles webhook payload
 */
export function parseWebhookPayload(body: unknown): WebhookPayload | null {
  if (!body || typeof body !== 'object') {
    return null;
  }

  const payload = body as Record<string, unknown>;

  if (!payload.type || !payload.data) {
    return null;
  }

  return payload as unknown as WebhookPayload;
}

/**
 * Check if webhook is a new message event
 */
export function isNewMessageEvent(payload: WebhookPayload): boolean {
  return payload.type === 'new-message';
}

/**
 * Check if the message is from a user (not from the bot itself)
 */
export function isIncomingMessage(data: MessageData): boolean {
  return !data.isFromMe && !data.isSystemMessage && !data.isServiceMessage;
}

/**
 * Convert BlueBubbles message data to our IncomingMessage format
 */
export function toIncomingMessage(data: MessageData): IncomingMessage | null {
  // Skip messages from ourselves
  if (data.isFromMe) {
    return null;
  }

  // Skip system messages
  if (data.isSystemMessage || data.isServiceMessage) {
    return null;
  }

  // Skip messages without text
  if (!data.text) {
    return null;
  }

  // Get sender from handle
  const senderAddress = data.handle?.address;
  if (!senderAddress) {
    return null;
  }

  // Get chat GUID
  const chatGuid = data.chats?.[0]?.guid;
  if (!chatGuid) {
    return null;
  }

  return {
    id: data.guid,
    guid: data.guid,
    text: data.text,
    sender: extractPhoneFromSender(senderAddress),
    timestamp: data.dateCreated,
    isFromMe: data.isFromMe,
    chatGuid,
    attachments: data.attachments?.map((att) => ({
      guid: att.guid,
      filename: att.transferName,
      mimeType: att.mimeType,
    })),
  };
}

/**
 * Extract chat GUID from message data
 */
export function extractChatGuid(data: MessageData): string | null {
  return data.chats?.[0]?.guid || null;
}

/**
 * Create a chat GUID for a phone number (for starting new conversations)
 */
export function createChatGuidForPhone(phoneNumber: string): string {
  // BlueBubbles uses this format for iMessage
  return `iMessage;-;${phoneNumber}`;
}

/**
 * Validate webhook signature (if BlueBubbles supports it)
 * Currently BlueBubbles doesn't have webhook signatures, but this is a placeholder
 */
export function validateWebhookSignature(
  _body: string,
  _signature: string | null,
  _secret: string
): boolean {
  // BlueBubbles doesn't currently sign webhooks
  // This is a placeholder for future implementation
  return true;
}
