// BlueBubbles API client

import { createLogger, generateTempGuid, retry } from '@oneclaw/core';
import type {
  BlueBubblesConfig,
  SendMessageRequest,
  SendMessageResponse,
  MessageData,
  ChatData,
} from './types';

const log = createLogger('BlueBubbles');

/**
 * BlueBubbles API client
 */
export class BlueBubblesClient {
  private serverUrl: string;
  private password: string;

  constructor(config: BlueBubblesConfig) {
    this.serverUrl = config.serverUrl.replace(/\/$/, ''); // Remove trailing slash
    this.password = config.password;
  }

  /**
   * Make an authenticated API request
   */
  private async request<T>(
    method: 'GET' | 'POST' | 'PUT' | 'DELETE',
    endpoint: string,
    body?: unknown
  ): Promise<T> {
    const url = `${this.serverUrl}/api/v1${endpoint}?password=${encodeURIComponent(this.password)}`;

    const options: RequestInit = {
      method,
      headers: {
        'Content-Type': 'application/json',
      },
    };

    if (body) {
      options.body = JSON.stringify(body);
    }

    const response = await fetch(url, options);

    if (!response.ok) {
      const errorText = await response.text();
      log.error(`API error: ${response.status}`, new Error(errorText));
      throw new Error(`BlueBubbles API error: ${response.status} - ${errorText}`);
    }

    return response.json() as Promise<T>;
  }

  /**
   * Send a message to a chat
   */
  async sendMessage(
    chatGuid: string,
    message: string,
    options?: Partial<SendMessageRequest>
  ): Promise<SendMessageResponse> {
    log.info('Sending message', { chatGuid, messageLength: message.length });

    const payload: SendMessageRequest = {
      chatGuid,
      message,
      tempGuid: options?.tempGuid || generateTempGuid(),
      method: options?.method || 'private-api',
      ...options,
    };

    return retry(
      () => this.request<SendMessageResponse>('POST', '/message/text', payload),
      3,
      1000
    );
  }

  /**
   * Send a reply to a specific message
   */
  async sendReply(
    chatGuid: string,
    message: string,
    replyToGuid: string,
    partIndex: number = 0
  ): Promise<SendMessageResponse> {
    log.info('Sending reply', { chatGuid, replyToGuid });

    return this.sendMessage(chatGuid, message, {
      selectedMessageGuid: replyToGuid,
      partIndex,
    });
  }

  /**
   * Get a specific message by GUID
   */
  async getMessage(guid: string): Promise<MessageData> {
    log.debug('Getting message', { guid });
    const response = await this.request<{ data: MessageData }>('GET', `/message/${guid}`);
    return response.data;
  }

  /**
   * Get recent messages for a chat
   */
  async getChatMessages(
    chatGuid: string,
    limit: number = 25,
    offset: number = 0
  ): Promise<MessageData[]> {
    log.debug('Getting chat messages', { chatGuid, limit, offset });
    const response = await this.request<{ data: MessageData[] }>(
      'GET',
      `/chat/${chatGuid}/message?limit=${limit}&offset=${offset}`
    );
    return response.data;
  }

  /**
   * Get all chats
   */
  async getChats(limit: number = 25, offset: number = 0): Promise<ChatData[]> {
    log.debug('Getting chats', { limit, offset });
    const response = await this.request<{ data: ChatData[] }>(
      'GET',
      `/chat?limit=${limit}&offset=${offset}`
    );
    return response.data;
  }

  /**
   * Get a specific chat by GUID
   */
  async getChat(chatGuid: string): Promise<ChatData> {
    log.debug('Getting chat', { chatGuid });
    const response = await this.request<{ data: ChatData }>('GET', `/chat/${chatGuid}`);
    return response.data;
  }

  /**
   * Mark a chat as read
   */
  async markChatRead(chatGuid: string): Promise<void> {
    log.debug('Marking chat read', { chatGuid });
    await this.request('POST', `/chat/${chatGuid}/read`);
  }

  /**
   * Get server info
   */
  async getServerInfo(): Promise<Record<string, unknown>> {
    log.debug('Getting server info');
    return this.request<Record<string, unknown>>('GET', '/server/info');
  }

  /**
   * Check if server is reachable
   */
  async ping(): Promise<boolean> {
    try {
      await this.getServerInfo();
      return true;
    } catch {
      return false;
    }
  }
}

/**
 * Create a BlueBubbles client from environment variables
 */
export function createBlueBubblesClient(): BlueBubblesClient {
  const serverUrl = process.env.BLUEBUBBLES_URL;
  const password = process.env.BLUEBUBBLES_PASSWORD;

  if (!serverUrl || !password) {
    throw new Error('Missing BLUEBUBBLES_URL or BLUEBUBBLES_PASSWORD');
  }

  return new BlueBubblesClient({ serverUrl, password });
}
