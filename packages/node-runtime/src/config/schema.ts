import { z } from 'zod';

// Zod schema for node.yaml validation
// This enforces the contract at runtime

export const NodeConfigSchema = z.object({
  node: z.object({
    id: z.string(),
    name: z.string(),
    environment: z.enum(['private', 'managed', 'hybrid']),
  }),
  
  llm: z.object({
    provider: z.enum(['anthropic', 'openai', 'openrouter']),
    api_key_env: z.string(),
    model: z.string(),
  }),
  
  security: z.object({
    mode: z.enum(['strict', 'permissive']),
    allowed_executors: z.array(z.string()),
  }),
  
  http: z.object({
    allowed_domains: z.array(z.string()),
  }),
  
  executors: z.object({
    browser: z.object({
      mode: z.enum(['local', 'remote']),
      headless: z.boolean(),
    }).optional(),
  }),
  
  artifacts: z.object({
    storage: z.enum(['local', 'remote']),
    path: z.string(),
  }),
  
  logging: z.object({
    level: z.enum(['debug', 'info', 'warn', 'error']),
    path: z.string(),
  }),
  
  control_plane: z.object({
    url: z.string().url(),
    token: z.string().nullable(),
  }),
});

export type NodeConfig = z.infer<typeof NodeConfigSchema>;
