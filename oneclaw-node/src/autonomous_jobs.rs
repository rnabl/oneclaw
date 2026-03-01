/**
 * Autonomous Job System - Daemon Integration
 * 
 * This module handles the daemon-side logic for autonomous multi-step jobs:
 * - Detecting complex vs simple requests
 * - Generating execution plans with LLM
 * - Delegating to harness for execution
 * - Polling for progress and sending real-time updates to Telegram
 * - Adaptive recovery when steps fail
 */

use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct JobPlan {
    pub description: String,
    pub steps: Vec<JobStep>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct JobStep {
    pub id: String,
    pub order: i32,
    pub action: String,
    pub params: serde_json::Value,
    pub status: String,
}

/// Detect if a user request requires multi-step autonomous execution
/// vs simple single-tool execution
pub fn is_complex_request(user_message: &str, tool_results_count: usize) -> bool {
    let message_lower = user_message.to_lowercase();
    
    // Explicit multi-step indicators
    let multi_step_keywords = [
        "and then",
        "after that",
        "next",
        "followed by",
        "and get me",
        "then draft",
        "then send",
        "analyze and",
        "find and",
        "get me the",
    ];
    
    // Complex task indicators
    let complex_indicators = [
        "point of contact",
        "contact info",
        "owner email",
        "decision maker",
        "analyze",
        "compare",
        "rank",
        "draft email",
        "outreach",
    ];
    
    // Check for multi-step keywords
    for keyword in &multi_step_keywords {
        if message_lower.contains(keyword) {
            return true;
        }
    }
    
    // Check if message mentions multiple actions
    let action_count = message_lower.matches("find").count()
        + message_lower.matches("get").count()
        + message_lower.matches("analyze").count()
        + message_lower.matches("draft").count()
        + message_lower.matches("send").count();
    
    if action_count >= 2 {
        return true;
    }
    
    // Check for complex indicators that typically need multiple steps
    for indicator in &complex_indicators {
        if message_lower.contains(indicator) {
            // "get me the point of contact" = find businesses + enrich contacts
            return true;
        }
    }
    
    // If the LLM already called multiple tools, it's complex
    if tool_results_count > 1 {
        return true;
    }
    
    false
}

/// Generate a job plan using LLM
/// This is a ONE-TIME upfront planning call
pub async fn generate_job_plan(
    user_message: &str,
    llm_client: &reqwest::Client,
    api_key: &str,
) -> anyhow::Result<JobPlan> {
    let prompt = format!(
        r#"You are a task planner for an AI agent. Given a user request, break it down into a sequence of executable steps.

Available actions:
- "discover": Find businesses by niche and location
- "filter": Filter businesses by criteria (rating, reviews, etc.)
- "enrich": Find owner/decision-maker contact information for a business
- "audit": Analyze a business website
- "analyze": Perform business analysis
- "draft-email": Draft an outreach email

User request: "{}"

Create a step-by-step execution plan. Each step should have:
- order: Step number (1, 2, 3...)
- action: One of the available actions
- params: Parameters needed for that action

Example:
User: "Find HVAC companies in Miami with 50-300 reviews and get me the point of contact"
Plan:
1. discover: {{ "niche": "hvac", "location": "Miami, FL", "limit": 50 }}
2. enrich: {{ "businesses": "{{from_step_1}}" }}

Respond with ONLY a JSON array of steps. No explanation.
"#,
        user_message
    );

    let request_body = serde_json::json!({
        "model": "claude-sonnet-4-20250514",
        "max_tokens": 2000,
        "messages": [{
            "role": "user",
            "content": prompt
        }]
    });

    let response = llm_client
        .post("https://api.anthropic.com/v1/messages")
        .header("x-api-key", api_key)
        .header("anthropic-version", "2023-06-01")
        .json(&request_body)
        .send()
        .await?;

    let response_json: serde_json::Value = response.json().await?;
    
    // Extract steps from response
    let content = response_json["content"][0]["text"]
        .as_str()
        .ok_or_else(|| anyhow::anyhow!("No content in LLM response"))?;
    
    // Parse JSON array from content (strip markdown if present)
    let json_str = content
        .trim()
        .trim_start_matches("```json")
        .trim_start_matches("```")
        .trim_end_matches("```")
        .trim();
    
    let steps_array: Vec<serde_json::Value> = serde_json::from_str(json_str)?;
    
    let steps: Vec<JobStep> = steps_array
        .into_iter()
        .enumerate()
        .map(|(i, step)| JobStep {
            id: nanoid::nanoid!(10),
            order: (i + 1) as i32,
            action: step["action"].as_str().unwrap_or("unknown").to_string(),
            params: step["params"].clone(),
            status: "pending".to_string(),
        })
        .collect();

    Ok(JobPlan {
        description: user_message.to_string(),
        steps,
    })
}

/// Generate a recovery plan when a step fails
/// This is the "adaptive" part - only called on failure
pub async fn generate_recovery_plan(
    failed_step: &JobStep,
    error: &str,
    remaining_steps: &[JobStep],
    llm_client: &reqwest::Client,
    api_key: &str,
) -> anyhow::Result<Vec<JobStep>> {
    let prompt = format!(
        r#"A task execution step failed. Decide how to recover.

Failed step: {} - {}
Error: {}
Remaining steps: {:?}

Options:
1. SKIP: Skip this step and continue with remaining steps
2. RETRY: Retry the same step with modified parameters
3. ALTERNATIVE: Use a different action to achieve the same goal
4. ABORT: The failure is unrecoverable, abort the job

Respond with a JSON object:
{{
  "decision": "SKIP" | "RETRY" | "ALTERNATIVE" | "ABORT",
  "reason": "explanation",
  "modified_step": {{ ... }} // Only if RETRY or ALTERNATIVE
}}
"#,
        failed_step.order,
        failed_step.action,
        error,
        remaining_steps.iter().map(|s| &s.action).collect::<Vec<_>>()
    );

    let request_body = serde_json::json!({
        "model": "claude-sonnet-4-20250514",
        "max_tokens": 1000,
        "messages": [{
            "role": "user",
            "content": prompt
        }]
    });

    let response = llm_client
        .post("https://api.anthropic.com/v1/messages")
        .header("x-api-key", api_key)
        .header("anthropic-version", "2023-06-01")
        .json(&request_body)
        .send()
        .await?;

    let response_json: serde_json::Value = response.json().await?;
    let content = response_json["content"][0]["text"]
        .as_str()
        .ok_or_else(|| anyhow::anyhow!("No content in LLM response"))?;
    
    let json_str = content
        .trim()
        .trim_start_matches("```json")
        .trim_start_matches("```")
        .trim_end_matches("```")
        .trim();
    
    let recovery: serde_json::Value = serde_json::from_str(json_str)?;
    
    match recovery["decision"].as_str() {
        Some("SKIP") => {
            // Continue with remaining steps
            Ok(remaining_steps.to_vec())
        }
        Some("RETRY") | Some("ALTERNATIVE") => {
            // Replace failed step with modified version
            let mut new_steps = vec![];
            if let Some(modified) = recovery["modified_step"].as_object() {
                new_steps.push(JobStep {
                    id: nanoid::nanoid!(10),
                    order: failed_step.order,
                    action: modified["action"].as_str().unwrap_or(&failed_step.action).to_string(),
                    params: modified["params"].clone(),
                    status: "pending".to_string(),
                });
            }
            new_steps.extend_from_slice(remaining_steps);
            Ok(new_steps)
        }
        Some("ABORT") | _ => {
            Err(anyhow::anyhow!("Recovery aborted: {}", recovery["reason"].as_str().unwrap_or("Unknown reason")))
        }
    }
}

/// Create a job in the harness
pub async fn create_harness_job(
    user_id: &str,
    plan: &JobPlan,
    harness_url: &str,
) -> anyhow::Result<String> {
    let client = reqwest::Client::new();
    
    let request_body = serde_json::json!({
        "userId": user_id,
        "description": plan.description,
        "plan": plan.steps,
    });

    let response = client
        .post(format!("{}/jobs/execute", harness_url))
        .json(&request_body)
        .send()
        .await?;

    if !response.status().is_success() {
        let error_text = response.text().await?;
        return Err(anyhow::anyhow!("Failed to create job: {}", error_text));
    }

    let response_json: serde_json::Value = response.json().await?;
    let job_id = response_json["jobId"]
        .as_str()
        .ok_or_else(|| anyhow::anyhow!("No jobId in response"))?;

    Ok(job_id.to_string())
}

/// Poll job status from harness
pub async fn poll_job_status(
    job_id: &str,
    harness_url: &str,
) -> anyhow::Result<serde_json::Value> {
    let client = reqwest::Client::new();
    
    let response = client
        .get(format!("{}/autonomous-jobs/{}/status", harness_url, job_id))
        .send()
        .await?;

    if !response.status().is_success() {
        let error_text = response.text().await?;
        return Err(anyhow::anyhow!("Failed to poll status: {}", error_text));
    }

    Ok(response.json().await?)
}

/// Get final job results from harness
pub async fn get_job_results(
    job_id: &str,
    harness_url: &str,
) -> anyhow::Result<serde_json::Value> {
    let client = reqwest::Client::new();
    
    let response = client
        .get(format!("{}/autonomous-jobs/{}/results", harness_url, job_id))
        .send()
        .await?;

    if !response.status().is_success() {
        let error_text = response.text().await?;
        return Err(anyhow::anyhow!("Failed to get results: {}", error_text));
    }

    Ok(response.json().await?)
}
