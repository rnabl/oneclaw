use axum::{extract::State, http::StatusCode, response::{Html, IntoResponse}, Json};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::sync::Arc;
use chrono::{DateTime, Utc};
use crate::{config, store};

#[derive(Serialize, Deserialize, Clone)]
pub struct Integration {
    pub id: String,
    pub name: String,
    pub icon: String,
    pub description: String,
    pub connected: bool,
    pub email: Option<String>,
    pub connected_at: Option<String>,
    pub status: String, // "connected", "expired", "disconnected"
    pub required_for: Vec<String>,
    pub scopes: Vec<String>,
}

#[derive(Serialize, Deserialize, Clone)]
pub struct GmailAccount {
    pub id: String,
    pub email: String,
    pub connected_at: String,
    pub expires_at: Option<String>,
    pub scopes: Vec<String>,
}

impl GmailAccount {
    /// Check if the OAuth token is expired or expiring very soon
    /// Uses a 5-minute grace period - tokens refresh automatically before this
    pub fn is_token_expired(&self) -> bool {
        if let Some(expires_at_str) = &self.expires_at {
            if let Ok(expires_at) = DateTime::parse_from_rfc3339(expires_at_str) {
                let now = Utc::now();
                // Add 5 minute grace period - show as expired only if really expired
                // The auto-refresh service refreshes tokens 10 minutes before expiry
                let grace_period = chrono::Duration::minutes(5);
                return expires_at < now + grace_period;
            }
        }
        // If we can't parse the expiration date, assume it's expired for safety
        true
    }
}

/// Get all Gmail accounts for this node from the control plane
pub async fn get_gmail_accounts(
    user_id: &str,
    control_plane_url: &str,
) -> Vec<GmailAccount> {
    let client = reqwest::Client::new();
    let response = client
        .get(format!("{}/api/v1/oauth/google/accounts", control_plane_url))
        .query(&[("user_id", user_id)])
        .send()
        .await;
    
    let Ok(resp) = response else {
        return vec![];
    };
    
    if !resp.status().is_success() {
        return vec![];
    }
    
    let Ok(data) = resp.json::<Value>().await else {
        return vec![];
    };
    
    let Some(accounts) = data["accounts"].as_array() else {
        return vec![];
    };
    
    accounts.iter().filter_map(|acc| {
        Some(GmailAccount {
            id: acc["id"].as_str()?.to_string(),
            email: acc["email"].as_str()?.to_string(),
            connected_at: acc["connected_at"].as_str()?.to_string(),
            expires_at: acc["expires_at"].as_str().map(String::from),
            scopes: acc["scopes"].as_array()
                .map(|s| s.iter().filter_map(|v| v.as_str().map(String::from)).collect())
                .unwrap_or_default(),
        })
    }).collect()
}

/// Check if Gmail is connected for this node (with valid, non-expired token)
pub async fn check_gmail_connected(
    user_id: &str,
    control_plane_url: Option<&str>,
) -> bool {
    let Some(url) = control_plane_url else {
        return false;
    };
    
    let accounts = get_gmail_accounts(user_id, url).await;
    // Only consider accounts with non-expired tokens as connected
    accounts.iter().any(|acc| !acc.is_token_expired())
}

/// Get Gmail account info if connected (returns first account for backward compat)
pub async fn get_gmail_info(
    user_id: &str,
    control_plane_url: &str,
) -> Option<(String, String)> {
    let accounts = get_gmail_accounts(user_id, control_plane_url).await;
    accounts.first().map(|a| (a.email.clone(), a.connected_at.clone()))
}

/// Get list of available integrations with connection status
pub async fn get_integrations_list(
    user_id: &str,
    control_plane_url: Option<&str>,
) -> Vec<Integration> {
    let gmail_accounts = match control_plane_url {
        Some(url) => get_gmail_accounts(user_id, url).await,
        None => vec![],
    };
    
    let gmail_connected = !gmail_accounts.is_empty();
    
    // If multiple accounts, show them all as separate integrations
    let mut integrations: Vec<Integration> = if gmail_accounts.is_empty() {
        vec![Integration {
            id: "gmail".to_string(),
            name: "Gmail".to_string(),
            icon: "📧".to_string(),
            description: "Send and read emails via Gmail".to_string(),
            connected: false,
            email: None,
            connected_at: None,
            status: "disconnected".to_string(),
            required_for: vec![
                "email sending".to_string(),
                "email reading".to_string(),
            ],
            scopes: vec![
                "gmail.send".to_string(),
                "gmail.readonly".to_string(),
            ],
        }]
    } else {
        gmail_accounts.iter().map(|acc| {
            let is_expired = acc.is_token_expired();
            Integration {
                id: format!("gmail:{}", acc.email),
                name: "Gmail".to_string(),
                icon: "📧".to_string(),
                description: "Send and read emails via Gmail".to_string(),
                connected: !is_expired, // Only mark as connected if not expired
                email: Some(acc.email.clone()),
                connected_at: Some(acc.connected_at.clone()),
                status: if is_expired { "expired".to_string() } else { "connected".to_string() },
                required_for: vec![
                    "email sending".to_string(),
                    "email reading".to_string(),
                ],
                scopes: acc.scopes.clone(),
            }
        }).collect()
    };
    
    // Add other integrations
    integrations.push(Integration {
        id: "google_calendar".to_string(),
        name: "Google Calendar".to_string(),
        icon: "📅".to_string(),
        description: "Manage calendar events and scheduling".to_string(),
        connected: false,
        email: None,
        connected_at: None,
        status: "disconnected".to_string(),
        required_for: vec![
            "calendar events".to_string(),
            "meeting scheduling".to_string(),
        ],
        scopes: vec![
            "calendar.readonly".to_string(),
            "calendar.events".to_string(),
        ],
    });
    
    integrations.push(Integration {
        id: "slack".to_string(),
        name: "Slack".to_string(),
        icon: "💬".to_string(),
        description: "Send messages and notifications to Slack".to_string(),
        connected: false,
        email: None,
        connected_at: None,
        status: "disconnected".to_string(),
        required_for: vec![
            "team notifications".to_string(),
            "channel messages".to_string(),
        ],
        scopes: vec![
            "chat:write".to_string(),
            "channels:read".to_string(),
        ],
    });
    
    integrations
}

/// Generate OAuth connect URL
pub fn generate_oauth_url(
    integration_id: &str,
    user_id: &str,
    control_plane_url: &str,
) -> Option<String> {
    match integration_id {
        "gmail" => Some(format!(
            "{}/oauth/google?user={}&source=node",
            control_plane_url,
            user_id
        )),
        _ => None,
    }
}
