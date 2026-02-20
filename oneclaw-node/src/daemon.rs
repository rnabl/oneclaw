use axum::{extract::State, http::StatusCode, response::Html, routing::{get, post}, Json, Router};
use serde::{Deserialize, Serialize};
use std::sync::Arc;
use tower_http::cors::CorsLayer;
use crate::{agent_os, config, conversation, executor, identity, integration, memory, monitor, oauth_config, receipt, store, workflow};

pub struct AppState {
    pub config: &'static config::NodeConfig,
    pub executor_registry: executor::Registry,
    pub store: Arc<dyn store::Store>,
    pub identity_manager: identity::IdentityManager,
    pub conversation_manager: conversation::ConversationManager,
    pub agent_os: agent_os::AgentOS,
    pub harness_tools: Vec<agent_os::ToolDefinition>,
    pub job_monitor: monitor::JobMonitor,
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
    
    // Load Agent OS (SOUL.md, IDENTITY.md, etc.)
    let agent_os = agent_os::AgentOS::load(None).unwrap_or_else(|e| {
        tracing::warn!("Failed to load Agent OS templates: {}", e);
        agent_os::AgentOS {
            soul: "You are OneClaw, a helpful AI agent.".to_string(),
            identity: "".to_string(),
            skills: "".to_string(),
            playbooks: "".to_string(),
            memory: "".to_string(),
        }
    });
    let soul_loaded = !agent_os.soul.is_empty() && !agent_os.soul.contains("Not Found");
    tracing::info!(
        "Agent OS: SOUL={} IDENTITY={} SKILLS={} PLAYBOOKS={} MEMORY={}",
        if soul_loaded { "loaded" } else { "fallback" },
        if agent_os.identity.contains("Not Found") { "missing" } else { "loaded" },
        if agent_os.skills.contains("Not Found") { "missing" } else { "loaded" },
        if agent_os.playbooks.contains("Not Found") { "missing" } else { "loaded" },
        if agent_os.memory.contains("Not Found") { "missing" } else { "loaded" },
    );
    
    // Fetch tools from harness (run blocking HTTP in spawn_blocking to avoid runtime panic)
    let harness_url = std::env::var("HARNESS_URL").unwrap_or_else(|_| "http://localhost:9000".to_string());
    let harness_url_clone = harness_url.clone();
    let harness_tools = tokio::task::spawn_blocking(move || {
        match reqwest::blocking::get(format!("{}/tools", harness_url_clone)) {
            Ok(resp) => {
                if let Ok(body) = resp.text() {
                    if let Ok(parsed) = serde_json::from_str::<serde_json::Value>(&body) {
                        if let Some(tools_arr) = parsed["tools"].as_array() {
                            tools_arr.iter().filter_map(|t| {
                                Some(agent_os::ToolDefinition {
                                    id: t["id"].as_str()?.to_string(),
                                    description: t["description"].as_str().unwrap_or("").to_string(),
                                    params_schema: t.get("paramsSchema").cloned(),
                                    cost_estimate: t["estimatedCostUsd"].as_f64(),
                                    tier: t["tier"].as_str().map(|s| s.to_string()),
                                })
                            }).collect()
                        } else {
                            vec![]
                        }
                    } else {
                        vec![]
                    }
                } else {
                    vec![]
                }
            }
            Err(e) => {
                tracing::warn!("Could not fetch harness tools: {}", e);
                vec![]
            }
        }
    })
    .await
    .unwrap_or_else(|_| vec![]);
    
    tracing::info!("Harness URL: {} (set HARNESS_URL to override)", harness_url);
    tracing::info!("Loaded {} harness tools", harness_tools.len());
    
    // Initialize job monitor
    let job_monitor = monitor::JobMonitor::default();
    
    let state = Arc::new(AppState { 
        config, 
        executor_registry,
        store: store_instance,
        identity_manager,
        conversation_manager,
        agent_os,
        harness_tools,
        job_monitor,
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

    let harness_url = std::env::var("HARNESS_URL").unwrap_or_else(|_| "http://localhost:9000".to_string());
    println!("\n🦞 OneClaw Node Daemon (Rust)");
    println!("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    println!("  Node:   {} ({})", config.node.name, config.node.id);
    println!("  Mode:   {}", config.node.environment);
    println!("  UI:     http://localhost:{}", port);
    println!("  Harness: {} (tools execute here)", harness_url);
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
    milestones: Vec<String>,
    duration_ms: u64,
}

#[derive(Serialize, Clone)]
struct ToolCallResult {
    tool: String,
    input: serde_json::Value,
    output: serde_json::Value,
    duration_ms: u64,
}

fn llm_timeout_secs() -> u64 {
    std::env::var("LLM_CALL_TIMEOUT_SECS")
        .ok()
        .and_then(|v| v.parse::<u64>().ok())
        .filter(|v| *v >= 5)
        .unwrap_or(65)
}

async fn run_llm_with_timeout(
    state: Arc<AppState>,
    input: serde_json::Value,
    phase: &'static str,
) -> Result<executor::ExecutorResult, String> {
    let timeout_secs = llm_timeout_secs();
    let task = tokio::task::spawn_blocking(move || {
        match state.executor_registry.get("llm.chat") {
            Some(exec) => exec.execute(input, state.config),
            None => executor::ExecutorResult::Error { error: "LLM executor not found".to_string() },
        }
    });

    match tokio::time::timeout(std::time::Duration::from_secs(timeout_secs), task).await {
        Ok(joined) => joined.map_err(|e| format!("{} join error: {}", phase, e)),
        Err(_) => Err(format!("{} timed out after {}s", phase, timeout_secs)),
    }
}

fn format_tools(tools: &[agent_os::ToolDefinition]) -> String {
    if tools.is_empty() {
        return "No tools available.".to_string();
    }
    let mut s = String::new();
    for tool in tools {
        s.push_str(&format!("- {}: {}\n", tool.id, tool.description));
    }
    s
}

fn extract_content(result: &executor::ExecutorResult) -> String {
    match result {
        executor::ExecutorResult::Executed { output, .. } => {
            output["content"].as_str().unwrap_or("").to_string()
        }
        executor::ExecutorResult::Error { error } => format!("Error: {}", error),
        executor::ExecutorResult::Denied { denial_reason } => format!("Denied: {}", denial_reason.policy),
    }
}

async fn execute_tool(
    state: &Arc<AppState>,
    tool_name: &str,
    tool_input: serde_json::Value,
) -> Option<ToolCallResult> {
    let state = Arc::clone(state);
    let tool_name_owned = tool_name.to_string();
    let tool_input_for_result = tool_input.clone();

    let result = tokio::task::spawn_blocking(move || {
        state
            .executor_registry
            .get(&tool_name_owned)
            .map(|exec| exec.execute(tool_input, state.config))
    })
    .await
    .ok()
    .flatten()?;

    match result {
        executor::ExecutorResult::Executed { output, duration_ms } => Some(ToolCallResult {
            tool: tool_name.to_string(),
            input: tool_input_for_result,
            output,
            duration_ms,
        }),
        executor::ExecutorResult::Error { error } => {
            tracing::warn!("Tool error: {}", error);
            Some(ToolCallResult {
                tool: tool_name.to_string(),
                input: tool_input_for_result,
                output: serde_json::json!({ "error": error }),
                duration_ms: 0,
            })
        }
        executor::ExecutorResult::Denied { denial_reason } => Some(ToolCallResult {
            tool: tool_name.to_string(),
            input: tool_input_for_result,
            output: serde_json::json!({ "denied": denial_reason.policy }),
            duration_ms: 0,
        }),
    }
}

async fn find_and_execute_tools(
    state: &Arc<AppState>,
    content: &str,
    messages: &[serde_json::Value],
) -> Vec<ToolCallResult> {
    let _ = messages;
    let mut results = Vec::new();
    let tool_regex = regex::Regex::new(
        r"```tool\s*\n?([\s\S]*?)\n?```|<tool>\s*([\s\S]*?)\s*</tool>",
    )
    .unwrap();

    for cap in tool_regex.captures_iter(content) {
        let tool_json = match cap.get(1).or_else(|| cap.get(2)) {
            Some(m) => m.as_str(),
            None => continue,
        };
        let tool_call: serde_json::Value = match serde_json::from_str(tool_json)
            .or_else(|_| json5::from_str(tool_json))
        {
            Ok(v) => v,
            Err(_) => continue,
        };
        let tool_name = match tool_call["tool"].as_str() {
            Some(s) => s,
            None => continue,
        };
        let tool_input = tool_call["input"].clone();
        tracing::info!("Executing tool: {}", tool_name);
        if let Some(result) = execute_tool(state, tool_name, tool_input).await {
            results.push(result);
        }
    }
    results
}

async fn get_followup_response(
    state: &Arc<AppState>,
    messages: &[serde_json::Value],
    tool_results: &[ToolCallResult],
) -> String {
    let mut new_messages = messages.to_vec();
    for result in tool_results {
        let result_msg = format!(
            "[Tool Result: {}]\n{}",
            result.tool,
            serde_json::to_string_pretty(&result.output).unwrap_or_default()
        );
        new_messages.push(serde_json::json!({
            "role": "system",
            "content": result_msg
        }));
    }
    new_messages.push(serde_json::json!({
        "role": "user",
        "content": "Summarize these results for the user in plain language. No tool blocks."
    }));
    let input = serde_json::json!({ "messages": new_messages });
    match run_llm_with_timeout(Arc::clone(state), input, "followup").await {
        Ok(executor::ExecutorResult::Executed { output, .. }) => {
            output["content"].as_str().unwrap_or("").to_string()
        }
        _ => "Tool executed but could not generate summary.".to_string(),
    }
}

async fn chat(
    State(state): State<Arc<AppState>>,
    Json(req): Json<ChatRequest>,
) -> Result<Json<ChatResponse>, (StatusCode, String)> {
    let start = std::time::Instant::now();
    let milestones = vec!["Received your message".to_string()];

    let msg_preview = req.message.chars().take(60).collect::<String>();
    tracing::info!("Chat: \"{}\"", msg_preview);

    // Resolve user identity
    let provider = req.provider.as_deref().unwrap_or("http");
    let provider_id = req.provider_id.as_deref().unwrap_or("anonymous");

    let (user_id, _) = state
        .identity_manager
        .resolve(provider, provider_id, req.username.as_deref())
        .await
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

    // Store user message
    let _ = state
        .conversation_manager
        .add_user_message(&user_id, &req.message, &req.channel)
        .await;

    // Build MINIMAL system prompt - just the essentials
    let tools_section = format_tools(&state.harness_tools);
    let local_executors: Vec<String> = state
        .executor_registry
        .list()
        .iter()
        .filter(|e| e.id != "harness.execute")
        .map(|e| format!("- {}: {}", e.id, e.description))
        .collect();
    let local_section = if local_executors.is_empty() {
        String::new()
    } else {
        format!("\nLocal executors:\n{}", local_executors.join("\n"))
    };
    let system_prompt = format!(
        r#"You are OneClaw, a helpful AI assistant.

If you need to use a tool, output it in a ```tool block:
```tool
{{"tool": "tool-name", "input": {{...}}}}
```

Available tools:
{}{}

Just respond naturally. If you use a tool, I'll execute it and you can summarize the results."#,
        tools_section,
        local_section
    );

    // Build messages
    let messages = state
        .conversation_manager
        .build_llm_messages(&user_id, &system_prompt)
        .await
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

    // Call LLM
    tracing::info!("Calling LLM...");
    let input = serde_json::json!({ "messages": messages });
    let result = run_llm_with_timeout(Arc::clone(&state), input, "main")
        .await
        .map_err(|e| (StatusCode::GATEWAY_TIMEOUT, e))?;

    let content = extract_content(&result);
    let tool_results = find_and_execute_tools(&state, &content, &messages).await;

    // Get final response
    let final_content = if tool_results.is_empty() {
        content
    } else {
        for result in &tool_results {
            let _ = state
                .conversation_manager
                .add_tool_message(
                    &user_id,
                    &format!("[{} result]", result.tool),
                    &req.channel,
                )
                .await;
        }
        get_followup_response(&state, &messages, &tool_results).await
    };

    let final_content = if final_content.trim().is_empty() {
        "I didn't get a response. Try again?".to_string()
    } else {
        final_content
    };

    let _ = state
        .conversation_manager
        .add_assistant_message(&user_id, &final_content, &req.channel, None)
        .await;

    let duration_ms = start.elapsed().as_millis() as u64;
    tracing::info!("Chat done in {}ms ({} tools)", duration_ms, tool_results.len());

    Ok(Json(ChatResponse {
        response: final_content,
        tool_calls: tool_results,
        milestones,
        duration_ms,
    }))
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

