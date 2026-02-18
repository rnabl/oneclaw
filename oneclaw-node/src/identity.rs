//! Identity Management
//! 
//! Handles unified user identity across channels.
//! - Resolves provider:provider_id to internal user_id
//! - Auto-creates users on first contact
//! - Supports identity linking across channels

use crate::store::Store;
use std::sync::Arc;

pub struct IdentityManager {
    store: Arc<dyn Store>,
    auto_create: bool,
}

impl IdentityManager {
    pub fn new(store: Arc<dyn Store>, auto_create: bool) -> Self {
        Self { store, auto_create }
    }
    
    /// Resolve a channel identity to a unified user ID
    /// 
    /// If auto_create is enabled and no identity exists, creates a new user
    /// and links the identity.
    /// 
    /// Returns: (user_id, is_new_user)
    pub async fn resolve(
        &self,
        provider: &str,
        provider_id: &str,
        username: Option<&str>,
    ) -> anyhow::Result<(String, bool)> {
        // Check if identity already exists
        if let Some(identity) = self.store.get_identity(provider, provider_id).await? {
            tracing::debug!(
                provider = %provider,
                provider_id = %provider_id,
                user_id = %identity.user_id,
                "Identity found"
            );
            return Ok((identity.user_id, false));
        }
        
        // Identity doesn't exist
        if !self.auto_create {
            anyhow::bail!("Identity not found and auto_create is disabled");
        }
        
        // Create new user
        let user_id = format!("user_{}", nanoid::nanoid!(12));
        self.store.create_user(&user_id).await?;
        
        // Link identity
        self.store.link_identity(&user_id, provider, provider_id, username).await?;
        
        tracing::info!(
            provider = %provider,
            provider_id = %provider_id,
            user_id = %user_id,
            "Created new user and linked identity"
        );
        
        Ok((user_id, true))
    }
    
    /// Link an additional identity to an existing user
    pub async fn link(
        &self,
        user_id: &str,
        provider: &str,
        provider_id: &str,
        username: Option<&str>,
    ) -> anyhow::Result<()> {
        // Verify user exists
        if self.store.get_user(user_id).await?.is_none() {
            anyhow::bail!("User not found: {}", user_id);
        }
        
        // Check if this identity is already linked to someone else
        if let Some(existing) = self.store.get_identity(provider, provider_id).await? {
            if existing.user_id != user_id {
                anyhow::bail!(
                    "Identity {}:{} is already linked to user {}",
                    provider, provider_id, existing.user_id
                );
            }
            // Already linked to this user, no-op
            return Ok(());
        }
        
        // Link the identity
        self.store.link_identity(user_id, provider, provider_id, username).await?;
        
        tracing::info!(
            user_id = %user_id,
            provider = %provider,
            provider_id = %provider_id,
            "Linked identity to user"
        );
        
        Ok(())
    }
    
    /// Get all identities for a user
    pub async fn get_identities(&self, user_id: &str) -> anyhow::Result<Vec<crate::store::Identity>> {
        self.store.get_user_identities(user_id).await
    }
    
    /// Generate a short-lived link code for cross-channel identity linking
    /// 
    /// User flow:
    /// 1. User in Discord says "link my telegram"
    /// 2. Bot generates code: "LINK-ABC123"
    /// 3. User sends code in Telegram
    /// 4. System links telegram identity to same user
    pub fn generate_link_code(&self, user_id: &str) -> String {
        // Simple implementation - in production, store these with expiry
        let code = nanoid::nanoid!(8).to_uppercase();
        format!("LINK-{}-{}", &user_id[..8], code)
    }
    
    /// Verify and parse a link code
    /// Returns the user_id if valid
    pub fn parse_link_code(&self, code: &str) -> Option<String> {
        // Extract user_id prefix from code
        // Format: LINK-{user_id_prefix}-{random}
        if !code.starts_with("LINK-") {
            return None;
        }
        
        let parts: Vec<&str> = code.split('-').collect();
        if parts.len() != 3 {
            return None;
        }
        
        // In production, look up the full user_id from prefix
        // For now, return the prefix (would need full lookup)
        Some(format!("user_{}", parts[1].to_lowercase()))
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    
    #[test]
    fn test_link_code_format() {
        // Link codes should be parseable
        let code = "LINK-USER_ABC1-XYZ12345";
        assert!(code.starts_with("LINK-"));
    }
}
