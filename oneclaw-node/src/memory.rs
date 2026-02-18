use serde::{Deserialize, Serialize};
use crate::config;

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct Preferences {
    pub user_id: Option<String>,
    pub default_execution_mode: Option<String>,
    pub preferred_location: Option<String>,
    pub preferred_output_format: Option<String>,
    #[serde(default)]
    pub custom: std::collections::HashMap<String, serde_json::Value>,
}

pub fn load_preferences() -> anyhow::Result<Preferences> {
    let config = config::load()?;
    let path = config::expand_path(&config.memory.preferences_path);
    if !path.exists() {
        return Ok(Preferences::default());
    }
    let contents = std::fs::read_to_string(&path)?;
    Ok(serde_yaml::from_str(&contents)?)
}

pub fn save_preferences(prefs: &Preferences) -> anyhow::Result<()> {
    let config = config::load()?;
    let path = config::expand_path(&config.memory.preferences_path);
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent)?;
    }
    std::fs::write(&path, serde_yaml::to_string(prefs)?)?;
    Ok(())
}
