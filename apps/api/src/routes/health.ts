// Health check endpoint - must respond fast, no external calls

import type { Context } from 'hono';

export async function healthHandler(c: Context) {
  // Simple health check - just confirm API is running
  // Don't call external services (Supabase, BlueBubbles) - they can hang
  return c.json(
    {
      status: 'ok',
      timestamp: new Date().toISOString(),
    },
    200
  );
}
