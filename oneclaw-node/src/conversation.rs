//! Conversation Management
//! 
//! Handles persistent, channel-agnostic conversation history.
//! - Stores messages with channel metadata
//! - Provides context for LLM calls
//! - Supports conversation clearing

use crate::store::{ConversationMessage, Store};
use serde::{Deserialize, Serialize};
use std::sync::Arc;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ChatMessage {
    pub role: String,
    pub content: String,
    pub channel: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub tool_calls: Option<Vec<ToolCall>>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ToolCall {
    pub tool: String,
    pub input: serde_json::Value,
    pub output: Option<serde_json::Value>,
    pub success: bool,
    pub duration_ms: u64,
}

pub struct ConversationManager {
    store: Arc<dyn Store>,
    max_messages: usize,
}

impl ConversationManager {
    pub fn new(store: Arc<dyn Store>, max_messages: usize) -> Self {
        Self { store, max_messages }
    }
    
    /// Get conversation history for a user
    /// Returns messages in chronological order, limited to max_messages
    pub async fn get_history(&self, user_id: &str) -> anyhow::Result<Vec<ChatMessage>> {
        let messages = self.store.get_conversation(user_id, self.max_messages).await?;
        
        Ok(messages.into_iter().map(|m| {
            let tool_calls = m.tool_calls.and_then(|tc| {
                serde_json::from_str(&tc).ok()
            });
            
            ChatMessage {
                role: m.role,
                content: m.content,
                channel: m.channel,
                tool_calls,
            }
        }).collect())
    }
    
    /// Add a user message to the conversation
    pub async fn add_user_message(&self, user_id: &str, content: &str, channel: &str) -> anyhow::Result<()> {
        self.store.add_message(user_id, "user", content, channel, None).await?;
        Ok(())
    }
    
    /// Add an assistant message to the conversation
    pub async fn add_assistant_message(
        &self,
        user_id: &str,
        content: &str,
        channel: &str,
        tool_calls: Option<&[ToolCall]>,
    ) -> anyhow::Result<()> {
        let tool_calls_json = tool_calls.map(|tc| serde_json::to_string(tc).unwrap_or_default());
        self.store.add_message(user_id, "assistant", content, channel, tool_calls_json.as_deref()).await?;
        Ok(())
    }
    
    /// Add a tool result message
    pub async fn add_tool_message(&self, user_id: &str, content: &str, channel: &str) -> anyhow::Result<()> {
        self.store.add_message(user_id, "tool", content, channel, None).await?;
        Ok(())
    }
    
    /// Clear conversation history for a user
    pub async fn clear(&self, user_id: &str) -> anyhow::Result<()> {
        self.store.clear_conversation(user_id).await?;
        tracing::info!(user_id = %user_id, "Cleared conversation history");
        Ok(())
    }
    
    /// Build messages array for LLM API call
    /// Includes system prompt and conversation history
    pub async fn build_llm_messages(
        &self,
        user_id: &str,
        system_prompt: &str,
    ) -> anyhow::Result<Vec<serde_json::Value>> {
        let history = self.get_history(user_id).await?;
        
        let mut messages = vec![
            serde_json::json!({
                "role": "system",
                "content": system_prompt
            })
        ];
        
        for msg in history {
            messages.push(serde_json::json!({
                "role": msg.role,
                "content": msg.content
            }));
        }
        
        Ok(messages)
    }
    
    /// Get conversation stats
    pub async fn stats(&self, user_id: &str) -> anyhow::Result<ConversationStats> {
        let history = self.store.get_conversation(user_id, 1000).await?;
        
        let user_count = history.iter().filter(|m| m.role == "user").count();
        let assistant_count = history.iter().filter(|m| m.role == "assistant").count();
        let tool_count = history.iter().filter(|m| m.role == "tool").count();
        
        let channels: std::collections::HashSet<_> = history.iter().map(|m| m.channel.clone()).collect();
        
        Ok(ConversationStats {
            total_messages: history.len(),
            user_messages: user_count,
            assistant_messages: assistant_count,
            tool_messages: tool_count,
            channels_used: channels.into_iter().collect(),
        })
    }
}

#[derive(Debug, Clone, Serialize)]
pub struct ConversationStats {
    pub total_messages: usize,
    pub user_messages: usize,
    pub assistant_messages: usize,
    pub tool_messages: usize,
    pub channels_used: Vec<String>,
}

/// Convert stored messages to LLM format
pub fn messages_to_llm_format(messages: &[ConversationMessage]) -> Vec<serde_json::Value> {
    messages.iter().map(|m| {
        serde_json::json!({
            "role": m.role,
            "content": m.content
        })
    }).collect()
}
