// Config types for OneClaw Node Runtime
// CRITICAL: These define the SINGLE config file structure

export interface NodeConfig {
  node: {
    id: string;
    name: string;
    environment: 'private' | 'managed' | 'hybrid';
  };
  
  llm: {
    provider: 'anthropic' | 'openai' | 'openrouter';
    api_key_env: string;
    model: string;
  };
  
  security: {
    mode: 'strict' | 'permissive';
    allowed_executors: string[];
  };
  
  http: {
    allowed_domains: string[];
  };
  
  executors: {
    browser?: {
      mode: 'local' | 'remote';
      headless: boolean;
    };
  };
  
  artifacts: {
    storage: 'local' | 'remote';
    path: string;
  };
  
  logging: {
    level: 'debug' | 'info' | 'warn' | 'error';
    path: string;
  };
  
  control_plane: {
    url: string;
    token: string | null;
  };
}
