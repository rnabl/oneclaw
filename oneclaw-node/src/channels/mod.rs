//! Channels - Input sources for the node
//! 
//! Channels provide different ways to interact with the node:
//! - Discord: WebSocket connection to Discord Gateway
//! - Slack: Socket Mode connection
//! - Telegram: Long polling
//! - HTTP: REST API (handled by daemon.rs)

pub mod discord;

use async_trait::async_trait;
use serde::{Deserialize, Serialize};
use tokio::sync::mpsc;

/// Channel type identifier
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum ChannelType {
    Discord,
    Slack,
    Telegram,
    Http,
}

impl std::fmt::Display for ChannelType {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            ChannelType::Discord => write!(f, "discord"),
            ChannelType::Slack => write!(f, "slack"),
            ChannelType::Telegram => write!(f, "telegram"),
            ChannelType::Http => write!(f, "http"),
        }
    }
}

/// Incoming message from any channel
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct IncomingMessage {
    pub channel_type: ChannelType,
    pub channel_id: String,        // Discord channel ID, Slack channel, etc.
    pub provider_user_id: String,  // Provider-specific user ID
    pub username: Option<String>,  // Display name
    pub content: String,
    pub timestamp: chrono::DateTime<chrono::Utc>,
    pub reply_to: Option<String>,  // For threading
    pub metadata: serde_json::Value,
}

/// Outgoing message to send via a channel
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct OutgoingMessage {
    pub channel_type: ChannelType,
    pub channel_id: String,
    pub content: String,
    pub reply_to: Option<String>,
    pub metadata: serde_json::Value,
}

/// Channel trait - all channels implement this
#[async_trait]
pub trait Channel: Send + Sync {
    /// Channel type identifier
    fn channel_type(&self) -> ChannelType;
    
    /// Start the channel, sending incoming messages to the provided sender
    async fn start(&self, tx: mpsc::Sender<IncomingMessage>) -> anyhow::Result<()>;
    
    /// Send a message through this channel
    async fn send(&self, msg: OutgoingMessage) -> anyhow::Result<()>;
    
    /// Stop the channel gracefully
    async fn stop(&self) -> anyhow::Result<()>;
}

/// Channel manager - coordinates all active channels
pub struct ChannelManager {
    channels: Vec<Box<dyn Channel>>,
    message_tx: mpsc::Sender<IncomingMessage>,
    message_rx: Option<mpsc::Receiver<IncomingMessage>>,
}

impl ChannelManager {
    pub fn new() -> Self {
        let (tx, rx) = mpsc::channel(100);
        Self {
            channels: Vec::new(),
            message_tx: tx,
            message_rx: Some(rx),
        }
    }
    
    /// Add a channel to the manager
    pub fn add_channel(&mut self, channel: Box<dyn Channel>) {
        self.channels.push(channel);
    }
    
    /// Start all channels
    pub async fn start_all(&self) -> anyhow::Result<()> {
        for channel in &self.channels {
            let tx = self.message_tx.clone();
            let channel_type = channel.channel_type();
            
            // Start each channel in its own task
            tokio::spawn(async move {
                tracing::info!(channel = %channel_type, "Starting channel");
                // Note: This would need a reference to the channel
                // In practice, we'd use Arc<dyn Channel> or similar
            });
        }
        Ok(())
    }
    
    /// Get the message receiver (takes ownership)
    pub fn take_receiver(&mut self) -> Option<mpsc::Receiver<IncomingMessage>> {
        self.message_rx.take()
    }
    
    /// Send a message to a specific channel
    pub async fn send(&self, msg: OutgoingMessage) -> anyhow::Result<()> {
        for channel in &self.channels {
            if channel.channel_type() == msg.channel_type {
                return channel.send(msg).await;
            }
        }
        anyhow::bail!("No channel found for type: {:?}", msg.channel_type)
    }
}
