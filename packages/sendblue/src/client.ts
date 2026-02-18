// Sendblue API client

import { createLogger, retry } from '@oneclaw/core';
import type { SendblueConfig, SendMessageRequest, SendMessageResponse } from './types';

const log = createLogger('Sendblue');

const SENDBLUE_API_URL = 'https://api.sendblue.co/api';

/**
 * Sendblue API client
 */
export class SendblueClient {
  private apiKey: string;
  private apiSecret: string;
  private fromNumber: string;

  constructor(config: SendblueConfig) {
    this.apiKey = config.apiKey;
    this.apiSecret = config.apiSecret;
    this.fromNumber = config.fromNumber;
  }

  /**
   * Make an authenticated API request
   */
  private async request<T>(
    method: 'GET' | 'POST' | 'PUT' | 'DELETE',
    endpoint: string,
    body?: unknown
  ): Promise<T> {
    const url = `${SENDBLUE_API_URL}${endpoint}`;

    const options: RequestInit = {
      method,
      headers: {
        'Content-Type': 'application/json',
        'sb-api-key-id': this.apiKey,
        'sb-api-secret-key': this.apiSecret,
      },
    };

    if (body) {
      options.body = JSON.stringify(body);
    }

    const response = await fetch(url, options);

    if (!response.ok) {
      const errorText = await response.text();
      log.error(`API error: ${response.status}`, new Error(errorText));
      throw new Error(`Sendblue API error: ${response.status} - ${errorText}`);
    }

    return response.json() as Promise<T>;
  }

  /**
   * Send a message to a phone number
   */
  async sendMessage(
    phoneNumber: string,
    message: string,
    options?: Partial<SendMessageRequest>
  ): Promise<SendMessageResponse> {
    log.info('Sending message', { to: phoneNumber.slice(0, -4) + '****', messageLength: message.length });

    const payload: SendMessageRequest = {
      number: phoneNumber,
      from_number: this.fromNumber,
      content: message,
      ...options,
    };

    return retry(
      () => this.request<SendMessageResponse>('POST', '/send-message', payload),
      3,
      1000
    );
  }

  /**
   * Send a message with media
   */
  async sendMediaMessage(
    phoneNumber: string,
    mediaUrl: string,
    message?: string
  ): Promise<SendMessageResponse> {
    log.info('Sending media message', { to: phoneNumber.slice(0, -4) + '****' });

    return this.sendMessage(phoneNumber, message || '', { media_url: mediaUrl });
  }

  /**
   * Send a message with expressive style
   */
  async sendStyledMessage(
    phoneNumber: string,
    message: string,
    style: SendMessageRequest['send_style']
  ): Promise<SendMessageResponse> {
    log.info('Sending styled message', { to: phoneNumber.slice(0, -4) + '****', style });

    return this.sendMessage(phoneNumber, message, { send_style: style });
  }
}

/**
 * Create a Sendblue client from environment variables
 */
export function createSendblueClient(): SendblueClient {
  const apiKey = process.env.SENDBLUE_API_KEY;
  const apiSecret = process.env.SENDBLUE_API_SECRET;
  const fromNumber = process.env.SENDBLUE_FROM_NUMBER;

  if (!apiKey || !apiSecret || !fromNumber) {
    throw new Error('Missing SENDBLUE_API_KEY, SENDBLUE_API_SECRET, or SENDBLUE_FROM_NUMBER');
  }

  return new SendblueClient({ apiKey, apiSecret, fromNumber });
}
