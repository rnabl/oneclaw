//! Store - Pluggable storage backend
//! 
//! Supports:
//! - SqliteStore: Local SQLite database (free tier, fully private)
//! - HostedStore: OneClaw Harness API (paid tier, synced)

use async_trait::async_trait;
use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use tokio_rusqlite::Connection;

// ============================================
// Data Types
// ============================================

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct User {
    pub id: String,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Identity {
    pub user_id: String,
    pub provider: String,         // "discord", "slack", "telegram", "http"
    pub provider_id: String,      // Provider-specific user ID
    pub username: Option<String>, // Display name from provider
    pub linked_at: DateTime<Utc>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ConversationMessage {
    pub id: i64,
    pub user_id: String,
    pub role: String,             // "user", "assistant", "tool"
    pub content: String,
    pub channel: String,          // Which channel this came from
    pub tool_calls: Option<String>, // JSON string of tool calls
    pub created_at: DateTime<Utc>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Preferences {
    pub user_id: String,
    pub data: serde_json::Value,  // Flexible JSON preferences
    pub updated_at: DateTime<Utc>,
}

// ============================================
// Store Trait
// ============================================

#[async_trait]
pub trait Store: Send + Sync {
    // User operations
    async fn get_user(&self, user_id: &str) -> anyhow::Result<Option<User>>;
    async fn create_user(&self, user_id: &str) -> anyhow::Result<User>;
    
    // Identity operations
    async fn get_identity(&self, provider: &str, provider_id: &str) -> anyhow::Result<Option<Identity>>;
    async fn link_identity(&self, user_id: &str, provider: &str, provider_id: &str, username: Option<&str>) -> anyhow::Result<()>;
    async fn get_user_identities(&self, user_id: &str) -> anyhow::Result<Vec<Identity>>;
    
    // Conversation operations
    async fn get_conversation(&self, user_id: &str, limit: usize) -> anyhow::Result<Vec<ConversationMessage>>;
    async fn add_message(&self, user_id: &str, role: &str, content: &str, channel: &str, tool_calls: Option<&str>) -> anyhow::Result<i64>;
    async fn clear_conversation(&self, user_id: &str) -> anyhow::Result<()>;
    
    // Preferences operations
    async fn get_preferences(&self, user_id: &str) -> anyhow::Result<Option<Preferences>>;
    async fn set_preferences(&self, user_id: &str, data: serde_json::Value) -> anyhow::Result<()>;
}

// ============================================
// SQLite Store (Local/Private)
// ============================================

pub struct SqliteStore {
    conn: Connection,
}

impl SqliteStore {
    pub async fn new(path: PathBuf) -> anyhow::Result<Self> {
        // Ensure parent directory exists
        if let Some(parent) = path.parent() {
            std::fs::create_dir_all(parent)?;
        }
        
        let conn = Connection::open(path).await?;
        
        // Initialize schema
        conn.call(|conn| {
            conn.execute_batch(r#"
                CREATE TABLE IF NOT EXISTS users (
                    id TEXT PRIMARY KEY,
                    created_at TEXT NOT NULL,
                    updated_at TEXT NOT NULL
                );
                
                CREATE TABLE IF NOT EXISTS identities (
                    user_id TEXT NOT NULL,
                    provider TEXT NOT NULL,
                    provider_id TEXT NOT NULL,
                    username TEXT,
                    linked_at TEXT NOT NULL,
                    PRIMARY KEY (provider, provider_id),
                    FOREIGN KEY (user_id) REFERENCES users(id)
                );
                
                CREATE INDEX IF NOT EXISTS idx_identities_user ON identities(user_id);
                
                CREATE TABLE IF NOT EXISTS conversations (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    user_id TEXT NOT NULL,
                    role TEXT NOT NULL,
                    content TEXT NOT NULL,
                    channel TEXT NOT NULL,
                    tool_calls TEXT,
                    created_at TEXT NOT NULL,
                    FOREIGN KEY (user_id) REFERENCES users(id)
                );
                
                CREATE INDEX IF NOT EXISTS idx_conversations_user ON conversations(user_id, created_at DESC);
                
                CREATE TABLE IF NOT EXISTS preferences (
                    user_id TEXT PRIMARY KEY,
                    data TEXT NOT NULL,
                    updated_at TEXT NOT NULL,
                    FOREIGN KEY (user_id) REFERENCES users(id)
                );
            "#)?;
            Ok(())
        }).await?;
        
        Ok(Self { conn })
    }
}

#[async_trait]
impl Store for SqliteStore {
    async fn get_user(&self, user_id: &str) -> anyhow::Result<Option<User>> {
        let user_id = user_id.to_string();
        self.conn.call(move |conn| {
            let mut stmt = conn.prepare("SELECT id, created_at, updated_at FROM users WHERE id = ?")?;
            let mut rows = stmt.query([&user_id])?;
            
            if let Some(row) = rows.next()? {
                Ok(Some(User {
                    id: row.get(0)?,
                    created_at: row.get::<_, String>(1)?.parse().unwrap_or_else(|_| Utc::now()),
                    updated_at: row.get::<_, String>(2)?.parse().unwrap_or_else(|_| Utc::now()),
                }))
            } else {
                Ok(None)
            }
        }).await.map_err(|e| anyhow::anyhow!("{}", e))
    }
    
    async fn create_user(&self, user_id: &str) -> anyhow::Result<User> {
        let user_id = user_id.to_string();
        let now = Utc::now();
        let now_str = now.to_rfc3339();
        
        self.conn.call(move |conn| {
            conn.execute(
                "INSERT INTO users (id, created_at, updated_at) VALUES (?, ?, ?)",
                [&user_id, &now_str, &now_str],
            )?;
            Ok(User {
                id: user_id,
                created_at: now,
                updated_at: now,
            })
        }).await.map_err(|e| anyhow::anyhow!("{}", e))
    }
    
    async fn get_identity(&self, provider: &str, provider_id: &str) -> anyhow::Result<Option<Identity>> {
        let provider = provider.to_string();
        let provider_id = provider_id.to_string();
        
        self.conn.call(move |conn| {
            let mut stmt = conn.prepare(
                "SELECT user_id, provider, provider_id, username, linked_at FROM identities WHERE provider = ? AND provider_id = ?"
            )?;
            let mut rows = stmt.query([&provider, &provider_id])?;
            
            if let Some(row) = rows.next()? {
                Ok(Some(Identity {
                    user_id: row.get(0)?,
                    provider: row.get(1)?,
                    provider_id: row.get(2)?,
                    username: row.get(3)?,
                    linked_at: row.get::<_, String>(4)?.parse().unwrap_or_else(|_| Utc::now()),
                }))
            } else {
                Ok(None)
            }
        }).await.map_err(|e| anyhow::anyhow!("{}", e))
    }
    
    async fn link_identity(&self, user_id: &str, provider: &str, provider_id: &str, username: Option<&str>) -> anyhow::Result<()> {
        let user_id = user_id.to_string();
        let provider = provider.to_string();
        let provider_id = provider_id.to_string();
        let username = username.map(|s| s.to_string());
        let now = Utc::now().to_rfc3339();
        
        self.conn.call(move |conn| {
            conn.execute(
                "INSERT OR REPLACE INTO identities (user_id, provider, provider_id, username, linked_at) VALUES (?, ?, ?, ?, ?)",
                rusqlite::params![user_id, provider, provider_id, username, now],
            )?;
            Ok(())
        }).await.map_err(|e| anyhow::anyhow!("{}", e))
    }
    
    async fn get_user_identities(&self, user_id: &str) -> anyhow::Result<Vec<Identity>> {
        let user_id = user_id.to_string();
        
        self.conn.call(move |conn| {
            let mut stmt = conn.prepare(
                "SELECT user_id, provider, provider_id, username, linked_at FROM identities WHERE user_id = ?"
            )?;
            let rows = stmt.query_map([&user_id], |row| {
                Ok(Identity {
                    user_id: row.get(0)?,
                    provider: row.get(1)?,
                    provider_id: row.get(2)?,
                    username: row.get(3)?,
                    linked_at: row.get::<_, String>(4)?.parse().unwrap_or_else(|_| Utc::now()),
                })
            })?;
            
            let mut identities = Vec::new();
            for row in rows {
                identities.push(row?);
            }
            Ok(identities)
        }).await.map_err(|e| anyhow::anyhow!("{}", e))
    }
    
    async fn get_conversation(&self, user_id: &str, limit: usize) -> anyhow::Result<Vec<ConversationMessage>> {
        let user_id = user_id.to_string();
        
        self.conn.call(move |conn| {
            let mut stmt = conn.prepare(
                "SELECT id, user_id, role, content, channel, tool_calls, created_at 
                 FROM conversations 
                 WHERE user_id = ? 
                 ORDER BY created_at DESC 
                 LIMIT ?"
            )?;
            let rows = stmt.query_map(rusqlite::params![user_id, limit], |row| {
                Ok(ConversationMessage {
                    id: row.get(0)?,
                    user_id: row.get(1)?,
                    role: row.get(2)?,
                    content: row.get(3)?,
                    channel: row.get(4)?,
                    tool_calls: row.get(5)?,
                    created_at: row.get::<_, String>(6)?.parse().unwrap_or_else(|_| Utc::now()),
                })
            })?;
            
            let mut messages: Vec<ConversationMessage> = Vec::new();
            for row in rows {
                messages.push(row?);
            }
            // Reverse to get chronological order
            messages.reverse();
            Ok(messages)
        }).await.map_err(|e| anyhow::anyhow!("{}", e))
    }
    
    async fn add_message(&self, user_id: &str, role: &str, content: &str, channel: &str, tool_calls: Option<&str>) -> anyhow::Result<i64> {
        let user_id = user_id.to_string();
        let role = role.to_string();
        let content = content.to_string();
        let channel = channel.to_string();
        let tool_calls = tool_calls.map(|s| s.to_string());
        let now = Utc::now().to_rfc3339();
        
        self.conn.call(move |conn| {
            conn.execute(
                "INSERT INTO conversations (user_id, role, content, channel, tool_calls, created_at) VALUES (?, ?, ?, ?, ?, ?)",
                rusqlite::params![user_id, role, content, channel, tool_calls, now],
            )?;
            Ok(conn.last_insert_rowid())
        }).await.map_err(|e| anyhow::anyhow!("{}", e))
    }
    
    async fn clear_conversation(&self, user_id: &str) -> anyhow::Result<()> {
        let user_id = user_id.to_string();
        
        self.conn.call(move |conn| {
            conn.execute("DELETE FROM conversations WHERE user_id = ?", [&user_id])?;
            Ok(())
        }).await.map_err(|e| anyhow::anyhow!("{}", e))
    }
    
    async fn get_preferences(&self, user_id: &str) -> anyhow::Result<Option<Preferences>> {
        let user_id = user_id.to_string();
        
        self.conn.call(move |conn| {
            let mut stmt = conn.prepare("SELECT user_id, data, updated_at FROM preferences WHERE user_id = ?")?;
            let mut rows = stmt.query([&user_id])?;
            
            if let Some(row) = rows.next()? {
                let data_str: String = row.get(1)?;
                let data: serde_json::Value = serde_json::from_str(&data_str).unwrap_or(serde_json::json!({}));
                Ok(Some(Preferences {
                    user_id: row.get(0)?,
                    data,
                    updated_at: row.get::<_, String>(2)?.parse().unwrap_or_else(|_| Utc::now()),
                }))
            } else {
                Ok(None)
            }
        }).await.map_err(|e| anyhow::anyhow!("{}", e))
    }
    
    async fn set_preferences(&self, user_id: &str, data: serde_json::Value) -> anyhow::Result<()> {
        let user_id = user_id.to_string();
        let data_str = serde_json::to_string(&data)?;
        let now = Utc::now().to_rfc3339();
        
        self.conn.call(move |conn| {
            conn.execute(
                "INSERT OR REPLACE INTO preferences (user_id, data, updated_at) VALUES (?, ?, ?)",
                [&user_id, &data_str, &now],
            )?;
            Ok(())
        }).await.map_err(|e| anyhow::anyhow!("{}", e))
    }
}

// ============================================
// Hosted Store (Harness API)
// ============================================

pub struct HostedStore {
    api_url: String,
    token: String,
    client: reqwest::Client,
}

impl HostedStore {
    pub fn new(api_url: String, token: String) -> Self {
        Self {
            api_url,
            token,
            client: reqwest::Client::new(),
        }
    }
}

#[async_trait]
impl Store for HostedStore {
    async fn get_user(&self, user_id: &str) -> anyhow::Result<Option<User>> {
        let resp = self.client
            .get(format!("{}/api/v1/users/{}", self.api_url, user_id))
            .header("Authorization", format!("Bearer {}", self.token))
            .send()
            .await?;
        
        if resp.status() == 404 {
            return Ok(None);
        }
        
        let user: User = resp.json().await?;
        Ok(Some(user))
    }
    
    async fn create_user(&self, user_id: &str) -> anyhow::Result<User> {
        let resp = self.client
            .post(format!("{}/api/v1/users", self.api_url))
            .header("Authorization", format!("Bearer {}", self.token))
            .json(&serde_json::json!({ "id": user_id }))
            .send()
            .await?;
        
        let user: User = resp.json().await?;
        Ok(user)
    }
    
    async fn get_identity(&self, provider: &str, provider_id: &str) -> anyhow::Result<Option<Identity>> {
        let resp = self.client
            .get(format!("{}/api/v1/identities/{}:{}", self.api_url, provider, provider_id))
            .header("Authorization", format!("Bearer {}", self.token))
            .send()
            .await?;
        
        if resp.status() == 404 {
            return Ok(None);
        }
        
        let identity: Identity = resp.json().await?;
        Ok(Some(identity))
    }
    
    async fn link_identity(&self, user_id: &str, provider: &str, provider_id: &str, username: Option<&str>) -> anyhow::Result<()> {
        self.client
            .post(format!("{}/api/v1/identities", self.api_url))
            .header("Authorization", format!("Bearer {}", self.token))
            .json(&serde_json::json!({
                "user_id": user_id,
                "provider": provider,
                "provider_id": provider_id,
                "username": username
            }))
            .send()
            .await?;
        
        Ok(())
    }
    
    async fn get_user_identities(&self, user_id: &str) -> anyhow::Result<Vec<Identity>> {
        let resp = self.client
            .get(format!("{}/api/v1/users/{}/identities", self.api_url, user_id))
            .header("Authorization", format!("Bearer {}", self.token))
            .send()
            .await?;
        
        let identities: Vec<Identity> = resp.json().await?;
        Ok(identities)
    }
    
    async fn get_conversation(&self, user_id: &str, limit: usize) -> anyhow::Result<Vec<ConversationMessage>> {
        let resp = self.client
            .get(format!("{}/api/v1/users/{}/conversations?limit={}", self.api_url, user_id, limit))
            .header("Authorization", format!("Bearer {}", self.token))
            .send()
            .await?;
        
        let messages: Vec<ConversationMessage> = resp.json().await?;
        Ok(messages)
    }
    
    async fn add_message(&self, user_id: &str, role: &str, content: &str, channel: &str, tool_calls: Option<&str>) -> anyhow::Result<i64> {
        let resp = self.client
            .post(format!("{}/api/v1/users/{}/conversations", self.api_url, user_id))
            .header("Authorization", format!("Bearer {}", self.token))
            .json(&serde_json::json!({
                "role": role,
                "content": content,
                "channel": channel,
                "tool_calls": tool_calls
            }))
            .send()
            .await?;
        
        let result: serde_json::Value = resp.json().await?;
        Ok(result["id"].as_i64().unwrap_or(0))
    }
    
    async fn clear_conversation(&self, user_id: &str) -> anyhow::Result<()> {
        self.client
            .delete(format!("{}/api/v1/users/{}/conversations", self.api_url, user_id))
            .header("Authorization", format!("Bearer {}", self.token))
            .send()
            .await?;
        
        Ok(())
    }
    
    async fn get_preferences(&self, user_id: &str) -> anyhow::Result<Option<Preferences>> {
        let resp = self.client
            .get(format!("{}/api/v1/users/{}/preferences", self.api_url, user_id))
            .header("Authorization", format!("Bearer {}", self.token))
            .send()
            .await?;
        
        if resp.status() == 404 {
            return Ok(None);
        }
        
        let prefs: Preferences = resp.json().await?;
        Ok(Some(prefs))
    }
    
    async fn set_preferences(&self, user_id: &str, data: serde_json::Value) -> anyhow::Result<()> {
        self.client
            .put(format!("{}/api/v1/users/{}/preferences", self.api_url, user_id))
            .header("Authorization", format!("Bearer {}", self.token))
            .json(&data)
            .send()
            .await?;
        
        Ok(())
    }
}

// ============================================
// Store Factory
// ============================================

pub enum StoreType {
    Sqlite(PathBuf),
    Hosted { api_url: String, token: String },
}

pub async fn create_store(store_type: StoreType) -> anyhow::Result<Box<dyn Store>> {
    match store_type {
        StoreType::Sqlite(path) => {
            let store = SqliteStore::new(path).await?;
            Ok(Box::new(store))
        }
        StoreType::Hosted { api_url, token } => {
            let store = HostedStore::new(api_url, token);
            Ok(Box::new(store))
        }
    }
}
