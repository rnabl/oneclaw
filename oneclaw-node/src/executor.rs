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
        let harness_url = std::env::var("HARNESS_URL").unwrap_or_else(|_| "http://localhost:9000".to_string());
        
        let mut executors: HashMap<String, Box<dyn Executor + Send + Sync>> = HashMap::new();
        executors.insert("http.request".to_string(), Box::new(HttpExecutor));
        executors.insert("llm.chat".to_string(), Box::new(LlmExecutor));
        executors.insert("google.gmail".to_string(), Box::new(GoogleGmailExecutor));
        executors.insert("harness.execute".to_string(), Box::new(HarnessExecutor::new(harness_url)));
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

fn extract_text_from_value(value: &Value) -> String {
    match value {
        Value::String(s) => s.clone(),
        Value::Array(items) => {
            let mut parts: Vec<String> = Vec::new();
            for item in items {
                if let Some(s) = item.as_str() {
                    if !s.trim().is_empty() {
                        parts.push(s.to_string());
                    }
                    continue;
                }
                if let Some(s) = item.get("text").and_then(|v| v.as_str()) {
                    if !s.trim().is_empty() {
                        parts.push(s.to_string());
                    }
                    continue;
                }
                if let Some(s) = item.get("content").and_then(|v| v.as_str()) {
                    if !s.trim().is_empty() {
                        parts.push(s.to_string());
                    }
                    continue;
                }
                if let Some(s) = item.get("value").and_then(|v| v.as_str()) {
                    if !s.trim().is_empty() {
                        parts.push(s.to_string());
                    }
                    continue;
                }
                if let Some(nested) = item.get("content") {
                    let nested_text = extract_text_from_value(nested);
                    if !nested_text.trim().is_empty() {
                        parts.push(nested_text);
                    }
                }
            }
            parts.join("\n")
        }
        Value::Object(map) => {
            for key in ["text", "content", "value"] {
                if let Some(v) = map.get(key) {
                    let text = extract_text_from_value(v);
                    if !text.trim().is_empty() {
                        return text;
                    }
                }
            }
            String::new()
        }
        _ => String::new(),
    }
}

fn collect_string_values(value: &Value, out: &mut Vec<String>) {
    match value {
        Value::String(s) => {
            let trimmed = s.trim();
            if !trimmed.is_empty() {
                out.push(trimmed.to_string());
            }
        }
        Value::Array(items) => {
            for item in items {
                collect_string_values(item, out);
            }
        }
        Value::Object(map) => {
            for (_k, v) in map {
                collect_string_values(v, out);
            }
        }
        _ => {}
    }
}

fn extract_assistant_content(parsed: &Value, provider: &str) -> String {
    // Anthropic format: content is usually an array of blocks with .text
    if provider == "anthropic" {
        let text = extract_text_from_value(&parsed["content"]);
        if !text.trim().is_empty() {
            return text;
        }
    }

    // OpenAI/OpenRouter common format.
    let text = extract_text_from_value(&parsed["choices"][0]["message"]["content"]);
    if !text.trim().is_empty() {
        return text;
    }

    // Alternative formats seen across some compatible providers/models.
    let text = extract_text_from_value(&parsed["choices"][0]["text"]);
    if !text.trim().is_empty() {
        return text;
    }

    let text = extract_text_from_value(&parsed["output_text"]);
    if !text.trim().is_empty() {
        return text;
    }

    let text = extract_text_from_value(&parsed["output"]);
    if !text.trim().is_empty() {
        return text;
    }

    // Provider-agnostic named fields seen in compatible APIs.
    for key in ["response", "answer", "assistant", "final", "reasoning"] {
        let text = extract_text_from_value(&parsed[key]);
        if !text.trim().is_empty() {
            return text;
        }
    }

    // Last resort: deep scan for non-trivial strings and pick the longest.
    let mut strings = Vec::new();
    collect_string_values(parsed, &mut strings);
    strings.retain(|s| s.len() >= 8);
    if let Some(best) = strings.into_iter().max_by_key(|s| s.len()) {
        return best;
    }

    String::new()
}

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
        let (url, mut body, auth_header) = match config.llm.provider.as_str() {
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

        // Optional fallback model for transient provider failures.
        let fallback_model = std::env::var("LLM_FALLBACK_MODEL").ok();

        // Timeouts + retry to avoid hanging when provider has transient 5xx issues.
        let client = match reqwest::blocking::Client::builder()
            .connect_timeout(std::time::Duration::from_secs(10))
            .timeout(std::time::Duration::from_secs(45))
            .build() {
            Ok(c) => c,
            Err(e) => return ExecutorResult::Error { error: format!("Failed to build HTTP client: {}", e) },
        };

        let max_attempts = 3;
        let mut attempt_error = String::new();
        let mut used_model = config.llm.model.clone();

        for attempt in 1..=max_attempts {
            let mut req = client.post(url)
                .header("Content-Type", "application/json")
                .json(&body);

            // Add auth header
            if config.llm.provider == "anthropic" {
                req = req.header("x-api-key", auth_header.clone())
                         .header("anthropic-version", "2023-06-01");
            } else {
                req = req.header("Authorization", auth_header.clone());
            }

            match req.send() {
                Ok(resp) => {
                    let status = resp.status().as_u16();
                    let body_text = resp.text().unwrap_or_default();

                    // Retry on provider-side errors.
                    if status >= 500 && attempt < max_attempts {
                        attempt_error = format!("LLM API error {} on attempt {}", status, attempt);
                        std::thread::sleep(std::time::Duration::from_millis(400 * attempt as u64));
                        continue;
                    }

                    // Optional fallback model after retries exhausted on 5xx.
                    if status >= 500 && attempt == max_attempts {
                        if let Some(fallback) = &fallback_model {
                            if fallback != &used_model {
                                used_model = fallback.clone();
                                body["model"] = serde_json::Value::String(used_model.clone());
                                attempt_error = format!("Primary model failed with {}, retrying once with fallback model {}", status, used_model);
                                // One additional fallback request.
                                let mut fb_req = client.post(url)
                                    .header("Content-Type", "application/json")
                                    .json(&body);
                                if config.llm.provider == "anthropic" {
                                    fb_req = fb_req.header("x-api-key", auth_header.clone())
                                                   .header("anthropic-version", "2023-06-01");
                                } else {
                                    fb_req = fb_req.header("Authorization", auth_header.clone());
                                }

                                match fb_req.send() {
                                    Ok(fb_resp) => {
                                        let fb_status = fb_resp.status().as_u16();
                                        let fb_body_text = fb_resp.text().unwrap_or_default();
                                        if fb_status >= 400 {
                                            let snippet = fb_body_text.chars().take(500).collect::<String>();
                                            return ExecutorResult::Error {
                                                error: format!("LLM API error {} (fallback model {}): {}", fb_status, used_model, snippet),
                                            };
                                        }

                                        let parsed: Value = match serde_json::from_str(&fb_body_text) {
                                            Ok(v) => v,
                                            Err(e) => return ExecutorResult::Error { error: format!("Parse error (fallback): {}", e) },
                                        };

                                        let content = extract_assistant_content(&parsed, &config.llm.provider);

                                        return ExecutorResult::Executed {
                                            output: serde_json::json!({
                                                "content": content,
                                                "model": used_model,
                                                "provider": config.llm.provider,
                                                "raw": parsed
                                            }),
                                            duration_ms: start.elapsed().as_millis() as u64,
                                        };
                                    }
                                    Err(e) => {
                                        return ExecutorResult::Error { error: format!("Fallback request failed: {}", e) };
                                    }
                                }
                            }
                        }
                    }

                    if status >= 400 {
                        let snippet = body_text.chars().take(500).collect::<String>();
                        return ExecutorResult::Error { 
                            error: format!("LLM API error {}: {}", status, snippet) 
                        };
                    }

                    // Parse response to extract content
                    let parsed: Value = match serde_json::from_str(&body_text) {
                        Ok(v) => v,
                        Err(e) => return ExecutorResult::Error { error: format!("Parse error: {}", e) },
                    };

                    // Extract assistant message based on provider format
                    let content = extract_assistant_content(&parsed, &config.llm.provider);

                    return ExecutorResult::Executed {
                        output: serde_json::json!({
                            "content": content,
                            "model": used_model,
                            "provider": config.llm.provider,
                            "raw": parsed
                        }),
                        duration_ms: start.elapsed().as_millis() as u64,
                    };
                }
                Err(e) => {
                    attempt_error = format!("LLM request failed on attempt {}: {}", attempt, e);
                    if attempt < max_attempts {
                        std::thread::sleep(std::time::Duration::from_millis(400 * attempt as u64));
                        continue;
                    }
                }
            }
        }

        ExecutorResult::Error {
            error: if attempt_error.is_empty() {
                "LLM request failed after retries".to_string()
            } else {
                attempt_error
            },
        }
    }
}

// ============================================
// Google Gmail Executor
// ============================================

pub struct GoogleGmailExecutor;

// ============================================
// Harness Executor - Bridge to TypeScript
// ============================================

pub struct HarnessExecutor {
    pub harness_url: String,
}

impl HarnessExecutor {
    pub fn new(harness_url: String) -> Self {
        Self { harness_url }
    }
}

impl Executor for HarnessExecutor {
    fn manifest(&self) -> ExecutorManifest {
        ExecutorManifest {
            id: "harness.execute".to_string(),
            version: "0.1.0".to_string(),
            description: "Execute workflows on the TypeScript Harness".to_string(),
            permissions: vec!["network".to_string(), "harness".to_string()],
        }
    }
    
    fn execute(&self, input: Value, _config: &crate::config::NodeConfig) -> ExecutorResult {
        let start = std::time::Instant::now();
        
        let executor_id = match input["executor"].as_str() {
            Some(e) => e,
            None => return ExecutorResult::Error { error: "executor required".to_string() },
        };
        
        let params = input.get("params").cloned().unwrap_or(serde_json::json!({}));
        let tenant_id = input["tenant_id"].as_str().unwrap_or("default");
        let tier = input["tier"].as_str().unwrap_or("pro");
        
        let client = reqwest::blocking::Client::builder()
            .timeout(std::time::Duration::from_secs(300)) // 5 min timeout for long workflows
            .build()
            .unwrap_or_else(|_| reqwest::blocking::Client::new());
        
        let payload = serde_json::json!({
            "workflowId": executor_id,
            "input": params,
            "tenantId": tenant_id,
            "tier": tier,
        });
        
        let url = format!("{}/execute", self.harness_url);
        
        match client.post(&url)
            .header("Content-Type", "application/json")
            .json(&payload)
            .send()
        {
            Ok(resp) => {
                let status = resp.status().as_u16();
                let body_text = resp.text().unwrap_or_default();
                
                if status >= 400 {
                    return ExecutorResult::Error { 
                        error: format!("Harness error {}: {}", status, body_text) 
                    };
                }
                
                let parsed: Value = serde_json::from_str(&body_text)
                    .unwrap_or_else(|_| serde_json::json!({ "raw": body_text }));
                
                // Check for error in response
                if let Some(err) = parsed.get("error") {
                    return ExecutorResult::Error { 
                        error: err.as_str().unwrap_or("Unknown error").to_string()
                    };
                }
                
                // NOTE: Monitor+heal spawn removed from here - execute() runs in spawn_blocking,
                // and tokio::task::spawn from a blocking thread causes runtime panic. Re-enable
                // by having the daemon spawn the monitor in async context after getting the response.
                
                ExecutorResult::Executed {
                    output: parsed,
                    duration_ms: start.elapsed().as_millis() as u64,
                }
            }
            Err(e) => ExecutorResult::Error { error: e.to_string() },
        }
    }
}

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

