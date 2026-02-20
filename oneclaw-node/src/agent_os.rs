use std::path::PathBuf;
use std::fs;
use serde::{Deserialize, Serialize};

/// Live agent files live in the workspace (main folder). Templates in repo are for copying only.
fn workspace_dir() -> Option<PathBuf> {
    dirs::home_dir().map(|h| h.join(".oneclaw").join("workspace"))
}

/// Repo templates dir (for fallback / first-run when workspace is empty).
fn templates_fallback_dirs() -> Vec<PathBuf> {
    let mut out = Vec::new();
    if let Ok(exe) = std::env::current_exe() {
        if let Some(exe_dir) = exe.parent() {
            out.push(exe_dir.join("templates"));
            if let Some(above) = exe_dir.parent() {
                out.push(above.join("templates"));
                if let Some(above2) = above.parent() {
                    out.push(above2.join("templates"));
                }
            }
        }
    }
    out.push(PathBuf::from("templates"));
    out.push(PathBuf::from("oneclaw-node/templates"));
    out
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AgentOS {
    pub soul: String,
    pub identity: String,
    pub skills: String,
    pub playbooks: String,
    pub memory: String,
}

impl AgentOS {
    /// Load agent OS: first from main workspace (~/.oneclaw/workspace), then from repo templates.
    pub fn load(templates_dir_override: Option<PathBuf>) -> anyhow::Result<Self> {
        // 1) Explicit override
        if let Some(d) = templates_dir_override {
            if d.exists() {
                tracing::info!("Agent OS dir (override): {}", d.display());
                return Self::load_from_dir(&d);
            }
        }

        // 2) Main folder: ~/.oneclaw/workspace (live agent, like OpenClaw)
        if let Some(workspace) = workspace_dir() {
            if workspace.exists() {
                tracing::info!("Agent OS dir (workspace): {}", workspace.display());
                return Self::load_from_dir(&workspace);
            }
        }

        // 3) Fallback: repo templates (for first run; user can copy to workspace later)
        let dir = templates_fallback_dirs()
            .into_iter()
            .find(|d| d.exists())
            .ok_or_else(|| anyhow::anyhow!("No agent workspace or templates dir found. Create ~/.oneclaw/workspace/ with SOUL.md, IDENTITY.md, etc., or run from repo with oneclaw-node/templates/."))?;

        tracing::info!("Agent OS dir (templates fallback): {}", dir.display());
        Self::load_from_dir(&dir)
    }

    fn load_from_dir(dir: &PathBuf) -> anyhow::Result<Self> {
        Ok(Self {
            soul: Self::load_file(dir, "SOUL.md")?,
            identity: Self::load_file(dir, "IDENTITY.md")?,
            skills: Self::load_file(dir, "SKILLS.md")?,
            playbooks: Self::load_file(dir, "PLAYBOOKS.md")?,
            memory: Self::load_file(dir, "MEMORY.md")?,
        })
    }

    fn load_file(dir: &PathBuf, name: &str) -> anyhow::Result<String> {
        let path = dir.join(name);
        if path.exists() {
            fs::read_to_string(&path).map_err(|e| anyhow::anyhow!("Failed to read {}: {}", name, e))
        } else {
            tracing::warn!("Agent OS file not found: {:?}", path);
            Ok(format!("# {} (Not Found)\n\nAdd this file to your workspace or use the repo template.", name.replace(".md", "")))
        }
    }

    pub fn build_system_prompt(&self, tool_registry: &[ToolDefinition]) -> String {
        let tools_section = self.format_tool_registry(tool_registry);
        
        format!(
            r#"{}

---

# IDENTITY
{}

---

# SKILLS
{}

---

# PLAYBOOKS
{}

---

# MEMORY
{}

---

# AVAILABLE TOOLS (from Harness)
{}
"#,
            self.soul,
            self.identity,
            self.skills,
            self.playbooks,
            self.memory,
            tools_section
        )
    }

    /// Minimal system prompt with SOUL personality + tools. Keeps personality while avoiding bloat.
    pub fn build_system_prompt_minimal(&self, tool_registry: &[ToolDefinition]) -> String {
        let tools_section = self.format_tool_registry(tool_registry);
        
        // Extract first paragraph of SOUL as personality core (before first ##)
        let soul_core = self.soul
            .lines()
            .skip_while(|l| l.trim().starts_with('#'))
            .take_while(|l| !l.trim().starts_with('#'))
            .collect::<Vec<_>>()
            .join("\n")
            .trim()
            .to_string();
        
        let personality = if soul_core.is_empty() || soul_core.contains("Not Found") {
            "You are OneClaw, a helpful AI assistant.".to_string()
        } else {
            soul_core
        };
        
        format!(
            r#"{}

## Tool Usage

When you need to execute something (search, book, fetch data), use a ```tool block:

```tool
{{"tool": "tool-name", "input": {{...}}}}
```

## Available Tools
{}

Respond naturally. If you use a tool, I'll execute it and you can summarize the results."#,
            personality,
            tools_section
        )
    }

    pub fn format_tool_registry(&self, tools: &[ToolDefinition]) -> String {
        if tools.is_empty() {
            return "No harness tools available.".to_string();
        }

        let mut output = String::from("| Tool ID | Description | Cost Estimate |\n|---------|-------------|---------------|\n");
        
        for tool in tools {
            output.push_str(&format!(
                "| {} | {} | ${:.3} |\n",
                tool.id,
                tool.description,
                tool.cost_estimate.unwrap_or(0.0)
            ));
        }
        
        output.push_str("\nTo execute a harness tool:\n```tool\n{\"tool\": \"harness.execute\", \"input\": {\"executor\": \"TOOL_ID\", \"params\": {...}}}\n```\n");
        
        output
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ToolDefinition {
    pub id: String,
    pub description: String,
    pub params_schema: Option<serde_json::Value>,
    pub cost_estimate: Option<f64>,
    pub tier: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct HarnessToolRegistry {
    pub tools: Vec<ToolDefinition>,
    pub harness_url: String,
}

impl HarnessToolRegistry {
    pub async fn fetch(harness_url: &str) -> anyhow::Result<Self> {
        let client = reqwest::Client::new();
        let url = format!("{}/tools", harness_url);
        
        match client.get(&url).send().await {
            Ok(resp) => {
                if resp.status().is_success() {
                    let body = resp.text().await?;
                    let tools: Vec<ToolDefinition> = serde_json::from_str(&body)?;
                    Ok(Self {
                        tools,
                        harness_url: harness_url.to_string(),
                    })
                } else {
                    tracing::warn!("Failed to fetch tools from harness: {}", resp.status());
                    Ok(Self {
                        tools: vec![],
                        harness_url: harness_url.to_string(),
                    })
                }
            }
            Err(e) => {
                tracing::warn!("Could not connect to harness at {}: {}", harness_url, e);
                Ok(Self {
                    tools: vec![],
                    harness_url: harness_url.to_string(),
                })
            }
        }
    }
}
