use axum::{extract::{Query, State}, http::StatusCode, response::Html, routing::{get, post}, Json, Router};
use serde::{Deserialize, Serialize};
use std::sync::Arc;
use tower_http::cors::CorsLayer;
use crate::{agent_os, config, conversation, executor, heartbeat, identity, integration, memory, monitor, oauth_config, receipt, store, workflow};

pub struct AppState {
    pub config: &'static config::NodeConfig,
    pub executor_registry: Arc<executor::Registry>,
    pub store: Arc<dyn store::Store>,
    pub identity_manager: Arc<identity::IdentityManager>,
    pub conversation_manager: Arc<conversation::ConversationManager>,
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
    
    // HARDCODED - no env vars
    let harness_url = crate::ports::HARNESS_URL.to_string();
    let harness_url_clone = harness_url.clone();
    let harness_tools = tokio::task::spawn_blocking(move || {
        let max_retries = 5;
        let mut retry_delay = std::time::Duration::from_secs(2);
        
        for attempt in 1..=max_retries {
            match reqwest::blocking::get(format!("{}/tools", harness_url_clone)) {
                Ok(resp) => {
                    if let Ok(body) = resp.text() {
                        if let Ok(parsed) = serde_json::from_str::<serde_json::Value>(&body) {
                            if let Some(tools_arr) = parsed["tools"].as_array() {
                                let tools: Vec<_> = tools_arr.iter().filter_map(|t| {
                                    Some(agent_os::ToolDefinition {
                                        id: t["id"].as_str()?.to_string(),
                                        description: t["description"].as_str().unwrap_or("").to_string(),
                                        params_schema: t.get("paramsSchema").cloned(),
                                        cost_estimate: t["estimatedCostUsd"].as_f64(),
                                        tier: t["tier"].as_str().map(|s| s.to_string()),
                                    })
                                }).collect();
                                if !tools.is_empty() {
                                    return tools;
                                }
                            }
                        }
                    }
                }
                Err(e) => {
                    tracing::warn!("Could not fetch harness tools (attempt {}/{}): {}", attempt, max_retries, e);
                }
            }
            
            if attempt < max_retries {
                tracing::info!("Retrying harness tools fetch in {:?}...", retry_delay);
                std::thread::sleep(retry_delay);
                retry_delay *= 2; // exponential backoff
            }
        }
        
        tracing::error!("Failed to fetch harness tools after {} attempts", max_retries);
        vec![]
    })
    .await
    .unwrap_or_else(|_| vec![]);
    
    tracing::info!("Harness URL: {} (set HARNESS_URL to override)", harness_url);
    tracing::info!("Loaded {} harness tools", harness_tools.len());
    
    // Initialize job monitor
    let job_monitor = monitor::JobMonitor::default();
    
    // Wrap managers in Arc for sharing with heartbeat
    let executor_registry = Arc::new(executor_registry);
    let identity_manager = Arc::new(identity_manager);
    let conversation_manager = Arc::new(conversation_manager);
    
    let state = Arc::new(AppState { 
        config, 
        executor_registry: executor_registry.clone(),
        store: store_instance.clone(),
        identity_manager: identity_manager.clone(),
        conversation_manager: conversation_manager.clone(),
        agent_os: agent_os.clone(),
        harness_tools: harness_tools.clone(),
        job_monitor,
    });

    // Start heartbeat service in background
    let heartbeat_config = heartbeat::HeartbeatConfig::default();
    if heartbeat_config.enabled {
        let heartbeat_service = Arc::new(heartbeat::HeartbeatService::new(
            heartbeat_config,
            agent_os,
            executor_registry,
            conversation_manager,
            identity_manager,
            harness_tools,
            config,
        ));
        tokio::spawn(async move {
            heartbeat_service.start().await;
        });
    }

    // Initialize Telegram channel if bot token is configured
    if let Ok(bot_token) = std::env::var("TELEGRAM_BOT_TOKEN") {
        if !bot_token.is_empty() && bot_token != "your_telegram_bot_token_here" {
            use crate::channels::{telegram::TelegramChannel, Channel};
            
            let telegram = TelegramChannel::new(bot_token);
            let (tx, mut rx) = tokio::sync::mpsc::channel(100);
            
            // Spawn Telegram listener
            let telegram_clone = telegram.clone();
            tokio::spawn(async move {
                if let Err(e) = telegram_clone.start(tx).await {
                    tracing::error!("Telegram channel error: {}", e);
                }
            });
            
            // Spawn message handler
            let state_clone = state.clone();
            let telegram_clone = telegram.clone();
            tokio::spawn(async move {
                while let Some(msg) = rx.recv().await {
                    tracing::info!("📨 Telegram message from {} (chat_id: {}): {}", 
                        msg.username.as_deref().unwrap_or("unknown"),
                        msg.channel_id,
                        msg.content
                    );
                    
                    let chat_id = msg.channel_id.clone();
                    let telegram_for_typing = telegram_clone.clone();
                    
                    // Spawn typing indicator that runs until we're done
                    let typing_task = tokio::spawn(async move {
                        loop {
                            let _ = telegram_for_typing.send_typing(&chat_id).await;
                            tokio::time::sleep(tokio::time::Duration::from_secs(4)).await;
                        }
                    });
                    
                    // Resolve user identity
                    let (user_id, _) = match state_clone
                        .identity_manager
                        .resolve("telegram", &msg.provider_user_id, msg.username.as_deref())
                        .await {
                            Ok(result) => result,
                            Err(e) => {
                                typing_task.abort();
                                tracing::error!("Identity resolution error: {}", e);
                                continue;
                            }
                        };
                    
                    // Store user message
                    let _ = state_clone
                        .conversation_manager
                        .add_user_message(&user_id, &msg.content, "telegram")
                        .await;
                    
                    // Build system prompt with Telegram formatting instructions
                    let mut system_prompt = state_clone.agent_os.build_system_prompt(&state_clone.harness_tools);
                    system_prompt.push_str("\n\n## Telegram Formatting\nYou are communicating via Telegram. Format your responses to be:\n- Concise and easy to read on mobile\n- Use **bold** for business names and key info\n- Use bullet points (•) for lists\n- Avoid raw CLI output - present data in a friendly way\n- When showing businesses, format like:\n\n**Business Name** ⭐ 4.8\n📞 (720) 442-0474\n✅ Has website | ✅ Has reviews\n");
                    
                    // Build messages
                    let messages = match state_clone
                        .conversation_manager
                        .build_llm_messages(&user_id, &system_prompt)
                        .await {
                            Ok(msgs) => msgs,
                            Err(e) => {
                                tracing::error!("Message building error: {}", e);
                                continue;
                            }
                        };
                    
                    // Convert harness tools to Claude format
                    let claude_tools: Vec<serde_json::Value> = state_clone.harness_tools
                        .iter()
                        .map(|tool| {
                            serde_json::json!({
                                "name": tool.id,
                                "description": tool.description,
                                "input_schema": tool.params_schema
                            })
                        })
                        .collect();
                    
                    let input = serde_json::json!({ 
                        "messages": messages,
                        "tools": claude_tools
                    });
                    
                    match run_llm_with_timeout(Arc::clone(&state_clone), input, "main").await {
                        Ok(result) => {
                            tracing::info!("✅ LLM response received");
                            
                            // Send initial thinking message
                            let _ = telegram_clone.send(crate::channels::OutgoingMessage {
                                channel_type: crate::channels::ChannelType::Telegram,
                                channel_id: msg.channel_id.clone(),
                                content: "💭 Analyzing your request...".to_string(),
                                reply_to: None,
                                metadata: serde_json::json!({}),
                            }).await;
                            
                            let content = extract_content(&result);
                            tracing::info!("✅ Content extracted, looking for tools...");
                            let tool_results = find_and_execute_tools(&state_clone, &content, &result).await;
                            tracing::info!("✅ Tools executed: {} results", tool_results.len());
                            
                            // Stop typing indicator
                            typing_task.abort();
                            
                            // Check if this is a complex multi-step request requiring autonomous job
                            let is_complex = crate::autonomous_jobs::is_complex_request(&msg.content, tool_results.len());
                            
                            if is_complex {
                                tracing::info!("🤖 Complex request detected, creating autonomous job plan");
                                
                                // Get LLM API key from environment
                                let api_key = std::env::var("ANTHROPIC_API_KEY")
                                    .unwrap_or_else(|_| std::env::var("OPENAI_API_KEY").unwrap_or_default());
                                
                                if api_key.is_empty() {
                                    tracing::warn!("No LLM API key found, falling back to simple execution");
                                } else {
                                    // Generate job plan
                                    match crate::autonomous_jobs::generate_job_plan(
                                        &msg.content,
                                        &reqwest::Client::new(),
                                        &api_key
                                    ).await {
                                        Ok(plan) => {
                                            tracing::info!("✅ Generated plan with {} steps", plan.steps.len());
                                            
                                            // Send acknowledgment
                                            let _ = telegram_clone.send(crate::channels::OutgoingMessage {
                                                channel_type: crate::channels::ChannelType::Telegram,
                                                channel_id: msg.channel_id.clone(),
                                                content: format!("🦞 Got it! Breaking this into {} steps...", plan.steps.len()),
                                                reply_to: None,
                                                metadata: serde_json::json!({}),
                                            }).await;
                                            
                                            // Create job in harness
                                            match crate::autonomous_jobs::create_harness_job(
                                                &user_id,
                                                &plan,
                                                &harness_url
                                            ).await {
                                                Ok(job_id) => {
                                                    tracing::info!("✅ Created job: {}", job_id);
                                                    
                                                    // Start polling in background
                                                    let poller = crate::autonomous_jobs_poller::JobPoller::new(
                                                        job_id.clone(),
                                                        msg.channel_id.clone(),
                                                        crate::channels::ChannelType::Telegram,
                                                        harness_url.clone()
                                                    );
                                                    
                                                    let telegram_for_polling = telegram_clone.clone();
                                                    let user_id_for_conv = user_id.clone();
                                                    let conv_manager = state_clone.conversation_manager.clone();
                                                    
                                                    tokio::spawn(async move {
                                                        match poller.run_until_complete(Arc::new(telegram_for_polling.clone())).await {
                                                            Ok(results) => {
                                                                tracing::info!("✅ Job completed, formatting results");
                                                                
                                                                // Format and send final results
                                                                let formatted = crate::autonomous_jobs_poller::format_job_results(&results);
                                                                
                                                                // Save to conversation
                                                                let _ = conv_manager.add_assistant_message(
                                                                    &user_id_for_conv,
                                                                    &formatted,
                                                                    "telegram",
                                                                    None
                                                                ).await;
                                                                
                                                                let _ = telegram_for_polling.send(crate::channels::OutgoingMessage {
                                                                    channel_type: crate::channels::ChannelType::Telegram,
                                                                    channel_id: msg.channel_id.clone(),
                                                                    content: formatted,
                                                                    reply_to: None,
                                                                    metadata: serde_json::json!({}),
                                                                }).await;
                                                            }
                                                            Err(e) => {
                                                                tracing::error!("❌ Job execution failed: {}", e);
                                                                let _ = telegram_for_polling.send(crate::channels::OutgoingMessage {
                                                                    channel_type: crate::channels::ChannelType::Telegram,
                                                                    channel_id: msg.channel_id.clone(),
                                                                    content: format!("❌ Job failed: {}\n\nTry `/logs` for details.", e),
                                                                    reply_to: None,
                                                                    metadata: serde_json::json!({}),
                                                                }).await;
                                                            }
                                                        }
                                                    });
                                                    
                                                    // Don't continue with normal flow - job is running in background
                                                    continue;
                                                }
                                                Err(e) => {
                                                    tracing::error!("Failed to create job: {}", e);
                                                }
                                            }
                                        }
                                        Err(e) => {
                                            tracing::error!("Failed to generate plan: {}", e);
                                        }
                                    }
                                }
                            }
                            
                            // Send status update if tools were called
                            if !tool_results.is_empty() {
                                let tool_names: Vec<&str> = tool_results.iter()
                                    .map(|r| r.tool.as_str())
                                    .collect();
                                let status_msg = format!("🔧 Executing: {}...", tool_names.join(", "));
                                tracing::info!("Tool execution started: {}", status_msg);
                                let _ = telegram_clone.send(crate::channels::OutgoingMessage {
                                    channel_type: crate::channels::ChannelType::Telegram,
                                    channel_id: msg.channel_id.clone(),
                                    content: status_msg,
                                    reply_to: None,
                                    metadata: serde_json::json!({}),
                                }).await;
                                
                                // Give user time to see the status before final response
                                tokio::time::sleep(tokio::time::Duration::from_millis(800)).await;
                                
                                // Extract and show steps completed (if harness returned them)
                                for result in &tool_results {
                                    if let Some(steps) = result.output.get("steps_completed").and_then(|s| s.as_array()) {
                                        let mut steps_msg = String::from("📋 **Execution Steps:**\n\n");
                                        for (i, step) in steps.iter().enumerate() {
                                            if let Some(step_str) = step.as_str() {
                                                steps_msg.push_str(&format!("{}. {}\n", i + 1, step_str));
                                            }
                                        }
                                        
                                        tracing::info!("Showing execution steps to user");
                                        let _ = telegram_clone.send(crate::channels::OutgoingMessage {
                                            channel_type: crate::channels::ChannelType::Telegram,
                                            channel_id: msg.channel_id.clone(),
                                            content: steps_msg,
                                            reply_to: None,
                                            metadata: serde_json::json!({}),
                                        }).await;
                                        
                                        tokio::time::sleep(tokio::time::Duration::from_millis(500)).await;
                                    }
                                }
                                
                                // Send completion status
                                let _ = telegram_clone.send(crate::channels::OutgoingMessage {
                                    channel_type: crate::channels::ChannelType::Telegram,
                                    channel_id: msg.channel_id.clone(),
                                    content: "✅ Complete! Formatting results...".to_string(),
                                    reply_to: None,
                                    metadata: serde_json::json!({}),
                                }).await;
                            }
                            
                            tracing::info!("Starting followup formatting...");
                            // Get final response with Telegram formatting
                            let final_content = if tool_results.is_empty() {
                                tracing::info!("No tools used, returning direct content");
                                content
                            } else {
                                tracing::info!("Tool results found, formatting for Telegram...");
                                
                                // Save tool results to conversation
                                for result in &tool_results {
                                    let _ = state_clone
                                        .conversation_manager
                                        .add_tool_message(
                                            &user_id,
                                            &format!("[{} result]", result.tool),
                                            "telegram",
                                        )
                                        .await;
                                }
                                
                                // Build a simpler prompt that just asks Claude to format, not regenerate
                                let formatted_response = format!(
                                    "I found the results. Here's a nicely formatted summary:\n\n{}",
                                    content
                                );
                                
                                // If content is already good, use it directly
                                if content.contains("**") || content.contains("⭐") {
                                    tracing::info!("Content already formatted, using directly");
                                    formatted_response
                                } else {
                                    tracing::info!("Content needs formatting, asking Claude...");
                                    // Ask Claude to format the raw tool output
                                    let mut followup_messages = vec![
                                        serde_json::json!({
                                            "role": "user",
                                            "content": format!(
                                                "Format this business data for Telegram with:\n\
                                                - **Bold** business names\n\
                                                - ⭐ ratings, 📞 phones\n\
                                                - ✅/❌ for features\n\
                                                - Quick stats summary\n\n\
                                                Data: {}",
                                                serde_json::to_string_pretty(&tool_results[0].output)
                                                    .unwrap_or_default()
                                                    .chars()
                                                    .take(4000)
                                                    .collect::<String>()
                                            )
                                        })
                                    ];
                                    
                                    let simple_input = serde_json::json!({ 
                                        "messages": followup_messages
                                    });
                                    
                                    match run_llm_with_timeout(Arc::clone(&state_clone), simple_input, "format").await {
                                        Ok(result) => {
                                            tracing::info!("✅ Formatting complete");
                                            extract_content(&result)
                                        },
                                        Err(e) => {
                                            tracing::error!("❌ Formatting failed: {}", e);
                                            formatted_response
                                        }
                                    }
                                }
                            };
                            
                            tracing::info!("Preparing final response...");
                            let final_content = if final_content.trim().is_empty() {
                                "I didn't get a response. Try again?".to_string()
                            } else {
                                final_content
                            };
                            
                            tracing::info!("Saving conversation messages...");
                            // Save assistant message
                            let _ = state_clone
                                .conversation_manager
                                .add_assistant_message(&user_id, &final_content, "telegram", None)
                                .await;
                            
                            tracing::info!("Sending final response to Telegram...");
                            // Send reply via Telegram
                            let _ = telegram_clone.send(crate::channels::OutgoingMessage {
                                channel_type: crate::channels::ChannelType::Telegram,
                                channel_id: msg.channel_id,
                                content: final_content,
                                reply_to: None,
                                metadata: serde_json::json!({}),
                            }).await;
                            tracing::info!("✅ Telegram response sent successfully");
                        }
                        Err(e) => {
                            typing_task.abort();
                            tracing::error!("❌ LLM error: {}", e);
                            
                            // Send detailed error to user
                            let error_msg = format!("❌ **Error Processing Request**\n\n{}\n\nCheck `/logs` for details.", 
                                e.to_string().chars().take(200).collect::<String>());
                            
                            let _ = telegram_clone.send(crate::channels::OutgoingMessage {
                                channel_type: crate::channels::ChannelType::Telegram,
                                channel_id: msg.channel_id,
                                content: error_msg,
                                reply_to: None,
                                metadata: serde_json::json!({}),
                            }).await;
                        }
                    }
                }
            });
            
            tracing::info!("✅ Telegram channel initialized");
        }
    }

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
        .route("/integrations/gmail/accounts", get(gmail_accounts))
        .route("/integrations/gmail/send-test", post(send_test_email))
        .route("/integrations/gmail/send", post(send_email))
        .route("/api/oauth/config", post(oauth_config::save_oauth_config_handler))
        .route("/gmail/senders", get(gmail_senders_proxy))
        .route("/api/gmail/senders", get(api_gmail_senders_proxy))
        .route("/oauth/google", get(oauth_google_proxy))
        .route("/oauth/google/callback", get(oauth_callback_proxy))
        .layer(CorsLayer::permissive())
        .with_state(state);

    // HARDCODED - no env vars
    let harness_url = crate::ports::HARNESS_URL.to_string();
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
            // For Claude, content is usually in output["content"] (from executor's processing)
            // But we should check raw too for native format
            if let Some(content_str) = output["content"].as_str() {
                return content_str.to_string();
            }
            
            // Check raw response for Claude's array format
            if let Some(raw_content) = output.get("raw").and_then(|r| r.get("content")).and_then(|c| c.as_array()) {
                let mut text_parts = Vec::new();
                for block in raw_content {
                    if block.get("type").and_then(|t| t.as_str()) == Some("text") {
                        if let Some(text) = block.get("text").and_then(|t| t.as_str()) {
                            text_parts.push(text);
                        }
                    }
                }
                if !text_parts.is_empty() {
                    return text_parts.join("\n");
                }
            }
            
            String::new()
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
    execute_tool_internal(state, tool_name, tool_input, None).await
}

async fn execute_tool_with_progress(
    state: &Arc<AppState>,
    tool_name: &str,
    tool_input: serde_json::Value,
    telegram_sender: &crate::channels::telegram::TelegramChannel,
    chat_id: &str,
) -> Option<ToolCallResult> {
    execute_tool_internal(state, tool_name, tool_input, Some((telegram_sender, chat_id))).await
}

async fn execute_tool_internal(
    state: &Arc<AppState>,
    tool_name: &str,
    tool_input: serde_json::Value,
    progress_callback: Option<(&crate::channels::telegram::TelegramChannel, &str)>,
) -> Option<ToolCallResult> {
    let state = Arc::clone(state);
    let tool_name_owned = tool_name.to_string();
    let tool_input_for_result = tool_input.clone();

    // Check if this is a harness tool (if it's in harness_tools list)
    let is_harness_tool = state.harness_tools.iter().any(|t| t.id == tool_name);
    
    let result = if is_harness_tool {
        // Execute via harness - use "executor" key (harness expects this)
        let harness_input = serde_json::json!({
            "executor": tool_name,
            "params": tool_input
        });
        tokio::task::spawn_blocking(move || {
            state
                .executor_registry
                .get("harness.execute")
                .map(|exec| exec.execute(harness_input, state.config))
        })
        .await
        .ok()
        .flatten()?
    } else {
        // Execute via direct executor
        tokio::task::spawn_blocking(move || {
            state
                .executor_registry
                .get(&tool_name_owned)
                .map(|exec| exec.execute(tool_input, state.config))
        })
        .await
        .ok()
        .flatten()?
    };

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
    llm_result: &executor::ExecutorResult,
) -> Vec<ToolCallResult> {
    let mut results = Vec::new();

    tracing::debug!("Parsing content for tool calls (length: {})", content.len());

    // Strategy 0: Claude's native tool_use format (in raw response)
    if let executor::ExecutorResult::Executed { output, .. } = llm_result {
        if let Some(raw_content) = output.get("raw").and_then(|r| r.get("content")).and_then(|c| c.as_array()) {
            for block in raw_content {
                if block.get("type").and_then(|t| t.as_str()) == Some("tool_use") {
                    if let (Some(tool_name), Some(tool_input)) = (
                        block.get("name").and_then(|n| n.as_str()),
                        block.get("input")
                    ) {
                        tracing::info!("Found tool call (Claude native format): {}", tool_name);
                        if let Some(result) = execute_tool(state, tool_name, tool_input.clone()).await {
                            results.push(result);
                        }
                    }
                }
            }
        }
    }

    // If Claude native format found tools, return early
    if !results.is_empty() {
        return results;
    }

    // Try multiple parsing strategies for maximum LLM compatibility
    
    // Strategy 1: Standard ```tool blocks or <tool> XML
    let tool_regex = regex::Regex::new(
        r"```tool\s*\n?([\s\S]*?)\n?```|<tool>\s*([\s\S]*?)\s*</tool>",
    )
    .unwrap();

    for cap in tool_regex.captures_iter(content) {
        let tool_json = match cap.get(1).or_else(|| cap.get(2)) {
            Some(m) => m.as_str(),
            None => continue,
        };
        tracing::info!("Found tool call (standard format)");
        if let Some(result) = parse_and_execute_tool(state, tool_json).await {
            results.push(result);
        }
    }
    
    // Strategy 2: Minimax's <minimax:tool_call> format
    let minimax_regex = regex::Regex::new(
        r"<minimax:tool_call>\s*([\s\S]*?)\s*</tool>",
    )
    .unwrap();
    
    for cap in minimax_regex.captures_iter(content) {
        if let Some(tool_json) = cap.get(1) {
            tracing::info!("Found tool call (minimax format)");
            if let Some(result) = parse_and_execute_tool(state, tool_json.as_str()).await {
                results.push(result);
            }
        }
    }
    
    // Strategy 3: [TOOL_CALL] markers
    let bracket_regex = regex::Regex::new(
        r"\[TOOL_CALL\]\s*([\s\S]*?)\s*\[/TOOL_CALL\]",
    )
    .unwrap();
    
    tracing::debug!("Testing bracket regex on content");
    for cap in bracket_regex.captures_iter(content) {
        if let Some(tool_json) = cap.get(1) {
            tracing::info!("Found tool call (bracket format), length: {}", tool_json.as_str().len());
            if let Some(result) = parse_and_execute_tool(state, tool_json.as_str()).await {
                results.push(result);
            }
        }
    }
    
    if results.is_empty() {
        tracing::debug!("No tool calls found. Content preview: {}", &content[..200.min(content.len())]);
    }
    
    results
}

async fn parse_and_execute_tool(
    state: &Arc<AppState>,
    tool_json: &str,
) -> Option<ToolCallResult> {
    // Clean up common LLM format issues
    let cleaned = tool_json
        .replace(" => ", ": ")  // Minimax uses => instead of :
        .replace("=>", ":");     // Without spaces too
    
    // Parse JSON (try strict first, then json5 for flexibility)
    let tool_call: serde_json::Value = match serde_json::from_str(&cleaned)
        .or_else(|_| json5::from_str(&cleaned))
    {
        Ok(v) => v,
        Err(e) => {
            tracing::warn!("Failed to parse tool JSON: {}. Content: {}", e, &cleaned[..100.min(cleaned.len())]);
            return None;
        }
    };
    
    let tool_name = tool_call["tool"].as_str()?;
    let tool_input = tool_call["input"].clone();
    
    tracing::info!("Executing tool: {}", tool_name);
    execute_tool(state, tool_name, tool_input).await
}

async fn get_followup_response(
    state: &Arc<AppState>,
    messages: &[serde_json::Value],
    tool_results: &[ToolCallResult],
) -> String {
    // Check if any tool result has a formattedResponse - if so, use it directly
    for result in tool_results {
        if let Some(output) = result.output.get("output") {
            if let Some(formatted) = output.get("formattedResponse") {
                if let Some(formatted_str) = formatted.as_str() {
                    if !formatted_str.is_empty() {
                        tracing::info!("Using pre-formatted response from tool: {}", result.tool);
                        return formatted_str.to_string();
                    }
                }
            }
        }
    }
    
    // No formatted response - ask Claude to summarize
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

    // Build system prompt using FULL Agent OS (SOUL, IDENTITY, SKILLS, PLAYBOOKS, MEMORY + tools)
    let system_prompt = state.agent_os.build_system_prompt(&state.harness_tools);

    // Build messages
    let messages = state
        .conversation_manager
        .build_llm_messages(&user_id, &system_prompt)
        .await
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

    // Call LLM
    tracing::info!("Calling LLM...");
    
    // Convert harness tools to Claude format
    let claude_tools: Vec<serde_json::Value> = state.harness_tools
        .iter()
        .map(|tool| {
            serde_json::json!({
                "name": tool.id,
                "description": tool.description,
                "input_schema": tool.params_schema
            })
        })
        .collect();
    
    tracing::info!("Sending {} tools to Claude", claude_tools.len());
    tracing::debug!("Tools: {}", serde_json::to_string_pretty(&claude_tools).unwrap_or_default());
    
    let input = serde_json::json!({ 
        "messages": messages,
        "tools": claude_tools
    });
    let result = run_llm_with_timeout(Arc::clone(&state), input, "main")
        .await
        .map_err(|e| (StatusCode::GATEWAY_TIMEOUT, e))?;

    let content = extract_content(&result);
    let tool_results = find_and_execute_tools(&state, &content, &result).await;

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

    // Learning phase: reflect on the interaction
    if !tool_results.is_empty() {
        let mut agent_os_clone = state.agent_os.clone();
        let executor_registry = Arc::clone(&state.executor_registry);
        let config = state.config;
        let goal = req.message.clone();
        let tool_results_clone = tool_results.clone();
        
        // Spawn learning as background task (don't block response)
        tokio::spawn(async move {
            let steps: Vec<crate::learning::StepRecord> = tool_results_clone
                .iter()
                .map(|r| crate::learning::StepRecord {
                    tool: r.tool.clone(),
                    input: r.input.clone(),
                    output: r.output.to_string(),
                    success: true,
                    duration_ms: r.duration_ms,
                })
                .collect();
            
            match crate::learning::reflect_and_evolve(
                &goal,
                &steps,
                true,
                &mut agent_os_clone,
                &executor_registry,
                config,
            )
            .await
            {
                Ok(true) => tracing::info!("🧠 Brain evolved after interaction"),
                Ok(false) => tracing::debug!("No learning updates needed"),
                Err(e) => tracing::warn!("Learning reflection failed: {}", e),
            }
        });
    }

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

/// GET /integrations/gmail/accounts - Get all connected Gmail accounts
async fn gmail_accounts(
    State(state): State<Arc<AppState>>,
) -> Json<serde_json::Value> {
    let user_id = &state.config.node.id;
    let control_plane_url = match state.config.control_plane.url.as_deref() {
        Some(url) => url,
        None => return Json(serde_json::json!({ "accounts": [], "error": "No control plane configured" })),
    };
    
    let accounts = integration::get_gmail_accounts(user_id, control_plane_url).await;
    
    Json(serde_json::json!({
        "accounts": accounts,
        "count": accounts.len(),
    }))
}

#[derive(Deserialize)]
struct SendTestEmailRequest {
    from_email: String,
}

/// POST /integrations/gmail/send-test - Send a test email to yourself
async fn send_test_email(
    State(state): State<Arc<AppState>>,
    Json(req): Json<SendTestEmailRequest>,
) -> Result<Json<serde_json::Value>, (StatusCode, Json<serde_json::Value>)> {
    let control_plane_url = match state.config.control_plane.url.as_deref() {
        Some(url) => url,
        None => return Err((StatusCode::BAD_REQUEST, Json(serde_json::json!({ "error": "No control plane configured" })))),
    };
    
    let client = reqwest::Client::new();
    let response = client
        .post(format!("{}/api/v1/gmail/send", control_plane_url))
        .json(&serde_json::json!({
            "user_id": state.config.node.id,
            "from_email": req.from_email,
            "to": req.from_email,
            "subject": "Test email from OneClaw Node",
            "body": format!("This is a test email sent from your OneClaw Node ({}) at {}.\n\nIf you received this, your Gmail integration is working correctly!", 
                state.config.node.name, 
                chrono::Utc::now().format("%Y-%m-%d %H:%M:%S UTC")),
        }))
        .send()
        .await;
    
    match response {
        Ok(resp) if resp.status().is_success() => {
            let data: serde_json::Value = resp.json().await.unwrap_or_default();
            Ok(Json(serde_json::json!({
                "success": true,
                "message": format!("Test email sent to {}", req.from_email),
                "data": data,
            })))
        }
        Ok(resp) => {
            let status = resp.status();
            let error_text = resp.text().await.unwrap_or_default();
            Err((StatusCode::from_u16(status.as_u16()).unwrap_or(StatusCode::INTERNAL_SERVER_ERROR), 
                Json(serde_json::json!({ "error": error_text }))))
        }
        Err(e) => {
            Err((StatusCode::INTERNAL_SERVER_ERROR, Json(serde_json::json!({ "error": e.to_string() }))))
        }
    }
}

#[derive(Deserialize)]
struct SendEmailRequest {
    from_email: String,
    to: String,
    subject: String,
    body: String,
}

/// POST /integrations/gmail/send - Send an email
async fn send_email(
    State(state): State<Arc<AppState>>,
    Json(req): Json<SendEmailRequest>,
) -> Result<Json<serde_json::Value>, (StatusCode, Json<serde_json::Value>)> {
    let control_plane_url = match state.config.control_plane.url.as_deref() {
        Some(url) => url,
        None => return Err((StatusCode::BAD_REQUEST, Json(serde_json::json!({ "error": "No control plane configured" })))),
    };
    
    let client = reqwest::Client::new();
    let response = client
        .post(format!("{}/api/v1/gmail/send", control_plane_url))
        .json(&serde_json::json!({
            "user_id": state.config.node.id,
            "from_email": req.from_email,
            "to": req.to,
            "subject": req.subject,
            "body": req.body,
        }))
        .send()
        .await;
    
    match response {
        Ok(resp) if resp.status().is_success() => {
            let data: serde_json::Value = resp.json().await.unwrap_or_default();
            Ok(Json(serde_json::json!({
                "success": true,
                "message": format!("Email sent to {}", req.to),
                "data": data,
            })))
        }
        Ok(resp) => {
            let status = resp.status();
            let error_text = resp.text().await.unwrap_or_default();
            Err((StatusCode::from_u16(status.as_u16()).unwrap_or(StatusCode::INTERNAL_SERVER_ERROR), 
                Json(serde_json::json!({ "error": error_text }))))
        }
        Err(e) => {
            Err((StatusCode::INTERNAL_SERVER_ERROR, Json(serde_json::json!({ "error": e.to_string() }))))
        }
    }
}

/// Proxy to harness /gmail/senders page
async fn gmail_senders_proxy(
    Query(params): Query<std::collections::HashMap<String, String>>,
) -> Result<axum::response::Response, (StatusCode, String)> {
    let harness_url = crate::ports::HARNESS_URL;
    let client = reqwest::Client::new();
    
    let mut url = format!("{}/gmail/senders", harness_url);
    if !params.is_empty() {
        let query: String = params.iter().map(|(k, v)| format!("{}={}", k, v)).collect::<Vec<_>>().join("&");
        url = format!("{}?{}", url, query);
    }
    
    match client.get(&url).send().await {
        Ok(resp) => {
            let status = StatusCode::from_u16(resp.status().as_u16()).unwrap_or(StatusCode::OK);
            let content_type = resp.headers().get("content-type")
                .and_then(|v| v.to_str().ok())
                .unwrap_or("text/html")
                .to_string();
            let body = resp.bytes().await.unwrap_or_default();
            
            Ok(axum::response::Response::builder()
                .status(status)
                .header("content-type", content_type)
                .body(axum::body::Body::from(body))
                .unwrap())
        }
        Err(e) => Err((StatusCode::BAD_GATEWAY, format!("Harness error: {}", e)))
    }
}

/// Proxy to harness /api/gmail/senders
async fn api_gmail_senders_proxy() -> Result<Json<serde_json::Value>, (StatusCode, String)> {
    let harness_url = crate::ports::HARNESS_URL;
    let client = reqwest::Client::new();
    
    match client.get(format!("{}/api/gmail/senders", harness_url)).send().await {
        Ok(resp) if resp.status().is_success() => {
            let data: serde_json::Value = resp.json().await.unwrap_or_default();
            Ok(Json(data))
        }
        Ok(resp) => {
            let error = resp.text().await.unwrap_or_default();
            Err((StatusCode::BAD_GATEWAY, error))
        }
        Err(e) => Err((StatusCode::BAD_GATEWAY, e.to_string()))
    }
}

/// Proxy to harness /oauth/google - fetch from harness and forward the redirect
async fn oauth_google_proxy(
    Query(params): Query<std::collections::HashMap<String, String>>,
) -> Result<axum::response::Response, (StatusCode, String)> {
    let harness_url = crate::ports::HARNESS_URL;
    let client = reqwest::Client::builder()
        .redirect(reqwest::redirect::Policy::none())  // Don't follow redirects
        .build()
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;
    
    let mut url = format!("{}/oauth/google", harness_url);
    if !params.is_empty() {
        let query: String = params.iter().map(|(k, v)| format!("{}={}", k, v)).collect::<Vec<_>>().join("&");
        url = format!("{}?{}", url, query);
    }
    
    match client.get(&url).send().await {
        Ok(resp) => {
            let status = StatusCode::from_u16(resp.status().as_u16()).unwrap_or(StatusCode::OK);
            
            // If it's a redirect, forward the redirect to the client
            if let Some(location) = resp.headers().get("location") {
                return Ok(axum::response::Response::builder()
                    .status(status)
                    .header("location", location.to_str().unwrap_or_default())
                    .body(axum::body::Body::empty())
                    .unwrap());
            }
            
            // Otherwise return the body
            let content_type = resp.headers().get("content-type")
                .and_then(|v| v.to_str().ok())
                .unwrap_or("text/html")
                .to_string();
            let body = resp.bytes().await.unwrap_or_default();
            
            Ok(axum::response::Response::builder()
                .status(status)
                .header("content-type", content_type)
                .body(axum::body::Body::from(body))
                .unwrap())
        }
        Err(e) => Err((StatusCode::BAD_GATEWAY, format!("Failed to reach harness: {}", e))),
    }
}

/// Proxy to harness /oauth/google/callback
async fn oauth_callback_proxy(
    Query(params): Query<std::collections::HashMap<String, String>>,
) -> Result<axum::response::Response, (StatusCode, String)> {
    let harness_url = crate::ports::HARNESS_URL;
    let client = reqwest::Client::new();
    
    let mut url = format!("{}/oauth/google/callback", harness_url);
    if !params.is_empty() {
        let query: String = params.iter().map(|(k, v)| format!("{}={}", k, v)).collect::<Vec<_>>().join("&");
        url = format!("{}?{}", url, query);
    }
    
    match client.get(&url).send().await {
        Ok(resp) => {
            let status = StatusCode::from_u16(resp.status().as_u16()).unwrap_or(StatusCode::OK);
            let content_type = resp.headers().get("content-type")
                .and_then(|v| v.to_str().ok())
                .unwrap_or("text/html")
                .to_string();
            let body = resp.bytes().await.unwrap_or_default();
            
            Ok(axum::response::Response::builder()
                .status(status)
                .header("content-type", content_type)
                .body(axum::body::Body::from(body))
                .unwrap())
        }
        Err(e) => Err((StatusCode::BAD_GATEWAY, format!("Harness error: {}", e)))
    }
}

