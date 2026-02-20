use std::sync::Arc;
use std::time::Duration;
use tokio::time::interval;
use crate::{agent_os, config, conversation, executor, identity};

pub struct HeartbeatConfig {
    pub enabled: bool,
    pub interval_secs: u64,
    pub target_channel: String,
}

impl Default for HeartbeatConfig {
    fn default() -> Self {
        Self {
            enabled: std::env::var("HEARTBEAT_ENABLED")
                .ok()
                .and_then(|v| v.parse::<bool>().ok())
                .unwrap_or(true),
            interval_secs: std::env::var("HEARTBEAT_INTERVAL_SECS")
                .ok()
                .and_then(|v| v.parse::<u64>().ok())
                .unwrap_or(1800), // 30 minutes default
            target_channel: std::env::var("HEARTBEAT_TARGET")
                .unwrap_or_else(|_| "last".to_string()),
        }
    }
}

pub struct HeartbeatService {
    config: HeartbeatConfig,
    agent_os: agent_os::AgentOS,
    executor_registry: Arc<executor::Registry>,
    conversation_manager: Arc<conversation::ConversationManager>,
    identity_manager: Arc<identity::IdentityManager>,
    harness_tools: Vec<agent_os::ToolDefinition>,
    node_config: &'static config::NodeConfig,
}

impl HeartbeatService {
    pub fn new(
        config: HeartbeatConfig,
        agent_os: agent_os::AgentOS,
        executor_registry: Arc<executor::Registry>,
        conversation_manager: Arc<conversation::ConversationManager>,
        identity_manager: Arc<identity::IdentityManager>,
        harness_tools: Vec<agent_os::ToolDefinition>,
        node_config: &'static config::NodeConfig,
    ) -> Self {
        Self {
            config,
            agent_os,
            executor_registry,
            conversation_manager,
            identity_manager,
            harness_tools,
            node_config,
        }
    }

    pub async fn start(self: Arc<Self>) {
        if !self.config.enabled {
            tracing::info!("Heartbeat service disabled (set HEARTBEAT_ENABLED=true to enable)");
            return;
        }

        tracing::info!(
            "Heartbeat service starting (interval: {}s, target: {})",
            self.config.interval_secs,
            self.config.target_channel
        );

        let mut ticker = interval(Duration::from_secs(self.config.interval_secs));
        ticker.set_missed_tick_behavior(tokio::time::MissedTickBehavior::Skip);

        loop {
            ticker.tick().await;
            if let Err(e) = self.run_heartbeat().await {
                tracing::warn!("Heartbeat error: {}", e);
            }
        }
    }

    async fn run_heartbeat(&self) -> anyhow::Result<()> {
        tracing::debug!("Running heartbeat check...");

        // Load HEARTBEAT.md if it exists
        let heartbeat_md = self.load_heartbeat_md()?;
        
        // Check if HEARTBEAT.md is effectively empty (only headers/blank lines)
        if heartbeat_md.is_empty() || is_effectively_empty(&heartbeat_md) {
            tracing::debug!("HEARTBEAT.md is empty or missing, skipping heartbeat run");
            return Ok(());
        }

        // Build heartbeat prompt
        let system_prompt = self.build_heartbeat_prompt(&heartbeat_md);
        
        // Use system/heartbeat user for heartbeat runs
        let (user_id, _) = self.identity_manager
            .resolve("system", "heartbeat", None)
            .await?;

        // Build messages (no prior conversation for heartbeat)
        let messages = vec![
            serde_json::json!({
                "role": "system",
                "content": system_prompt
            }),
            serde_json::json!({
                "role": "user",
                "content": "Check HEARTBEAT.md and respond with HEARTBEAT_OK if nothing needs attention, or describe what needs attention."
            })
        ];

        // Call LLM
        let input = serde_json::json!({ "messages": messages });
        let llm_executor = self.executor_registry
            .get("llm.chat")
            .ok_or_else(|| anyhow::anyhow!("LLM executor not found"))?;
        
        let executor_registry = Arc::clone(&self.executor_registry);
        let config = self.node_config;
        let result = tokio::task::spawn_blocking(move || {
            let executor = executor_registry.get("llm.chat")
                .ok_or_else(|| anyhow::anyhow!("LLM executor not found"))?;
            Ok::<_, anyhow::Error>(executor.execute(input, config))
        })
        .await??;

        // Extract response
        let content = match result {
            executor::ExecutorResult::Executed { output, .. } => {
                output["content"].as_str().unwrap_or("").to_string()
            }
            executor::ExecutorResult::Error { error } => {
                tracing::warn!("Heartbeat LLM error: {}", error);
                return Ok(());
            }
            executor::ExecutorResult::Denied { .. } => {
                return Ok(());
            }
        };

        // Process response
        self.process_heartbeat_response(&content, &user_id).await?;

        Ok(())
    }

    fn load_heartbeat_md(&self) -> anyhow::Result<String> {
        // Try workspace first, then templates
        let workspace_path = dirs::home_dir()
            .map(|h| h.join(".oneclaw").join("workspace").join("HEARTBEAT.md"));
        
        if let Some(path) = workspace_path {
            if path.exists() {
                return std::fs::read_to_string(&path)
                    .map_err(|e| anyhow::anyhow!("Failed to read HEARTBEAT.md: {}", e));
            }
        }

        // Try templates fallback
        let template_paths = vec![
            std::path::PathBuf::from("oneclaw-node/templates/HEARTBEAT.md"),
            std::path::PathBuf::from("templates/HEARTBEAT.md"),
        ];

        for path in template_paths {
            if path.exists() {
                return std::fs::read_to_string(&path)
                    .map_err(|e| anyhow::anyhow!("Failed to read HEARTBEAT.md: {}", e));
            }
        }

        Ok(String::new())
    }

    fn build_heartbeat_prompt(&self, heartbeat_md: &str) -> String {
        let tools_section = self.agent_os.format_tool_registry(&self.harness_tools);
        
        format!(
            r#"You are running a periodic heartbeat check.

# HEARTBEAT CHECKLIST
{}

# AVAILABLE TOOLS
{}

# INSTRUCTIONS
- Read the checklist above and check if anything needs attention
- If nothing urgent: reply EXACTLY with "HEARTBEAT_OK" (no other text)
- If something needs attention: describe it briefly and clearly (no HEARTBEAT_OK)
- Keep responses under 300 characters unless urgent
- Do not repeat old tasks from prior conversations
- Focus only on new/urgent items"#,
            heartbeat_md,
            tools_section
        )
    }

    async fn process_heartbeat_response(&self, content: &str, user_id: &str) -> anyhow::Result<()> {
        let trimmed = content.trim();
        
        // Check for HEARTBEAT_OK (exact match or at start/end)
        let is_ok = trimmed == "HEARTBEAT_OK"
            || trimmed.starts_with("HEARTBEAT_OK")
            || trimmed.ends_with("HEARTBEAT_OK");
        
        if is_ok {
            // Extract remaining content after removing HEARTBEAT_OK
            let remaining = trimmed
                .replace("HEARTBEAT_OK", "")
                .trim()
                .to_string();
            
            // If remaining content is short (≤300 chars), suppress it
            if remaining.len() <= 300 {
                tracing::debug!("Heartbeat OK (suppressed)");
                return Ok(());
            }
            
            // Long content after HEARTBEAT_OK - treat as alert
            tracing::info!("Heartbeat alert: {}", remaining);
            self.deliver_alert(&remaining, user_id).await?;
        } else {
            // No HEARTBEAT_OK - this is an alert
            tracing::info!("Heartbeat alert: {}", trimmed);
            self.deliver_alert(trimmed, user_id).await?;
        }
        
        Ok(())
    }

    async fn deliver_alert(&self, content: &str, user_id: &str) -> anyhow::Result<()> {
        // For now, just log the alert
        // TODO: Implement channel delivery based on self.config.target_channel
        tracing::info!("🔔 Heartbeat Alert: {}", content);
        
        // Store in conversation for visibility
        self.conversation_manager
            .add_assistant_message(
                user_id,
                &format!("🔔 Heartbeat: {}", content),
                "heartbeat",
                None,
            )
            .await?;
        
        Ok(())
    }
}

fn is_effectively_empty(content: &str) -> bool {
    // Check if content is only headers and blank lines
    content
        .lines()
        .all(|line| {
            let trimmed = line.trim();
            trimmed.is_empty() || trimmed.starts_with('#')
        })
}
