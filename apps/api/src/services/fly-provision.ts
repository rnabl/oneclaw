/**
 * Fly.io Machine provisioning for per-user agent instances
 * Framework-agnostic: supports OpenClaw, ZeroClaw, IronClaw, LangGraph, CrewAI
 */

const FLY_API_URL = 'https://api.machines.dev/v1';
const FLY_API_TOKEN = process.env.FLY_API_TOKEN || '';

// Framework-specific app names on Fly.io
const FLY_APPS: Record<string, string> = {
  openclaw: process.env.FLY_APP_OPENCLAW || 'iclaw-openclaw',
  zeroclaw: process.env.FLY_APP_ZEROCLAW || 'iclaw-zeroclaw',
  ironclaw: process.env.FLY_APP_IRONCLAW || 'iclaw-ironclaw',
  langgraph: process.env.FLY_APP_LANGGRAPH || 'iclaw-langgraph',
  crewai: process.env.FLY_APP_CREWAI || 'iclaw-crewai',
};

// Framework-specific Docker images
const FRAMEWORK_IMAGES: Record<string, string> = {
  openclaw: 'registry.fly.io/iclaw-openclaw:latest',
  zeroclaw: 'registry.fly.io/iclaw-zeroclaw:latest',
  ironclaw: 'registry.fly.io/iclaw-ironclaw:latest',
  langgraph: 'registry.fly.io/iclaw-langgraph:latest',
  crewai: 'registry.fly.io/iclaw-crewai:latest',
};

// Framework-specific ports
const FRAMEWORK_PORTS: Record<string, number> = {
  openclaw: 18789,
  zeroclaw: 8080,
  ironclaw: 9000,
  langgraph: 8000,
  crewai: 8000,
};

// Framework-specific memory requirements (MB)
const FRAMEWORK_MEMORY: Record<string, number> = {
  openclaw: 512,
  zeroclaw: 256,  // Rust is memory efficient
  ironclaw: 512,
  langgraph: 1024,  // Python needs more
  crewai: 1024,
};

export type Framework = 'openclaw' | 'zeroclaw' | 'ironclaw' | 'langgraph' | 'crewai';

export interface ProvisionConfig {
  userId: string;
  framework: Framework;
  anthropicKey?: string;
  openrouterKey?: string;
  discordToken?: string;
  telegramToken?: string;
  slackToken?: string;
  iclawApiKey: string;  // Key to call nabl workflows
  region?: string;
}

interface FlyMachine {
  id: string;
  name: string;
  state: string;
  private_ip: string;
}

/**
 * Generate environment variables based on framework and config
 */
function getFrameworkEnv(config: ProvisionConfig): Record<string, string> {
  const env: Record<string, string> = {
    ICLAW_API_KEY: config.iclawApiKey,
    ICLAW_API_URL: process.env.ICLAW_API_URL || 'https://api.iclaw.dev',
  };
  
  // LLM Keys
  if (config.anthropicKey) env.ANTHROPIC_API_KEY = config.anthropicKey;
  if (config.openrouterKey) env.OPENROUTER_API_KEY = config.openrouterKey;
  
  // Channel tokens
  if (config.discordToken) env.DISCORD_BOT_TOKEN = config.discordToken;
  if (config.telegramToken) env.TELEGRAM_BOT_TOKEN = config.telegramToken;
  if (config.slackToken) env.SLACK_BOT_TOKEN = config.slackToken;
  
  // Framework-specific env vars
  switch (config.framework) {
    case 'openclaw':
      env.OPENCLAW_TOKEN = crypto.randomUUID().replace(/-/g, '');
      break;
    case 'zeroclaw':
      env.ZEROCLAW_LOG_LEVEL = 'info';
      break;
    case 'ironclaw':
      env.DATABASE_URL = `postgres://iclaw:${crypto.randomUUID().slice(0, 8)}@db.internal:5432/ironclaw`;
      break;
    case 'langgraph':
      env.LANGCHAIN_TRACING_V2 = 'false';
      break;
    case 'crewai':
      env.CREWAI_TELEMETRY = 'false';
      break;
  }
  
  return env;
}

/**
 * Create a new Fly.io machine for a user with selected framework
 */
export async function provisionUserMachine(config: ProvisionConfig): Promise<{
  machineId: string;
  machineUrl: string;
  token: string;
  framework: Framework;
} | null> {
  const { userId, framework, region = 'iad' } = config;
  const appName = FLY_APPS[framework];
  const image = FRAMEWORK_IMAGES[framework];
  const port = FRAMEWORK_PORTS[framework];
  const memory = FRAMEWORK_MEMORY[framework];
  const token = crypto.randomUUID().replace(/-/g, '');
  
  const machineConfig = {
    name: `${framework}-${userId}`,
    region,
    config: {
      image,
      env: {
        ...getFrameworkEnv(config),
        MACHINE_TOKEN: token,  // For API authentication to this machine
      },
      services: [
        {
          ports: [{ port: 443, handlers: ['tls', 'http'] }],
          protocol: 'tcp',
          internal_port: port,
        },
      ],
      guest: {
        cpu_kind: 'shared',
        cpus: 1,
        memory_mb: memory,
      },
      // Auto-stop after 5 minutes of inactivity
      auto_stop: true,
      auto_start: true,
    },
  };

  try {
    console.log(`[Fly] Creating ${framework} machine for user ${userId}...`);
    
    const response = await fetch(`${FLY_API_URL}/apps/${appName}/machines`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${FLY_API_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(machineConfig),
    });

    if (!response.ok) {
      const error = await response.text();
      console.error('[Fly] Failed to create machine:', error);
      return null;
    }

    const machine: FlyMachine = await response.json();
    
    // Machine URL format: https://{app-name}.fly.dev/{machine-id} or https://{machine-id}.{app-name}.fly.dev
    const machineUrl = `https://${machine.id}.${appName}.fly.dev`;
    
    console.log(`[Fly] Created ${framework} machine ${machine.id} for user ${userId}`);
    
    return {
      machineId: machine.id,
      machineUrl,
      token,
      framework,
    };
  } catch (error) {
    console.error('[Fly] Error provisioning machine:', error);
    return null;
  }
}

/**
 * Stop a user's machine (to save costs when inactive)
 */
export async function stopUserMachine(framework: Framework, machineId: string): Promise<boolean> {
  const appName = FLY_APPS[framework];
  try {
    const response = await fetch(
      `${FLY_API_URL}/apps/${appName}/machines/${machineId}/stop`,
      {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${FLY_API_TOKEN}` },
      }
    );
    return response.ok;
  } catch {
    return false;
  }
}

/**
 * Start a user's machine
 */
export async function startUserMachine(framework: Framework, machineId: string): Promise<boolean> {
  const appName = FLY_APPS[framework];
  try {
    const response = await fetch(
      `${FLY_API_URL}/apps/${appName}/machines/${machineId}/start`,
      {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${FLY_API_TOKEN}` },
      }
    );
    return response.ok;
  } catch {
    return false;
  }
}

/**
 * Delete a user's machine (for cancellations)
 */
export async function deleteUserMachine(framework: Framework, machineId: string): Promise<boolean> {
  const appName = FLY_APPS[framework];
  try {
    const response = await fetch(
      `${FLY_API_URL}/apps/${appName}/machines/${machineId}`,
      {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${FLY_API_TOKEN}` },
      }
    );
    return response.ok;
  } catch {
    return false;
  }
}

/**
 * Get machine status
 */
export async function getMachineStatus(framework: Framework, machineId: string): Promise<{
  state: string;
  region: string;
  created_at: string;
} | null> {
  const appName = FLY_APPS[framework];
  try {
    const response = await fetch(
      `${FLY_API_URL}/apps/${appName}/machines/${machineId}`,
      {
        headers: { 'Authorization': `Bearer ${FLY_API_TOKEN}` },
      }
    );
    if (!response.ok) return null;
    const machine = await response.json();
    return {
      state: machine.state,
      region: machine.region,
      created_at: machine.created_at,
    };
  } catch {
    return null;
  }
}

/**
 * List all machines for an app
 */
export async function listMachines(framework: Framework): Promise<FlyMachine[]> {
  const appName = FLY_APPS[framework];
  try {
    const response = await fetch(
      `${FLY_API_URL}/apps/${appName}/machines`,
      {
        headers: { 'Authorization': `Bearer ${FLY_API_TOKEN}` },
      }
    );
    if (!response.ok) return [];
    return await response.json();
  } catch {
    return [];
  }
}
