mod agent_os;
mod channels;
mod config;
mod conversation;
mod daemon;
mod executor;
mod identity;
mod integration;
mod memory;
mod monitor;
mod oauth_config;
mod receipt;
mod store;
mod workflow;

use clap::{Parser, Subcommand};

#[derive(Parser)]
#[command(name = "oneclaw")]
#[command(about = "OneClaw Node Runtime - Deterministic workflow execution")]
#[command(version)]
struct Cli {
    #[command(subcommand)]
    command: Commands,
}

#[derive(Subcommand)]
enum Commands {
    /// Start the node daemon
    Daemon {
        #[arg(short, long, default_value = "8787")]
        port: u16,
    },
    /// Interactive onboarding wizard
    Onboard,
    /// Run a workflow
    Run {
        workflow: String,
        #[arg(short, long)]
        input: Option<String>,
    },
    /// Show current config
    Config,
}

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    // Load .env so LLM/harness keys match .env.local at repo root (same as harness)
    for path in ["../.env.local", "../.env", ".env.local", ".env"] {
        if std::path::Path::new(path).exists() {
            if let Err(e) = dotenvy::from_path(path) {
                tracing::warn!("Could not load {}: {}", path, e);
            } else {
                tracing::info!("Loaded env from {}", path);
                break;
            }
        }
    }
    use tracing_subscriber::{fmt, prelude::*, EnvFilter};
    tracing_subscriber::registry()
        .with(EnvFilter::try_from_default_env().unwrap_or_else(|_| EnvFilter::new("info")))
        .with(fmt::layer().with_target(false))
        .init();
    let cli = Cli::parse();

    match cli.command {
        Commands::Daemon { port } => {
            daemon::start(port).await?;
        }
        Commands::Onboard => {
            onboard().await?;
        }
        Commands::Run { workflow, input } => {
            let input_json = input
                .map(|s| serde_json::from_str(&s))
                .transpose()?
                .unwrap_or(serde_json::json!({}));
            let receipt = workflow::run(&workflow, input_json).await?;
            println!("{}", serde_json::to_string_pretty(&receipt)?);
        }
        Commands::Config => {
            let config = config::load()?;
            println!("{}", serde_yaml::to_string(&config)?);
        }
    }
    Ok(())
}

async fn onboard() -> anyhow::Result<()> {
    use std::io::{self, Write};
    
    println!("🦞 OneClaw Node Setup\n");
    let node_id = nanoid::nanoid!();
    println!("Generated node ID: {}", node_id);
    
    print!("Node name [My OneClaw Node]: ");
    io::stdout().flush()?;
    let mut name = String::new();
    io::stdin().read_line(&mut name)?;
    let name = name.trim();
    let name = if name.is_empty() { "My OneClaw Node" } else { name };
    
    println!("\nEnvironment: 1=private, 2=managed, 3=hybrid");
    print!("Select [1]: ");
    io::stdout().flush()?;
    let mut env_choice = String::new();
    io::stdin().read_line(&mut env_choice)?;
    let environment = match env_choice.trim() {
        "2" => "managed",
        "3" => "hybrid",
        _ => "private",
    };
    
    println!("\nLLM: 1=anthropic, 2=openrouter, 3=openai");
    print!("Select [1]: ");
    io::stdout().flush()?;
    let mut llm_choice = String::new();
    io::stdin().read_line(&mut llm_choice)?;
    let (provider, api_key_env, model) = match llm_choice.trim() {
        "2" => ("openrouter", "OPENROUTER_API_KEY", "anthropic/claude-3.5-sonnet"),
        "3" => ("openai", "OPENAI_API_KEY", "gpt-4o"),
        _ => ("anthropic", "ANTHROPIC_API_KEY", "claude-3-5-sonnet-20241022"),
    };
    
    let config = config::NodeConfig {
        node: config::Node { id: node_id, name: name.to_string(), environment: environment.to_string() },
        llm: config::LlmConfig { provider: provider.to_string(), api_key_env: api_key_env.to_string(), model: model.to_string() },
        security: config::SecurityConfig { mode: "strict".to_string(), allowed_executors: vec!["http.request".to_string()] },
        http: config::HttpConfig { allowed_domains: vec!["*".to_string()] },
        executors: config::ExecutorsConfig { enabled: vec!["http.request".to_string()] },
        memory: config::MemoryConfig { session_max_messages: 50, preferences_path: "~/.oneclaw/memory/preferences.yaml".to_string() },
        artifacts: config::ArtifactsConfig { storage: "local".to_string(), path: "~/.oneclaw/artifacts".to_string() },
        logging: config::LoggingConfig { level: "info".to_string(), path: "~/.oneclaw/logs".to_string() },
        control_plane: config::ControlPlaneConfig { url: Some("http://104.131.111.116:3000".to_string()), token: None },
        channels: config::ChannelsConfig::default(),
        store: config::StoreConfig::default(),
        identity: config::IdentityConfig::default(),
    };
    
    let config_path = config::config_path()?;
    std::fs::create_dir_all(config_path.parent().unwrap())?;
    std::fs::write(&config_path, serde_yaml::to_string(&config)?)?;
    
    println!("\n✅ Config saved to {:?}", config_path);
    println!("\nRun: oneclaw daemon");
    Ok(())
}
