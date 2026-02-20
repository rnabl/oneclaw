use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::sync::Arc;
use tokio::sync::{mpsc, RwLock};
use tokio::time::{Duration, Instant};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct JobStatus {
    pub job_id: String,
    pub status: String,
    pub started_at: std::time::SystemTime,
    pub last_update: std::time::SystemTime,
    pub current_step: Option<String>,
    pub progress: f32,
    pub logs: Vec<LogEntry>,
    pub warnings: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LogEntry {
    pub timestamp: std::time::SystemTime,
    pub level: String,
    pub message: String,
    pub step: Option<String>,
}

#[derive(Debug, Clone)]
pub enum MonitorAction {
    Continue,
    Abort { reason: String },
    SwitchMethod { new_method: String, reason: String },
    Retry { delay_ms: u64, reason: String },
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MonitorConfig {
    pub max_duration_ms: u64,
    pub step_timeout_ms: u64,
    pub rate_limit_cooldown_ms: u64,
    pub max_retries: u32,
}

impl Default for MonitorConfig {
    fn default() -> Self {
        Self {
            max_duration_ms: 300_000, // 5 minutes
            step_timeout_ms: 60_000,  // 1 minute per step
            rate_limit_cooldown_ms: 5_000,
            max_retries: 3,
        }
    }
}

pub struct JobMonitor {
    jobs: Arc<RwLock<HashMap<String, JobStatus>>>,
    config: MonitorConfig,
}

impl JobMonitor {
    pub fn new(config: MonitorConfig) -> Self {
        Self {
            jobs: Arc::new(RwLock::new(HashMap::new())),
            config,
        }
    }

    pub async fn start_monitoring(&self, job_id: &str, harness_url: &str) -> mpsc::Receiver<MonitorAction> {
        let (tx, rx) = mpsc::channel(16);
        
        let job_id = job_id.to_string();
        let harness_url = harness_url.to_string();
        let jobs = self.jobs.clone();
        let config = self.config.clone();
        
        tokio::spawn(async move {
            let client = reqwest::Client::new();
            let start = Instant::now();
            let mut last_step_change = Instant::now();
            let mut retry_count = 0;
            let mut last_status = String::new();
            
            loop {
                // Check total duration
                if start.elapsed().as_millis() as u64 > config.max_duration_ms {
                    let _ = tx.send(MonitorAction::Abort {
                        reason: format!("Job exceeded maximum duration of {}ms", config.max_duration_ms),
                    }).await;
                    break;
                }
                
                // Poll job status from harness
                let status_url = format!("{}/jobs/{}", harness_url, job_id);
                match client.get(&status_url).send().await {
                    Ok(resp) => {
                        if let Ok(body) = resp.text().await {
                            if let Ok(parsed) = serde_json::from_str::<serde_json::Value>(&body) {
                                let status = parsed["job"]["status"].as_str().unwrap_or("");
                                let current_step = parsed["job"]["currentStep"].as_str().map(|s| s.to_string());
                                
                                // Check for completion
                                if status == "completed" || status == "failed" {
                                    break;
                                }
                                
                                // Check for step timeout
                                if let Some(ref step) = current_step {
                                    if step != &last_status {
                                        last_step_change = Instant::now();
                                        last_status = step.clone();
                                    } else if last_step_change.elapsed().as_millis() as u64 > config.step_timeout_ms {
                                        let _ = tx.send(MonitorAction::SwitchMethod {
                                            new_method: "sequential".to_string(),
                                            reason: format!("Step '{}' timed out after {}ms", step, config.step_timeout_ms),
                                        }).await;
                                    }
                                }
                                
                                // Check for patterns in logs
                                if let Some(logs) = parsed["job"]["logs"].as_array() {
                                    for log in logs.iter().rev().take(10) {
                                        let msg = log["message"].as_str().unwrap_or("");
                                        
                                        // Rate limit detection
                                        if msg.contains("429") || msg.to_lowercase().contains("rate limit") {
                                            if retry_count < config.max_retries {
                                                retry_count += 1;
                                                let _ = tx.send(MonitorAction::Retry {
                                                    delay_ms: config.rate_limit_cooldown_ms,
                                                    reason: "Rate limited - backing off".to_string(),
                                                }).await;
                                            } else {
                                                let _ = tx.send(MonitorAction::SwitchMethod {
                                                    new_method: "sequential".to_string(),
                                                    reason: "Max retries exceeded due to rate limiting".to_string(),
                                                }).await;
                                            }
                                        }
                                        
                                        // Block detection
                                        if msg.contains("403") || msg.to_lowercase().contains("blocked") {
                                            let _ = tx.send(MonitorAction::SwitchMethod {
                                                new_method: "stealth".to_string(),
                                                reason: "Blocked - switching to stealth mode".to_string(),
                                            }).await;
                                        }
                                        
                                        // Captcha detection
                                        if msg.to_lowercase().contains("captcha") {
                                            let _ = tx.send(MonitorAction::Abort {
                                                reason: "Captcha detected - cannot continue automatically".to_string(),
                                            }).await;
                                        }
                                    }
                                }
                                
                                // Update local cache
                                let mut jobs_guard = jobs.write().await;
                                jobs_guard.insert(job_id.clone(), JobStatus {
                                    job_id: job_id.clone(),
                                    status: status.to_string(),
                                    started_at: std::time::SystemTime::now(),
                                    last_update: std::time::SystemTime::now(),
                                    current_step,
                                    progress: parsed["job"]["progress"].as_f64().unwrap_or(0.0) as f32,
                                    logs: vec![],
                                    warnings: vec![],
                                });
                            }
                        }
                    }
                    Err(e) => {
                        tracing::warn!("Failed to poll job status: {}", e);
                    }
                }
                
                // Poll every 2 seconds
                tokio::time::sleep(Duration::from_secs(2)).await;
            }
        });
        
        rx
    }

    pub async fn get_job_status(&self, job_id: &str) -> Option<JobStatus> {
        let jobs = self.jobs.read().await;
        jobs.get(job_id).cloned()
    }

    pub async fn handle_action(&self, action: MonitorAction, harness_url: &str, job_id: &str) -> anyhow::Result<()> {
        let client = reqwest::Client::new();
        
        match action {
            MonitorAction::Abort { reason } => {
                tracing::info!("Aborting job {}: {}", job_id, reason);
                let url = format!("{}/jobs/{}/cancel", harness_url, job_id);
                client.post(&url).send().await?;
            }
            MonitorAction::SwitchMethod { new_method, reason } => {
                tracing::info!("Switching method for job {}: {} -> {}", job_id, reason, new_method);
                let url = format!("{}/jobs/{}/switch-method", harness_url, job_id);
                client.post(&url)
                    .json(&serde_json::json!({ "method": new_method, "reason": reason }))
                    .send()
                    .await?;
            }
            MonitorAction::Retry { delay_ms, reason } => {
                tracing::info!("Retrying job {} after {}ms: {}", job_id, delay_ms, reason);
                tokio::time::sleep(Duration::from_millis(delay_ms)).await;
            }
            MonitorAction::Continue => {}
        }
        
        Ok(())
    }
}

impl Default for JobMonitor {
    fn default() -> Self {
        Self::new(MonitorConfig::default())
    }
}
