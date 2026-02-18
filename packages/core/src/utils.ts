// Core utilities for OneClaw

import { PRO_ONLY_FEATURES, BILLING_PERIOD_FORMAT } from './constants';
import type { UserTier } from './types';

/**
 * Get current billing period in YYYY-MM format
 */
export function getCurrentBillingPeriod(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  return `${year}-${month}`;
}

/**
 * Normalize phone number to E.164 format
 */
export function normalizePhoneNumber(phone: string): string {
  // Remove all non-digit characters
  const digits = phone.replace(/\D/g, '');
  
  // Handle US numbers
  if (digits.length === 10) {
    return `+1${digits}`;
  }
  
  // Already has country code
  if (digits.length === 11 && digits.startsWith('1')) {
    return `+${digits}`;
  }
  
  // Return as-is if already formatted or unknown format
  if (phone.startsWith('+')) {
    return phone;
  }
  
  return `+${digits}`;
}

/**
 * Extract phone number from iMessage sender
 * BlueBubbles may send as email or phone
 */
export function extractPhoneFromSender(sender: string): string {
  // If it's an email, return as-is (iMessage email)
  if (sender.includes('@')) {
    return sender.toLowerCase();
  }
  
  return normalizePhoneNumber(sender);
}

/**
 * Check if a message contains Pro-only feature requests
 */
export function containsProFeature(message: string): string | null {
  const lowerMessage = message.toLowerCase();
  
  for (const feature of PRO_ONLY_FEATURES) {
    if (lowerMessage.includes(feature)) {
      return feature;
    }
  }
  
  return null;
}

/**
 * Check if user has access to a feature based on tier
 */
export function hasFeatureAccess(tier: UserTier, requiredTier: UserTier): boolean {
  const tierOrder: UserTier[] = ['none', 'starter', 'pro'];
  return tierOrder.indexOf(tier) >= tierOrder.indexOf(requiredTier);
}

/**
 * Check if user can use Pro features
 */
export function isProUser(tier: UserTier): boolean {
  return tier === 'pro';
}

/**
 * Check if user has any active subscription
 */
export function hasActiveSubscription(tier: UserTier): boolean {
  return tier === 'starter' || tier === 'pro';
}

/**
 * Generate a unique temp GUID for messages
 */
export function generateTempGuid(): string {
  return `temp-${Date.now()}-${Math.random().toString(36).substring(7)}`;
}

/**
 * Truncate text to max length with ellipsis
 */
export function truncate(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  return text.slice(0, maxLength - 3) + '...';
}

/**
 * Sleep for specified milliseconds
 */
export function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Retry a function with exponential backoff
 */
export async function retry<T>(
  fn: () => Promise<T>,
  maxAttempts: number = 3,
  baseDelay: number = 1000
): Promise<T> {
  let lastError: Error | undefined;
  
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error as Error;
      
      if (attempt === maxAttempts) {
        throw lastError;
      }
      
      const delay = baseDelay * Math.pow(2, attempt - 1);
      await sleep(delay);
    }
  }
  
  throw lastError;
}

/**
 * Safe JSON parse with fallback
 */
export function safeJsonParse<T>(json: string, fallback: T): T {
  try {
    return JSON.parse(json) as T;
  } catch {
    return fallback;
  }
}

/**
 * Format date for display
 */
export function formatDate(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  return d.toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

/**
 * Mask phone number for logging (keeps first 6 digits, masks rest)
 */
export function maskPhoneNumber(phone: string): string {
  if (phone.length <= 6) return phone;
  return phone.substring(0, 6) + '****';
}

/**
 * Strip markdown formatting for iMessage
 * Converts markdown to plain text
 */
export function stripMarkdown(text: string): string {
  return text
    // Remove bold **text** or __text__
    .replace(/\*\*(.+?)\*\*/g, '$1')
    .replace(/__(.+?)__/g, '$1')
    // Remove italic *text* or _text_
    .replace(/\*(.+?)\*/g, '$1')
    .replace(/_(.+?)_/g, '$1')
    // Remove headers ### 
    .replace(/^#{1,6}\s+/gm, '')
    // Remove code blocks ```
    .replace(/```[\s\S]*?```/g, '')
    // Remove inline code `text`
    .replace(/`(.+?)`/g, '$1')
    // Remove links [text](url) -> text
    .replace(/\[(.+?)\]\(.+?\)/g, '$1')
    // Clean up extra whitespace
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/**
 * Mask sensitive data for logging
 */
export function maskSensitive(text: string): string {
  // Mask phone numbers
  let masked = text.replace(/\+?\d{10,}/g, '***PHONE***');
  
  // Mask emails
  masked = masked.replace(/[\w.-]+@[\w.-]+\.\w+/g, '***EMAIL***');
  
  // Mask API keys
  masked = masked.replace(/sk_[a-zA-Z0-9_]+/g, '***API_KEY***');
  masked = masked.replace(/whsec_[a-zA-Z0-9_]+/g, '***WEBHOOK_SECRET***');
  
  return masked;
}

/**
 * Create a logger with context
 */
export function createLogger(context: string) {
  const prefix = `[OneClaw:${context}]`;
  
  return {
    info: (message: string, data?: Record<string, unknown>) => {
      console.log(prefix, message, data ? JSON.stringify(data) : '');
    },
    error: (message: string, error?: Error | unknown) => {
      console.error(prefix, message, error);
    },
    warn: (message: string, data?: Record<string, unknown>) => {
      console.warn(prefix, message, data ? JSON.stringify(data) : '');
    },
    debug: (message: string, data?: Record<string, unknown>) => {
      if (process.env.DEBUG) {
        console.debug(prefix, message, data ? JSON.stringify(data) : '');
      }
    },
  };
}
