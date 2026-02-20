use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use std::sync::OnceLock;

static CONFIG: OnceLock<NodeConfig> = OnceLock::new();

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct NodeConfig {
    pub node: Node,
    pub llm: LlmConfig,
    pub security: SecurityConfig,
    pub http: HttpConfig,
    pub executors: ExecutorsConfig,
    pub memory: MemoryConfig,
    pub artifacts: ArtifactsConfig,
    pub logging: LoggingConfig,
    pub control_plane: ControlPlaneConfig,
    
    #[serde(default)]
    pub channels: ChannelsConfig,
    
    #[serde(default)]
    pub store: StoreConfig,
    
    #[serde(default)]
    pub identity: IdentityConfig,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Node {
    pub id: String,
    pub name: String,
    pub environment: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LlmConfig {
    pub provider: String,
    pub api_key_env: String,
    pub model: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SecurityConfig {
    pub mode: String,
    pub allowed_executors: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct HttpConfig {
    pub allowed_domains: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ExecutorsConfig {
    pub enabled: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MemoryConfig {
    pub session_max_messages: usize,
    pub preferences_path: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ArtifactsConfig {
    pub storage: String,
    pub path: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LoggingConfig {
    pub level: String,
    pub path: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ControlPlaneConfig {
    pub url: Option<String>,
    pub token: Option<String>,
}

// ============================================
// Channels Config
// ============================================

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct ChannelsConfig {
    #[serde(default)]
    pub discord: DiscordChannelConfig,
    
    #[serde(default)]
    pub slack: SlackChannelConfig,
    
    #[serde(default)]
    pub telegram: TelegramChannelConfig,
    
    #[serde(default)]
    pub http: HttpChannelConfig,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DiscordChannelConfig {
    #[serde(default)]
    pub enabled: bool,
    
    #[serde(default = "default_discord_token_env")]
    pub token_env: String,
    
    #[serde(default)]
    pub listen_guilds: Vec<String>,  // Guild IDs or ["*"] for all
    
    #[serde(default)]
    pub listen_channels: Vec<String>, // Channel IDs or ["*"] for all
    
    #[serde(default = "default_trigger")]
    pub trigger: String, // "mention" | "all" | "dm_only"
}

impl Default for DiscordChannelConfig {
    fn default() -> Self {
        Self {
            enabled: false,
            token_env: default_discord_token_env(),
            listen_guilds: vec!["*".to_string()],
            listen_channels: vec!["*".to_string()],
            trigger: default_trigger(),
        }
    }
}

fn default_discord_token_env() -> String { "DISCORD_BOT_TOKEN".to_string() }
fn default_trigger() -> String { "mention".to_string() }

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SlackChannelConfig {
    #[serde(default)]
    pub enabled: bool,
    
    #[serde(default = "default_slack_token_env")]
    pub token_env: String,
    
    #[serde(default = "default_slack_app_token_env")]
    pub app_token_env: String,
    
    #[serde(default)]
    pub listen_channels: Vec<String>,
}

impl Default for SlackChannelConfig {
    fn default() -> Self {
        Self {
            enabled: false,
            token_env: default_slack_token_env(),
            app_token_env: default_slack_app_token_env(),
            listen_channels: vec!["*".to_string()],
        }
    }
}

fn default_slack_token_env() -> String { "SLACK_BOT_TOKEN".to_string() }
fn default_slack_app_token_env() -> String { "SLACK_APP_TOKEN".to_string() }

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TelegramChannelConfig {
    #[serde(default)]
    pub enabled: bool,
    
    #[serde(default = "default_telegram_token_env")]
    pub token_env: String,
    
    #[serde(default)]
    pub allowed_users: Vec<String>, // User IDs or ["*"] for all
}

impl Default for TelegramChannelConfig {
    fn default() -> Self {
        Self {
            enabled: false,
            token_env: default_telegram_token_env(),
            allowed_users: vec!["*".to_string()],
        }
    }
}

fn default_telegram_token_env() -> String { "TELEGRAM_BOT_TOKEN".to_string() }

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct HttpChannelConfig {
    #[serde(default = "default_true")]
    pub enabled: bool,
    
    #[serde(default = "default_port")]
    pub port: u16,
}

impl Default for HttpChannelConfig {
    fn default() -> Self {
        Self {
            enabled: true,
            port: default_port(),
        }
    }
}

fn default_true() -> bool { true }
fn default_port() -> u16 { 8787 }

// ============================================
// Store Config
// ============================================

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct StoreConfig {
    #[serde(default = "default_store_type")]
    pub store_type: String, // "sqlite" | "hosted"
    
    #[serde(default = "default_sqlite_path")]
    pub sqlite_path: String,
}

impl Default for StoreConfig {
    fn default() -> Self {
        Self {
            store_type: default_store_type(),
            sqlite_path: default_sqlite_path(),
        }
    }
}

fn default_store_type() -> String { "sqlite".to_string() }
fn default_sqlite_path() -> String { "~/.oneclaw/data.db".to_string() }

// ============================================
// Identity Config
// ============================================

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct IdentityConfig {
    #[serde(default = "default_true")]
    pub auto_create: bool,
    
    #[serde(default = "default_link_timeout")]
    pub link_timeout_minutes: u32,
}

impl Default for IdentityConfig {
    fn default() -> Self {
        Self {
            auto_create: true,
            link_timeout_minutes: default_link_timeout(),
        }
    }
}

fn default_link_timeout() -> u32 { 15 }

pub fn config_path() -> anyhow::Result<PathBuf> {
    let home = dirs::home_dir().ok_or_else(|| anyhow::anyhow!("No home dir"))?;
    Ok(home.join(".oneclaw").join("node.yaml"))
}

pub fn load() -> anyhow::Result<&'static NodeConfig> {
    if let Some(config) = CONFIG.get() {
        return Ok(config);
    }
    let path = config_path()?;
    if !path.exists() {
        anyhow::bail!("Config not found. Run 'oneclaw onboard' first.");
    }
    let contents = std::fs::read_to_string(&path)?;
    let mut config: NodeConfig = serde_yaml::from_str(&contents)?;

    // Allow env overrides so local .env.local can switch models/providers
    // without editing ~/.oneclaw/node.yaml every time.
    if let Ok(provider) = std::env::var("LLM_PROVIDER") {
        let trimmed = provider.trim();
        if !trimmed.is_empty() {
            config.llm.provider = trimmed.to_string();
        }
    }
    if let Ok(api_env) = std::env::var("LLM_API_KEY_ENV") {
        let trimmed = api_env.trim();
        if !trimmed.is_empty() {
            config.llm.api_key_env = trimmed.to_string();
        }
    }

    // Model precedence:
    // 1) LLM_MODEL (global explicit override)
    // 2) provider-specific model env
    if let Ok(model) = std::env::var("LLM_MODEL") {
        let trimmed = model.trim();
        if !trimmed.is_empty() {
            config.llm.model = trimmed.to_string();
        }
    } else {
        match config.llm.provider.as_str() {
            "openrouter" => {
                if let Ok(model) = std::env::var("OPENROUTER_MODEL") {
                    let trimmed = model.trim();
                    if !trimmed.is_empty() {
                        config.llm.model = trimmed.to_string();
                    }
                }
            }
            "anthropic" => {
                if let Ok(model) = std::env::var("ANTHROPIC_MODEL") {
                    let trimmed = model.trim();
                    if !trimmed.is_empty() {
                        config.llm.model = trimmed.to_string();
                    }
                }
            }
            "openai" => {
                if let Ok(model) = std::env::var("OPENAI_MODEL") {
                    let trimmed = model.trim();
                    if !trimmed.is_empty() {
                        config.llm.model = trimmed.to_string();
                    }
                }
            }
            _ => {}
        }
    }

    // Keep api key env aligned with provider unless explicitly overridden.
    if std::env::var("LLM_API_KEY_ENV").is_err() {
        config.llm.api_key_env = match config.llm.provider.as_str() {
            "openrouter" => "OPENROUTER_API_KEY".to_string(),
            "anthropic" => "ANTHROPIC_API_KEY".to_string(),
            "openai" => "OPENAI_API_KEY".to_string(),
            _ => config.llm.api_key_env.clone(),
        };
    }

    CONFIG.set(config.clone()).ok();
    tracing::info!(
        node_id = %config.node.id,
        provider = %config.llm.provider,
        model = %config.llm.model,
        api_key_env = %config.llm.api_key_env,
        "Config loaded"
    );
    Ok(CONFIG.get().unwrap())
}

pub fn expand_path(path: &str) -> PathBuf {
    if path.starts_with("~") {
        if let Some(home) = dirs::home_dir() {
            return home.join(&path[2..]);
        }
    }
    PathBuf::from(path)
}
