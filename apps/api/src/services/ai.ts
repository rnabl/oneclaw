// AI service - handles LLM API interactions via OpenRouter
// Supports multiple models: MiniMax, Claude, GPT-4, etc.

import { createLogger, MAX_HISTORY_MESSAGES, stripMarkdown } from '@oneclaw/core';
import type { ConversationContext } from '@oneclaw/core';

const log = createLogger('AI');

// OpenRouter API endpoint
const OPENROUTER_API_URL = 'https://openrouter.ai/api/v1/chat/completions';

// Default model - MiniMax M2.5 (fast, cheap, good)
const DEFAULT_MODEL = process.env.OPENROUTER_MODEL || 'minimax/minimax-m2.5';

// Available models via OpenRouter:
// - minimax/minimax-01 (fast, cheap)
// - anthropic/claude-sonnet-4 (balanced)
// - anthropic/claude-3.5-sonnet (good)
// - openai/gpt-4o (expensive but good)
// - google/gemini-2.0-flash-001 (fast)

interface OpenRouterMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

interface OpenRouterResponse {
  id: string;
  choices: Array<{
    message: {
      role: string;
      content: string;
    };
    finish_reason: string;
  }>;
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

/**
 * Generate AI response using OpenRouter
 */
export async function generateAIResponse(
  systemPrompt: string,
  context: ConversationContext
): Promise<string> {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    throw new Error('OPENROUTER_API_KEY not configured');
  }

  const model = DEFAULT_MODEL;
  log.debug('Generating AI response', { model });

  try {
    // Build messages array
    const messages: OpenRouterMessage[] = [];

    // Add system prompt
    messages.push({
      role: 'system',
      content: systemPrompt,
    });

    // Add conversation history (limited)
    const historyStart = Math.max(0, context.messages.length - MAX_HISTORY_MESSAGES);
    for (let i = historyStart; i < context.messages.length; i++) {
      const msg = context.messages[i];
      messages.push({
        role: msg.role as 'user' | 'assistant',
        content: msg.content,
      });
    }

    // Add current message
    messages.push({
      role: 'user',
      content: context.currentMessage,
    });

    // Call OpenRouter API
    const response = await fetch(OPENROUTER_API_URL, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'https://oneclaw.chat',
        'X-Title': 'OneClaw',
      },
      body: JSON.stringify({
        model,
        messages,
        max_tokens: 1024,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      log.error('OpenRouter API error', { status: response.status, error: errorText });
      
      if (response.status === 429) {
        return "I'm getting a lot of requests right now. Give me a moment and try again.";
      }
      if (response.status === 401) {
        return "I'm having a configuration issue. Please try again later.";
      }
      throw new Error(`OpenRouter API error: ${response.status}`);
    }

    const data: OpenRouterResponse = await response.json();

    // Extract text response
    const content = data.choices?.[0]?.message?.content;
    
    if (!content) {
      log.warn('No content in AI response');
      return "I'm having trouble responding right now. Can you try again?";
    }

    log.debug('AI response generated', { 
      model,
      tokens: data.usage?.total_tokens,
    });

    // Strip any markdown for iMessage compatibility
    return stripMarkdown(content);
  } catch (error) {
    log.error('AI generation error', error);
    throw error;
  }
}

/**
 * Generate a quick response without full context (for simple queries)
 */
export async function quickResponse(prompt: string): Promise<string> {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    throw new Error('OPENROUTER_API_KEY not configured');
  }

  const model = DEFAULT_MODEL;

  const response = await fetch(OPENROUTER_API_URL, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': 'https://oneclaw.chat',
      'X-Title': 'OneClaw',
    },
    body: JSON.stringify({
      model,
      messages: [{ role: 'user', content: prompt }],
      max_tokens: 256,
    }),
  });

  if (!response.ok) {
    throw new Error(`OpenRouter API error: ${response.status}`);
  }

  const data: OpenRouterResponse = await response.json();
  return data.choices?.[0]?.message?.content || '';
}
