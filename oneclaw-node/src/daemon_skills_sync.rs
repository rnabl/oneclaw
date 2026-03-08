// =============================================================================
// SKILLS.MD AUTO-SYNC
// =============================================================================

use crate::agent_os;
use std::collections::HashMap;

/// Sync harness tools to ~/.oneclaw/workspace/SKILLS.md
pub async fn sync_skills_md(tools: &[agent_os::ToolDefinition]) -> anyhow::Result<()> {
    let workspace = dirs::home_dir()
        .ok_or_else(|| anyhow::anyhow!("No home directory"))?
        .join(".oneclaw")
        .join("workspace");
    
    // Create workspace if it doesn't exist
    if !workspace.exists() {
        std::fs::create_dir_all(&workspace)?;
        tracing::info!("Created workspace directory: {}", workspace.display());
    }
    
    // Generate SKILLS.md content from tools
    let content = generate_skills_content(tools);
    
    // Write to SKILLS.md
    std::fs::write(workspace.join("SKILLS.md"), content)?;
    
    Ok(())
}

fn generate_skills_content(tools: &[agent_os::ToolDefinition]) -> String {
    let mut content = String::from("# Skills\n\n");
    content.push_str("## Registered Tools\n\n");
    content.push_str("These are the ONLY tools you can use. Do not invent others.\n\n");
    content.push_str("**Auto-generated from Harness registry** - Do not edit manually.\n\n");
    
    // Group tools by category
    let mut categories: HashMap<String, Vec<&agent_os::ToolDefinition>> = HashMap::new();
    
    for tool in tools {
        let category = categorize_tool(&tool.id);
        categories.entry(category).or_insert_with(Vec::new).push(tool);
    }
    
    // Sort categories
    let mut category_names: Vec<_> = categories.keys().cloned().collect();
    category_names.sort();
    
    // Write each category
    for category in category_names {
        content.push_str(&format!("### {}\n\n", category));
        content.push_str("| Tool ID | Description | Est. Cost |\n");
        content.push_str("|---------|-------------|----------|\n");
        
        if let Some(tools_in_cat) = categories.get(&category) {
            for tool in tools_in_cat {
                let cost = tool.cost_estimate
                    .map(|c| format!("${:.3}", c))
                    .unwrap_or_else(|| "Free".to_string());
                content.push_str(&format!("| `{}` | {} | {} |\n", 
                    tool.id, 
                    tool.description,
                    cost
                ));
            }
        }
        content.push_str("\n");
    }
    
    // Add usage instructions
    content.push_str("---\n\n");
    content.push_str("## Tool Call Syntax\n\n");
    content.push_str("All tools execute through harness:\n\n");
    content.push_str("```tool\n");
    content.push_str(r#"{"tool": "harness.execute", "input": {"executor": "TOOL_ID", "params": {...}}}"#);
    content.push_str("\n```\n\n");
    
    // Add examples for key tools
    content.push_str("## Key Examples\n\n");
    
    // Execute code example
    if tools.iter().any(|t| t.id == "execute-code") {
        content.push_str("### Execute Code (TypeScript/JavaScript/Bash)\n\n");
        content.push_str("```tool\n");
        content.push_str(r#"{"tool": "harness.execute", "input": {"executor": "execute-code", "params": {
  "code": "console.log('Hello from Deno!')",
  "language": "typescript",
  "timeout": 5000
}}}"#);
        content.push_str("\n```\n\n");
        
        content.push_str("**With network access:**\n");
        content.push_str("```tool\n");
        content.push_str(r#"{"tool": "harness.execute", "input": {"executor": "execute-code", "params": {
  "code": "const res = await fetch('https://api.github.com'); console.log(res.status)",
  "language": "typescript",
  "allowNet": true,
  "allowedDomains": ["api.github.com"]
}}}"#);
        content.push_str("\n```\n\n");
    }
    
    // Database example
    if tools.iter().any(|t| t.id == "supabase-database") {
        content.push_str("### Query Database\n\n");
        content.push_str("```tool\n");
        content.push_str(r#"{"tool": "harness.execute", "input": {"executor": "supabase-database", "params": {
  "operation": "select",
  "table": "email_campaigns",
  "conditions": {"status": "sent"}
}}}"#);
        content.push_str("\n```\n\n");
    }
    
    // Business discovery example
    if tools.iter().any(|t| t.id == "discover-businesses") {
        content.push_str("### Discover Businesses\n\n");
        content.push_str("```tool\n");
        content.push_str(r#"{"tool": "harness.execute", "input": {"executor": "discover-businesses", "params": {
  "niche": "plumber",
  "location": "Denver, CO",
  "limit": 20
}}}"#);
        content.push_str("\n```\n\n");
    }
    
    content.push_str("---\n\n");
    content.push_str(&format!("**Last synced:** {}\n", chrono::Local::now().format("%Y-%m-%d %H:%M:%S")));
    content.push_str(&format!("**Total tools:** {}\n", tools.len()));
    
    content
}

fn categorize_tool(tool_id: &str) -> String {
    if tool_id.contains("execute-code") || tool_id.contains("write-file") || tool_id.contains("read-file") {
        "🔥 Code Execution".to_string()
    } else if tool_id.contains("database") || tool_id.contains("storage") || tool_id.contains("init-database") {
        "💾 Database & Storage".to_string()
    } else if tool_id.contains("email") || tool_id.contains("gmail") || tool_id.contains("campaign") {
        "📧 Email & Campaigns".to_string()
    } else if tool_id.contains("discover") || tool_id.contains("search-businesses") || tool_id.contains("enrich") {
        "🏢 Business Discovery".to_string()
    } else if tool_id.contains("ai-rankings") || tool_id.contains("match") || tool_id.contains("audit") || tool_id.contains("citation") {
        "📊 Analysis & Insights".to_string()
    } else if tool_id.contains("pipeline") || tool_id.contains("workflow") || tool_id.contains("resume") || tool_id.contains("job") {
        "🔄 Workflows & Jobs".to_string()
    } else {
        "🛠 Other Tools".to_string()
    }
}
