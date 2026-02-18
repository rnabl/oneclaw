use axum::{extract::State, http::StatusCode, response::Html, routing::{get, post}, Json, Router};
use serde::{Deserialize, Serialize};
use std::sync::Arc;
use tower_http::cors::CorsLayer;
use crate::{config, conversation, executor, identity, integration, memory, oauth_config, receipt, store, workflow};

pub struct AppState {
    pub config: &'static config::NodeConfig,
    pub executor_registry: executor::Registry,
    pub store: Arc<dyn store::Store>,
    pub identity_manager: identity::IdentityManager,
    pub conversation_manager: conversation::ConversationManager,
}

pub async fn start(port: u16) -> anyhow::Result<()> {
    let config = config::load()?;
    let executor_registry = executor::Registry::load()?;
    
    // Initialize store based on config
    let store_instance: Arc<dyn store::Store> = match config.store.store_type.as_str() {
        "hosted" => {
            let api_url = config.control_plane.url.clone()
                .unwrap_or_else(|| "http://localhost:3000".to_string());
            let token = config.control_plane.token.clone()
                .unwrap_or_default();
            Arc::new(store::HostedStore::new(api_url, token))
        }
        _ => {
            // Default to SQLite
            let path = config::expand_path(&config.store.sqlite_path);
            let sqlite_store = store::SqliteStore::new(path).await?;
            Arc::new(sqlite_store)
        }
    };
    
    // Initialize managers
    let identity_manager = identity::IdentityManager::new(
        store_instance.clone(),
        config.identity.auto_create,
    );
    
    let conversation_manager = conversation::ConversationManager::new(
        store_instance.clone(),
        config.memory.session_max_messages,
    );
    
    let state = Arc::new(AppState { 
        config, 
        executor_registry,
        store: store_instance,
        identity_manager,
        conversation_manager,
    });

    let app = Router::new()
        .route("/", get(ui_dashboard))
        .route("/chat.html", get(ui_chat))
        .route("/setup.html", get(ui_setup))
        .route("/receipts.html", get(ui_receipts))
        .route("/integrations.html", get(ui_integrations))
        .route("/static/style.css", get(ui_style))
        .route("/health", get(health))
        .route("/config", get(get_config))
        .route("/run", post(run_workflow))
        .route("/chat", post(chat))
        .route("/chat/history", get(get_chat_history))
        .route("/chat/clear", post(clear_chat))
        .route("/receipts", get(list_receipts))
        .route("/memory/preferences", get(get_preferences))
        .route("/executors", get(list_executors))
        .route("/integrations", get(get_integrations))
        .route("/integrations/gmail/connect", get(connect_gmail))
        .route("/integrations/gmail/status", get(gmail_status))
        .route("/api/oauth/config", post(oauth_config::save_oauth_config_handler))
        .layer(CorsLayer::permissive())
        .with_state(state);

    println!("\n🦞 OneClaw Node Daemon (Rust)");
    println!("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    println!("  Node:   {} ({})", config.node.name, config.node.id);
    println!("  Mode:   {}", config.node.environment);
    println!("  UI:     http://localhost:{}", port);
    println!("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    println!("\nPress Ctrl+C to stop\n");

    let listener = tokio::net::TcpListener::bind(format!("0.0.0.0:{}", port)).await?;
    axum::serve(listener, app).await?;
    Ok(())
}

async fn ui_dashboard() -> Html<&'static str> { Html(include_str!("ui/index.html")) }
async fn ui_chat() -> Html<&'static str> { Html(include_str!("ui/chat.html")) }
async fn ui_setup() -> Html<&'static str> { Html(include_str!("ui/setup.html")) }
async fn ui_receipts() -> Html<&'static str> { Html(include_str!("ui/receipts.html")) }
async fn ui_integrations() -> Html<&'static str> { Html(include_str!("ui/integrations.html")) }
async fn ui_style() -> ([(&'static str, &'static str); 1], &'static str) {
    ([("content-type", "text/css")], include_str!("ui/style.css"))
}

#[derive(Serialize)]
struct HealthResponse { status: String, node_id: String, node_name: String }

async fn health(State(state): State<Arc<AppState>>) -> Json<HealthResponse> {
    Json(HealthResponse {
        status: "ok".to_string(),
        node_id: state.config.node.id.clone(),
        node_name: state.config.node.name.clone(),
    })
}

async fn get_config(State(state): State<Arc<AppState>>) -> Json<&'static config::NodeConfig> {
    Json(state.config)
}

#[derive(Deserialize)]
struct RunRequest { workflow_id: String, inputs: serde_json::Value }

async fn run_workflow(State(_state): State<Arc<AppState>>, Json(req): Json<RunRequest>) -> Result<Json<receipt::WorkflowReceipt>, (StatusCode, String)> {
    workflow::run(&req.workflow_id, req.inputs).await
        .map(Json)
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))
}

async fn list_receipts() -> Result<Json<Vec<String>>, (StatusCode, String)> {
    receipt::list_receipts().map(Json).map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))
}

async fn get_preferences() -> Result<Json<memory::Preferences>, (StatusCode, String)> {
    memory::load_preferences().map(Json).map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))
}

async fn list_executors(State(state): State<Arc<AppState>>) -> Json<Vec<executor::ExecutorManifest>> {
    Json(state.executor_registry.list())
}

// ============================================
// Chat Endpoint
// ============================================

#[derive(Deserialize)]
struct ChatRequest {
    message: String,
    #[serde(default = "default_channel")]
    channel: String,
    #[serde(default)]
    provider: Option<String>,      // e.g., "discord", "http"
    #[serde(default)]
    provider_id: Option<String>,   // e.g., "397102686660591616"
    #[serde(default)]
    username: Option<String>,
}

fn default_channel() -> String { "http".to_string() }

#[derive(Serialize)]
struct ChatResponse {
    response: String,
    tool_calls: Vec<ToolCallResult>,
    duration_ms: u64,
}

#[derive(Serialize, Clone)]
struct ToolCallResult {
    tool: String,
    input: serde_json::Value,
    output: serde_json::Value,
    duration_ms: u64,
}

fn get_system_prompt(state: &AppState, user_id: &str) -> String {
    let executors: Vec<String> = state.executor_registry.list()
        .iter()
        .map(|e| format!("- {}: {}", e.id, e.description))
        .collect();
    
    // Check Gmail connection status
    let control_plane_url = state.config.control_plane.url.as_deref();
    let gmail_connected = tokio::task::block_in_place(|| {
        tokio::runtime::Handle::current()
            .block_on(integration::check_gmail_connected(user_id, control_plane_url))
    });
    
    let mut prompt = format!(r#"You are OneClaw, a powerful AI assistant running on a local node.

You have access to these tools that you can use by responding with JSON tool calls:

AVAILABLE TOOLS:
{}

To use a tool, respond with a JSON block like this:
```tool
{{"tool": "http.request", "input": {{"method": "GET", "url": "https://api.example.com/data"}}}}
```

You can make multiple tool calls in one response. After each tool call, you'll receive the result and can continue your response.

When making HTTP requests:
- Use http.request for any API calls
- The OneClaw API is at: http://104.131.111.116:3000
- You have full network access (all domains allowed)
"#, executors.join("\n"));
    
    // Add Gmail integration status
    if gmail_connected {
        prompt.push_str(r#"
GMAIL INTEGRATION: ✅ Connected
You can send emails using the google.gmail tool:
```tool
{"tool": "google.gmail", "input": {"user_id": "USER_ID", "to": "email@example.com", "subject": "Hello", "body": "Email content here"}}
```

When a user asks to send an email, use this tool to send it.
"#);
    } else {
        prompt.push_str(&format!(r#"
GMAIL INTEGRATION: ❌ Not Connected
If the user asks to send an email, respond with:

"I'd love to send that email! However, I need access to your Gmail first.

🔗 Click here to connect: http://localhost:8787/integrations/gmail/connect

This will open Google's secure login page. Once you approve, I'll be able to send emails on your behalf. Your credentials are encrypted and stored locally."

Do NOT attempt to use the google.gmail tool until Gmail is connected.
"#));
    }
    
    prompt.push_str(&format!(r#"

Be helpful, concise, and actually execute tasks when asked. You are wired into real systems - your tool calls will actually run.

Current node: {} ({})
Environment: {}"#,
        state.config.node.name,
        state.config.node.id,
        state.config.node.environment
    ));
    
    prompt
}

async fn chat(
    State(state): State<Arc<AppState>>,
    Json(req): Json<ChatRequest>,
) -> Result<Json<ChatResponse>, (StatusCode, String)> {
    let start = std::time::Instant::now();
    let mut tool_call_results: Vec<ToolCallResult> = Vec::new();
    
    // Resolve user identity
    let provider = req.provider.as_deref().unwrap_or("http");
    let provider_id = req.provider_id.as_deref().unwrap_or("anonymous");
    let username = req.username.as_deref();
    
    let (user_id, is_new) = state.identity_manager
        .resolve(provider, provider_id, username)
        .await
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;
    
    if is_new {
        tracing::info!(user_id = %user_id, provider = %provider, "New user created");
    }
    
    // Add user message to persistent conversation
    state.conversation_manager
        .add_user_message(&user_id, &req.message, &req.channel)
        .await
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;
    
    // Build messages array for LLM with integration-aware system prompt
    let system_prompt = get_system_prompt(&state, &user_id);
    let messages = state.conversation_manager
        .build_llm_messages(&user_id, &system_prompt)
        .await
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;
    
    // Call LLM executor
    let llm_executor = state.executor_registry.get("llm.chat")
        .ok_or((StatusCode::INTERNAL_SERVER_ERROR, "LLM executor not found".to_string()))?;
    
    let input = serde_json::json!({ "messages": messages });
    let result = llm_executor.execute(input, state.config);
    
    let mut final_content = String::new();
    
    match result {
        executor::ExecutorResult::Executed { output, duration_ms: _ } => {
            let content = output["content"].as_str().unwrap_or("").to_string();
            
            // Check for tool calls in the response
            let tool_regex = regex::Regex::new(r"```tool\s*\n?([\s\S]*?)\n?```").unwrap();
            let mut remaining_content = content.clone();
            
            for cap in tool_regex.captures_iter(&content) {
                let tool_json = &cap[1];
                
                // Parse tool call
                if let Ok(tool_call) = serde_json::from_str::<serde_json::Value>(tool_json) {
                    let tool_name = tool_call["tool"].as_str().unwrap_or("");
                    let tool_input = tool_call["input"].clone();
                    
                    // Execute the tool
                    if let Some(executor) = state.executor_registry.get(tool_name) {
                        let tool_start = std::time::Instant::now();
                        let tool_result = executor.execute(tool_input.clone(), state.config);
                        
                        match tool_result {
                            executor::ExecutorResult::Executed { output, duration_ms } => {
                                tool_call_results.push(ToolCallResult {
                                    tool: tool_name.to_string(),
                                    input: tool_input,
                                    output: output.clone(),
                                    duration_ms,
                                });
                                
                                // Add tool result to conversation for follow-up
                                let tool_result_msg = format!(
                                    "[Tool Result: {}]\n{}",
                                    tool_name,
                                    serde_json::to_string_pretty(&output).unwrap_or_default()
                                );
                                
                                // Record tool execution in persistent store
                                let _ = state.conversation_manager
                                    .add_assistant_message(&user_id, &format!("Executing {}...", tool_name), &req.channel, None)
                                    .await;
                                let _ = state.conversation_manager
                                    .add_tool_message(&user_id, &tool_result_msg, &req.channel)
                                    .await;
                            }
                            executor::ExecutorResult::Error { error } => {
                                tool_call_results.push(ToolCallResult {
                                    tool: tool_name.to_string(),
                                    input: tool_input,
                                    output: serde_json::json!({"error": error}),
                                    duration_ms: tool_start.elapsed().as_millis() as u64,
                                });
                            }
                            executor::ExecutorResult::Denied { denial_reason } => {
                                tool_call_results.push(ToolCallResult {
                                    tool: tool_name.to_string(),
                                    input: tool_input,
                                    output: serde_json::json!({"denied": denial_reason.policy}),
                                    duration_ms: 0,
                                });
                            }
                        }
                    }
                }
                
                // Remove tool block from visible content
                remaining_content = remaining_content.replace(&cap[0], "");
            }
            
            // Clean up the response
            final_content = remaining_content.trim().to_string();
            
            // If we executed tools, get a follow-up response
            if !tool_call_results.is_empty() {
                // Rebuild messages with tool results from persistent store
                let mut followup_messages = state.conversation_manager
                    .build_llm_messages(&user_id, &system_prompt)
                    .await
                    .unwrap_or_else(|_| messages.clone());
                
                followup_messages.push(serde_json::json!({
                    "role": "user",
                    "content": "Now summarize the result for the user in a helpful way. Do NOT include any ```tool blocks - the tool has already been executed. Just explain what happened in plain text."
                }));
                
                let followup_input = serde_json::json!({ "messages": followup_messages });
                if let executor::ExecutorResult::Executed { output, .. } = llm_executor.execute(followup_input, state.config) {
                    let mut followup_content = output["content"].as_str().unwrap_or(&final_content).to_string();
                    // Strip any remaining tool blocks from follow-up
                    let tool_regex = regex::Regex::new(r"```tool\s*\n?([\s\S]*?)\n?```").unwrap();
                    followup_content = tool_regex.replace_all(&followup_content, "").to_string();
                    final_content = followup_content.trim().to_string();
                }
            }
            
            // Add final response to persistent conversation
            let tool_calls_for_storage: Option<Vec<conversation::ToolCall>> = if tool_call_results.is_empty() {
                None
            } else {
                Some(tool_call_results.iter().map(|tc| conversation::ToolCall {
                    tool: tc.tool.clone(),
                    input: tc.input.clone(),
                    output: Some(tc.output.clone()),
                    success: !tc.output.get("error").is_some(),
                    duration_ms: tc.duration_ms,
                }).collect())
            };
            
            let _ = state.conversation_manager
                .add_assistant_message(&user_id, &final_content, &req.channel, tool_calls_for_storage.as_deref())
                .await;
            
            Ok(Json(ChatResponse {
                response: final_content,
                tool_calls: tool_call_results,
                duration_ms: start.elapsed().as_millis() as u64,
            }))
        }
        executor::ExecutorResult::Error { error } => {
            Err((StatusCode::INTERNAL_SERVER_ERROR, error))
        }
        executor::ExecutorResult::Denied { denial_reason } => {
            Err((StatusCode::FORBIDDEN, denial_reason.policy))
        }
    }
}

#[derive(Deserialize)]
struct HistoryQuery {
    #[serde(default)]
    user_id: Option<String>,
}

async fn get_chat_history(
    State(state): State<Arc<AppState>>,
    axum::extract::Query(query): axum::extract::Query<HistoryQuery>,
) -> Result<Json<Vec<conversation::ChatMessage>>, (StatusCode, String)> {
    // For HTTP channel, use provided user_id or default to anonymous
    let user_id = query.user_id.unwrap_or_else(|| "http:anonymous".to_string());
    
    // First, resolve the user_id if it looks like a provider:id format
    let actual_user_id = if user_id.contains(':') {
        let parts: Vec<&str> = user_id.split(':').collect();
        if parts.len() == 2 {
            match state.identity_manager.resolve(parts[0], parts[1], None).await {
                Ok((uid, _)) => uid,
                Err(_) => user_id.clone(),
            }
        } else {
            user_id.clone()
        }
    } else {
        user_id.clone()
    };
    
    let history = state.conversation_manager
        .get_history(&actual_user_id)
        .await
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;
    
    Ok(Json(history))
}

async fn clear_chat(
    State(state): State<Arc<AppState>>,
    axum::extract::Query(query): axum::extract::Query<HistoryQuery>,
) -> Result<Json<serde_json::Value>, (StatusCode, String)> {
    let user_id = query.user_id.unwrap_or_else(|| "http:anonymous".to_string());
    
    // Resolve user_id
    let actual_user_id = if user_id.contains(':') {
        let parts: Vec<&str> = user_id.split(':').collect();
        if parts.len() == 2 {
            match state.identity_manager.resolve(parts[0], parts[1], None).await {
                Ok((uid, _)) => uid,
                Err(_) => user_id.clone(),
            }
        } else {
            user_id.clone()
        }
    } else {
        user_id.clone()
    };
    
    state.conversation_manager
        .clear(&actual_user_id)
        .await
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;
    
    Ok(Json(serde_json::json!({ "cleared": true, "user_id": actual_user_id })))
}

// ============================================
// Integration Endpoints
// ============================================

/// GET /integrations - List all available integrations with connection status
async fn get_integrations(
    State(state): State<Arc<AppState>>,
) -> Json<serde_json::Value> {
    let user_id = &state.config.node.id;
    let control_plane_url = state.config.control_plane.url.as_deref();
    
    let integrations = integration::get_integrations_list(user_id, control_plane_url).await;
    
    Json(serde_json::json!({
        "integrations": integrations
    }))
}

/// GET /integrations/gmail/connect - Redirect to OAuth flow
async fn connect_gmail(
    State(state): State<Arc<AppState>>,
) -> Result<Html<String>, (StatusCode, String)> {
    let control_plane_url = state.config.control_plane.url.as_ref()
        .ok_or((StatusCode::BAD_REQUEST, "Control plane URL not configured".to_string()))?;
    
    let user_id = &state.config.node.id;
    
    let oauth_url = integration::generate_oauth_url("gmail", user_id, control_plane_url)
        .ok_or((StatusCode::INTERNAL_SERVER_ERROR, "Failed to generate OAuth URL".to_string()))?;
    
    let html = format!(r#"
<!DOCTYPE html>
<html>
<head>
    <title>Connect Gmail</title>
    <meta http-equiv="refresh" content="0; url={}">
    <style>
        body {{
            font-family: -apple-system, BlinkMacSystemFont, sans-serif;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            display: flex;
            align-items: center;
            justify-content: center;
            height: 100vh;
            margin: 0;
        }}
        .card {{
            background: white;
            border-radius: 20px;
            padding: 40px;
            text-align: center;
            box-shadow: 0 10px 40px rgba(0,0,0,0.2);
            max-width: 400px;
        }}
        .emoji {{ font-size: 64px; margin-bottom: 20px; }}
        .loader {{
            border: 4px solid #f3f3f3;
            border-top: 4px solid #667eea;
            border-radius: 50%;
            width: 40px;
            height: 40px;
            animation: spin 1s linear infinite;
            margin: 20px auto;
        }}
        @keyframes spin {{
            0% {{ transform: rotate(0deg); }}
            100% {{ transform: rotate(360deg); }}
        }}
        a {{ color: #667eea; text-decoration: none; }}
    </style>
</head>
<body>
    <div class="card">
        <div class="emoji">🔗</div>
        <h1>Connecting to Gmail...</h1>
        <div class="loader"></div>
        <p style="color: #666; margin-top: 20px;">
            Redirecting to Google login...
        </p>
        <p style="font-size: 14px; margin-top: 16px;">
            <a href="{}">Click here if not redirected</a>
        </p>
    </div>
</body>
</html>
    "#, oauth_url, oauth_url);
    
    Ok(Html(html))
}

/// GET /integrations/gmail/status - Check if Gmail is connected
async fn gmail_status(
    State(state): State<Arc<AppState>>,
) -> Json<serde_json::Value> {
    let user_id = &state.config.node.id;
    let control_plane_url = state.config.control_plane.url.as_deref();
    
    let connected = integration::check_gmail_connected(user_id, control_plane_url).await;
    
    Json(serde_json::json!({
        "connected": connected,
        "user_id": user_id,
    }))
}

