use axum::{extract::State, http::StatusCode, response::{Html, IntoResponse}, Json};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::sync::Arc;
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
    pub required_for: Vec<String>,
    pub scopes: Vec<String>,
}

/// Check if Gmail is connected for this node
pub async fn check_gmail_connected(
    user_id: &str,
    control_plane_url: Option<&str>,
) -> bool {
    let Some(url) = control_plane_url else {
        return false;
    };
    
    let client = reqwest::Client::new();
    let response = client
        .get(format!("{}/api/v1/oauth/google/status", url))
        .query(&[("user_id", user_id)])
        .send()
        .await;
    
    matches!(response, Ok(r) if r.status().is_success())
}

/// Get Gmail account info if connected
pub async fn get_gmail_info(
    user_id: &str,
    control_plane_url: &str,
) -> Option<(String, String)> {
    let client = reqwest::Client::new();
    let response = client
        .get(format!("{}/api/v1/oauth/google/account", control_plane_url))
        .query(&[("user_id", user_id)])
        .send()
        .await
        .ok()?;
    
    if !response.status().is_success() {
        return None;
    }
    
    let data: Value = response.json().await.ok()?;
    let email = data["email"].as_str()?.to_string();
    let connected_at = data["connected_at"].as_str()?.to_string();
    
    Some((email, connected_at))
}

/// Get list of available integrations with connection status
pub async fn get_integrations_list(
    user_id: &str,
    control_plane_url: Option<&str>,
) -> Vec<Integration> {
    let gmail_connected = check_gmail_connected(user_id, control_plane_url).await;
    
    let (gmail_email, gmail_connected_at) = if gmail_connected {
        match control_plane_url.and_then(|url| {
            tokio::task::block_in_place(|| {
                tokio::runtime::Handle::current()
                    .block_on(get_gmail_info(user_id, url))
            })
        }) {
            Some((email, connected)) => (Some(email), Some(connected)),
            None => (None, None),
        }
    } else {
        (None, None)
    };
    
    vec![
        Integration {
            id: "gmail".to_string(),
            name: "Gmail".to_string(),
            icon: "📧".to_string(),
            description: "Send and read emails via Gmail".to_string(),
            connected: gmail_connected,
            email: gmail_email,
            connected_at: gmail_connected_at,
            required_for: vec![
                "email sending".to_string(),
                "email reading".to_string(),
            ],
            scopes: vec![
                "gmail.send".to_string(),
                "gmail.readonly".to_string(),
            ],
        },
        Integration {
            id: "google_calendar".to_string(),
            name: "Google Calendar".to_string(),
            icon: "📅".to_string(),
            description: "Manage calendar events and scheduling".to_string(),
            connected: false,
            email: None,
            connected_at: None,
            required_for: vec![
                "calendar events".to_string(),
                "meeting scheduling".to_string(),
            ],
            scopes: vec![
                "calendar.readonly".to_string(),
                "calendar.events".to_string(),
            ],
        },
        Integration {
            id: "slack".to_string(),
            name: "Slack".to_string(),
            icon: "💬".to_string(),
            description: "Send messages and notifications to Slack".to_string(),
            connected: false,
            email: None,
            connected_at: None,
            required_for: vec![
                "team notifications".to_string(),
                "channel messages".to_string(),
            ],
            scopes: vec![
                "chat:write".to_string(),
                "channels:read".to_string(),
            ],
        },
    ]
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
