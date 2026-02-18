import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['cjs', 'esm'],
  dts: false,
  clean: true,
  external: [
    'zod',
    '@supabase/supabase-js',
    '@anthropic-ai/sdk',
    'hono',
    '@hono/node-server',
  ],
  noExternal: [
    '@oneclaw/harness',
    '@oneclaw/core',
    '@oneclaw/database',
  ],
});
