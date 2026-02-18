use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use crate::{config, executor::{DenialReason, ExecutorResult}};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WorkflowReceipt {
    pub run_id: String,
    pub workflow_id: String,
    pub node_id: String,
    pub started_at: String,
    pub completed_at: String,
    pub status: String,
    pub mode: String,
    pub steps: Vec<StepReceipt>,
    pub inputs: serde_json::Value,
    pub outputs: serde_json::Value,
    pub debug: DebugInfo,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct StepReceipt {
    pub step_id: String,
    pub executor: String,
    pub status: String,
    pub request: serde_json::Value,
    pub response: serde_json::Value,
    pub denial_reason: Option<DenialReason>,
    pub error: Option<String>,
    pub duration_ms: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DebugInfo {
    pub config_snapshot: String,
    pub executor_versions: HashMap<String, String>,
    pub total_duration_ms: u64,
}

fn artifacts_path() -> anyhow::Result<std::path::PathBuf> {
    let config = config::load()?;
    Ok(config::expand_path(&config.artifacts.path))
}

pub fn write_receipt(receipt: &WorkflowReceipt) -> anyhow::Result<()> {
    let path = artifacts_path()?.join(&receipt.run_id).join("receipt.json");
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent)?;
    }
    std::fs::write(&path, serde_json::to_string_pretty(receipt)?)?;
    tracing::info!(run_id = %receipt.run_id, "Receipt written");
    Ok(())
}

pub fn read_receipt(run_id: &str) -> anyhow::Result<Option<WorkflowReceipt>> {
    let path = artifacts_path()?.join(run_id).join("receipt.json");
    if !path.exists() { return Ok(None); }
    Ok(Some(serde_json::from_str(&std::fs::read_to_string(&path)?)?))
}

pub fn list_receipts() -> anyhow::Result<Vec<String>> {
    let path = artifacts_path()?;
    if !path.exists() { return Ok(vec![]); }
    let mut receipts = Vec::new();
    for entry in std::fs::read_dir(&path)? {
        let entry = entry?;
        if entry.file_type()?.is_dir() {
            if let Some(name) = entry.file_name().to_str() {
                receipts.push(name.to_string());
            }
        }
    }
    receipts.sort_by(|a, b| b.cmp(a));
    Ok(receipts)
}

pub fn config_snapshot_hash() -> String {
    if let Ok(config) = config::load() {
        format!("{:x}", md5::compute(serde_json::to_string(config).unwrap_or_default().as_bytes()))
    } else {
        "unknown".to_string()
    }
}

impl StepReceipt {
    pub fn from_result(step_id: &str, executor: &str, request: serde_json::Value, result: ExecutorResult) -> Self {
        match result {
            ExecutorResult::Executed { output, duration_ms } => Self {
                step_id: step_id.to_string(), executor: executor.to_string(), status: "executed".to_string(),
                request, response: output, denial_reason: None, error: None, duration_ms,
            },
            ExecutorResult::Denied { denial_reason } => Self {
                step_id: step_id.to_string(), executor: executor.to_string(), status: "denied".to_string(),
                request, response: serde_json::json!(null), denial_reason: Some(denial_reason), error: None, duration_ms: 0,
            },
            ExecutorResult::Error { error } => Self {
                step_id: step_id.to_string(), executor: executor.to_string(), status: "error".to_string(),
                request, response: serde_json::json!(null), denial_reason: None, error: Some(error), duration_ms: 0,
            },
        }
    }
}
