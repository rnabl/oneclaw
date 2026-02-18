use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::collections::HashMap;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ExecutorManifest {
    pub id: String,
    pub version: String,
    pub description: String,
    pub permissions: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "status")]
pub enum ExecutorResult {
    #[serde(rename = "executed")]
    Executed { output: Value, duration_ms: u64 },
    #[serde(rename = "denied")]
    Denied { denial_reason: DenialReason },
    #[serde(rename = "error")]
    Error { error: String },
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DenialReason {
    pub rule: String,
    pub attempted: String,
    pub policy: String,
}

pub struct Registry {
    executors: HashMap<String, Box<dyn Executor + Send + Sync>>,
}

impl Registry {
    pub fn load() -> anyhow::Result<Self> {
        let mut executors: HashMap<String, Box<dyn Executor + Send + Sync>> = HashMap::new();
        executors.insert("http.request".to_string(), Box::new(HttpExecutor));
        executors.insert("llm.chat".to_string(), Box::new(LlmExecutor));
        executors.insert("google.gmail".to_string(), Box::new(GoogleGmailExecutor));
        Ok(Self { executors })
    }

    pub fn get(&self, id: &str) -> Option<&(dyn Executor + Send + Sync)> {
        self.executors.get(id).map(|e| e.as_ref())
    }

    pub fn list(&self) -> Vec<ExecutorManifest> {
        self.executors.values().map(|e| e.manifest()).collect()
    }
}

pub trait Executor {
    fn manifest(&self) -> ExecutorManifest;
    fn execute(&self, input: Value, config: &crate::config::NodeConfig) -> ExecutorResult;
}

pub struct HttpExecutor;

impl Executor for HttpExecutor {
    fn manifest(&self) -> ExecutorManifest {
        ExecutorManifest {
            id: "http.request".to_string(),
            version: "0.1.0".to_string(),
            description: "HTTP requests (curl parity)".to_string(),
            permissions: vec!["network".to_string()],
        }
    }

    fn execute(&self, input: Value, config: &crate::config::NodeConfig) -> ExecutorResult {
        let start = std::time::Instant::now();
        let method = input["method"].as_str().unwrap_or("GET");
        let url = match input["url"].as_str() {
            Some(u) => u,
            None => return ExecutorResult::Error { error: "url required".to_string() },
        };

        // Domain check
        if let Ok(parsed) = url::Url::parse(url) {
            let domain = parsed.host_str().unwrap_or("");
            let allowed = config.http.allowed_domains.iter().any(|p| p == "*" || p == domain || (p.starts_with("*.") && domain.ends_with(&p[1..])));
            if !allowed {
                return ExecutorResult::Denied {
                    denial_reason: DenialReason {
                        rule: "http.allowed_domains".to_string(),
                        attempted: domain.to_string(),
                        policy: format!("Domain '{}' not allowed", domain),
                    },
                };
            }
        }

        let client = reqwest::blocking::Client::new();
        let mut req = match method {
            "POST" => client.post(url),
            "PUT" => client.put(url),
            "DELETE" => client.delete(url),
            _ => client.get(url),
        };

        if let Some(headers) = input["headers"].as_object() {
            for (k, v) in headers {
                if let Some(val) = v.as_str() {
                    req = req.header(k.as_str(), val);
                }
            }
        }
        if let Some(body) = input["body"].as_str() {
            req = req.body(body.to_string());
        }

        match req.send() {
            Ok(resp) => {
                let status = resp.status().as_u16();
                let body = resp.text().unwrap_or_default();
                ExecutorResult::Executed {
                    output: serde_json::json!({ "status": status, "body": body }),
                    duration_ms: start.elapsed().as_millis() as u64,
                }
            }
            Err(e) => ExecutorResult::Error { error: e.to_string() },
        }
    }
}

// ============================================
// LLM Executor - Chat with AI
// ============================================

pub struct LlmExecutor;

impl Executor for LlmExecutor {
    fn manifest(&self) -> ExecutorManifest {
        ExecutorManifest {
            id: "llm.chat".to_string(),
            version: "0.1.0".to_string(),
            description: "Chat with LLM (OpenRouter/Anthropic/OpenAI)".to_string(),
            permissions: vec!["network".to_string(), "llm".to_string()],
        }
    }

    fn execute(&self, input: Value, config: &crate::config::NodeConfig) -> ExecutorResult {
        let start = std::time::Instant::now();
        
        // Get messages from input
        let messages = match input.get("messages") {
            Some(m) => m.clone(),
            None => return ExecutorResult::Error { error: "messages required".to_string() },
        };
        
        // Get API key from environment
        let api_key = match std::env::var(&config.llm.api_key_env) {
            Ok(k) => k,
            Err(_) => return ExecutorResult::Error { 
                error: format!("API key not found in env: {}", config.llm.api_key_env) 
            },
        };
        
        // Build request based on provider
        let (url, body, auth_header) = match config.llm.provider.as_str() {
            "openrouter" => {
                let url = "https://openrouter.ai/api/v1/chat/completions";
                let body = serde_json::json!({
                    "model": config.llm.model,
                    "messages": messages,
                    "max_tokens": 4096
                });
                (url, body, format!("Bearer {}", api_key))
            }
            "anthropic" => {
                let url = "https://api.anthropic.com/v1/messages";
                let body = serde_json::json!({
                    "model": config.llm.model,
                    "messages": messages,
                    "max_tokens": 4096
                });
                (url, body, api_key.clone())
            }
            "openai" => {
                let url = "https://api.openai.com/v1/chat/completions";
                let body = serde_json::json!({
                    "model": config.llm.model,
                    "messages": messages,
                    "max_tokens": 4096
                });
                (url, body, format!("Bearer {}", api_key))
            }
            _ => return ExecutorResult::Error { 
                error: format!("Unknown provider: {}", config.llm.provider) 
            },
        };
        
        let client = reqwest::blocking::Client::new();
        let mut req = client.post(url)
            .header("Content-Type", "application/json")
            .json(&body);
        
        // Add auth header
        if config.llm.provider == "anthropic" {
            req = req.header("x-api-key", auth_header)
                     .header("anthropic-version", "2023-06-01");
        } else {
            req = req.header("Authorization", auth_header);
        }
        
        match req.send() {
            Ok(resp) => {
                let status = resp.status().as_u16();
                let body_text = resp.text().unwrap_or_default();
                
                if status >= 400 {
                    return ExecutorResult::Error { 
                        error: format!("LLM API error {}: {}", status, body_text) 
                    };
                }
                
                // Parse response to extract content
                let parsed: Value = match serde_json::from_str(&body_text) {
                    Ok(v) => v,
                    Err(e) => return ExecutorResult::Error { error: format!("Parse error: {}", e) },
                };
                
                // Extract assistant message based on provider format
                let content = if config.llm.provider == "anthropic" {
                    parsed["content"][0]["text"].as_str().unwrap_or("").to_string()
                } else {
                    parsed["choices"][0]["message"]["content"].as_str().unwrap_or("").to_string()
                };
                
                ExecutorResult::Executed {
                    output: serde_json::json!({
                        "content": content,
                        "model": config.llm.model,
                        "provider": config.llm.provider,
                        "raw": parsed
                    }),
                    duration_ms: start.elapsed().as_millis() as u64,
                }
            }
            Err(e) => ExecutorResult::Error { error: e.to_string() },
        }
    }
}

// ============================================
// Google Gmail Executor
// ============================================

pub struct GoogleGmailExecutor;

impl Executor for GoogleGmailExecutor {
    fn manifest(&self) -> ExecutorManifest {
        ExecutorManifest {
            id: "google.gmail".to_string(),
            version: "0.1.0".to_string(),
            description: "Send emails via Gmail API".to_string(),
            permissions: vec!["network".to_string(), "oauth".to_string()],
        }
    }
    
    fn execute(&self, input: Value, config: &crate::config::NodeConfig) -> ExecutorResult {
        let start = std::time::Instant::now();
        
        // Extract required fields
        let user_id = match input["user_id"].as_str() {
            Some(u) => u,
            None => return ExecutorResult::Error { error: "user_id required".to_string() },
        };
        
        let to = match input["to"].as_str() {
            Some(t) => t,
            None => return ExecutorResult::Error { error: "to email required".to_string() },
        };
        
        let subject = input["subject"].as_str().unwrap_or("(No Subject)");
        let body = match input["body"].as_str() {
            Some(b) => b,
            None => return ExecutorResult::Error { error: "body required".to_string() },
        };
        
        let from_name = input["from_name"].as_str();
        let gmail_account_id = input["gmail_account_id"].as_str();
        
        // Get control plane URL
        let control_plane_url = match &config.control_plane.url {
            Some(url) => url,
            None => return ExecutorResult::Error { 
                error: "control_plane.url not configured".to_string() 
            },
        };
        
        // Call Harness API to send email
        let client = reqwest::blocking::Client::new();
        let mut payload = serde_json::json!({
            "user_id": user_id,
            "to": to,
            "subject": subject,
            "body": body,
        });
        
        if let Some(name) = from_name {
            payload["from_name"] = Value::String(name.to_string());
        }
        
        if let Some(account_id) = gmail_account_id {
            payload["gmail_account_id"] = Value::String(account_id.to_string());
        }
        
        let result = client
            .post(format!("{}/api/v1/oauth/google/send", control_plane_url))
            .header("Content-Type", "application/json")
            .json(&payload)
            .send();
        
        match result {
            Ok(resp) => {
                let status = resp.status().as_u16();
                let body_text = resp.text().unwrap_or_default();
                
                if status >= 400 {
                    return ExecutorResult::Error {
                        error: format!("Gmail API error {}: {}", status, body_text),
                    };
                }
                
                let parsed: Value = serde_json::from_str(&body_text)
                    .unwrap_or_else(|_| serde_json::json!({ "raw": body_text }));
                
                ExecutorResult::Executed {
                    output: serde_json::json!({
                        "success": true,
                        "to": to,
                        "subject": subject,
                        "gmail_message_id": parsed["gmail_message_id"],
                        "sent_at": parsed["sent_at"],
                    }),
                    duration_ms: start.elapsed().as_millis() as u64,
                }
            }
            Err(e) => ExecutorResult::Error { error: e.to_string() },
        }
    }
}

