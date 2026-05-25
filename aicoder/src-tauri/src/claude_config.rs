use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::fs;
use std::path::PathBuf;

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct McpServerInfo {
    pub name: String,
    pub command: String,
    pub args: Vec<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct SkillInfo {
    pub name: String,
    pub description: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct HookInfo {
    pub event: String,
    pub command: String,
}

fn get_claude_dir() -> Result<PathBuf, Box<dyn std::error::Error>> {
    let home = if cfg!(target_os = "windows") {
        std::env::var("USERPROFILE").map_err(|_| "Cannot determine home directory")?
    } else {
        std::env::var("HOME").map_err(|_| "Cannot determine home directory")?
    };
    Ok(PathBuf::from(home).join(".claude"))
}

// 读取 MCP Server 配置（从 ~/.claude/.claude.json）
pub fn get_mcp_servers() -> Result<Vec<McpServerInfo>, Box<dyn std::error::Error>> {
    let config_path = get_claude_dir()?.join(".claude.json");
    if !config_path.exists() {
        return Ok(vec![]);
    }

    let content = fs::read_to_string(&config_path)?;
    let json: serde_json::Value = serde_json::from_str(&content)?;

    let mut servers = vec![];
    if let Some(mcp_obj) = json.get("mcpServers").and_then(|v| v.as_object()) {
        for (name, config) in mcp_obj {
            let command = config.get("command")
                .and_then(|v| v.as_str())
                .unwrap_or("")
                .to_string();
            let args = config.get("args")
                .and_then(|v| v.as_array())
                .map(|arr| arr.iter()
                    .filter_map(|v| v.as_str().map(|s| s.to_string()))
                    .collect())
                .unwrap_or_default();
            servers.push(McpServerInfo {
                name: name.clone(),
                command,
                args,
            });
        }
    }

    Ok(servers)
}

// 读取已安装的 Skills（从 ~/.claude/skills/ 目录）
pub fn get_skills() -> Result<Vec<SkillInfo>, Box<dyn std::error::Error>> {
    let skills_dir = get_claude_dir()?.join("skills");
    if !skills_dir.exists() {
        return Ok(vec![]);
    }

    let mut skills = vec![];
    let entries = fs::read_dir(&skills_dir)?;

    for entry in entries {
        let entry = entry?;
        let path = entry.path();
        if !path.is_dir() {
            continue;
        }

        let name = path.file_name()
            .and_then(|n| n.to_str())
            .unwrap_or("")
            .to_string();

        // 尝试从 SKILL.md 提取描述
        let skill_md_path = path.join("SKILL.md");
        let description = if skill_md_path.exists() {
            extract_skill_description(&skill_md_path)
        } else {
            String::new()
        };

        skills.push(SkillInfo { name, description });
    }

    Ok(skills)
}

fn extract_skill_description(path: &PathBuf) -> String {
    let content = match fs::read_to_string(path) {
        Ok(c) => c,
        Err(_) => return String::new(),
    };

    // 尝试从 frontmatter 的 description 字段提取
    if let Some(desc) = extract_frontmatter_field(&content, "description") {
        return desc;
    }

    // 回退：取第一个非空、非标题行
    for line in content.lines() {
        let trimmed = line.trim();
        if trimmed.is_empty() || trimmed.starts_with('#') || trimmed.starts_with("---") {
            continue;
        }
        // 截断过长的描述
        let desc = if trimmed.len() > 100 {
            format!("{}...", &trimmed[..97])
        } else {
            trimmed.to_string()
        };
        return desc;
    }

    String::new()
}

fn extract_frontmatter_field(content: &str, field: &str) -> Option<String> {
    // 简单解析 YAML frontmatter
    let lines: Vec<&str> = content.lines().collect();
    if lines.len() < 3 || lines[0].trim() != "---" {
        return None;
    }

    let prefix = format!("{}:", field);
    for line in &lines[1..] {
        if line.trim() == "---" {
            break;
        }
        if line.trim().starts_with(&prefix) {
            let value = line.trim().strip_prefix(&prefix)?.trim();
            // 去掉引号
            let value = value.trim_matches('"').trim_matches('\'');
            return Some(value.to_string());
        }
    }

    None
}

// 读取 Hooks 配置（从 ~/.claude/settings.json）
pub fn get_hooks() -> Result<Vec<HookInfo>, Box<dyn std::error::Error>> {
    let settings_path = get_claude_dir()?.join("settings.json");
    if !settings_path.exists() {
        return Ok(vec![]);
    }

    let content = fs::read_to_string(&settings_path)?;
    let json: serde_json::Value = serde_json::from_str(&content)?;

    let mut hooks = vec![];
    if let Some(hooks_obj) = json.get("hooks").and_then(|v| v.as_object()) {
        for (event, commands) in hooks_obj {
            if let Some(cmd_arr) = commands.as_array() {
                for cmd in cmd_arr {
                    if let Some(command) = cmd.get("command").and_then(|v| v.as_str()) {
                        hooks.push(HookInfo {
                            event: event.clone(),
                            command: command.to_string(),
                        });
                    } else if let Some(command) = cmd.get("cmd").and_then(|v| v.as_str()) {
                        hooks.push(HookInfo {
                            event: event.clone(),
                            command: command.to_string(),
                        });
                    }
                }
            }
        }
    }

    Ok(hooks)
}
