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

// 设置 Claude Code hooks，自动配置通知脚本
pub fn setup_claude_hooks(hook_script_path: &str) -> Result<(), String> {
    let settings_path = get_claude_dir()
        .map_err(|e| format!("无法获取 Claude 配置目录: {}", e))?
        .join("settings.json");

    // 读取现有配置或创建空配置
    let mut settings: serde_json::Value = if settings_path.exists() {
        let content = fs::read_to_string(&settings_path)
            .map_err(|e| format!("无法读取 settings.json: {}", e))?;
        serde_json::from_str(&content)
            .map_err(|e| format!("无法解析 settings.json: {}", e))?
    } else {
        serde_json::json!({})
    };

    // 构建 hook 命令（跨平台）
    let hook_cmd = if cfg!(target_os = "windows") {
        format!("powershell -NoLogo -NoProfile -ExecutionPolicy Bypass -File \"{}\"", hook_script_path)
    } else {
        format!("bash \"{}\"", hook_script_path)
    };

    // Notification hooks：Claude 需要用户操作时触发（权限确认、对话框）
    let notification_hooks = serde_json::json!([
        {
            "matcher": "permission_prompt|elicitation_dialog",
            "hooks": [
                {
                    "type": "command",
                    "command": hook_cmd
                }
            ]
        }
    ]);

    // Stop hooks：Claude 每次完成回答（生成停止）时触发
    let stop_hooks = serde_json::json!([
        {
            "hooks": [
                {
                    "type": "command",
                    "command": hook_cmd
                }
            ]
        }
    ]);

    // 合并到现有 hooks 配置中（保留用户已有的其他 hook）
    if let Some(hooks) = settings.get_mut("hooks") {
        hooks["Notification"] = notification_hooks;
        hooks["Stop"] = stop_hooks;
    } else {
        settings["hooks"] = serde_json::json!({
            "Notification": notification_hooks,
            "Stop": stop_hooks
        });
    }

    // 写入配置文件
    let pretty = serde_json::to_string_pretty(&settings)
        .map_err(|e| format!("无法序列化配置: {}", e))?;
    fs::write(&settings_path, pretty)
        .map_err(|e| format!("无法写入 settings.json: {}", e))?;

    Ok(())
}

// 从指定事件（Notification/Stop）的 hooks 中提取 notify 脚本命令
fn find_notify_command(json: &serde_json::Value, event: &str) -> Option<String> {
    let entries = json.get("hooks")?.get(event)?.as_array()?;
    for entry in entries {
        if let Some(hooks) = entry.get("hooks").and_then(|h| h.as_array()) {
            for hook in hooks {
                if let Some(cmd) = hook.get("command").and_then(|c| c.as_str()) {
                    if cmd.contains("notify.ps1") || cmd.contains("notify.sh") {
                        return Some(cmd.to_string());
                    }
                }
            }
        }
    }
    None
}

// 获取 Claude Code hooks 配置的脚本路径
// Notification 和 Stop 两个 hook 必须都指向 notify 脚本，缺任何一个都视为未配置
pub fn get_hook_script_path() -> Result<String, String> {
    let settings_path = get_claude_dir()
        .map_err(|e| format!("无法获取 Claude 配置目录: {}", e))?
        .join("settings.json");

    if !settings_path.exists() {
        return Err("settings.json 不存在".to_string());
    }

    let content = fs::read_to_string(&settings_path)
        .map_err(|e| format!("无法读取 settings.json: {}", e))?;
    let json: serde_json::Value = serde_json::from_str(&content)
        .map_err(|e| format!("无法解析 settings.json: {}", e))?;

    // Stop hook 缺失会导致回答完成无提醒，必须同时配置
    if find_notify_command(&json, "Stop").is_none() {
        return Err("未找到 Stop 通知 hook 配置".to_string());
    }

    // 返回 Notification hook 的命令（两个 hook 使用同一脚本）
    find_notify_command(&json, "Notification")
        .ok_or_else(|| "未找到 Notification 通知 hook 配置".to_string())
}
