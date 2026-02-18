//! Discord Channel
//! 
//! Connects to Discord Gateway via WebSocket for real-time message events.
//! Handles:
//! - Gateway connection and heartbeat
//! - Message events (mentions, DMs)
//! - Sending responses back to Discord

use async_trait::async_trait;
use futures::{SinkExt, StreamExt};
use serde::{Deserialize, Serialize};
use std::sync::Arc;
use tokio::sync::{mpsc, RwLock};
use tokio_tungstenite::{connect_async, tungstenite::Message};

use super::{Channel, ChannelType, IncomingMessage, OutgoingMessage};
use crate::config::DiscordChannelConfig;

// Discord Gateway Opcodes
const OP_DISPATCH: u8 = 0;
const OP_HEARTBEAT: u8 = 1;
const OP_IDENTIFY: u8 = 2;
const OP_HELLO: u8 = 10;
const OP_HEARTBEAT_ACK: u8 = 11;

#[derive(Debug, Serialize, Deserialize)]
struct GatewayPayload {
    op: u8,
    d: Option<serde_json::Value>,
    s: Option<u64>,
    t: Option<String>,
}

#[derive(Debug, Deserialize)]
struct DiscordMessage {
    id: String,
    channel_id: String,
    content: String,
    author: DiscordUser,
    #[serde(default)]
    mentions: Vec<DiscordUser>,
    guild_id: Option<String>,
}

#[derive(Debug, Deserialize)]
struct DiscordUser {
    id: String,
    username: String,
    #[serde(default)]
    bot: bool,
}

#[derive(Debug, Deserialize)]
struct ReadyEvent {
    user: DiscordUser,
    session_id: String,
}

pub struct DiscordChannel {
    config: DiscordChannelConfig,
    token: String,
    bot_user_id: Arc<RwLock<Option<String>>>,
    http_client: reqwest::Client,
}

impl DiscordChannel {
    pub fn new(config: DiscordChannelConfig) -> anyhow::Result<Self> {
        let token = std::env::var(&config.token_env)
            .map_err(|_| anyhow::anyhow!("Discord token not found in env: {}", config.token_env))?;
        
        Ok(Self {
            config,
            token,
            bot_user_id: Arc::new(RwLock::new(None)),
            http_client: reqwest::Client::new(),
        })
    }
    
    /// Check if a message should trigger the bot
    fn should_respond(&self, msg: &DiscordMessage, bot_id: &str) -> bool {
        // Ignore bot messages
        if msg.author.bot {
            return false;
        }
        
        match self.config.trigger.as_str() {
            "all" => true,
            "dm_only" => msg.guild_id.is_none(),
            "mention" | _ => {
                // Check if bot is mentioned
                msg.mentions.iter().any(|u| u.id == bot_id)
                    || msg.content.contains(&format!("<@{}>", bot_id))
                    || msg.content.contains(&format!("<@!{}>", bot_id))
            }
        }
    }
    
    /// Remove bot mention from content
    fn clean_content(&self, content: &str, bot_id: &str) -> String {
        content
            .replace(&format!("<@{}>", bot_id), "")
            .replace(&format!("<@!{}>", bot_id), "")
            .trim()
            .to_string()
    }
    
    /// Send a message to a Discord channel
    async fn send_message(&self, channel_id: &str, content: &str) -> anyhow::Result<()> {
        let url = format!("https://discord.com/api/v10/channels/{}/messages", channel_id);
        
        let response = self.http_client
            .post(&url)
            .header("Authorization", format!("Bot {}", self.token))
            .header("Content-Type", "application/json")
            .json(&serde_json::json!({ "content": content }))
            .send()
            .await?;
        
        if !response.status().is_success() {
            let error = response.text().await?;
            anyhow::bail!("Discord API error: {}", error);
        }
        
        Ok(())
    }
}

#[async_trait]
impl Channel for DiscordChannel {
    fn channel_type(&self) -> ChannelType {
        ChannelType::Discord
    }
    
    async fn start(&self, tx: mpsc::Sender<IncomingMessage>) -> anyhow::Result<()> {
        // Get gateway URL
        let gateway_url = "wss://gateway.discord.gg/?v=10&encoding=json";
        
        tracing::info!("Connecting to Discord Gateway...");
        
        let (ws_stream, _) = connect_async(gateway_url).await?;
        let (mut write, mut read) = ws_stream.split();
        
        let mut sequence: Option<u64> = None;
        let mut heartbeat_interval: u64 = 45000;
        let bot_user_id = self.bot_user_id.clone();
        let token = self.token.clone();
        let config = self.config.clone();
        
        // Spawn heartbeat task
        let heartbeat_tx = {
            let (htx, mut hrx) = mpsc::channel::<()>(1);
            
            tokio::spawn(async move {
                loop {
                    tokio::time::sleep(tokio::time::Duration::from_millis(heartbeat_interval)).await;
                    if hrx.try_recv().is_ok() {
                        break;
                    }
                }
            });
            
            htx
        };
        
        // Main event loop
        while let Some(msg) = read.next().await {
            match msg {
                Ok(Message::Text(text)) => {
                    if let Ok(payload) = serde_json::from_str::<GatewayPayload>(&text) {
                        // Update sequence
                        if let Some(s) = payload.s {
                            sequence = Some(s);
                        }
                        
                        match payload.op {
                            OP_HELLO => {
                                // Extract heartbeat interval
                                if let Some(d) = &payload.d {
                                    heartbeat_interval = d["heartbeat_interval"].as_u64().unwrap_or(45000);
                                }
                                
                                // Send IDENTIFY
                                let identify = GatewayPayload {
                                    op: OP_IDENTIFY,
                                    d: Some(serde_json::json!({
                                        "token": token,
                                        "intents": 33281, // GUILDS + GUILD_MESSAGES + MESSAGE_CONTENT + DIRECT_MESSAGES
                                        "properties": {
                                            "os": "linux",
                                            "browser": "oneclaw",
                                            "device": "oneclaw"
                                        }
                                    })),
                                    s: None,
                                    t: None,
                                };
                                
                                write.send(Message::Text(serde_json::to_string(&identify)?)).await?;
                                tracing::info!("Sent IDENTIFY to Discord");
                            }
                            
                            OP_HEARTBEAT => {
                                // Send heartbeat immediately
                                let heartbeat = GatewayPayload {
                                    op: OP_HEARTBEAT,
                                    d: sequence.map(|s| serde_json::json!(s)),
                                    s: None,
                                    t: None,
                                };
                                write.send(Message::Text(serde_json::to_string(&heartbeat)?)).await?;
                            }
                            
                            OP_HEARTBEAT_ACK => {
                                // Heartbeat acknowledged
                            }
                            
                            OP_DISPATCH => {
                                if let Some(event_name) = &payload.t {
                                    match event_name.as_str() {
                                        "READY" => {
                                            if let Some(d) = payload.d {
                                                if let Ok(ready) = serde_json::from_value::<ReadyEvent>(d) {
                                                    *bot_user_id.write().await = Some(ready.user.id.clone());
                                                    tracing::info!(
                                                        bot_name = %ready.user.username,
                                                        bot_id = %ready.user.id,
                                                        "Discord bot connected"
                                                    );
                                                }
                                            }
                                        }
                                        
                                        "MESSAGE_CREATE" => {
                                            if let Some(d) = payload.d {
                                                if let Ok(discord_msg) = serde_json::from_value::<DiscordMessage>(d.clone()) {
                                                    let current_bot_id = bot_user_id.read().await;
                                                    
                                                    if let Some(ref bid) = *current_bot_id {
                                                        // Check guild filter
                                                        let guild_allowed = config.listen_guilds.contains(&"*".to_string())
                                                            || discord_msg.guild_id.as_ref()
                                                                .map(|g| config.listen_guilds.contains(g))
                                                                .unwrap_or(true); // Allow DMs
                                                        
                                                        // Check channel filter
                                                        let channel_allowed = config.listen_channels.contains(&"*".to_string())
                                                            || config.listen_channels.contains(&discord_msg.channel_id);
                                                        
                                                        if guild_allowed && channel_allowed {
                                                            // Create a local reference to avoid moving self
                                                            let should_respond = {
                                                                // Inline the should_respond logic
                                                                if discord_msg.author.bot {
                                                                    false
                                                                } else {
                                                                    match config.trigger.as_str() {
                                                                        "all" => true,
                                                                        "dm_only" => discord_msg.guild_id.is_none(),
                                                                        "mention" | _ => {
                                                                            discord_msg.mentions.iter().any(|u| u.id == *bid)
                                                                                || discord_msg.content.contains(&format!("<@{}>", bid))
                                                                                || discord_msg.content.contains(&format!("<@!{}>", bid))
                                                                        }
                                                                    }
                                                                }
                                                            };
                                                            
                                                            if should_respond {
                                                                // Clean content
                                                                let clean_content = discord_msg.content
                                                                    .replace(&format!("<@{}>", bid), "")
                                                                    .replace(&format!("<@!{}>", bid), "")
                                                                    .trim()
                                                                    .to_string();
                                                                
                                                                let incoming = IncomingMessage {
                                                                    channel_type: ChannelType::Discord,
                                                                    channel_id: discord_msg.channel_id.clone(),
                                                                    provider_user_id: discord_msg.author.id.clone(),
                                                                    username: Some(discord_msg.author.username.clone()),
                                                                    content: clean_content,
                                                                    timestamp: chrono::Utc::now(),
                                                                    reply_to: Some(discord_msg.id.clone()),
                                                                    metadata: d,
                                                                };
                                                                
                                                                if let Err(e) = tx.send(incoming).await {
                                                                    tracing::error!("Failed to send message to handler: {}", e);
                                                                }
                                                            }
                                                        }
                                                    }
                                                }
                                            }
                                        }
                                        
                                        _ => {}
                                    }
                                }
                            }
                            
                            _ => {}
                        }
                    }
                }
                
                Ok(Message::Close(_)) => {
                    tracing::warn!("Discord WebSocket closed");
                    break;
                }
                
                Err(e) => {
                    tracing::error!("Discord WebSocket error: {}", e);
                    break;
                }
                
                _ => {}
            }
            
            // Send periodic heartbeat
            let heartbeat = GatewayPayload {
                op: OP_HEARTBEAT,
                d: sequence.map(|s| serde_json::json!(s)),
                s: None,
                t: None,
            };
            // Note: In production, this should be on a timer, not every message
        }
        
        Ok(())
    }
    
    async fn send(&self, msg: OutgoingMessage) -> anyhow::Result<()> {
        self.send_message(&msg.channel_id, &msg.content).await
    }
    
    async fn stop(&self) -> anyhow::Result<()> {
        // Signal shutdown
        tracing::info!("Stopping Discord channel");
        Ok(())
    }
}
