//! Workflow System
//! 
//! Workflows are YAML specs (not code!)
//! Runtime loads, validates, and executes them deterministically.

use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::collections::HashMap;
use std::path::PathBuf;

use crate::{config, executor, receipt};

/// Workflow specification
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WorkflowSpec {
    pub version: String,
    pub id: String,
    pub name: String,
    pub description: Option<String>,
    
    #[serde(default)]
    pub inputs: HashMap<String, InputDef>,
    
    pub steps: Vec<Step>,
    
    #[serde(default)]
    pub outputs: HashMap<String, String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct InputDef {
    #[serde(rename = "type")]
    pub input_type: String,
    #[serde(default)]
    pub required: bool,
    pub default: Option<Value>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Step {
    pub id: String,
    pub executor: String,
    pub input: Value,
    
    /// Variable substitutions
    #[serde(default)]
    pub uses: HashMap<String, String>,
    
    /// For loop execution
    #[serde(rename = "foreach")]
    pub foreach: Option<String>,
    
    /// Batch size for durable loops
    pub batch_size: Option<usize>,
    
    /// Enable checkpointing
    #[serde(default)]
    pub checkpoint: bool,
    
    /// Timeout in seconds
    pub timeout: Option<u64>,
    
    /// Condition (skip if false)
    #[serde(rename = "if")]
    pub condition: Option<String>,
}

/// Load workflow spec from file or registry
pub fn load_spec(workflow_id: &str) -> anyhow::Result<WorkflowSpec> {
    // First, try loading from workflows/ directory
    let paths = vec![
        PathBuf::from(format!("workflows/{}.yaml", workflow_id)),
        PathBuf::from(format!("workflows/{}.yml", workflow_id)),
        config::expand_path(&format!("~/.oneclaw/workflows/{}.yaml", workflow_id)),
    ];
    
    for path in paths {
        if path.exists() {
            let contents = std::fs::read_to_string(&path)?;
            let spec: WorkflowSpec = serde_yaml::from_str(&contents)?;
            return Ok(spec);
        }
    }
    
    anyhow::bail!("Workflow not found: {}", workflow_id);
}

/// Merge user-provided inputs with defaults from the workflow spec
fn merge_inputs_with_defaults(spec: &WorkflowSpec, provided: Value) -> Value {
    let mut merged = serde_json::Map::new();
    
    // First, apply all defaults
    for (name, def) in &spec.inputs {
        if let Some(default_val) = &def.default {
            merged.insert(name.clone(), default_val.clone());
        }
    }
    
    // Then, override with provided values
    if let Value::Object(obj) = provided {
        for (key, val) in obj {
            merged.insert(key, val);
        }
    }
    
    Value::Object(merged)
}

/// Run a workflow
pub async fn run(workflow_id: &str, inputs: Value) -> anyhow::Result<receipt::WorkflowReceipt> {
    let start_time = chrono::Utc::now();
    let run_id = nanoid::nanoid!();
    let config = config::load()?;
    
    tracing::info!(
        run_id = %run_id,
        workflow_id = %workflow_id,
        "Starting workflow"
    );
    
    // Load workflow spec
    let spec = load_spec(workflow_id)?;
    
    // Initialize executor registry
    let registry = executor::Registry::load()?;
    
    // Merge provided inputs with defaults from spec
    let merged_inputs = merge_inputs_with_defaults(&spec, inputs.clone());
    
    // Execute steps
    let mut step_receipts = Vec::new();
    let mut outputs = serde_json::json!({});
    let mut context = Context::new(merged_inputs.clone());
    
    for step in &spec.steps {
        // Check condition
        if let Some(condition) = &step.condition {
            if !evaluate_condition(condition, &context) {
                step_receipts.push(receipt::StepReceipt {
                    step_id: step.id.clone(),
                    executor: step.executor.clone(),
                    status: "skipped".to_string(),
                    request: serde_json::json!(null),
                    response: serde_json::json!(null),
                    denial_reason: None,
                    error: None,
                    duration_ms: 0,
                });
                continue;
            }
        }
        
        // Resolve input with variable substitution
        let resolved_input = resolve_variables(&step.input, &step.uses, &context)?;
        
        // Check if executor is allowed
        if !config.security.allowed_executors.contains(&step.executor) {
            let denial = executor::DenialReason {
                rule: "security.allowed_executors".to_string(),
                attempted: step.executor.clone(),
                policy: format!("Executor '{}' is not in allowed_executors list", step.executor),
            };
            step_receipts.push(receipt::StepReceipt {
                step_id: step.id.clone(),
                executor: step.executor.clone(),
                status: "denied".to_string(),
                request: resolved_input.clone(),
                response: serde_json::json!(null),
                denial_reason: Some(denial),
                error: None,
                duration_ms: 0,
            });
            continue;
        }
        
        // Get executor
        let executor = match registry.get(&step.executor) {
            Some(e) => e,
            None => {
                step_receipts.push(receipt::StepReceipt {
                    step_id: step.id.clone(),
                    executor: step.executor.clone(),
                    status: "error".to_string(),
                    request: resolved_input.clone(),
                    response: serde_json::json!(null),
                    denial_reason: None,
                    error: Some(format!("Executor not found: {}", step.executor)),
                    duration_ms: 0,
                });
                continue;
            }
        };
        
        // Execute
        let result = executor.execute(resolved_input.clone(), config);
        let step_receipt = receipt::StepReceipt::from_result(
            &step.id,
            &step.executor,
            resolved_input,
            result.clone(),
        );
        
        // Store output in context
        if let executor::ExecutorResult::Executed { output, .. } = result {
            context.set_step_output(&step.id, output.clone());
            
            // If this is the last step, use as outputs
            outputs = output;
        }
        
        step_receipts.push(step_receipt);
    }
    
    let end_time = chrono::Utc::now();
    let total_duration = (end_time - start_time).num_milliseconds() as u64;
    
    // Determine overall status
    let status = if step_receipts.iter().all(|s| s.status == "executed" || s.status == "skipped") {
        "success"
    } else if step_receipts.iter().any(|s| s.status == "executed") {
        "partial"
    } else {
        "failed"
    };
    
    // Build receipt
    let receipt = receipt::WorkflowReceipt {
        run_id: run_id.clone(),
        workflow_id: workflow_id.to_string(),
        node_id: config.node.id.clone(),
        started_at: start_time.to_rfc3339(),
        completed_at: end_time.to_rfc3339(),
        status: status.to_string(),
        mode: config.node.environment.clone(),
        steps: step_receipts,
        inputs: merged_inputs,
        outputs,
        debug: receipt::DebugInfo {
            config_snapshot: receipt::config_snapshot_hash(),
            executor_versions: HashMap::from([
                ("http.request".to_string(), "0.1.0".to_string()),
            ]),
            total_duration_ms: total_duration,
        },
    };
    
    // Write receipt
    receipt::write_receipt(&receipt)?;
    
    tracing::info!(
        run_id = %run_id,
        status = %status,
        duration_ms = %total_duration,
        "Workflow completed"
    );
    
    Ok(receipt)
}

// ============================================
// Context for variable resolution
// ============================================

struct Context {
    inputs: Value,
    steps: HashMap<String, Value>,
}

impl Context {
    fn new(inputs: Value) -> Self {
        Self {
            inputs,
            steps: HashMap::new(),
        }
    }
    
    fn set_step_output(&mut self, step_id: &str, output: Value) {
        self.steps.insert(step_id.to_string(), output);
    }
    
    fn get(&self, path: &str) -> Option<Value> {
        let parts: Vec<&str> = path.split('.').collect();
        if parts.is_empty() {
            return None;
        }
        
        match parts[0] {
            "inputs" => {
                let mut value = &self.inputs;
                for part in &parts[1..] {
                    value = value.get(part)?;
                }
                Some(value.clone())
            }
            "steps" => {
                if parts.len() < 2 {
                    return None;
                }
                let step_output = self.steps.get(parts[1])?;
                let mut value = step_output;
                for part in &parts[2..] {
                    value = value.get(part)?;
                }
                Some(value.clone())
            }
            "env" => {
                if parts.len() < 2 {
                    return None;
                }
                std::env::var(parts[1]).ok().map(Value::String)
            }
            _ => None,
        }
    }
}

fn resolve_variables(
    input: &Value,
    uses: &HashMap<String, String>,
    context: &Context,
) -> anyhow::Result<Value> {
    // Simple variable substitution in strings
    let json_str = serde_json::to_string(input)?;
    let mut resolved = json_str.clone();
    
    // Replace ${path} patterns
    let re = regex::Regex::new(r"\$\{([^}]+)\}")?;
    for cap in re.captures_iter(&json_str) {
        let full_match = &cap[0];
        let path = &cap[1];
        
        if let Some(value) = context.get(path) {
            let replacement = match value {
                Value::String(s) => s,
                _ => serde_json::to_string(&value)?,
            };
            resolved = resolved.replace(full_match, &replacement);
        }
    }
    
    // Replace from uses map
    for (key, path) in uses {
        if let Some(value) = context.get(path) {
            let placeholder = format!("${{{}}}", key);
            let replacement = match value {
                Value::String(s) => s,
                _ => serde_json::to_string(&value)?,
            };
            resolved = resolved.replace(&placeholder, &replacement);
        }
    }
    
    let result: Value = serde_json::from_str(&resolved)?;
    Ok(result)
}

fn evaluate_condition(condition: &str, context: &Context) -> bool {
    // Simple condition evaluation (just check if value exists and is truthy)
    if let Some(value) = context.get(condition) {
        match value {
            Value::Bool(b) => b,
            Value::Null => false,
            Value::String(s) => !s.is_empty(),
            Value::Number(n) => n.as_f64().map(|f| f != 0.0).unwrap_or(false),
            _ => true,
        }
    } else {
        false
    }
}
