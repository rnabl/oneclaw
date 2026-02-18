use axum::{extract::State, http::StatusCode, Json};
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;
use std::sync::Arc;

#[derive(Deserialize)]
pub struct OAuthConfigRequest {
    client_id: String,
    client_secret: String,
    redirect_uri: String,
}

#[derive(Serialize)]
pub struct OAuthConfigResponse {
    success: bool,
    message: String,
}

/// POST /api/oauth/config
/// Save OAuth credentials to .env file in Harness directory
pub async fn save_oauth_config_handler(
    Json(req): Json<OAuthConfigRequest>,
) -> Result<Json<OAuthConfigResponse>, (StatusCode, String)> {
    // Validate inputs
    if !req.client_id.ends_with(".apps.googleusercontent.com") {
        return Ok(Json(OAuthConfigResponse {
            success: false,
            message: "Invalid client ID format".to_string(),
        }));
    }
    
    if !req.client_secret.starts_with("GOCSPX-") {
        return Ok(Json(OAuthConfigResponse {
            success: false,
            message: "Invalid client secret format".to_string(),
        }));
    }
    
    // Determine .env file location
    // Try to find apps/api/.env relative to project root
    let current_dir = std::env::current_dir()
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;
    
    // Go up to project root (oneclaw-node -> oneclaw)
    let project_root = current_dir.parent()
        .ok_or((StatusCode::INTERNAL_SERVER_ERROR, "Cannot find project root".to_string()))?;
    
    let env_path = project_root.join("apps").join("api").join(".env");
    
    // Check if Harness directory exists
    if !project_root.join("apps").join("api").exists() {
        return Ok(Json(OAuthConfigResponse {
            success: false,
            message: format!(
                "Harness directory not found. Please add credentials manually to: {}",
                env_path.display()
            ),
        }));
    }
    
    // Read existing .env or create new
    let mut env_content = if env_path.exists() {
        fs::read_to_string(&env_path)
            .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?
    } else {
        String::new()
    };
    
    // Remove existing Google OAuth lines
    let lines: Vec<String> = env_content
        .lines()
        .filter(|line| {
            !line.starts_with("GOOGLE_CLIENT_ID=") &&
            !line.starts_with("GOOGLE_CLIENT_SECRET=") &&
            !line.starts_with("GOOGLE_REDIRECT_URI=")
        })
        .map(|s| s.to_string())
        .collect();
    
    env_content = lines.join("\n");
    
    // Add new credentials
    if !env_content.is_empty() && !env_content.ends_with('\n') {
        env_content.push('\n');
    }
    
    env_content.push_str(&format!("\n# Google OAuth for Gmail Integration\n"));
    env_content.push_str(&format!("GOOGLE_CLIENT_ID={}\n", req.client_id));
    env_content.push_str(&format!("GOOGLE_CLIENT_SECRET={}\n", req.client_secret));
    env_content.push_str(&format!("GOOGLE_REDIRECT_URI={}\n", req.redirect_uri));
    
    // Generate encryption key if not exists
    if !env_content.contains("TOKEN_ENCRYPTION_KEY=") {
        use rand::Rng;
        use base64::{engine::general_purpose, Engine as _};
        let key: [u8; 32] = rand::thread_rng().gen();
        let key_b64 = general_purpose::STANDARD.encode(&key);
        env_content.push_str(&format!("TOKEN_ENCRYPTION_KEY={}\n", key_b64));
    }
    
    // Write to file
    fs::write(&env_path, env_content)
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;
    
    Ok(Json(OAuthConfigResponse {
        success: true,
        message: format!("OAuth credentials saved to {}", env_path.display()),
    }))
}
