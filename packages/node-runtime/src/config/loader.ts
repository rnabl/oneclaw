import { readFileSync, existsSync } from 'fs';
import { parse as parseYaml } from 'yaml';
import { NodeConfigSchema, type NodeConfig } from './schema';
import { join } from 'path';

// SINGLE SOURCE OF TRUTH
// This is the ONLY place config is loaded from
// No workspace copies, no home directory copies, no duplication

let cachedConfig: NodeConfig | null = null;

/**
 * Load and validate config from node.yaml
 * CRITICAL: Only loads from ONE location
 */
export function loadConfig(configPath?: string): NodeConfig {
  // Return cached if already loaded
  if (cachedConfig) {
    return cachedConfig;
  }
  
  // Determine config file location
  const path = configPath || findConfigFile();
  
  if (!path || !existsSync(path)) {
    throw new Error(
      'Config file not found. Run "oneclaw onboard" to create node.yaml'
    );
  }
  
  // Read and parse YAML
  let rawConfig: unknown;
  try {
    const fileContent = readFileSync(path, 'utf-8');
    rawConfig = parseYaml(fileContent);
  } catch (error) {
    throw new Error(
      `Failed to read config file at ${path}: ${error instanceof Error ? error.message : 'Unknown error'}`
    );
  }
  
  // Validate against schema
  const result = NodeConfigSchema.safeParse(rawConfig);
  
  if (!result.success) {
    const errors = result.error.errors.map(e => `${e.path.join('.')}: ${e.message}`).join('\n');
    throw new Error(
      `Invalid config file at ${path}:\n${errors}\n\nRun "oneclaw onboard" to regenerate.`
    );
  }
  
  // Cache and return
  cachedConfig = result.data;
  return cachedConfig;
}

/**
 * Find config file - checks in order:
 * 1. ./node.yaml (current directory)
 * 2. ~/.oneclaw/node.yaml (home directory)
 */
function findConfigFile(): string | null {
  const locations = [
    join(process.cwd(), 'node.yaml'),
    join(process.env.HOME || process.env.USERPROFILE || '', '.oneclaw', 'node.yaml'),
  ];
  
  for (const location of locations) {
    if (existsSync(location)) {
      return location;
    }
  }
  
  return null;
}

/**
 * Reload config (invalidate cache)
 * Use when config file changes
 */
export function reloadConfig(configPath?: string): NodeConfig {
  cachedConfig = null;
  return loadConfig(configPath);
}

/**
 * Get config file path
 */
export function getConfigPath(): string | null {
  return findConfigFile();
}
