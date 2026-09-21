use serde::{Deserialize, Serialize};
use std::fs;
use std::io::{BufRead, BufReader};
use std::path::PathBuf;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ChatMessage {
    pub id: String,
    pub role: String,
    pub timestamp: String,
    pub content: Vec<ContentBlock>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ContentBlock {
    pub block_type: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub text: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub thinking: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub tool_name: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub tool_input: Option<serde_json::Value>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub tool_use_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub tool_result: Option<String>,
}

/// Encode project path using Claude Code's encoding rules:
/// : -> -, \ or / -> -, ASCII letters kept, non-ASCII chars become -
pub fn encode_project_path(project_path: &str) -> String {
    project_path
        .chars()
        .map(|c| {
            if c == ':' || c == '\\' || c == '/' {
                '-'.to_string()
            } else if c.is_ascii() {
                c.to_string()
            } else {
                '-'.to_string()
            }
        })
        .collect()
}

/// Get the path to Claude Code's session JSONL file
pub fn get_session_jsonl_path(session_id: &str, project_path: &str) -> Result<PathBuf, String> {
    let encoded = encode_project_path(project_path);
    let home = std::env::var("USERPROFILE")
        .or_else(|_| std::env::var("HOME"))
        .map_err(|e| format!("Failed to get home directory: {}", e))?;

    Ok(PathBuf::from(home)
        .join(".claude")
        .join("projects")
        .join(&encoded)
        .join(format!("{}.jsonl", session_id)))
}

/// 列出项目目录下所有 Claude 会话文件的 session ID
/// 用于检测 /branch 创建的新会话
pub fn list_session_files(project_path: &str) -> Result<Vec<String>, String> {
    let encoded = encode_project_path(project_path);
    let home = std::env::var("USERPROFILE")
        .or_else(|_| std::env::var("HOME"))
        .map_err(|e| format!("Failed to get home directory: {}", e))?;

    let dir = PathBuf::from(home)
        .join(".claude")
        .join("projects")
        .join(&encoded);

    if !dir.exists() {
        return Ok(Vec::new());
    }

    let entries = fs::read_dir(&dir)
        .map_err(|e| format!("Failed to read directory: {}", e))?;

    let mut session_ids = Vec::new();
    for entry in entries.flatten() {
        let path = entry.path();
        if path.extension().map_or(false, |ext| ext == "jsonl") {
            if let Some(stem) = path.file_stem() {
                session_ids.push(stem.to_string_lossy().to_string());
            }
        }
    }
    Ok(session_ids)
}

/// Parse a single JSONL line into a ChatMessage if it's a relevant event
fn parse_line(line: &str) -> Option<ChatMessage> {
    let v: serde_json::Value = serde_json::from_str(line).ok()?;
    let event_type = v.get("type")?.as_str()?;

    match event_type {
        "assistant" => parse_assistant_message(&v),
        "user" => parse_user_message(&v),
        _ => None,
    }
}

/// Parse an assistant event containing message.content blocks
fn parse_assistant_message(v: &serde_json::Value) -> Option<ChatMessage> {
    let message = v.get("message")?;
    let content_blocks = message.get("content")?.as_array()?;

    let mut blocks = Vec::new();
    for block in content_blocks {
        let block_type = block.get("type")?.as_str()?;

        match block_type {
            "text" => {
                let text = block.get("text")?.as_str()?.to_string();
                if !text.trim().is_empty() {
                    blocks.push(ContentBlock {
                        block_type: "text".to_string(),
                        text: Some(text),
                        thinking: None,
                        tool_name: None,
                        tool_input: None,
                        tool_use_id: None,
                        tool_result: None,
                    });
                }
            }
            "thinking" => {
                let thinking = block.get("thinking")?.as_str()?.to_string();
                if !thinking.trim().is_empty() {
                    blocks.push(ContentBlock {
                        block_type: "thinking".to_string(),
                        text: None,
                        thinking: Some(thinking),
                        tool_name: None,
                        tool_input: None,
                        tool_use_id: None,
                        tool_result: None,
                    });
                }
            }
            "tool_use" => {
                let tool_name = block.get("name")?.as_str()?.to_string();
                let tool_input = block.get("input").cloned();
                let tool_use_id = block.get("id").and_then(|v| v.as_str()).map(|s| s.to_string());
                blocks.push(ContentBlock {
                    block_type: "tool_use".to_string(),
                    text: None,
                    thinking: None,
                    tool_name: Some(tool_name),
                    tool_input,
                    tool_use_id,
                    tool_result: None,
                });
            }
            _ => {}
        }
    }

    if blocks.is_empty() {
        return None;
    }

    let id = v.get("uuid").and_then(|v| v.as_str()).unwrap_or("").to_string();
    let timestamp = v.get("timestamp").and_then(|v| v.as_str()).unwrap_or("").to_string();

    Some(ChatMessage {
        id,
        role: "assistant".to_string(),
        timestamp,
        content: blocks,
    })
}

/// Parse a user event - either a plain text message or a tool_result
fn parse_user_message(v: &serde_json::Value) -> Option<ChatMessage> {
    let message = v.get("message")?;
    let content = message.get("content")?;

    let id = v.get("uuid").and_then(|v| v.as_str()).unwrap_or("").to_string();
    let timestamp = v.get("timestamp").and_then(|v| v.as_str()).unwrap_or("").to_string();

    // Content can be a string (plain user message) or an array (tool_result)
    if let Some(text) = content.as_str() {
        // Plain text user message
        if text.trim().is_empty() {
            return None;
        }
        Some(ChatMessage {
            id,
            role: "user".to_string(),
            timestamp,
            content: vec![ContentBlock {
                block_type: "text".to_string(),
                text: Some(text.to_string()),
                thinking: None,
                tool_name: None,
                tool_input: None,
                tool_use_id: None,
                tool_result: None,
            }],
        })
    } else if let Some(arr) = content.as_array() {
        // Array of content blocks (typically tool_result entries)
        let mut blocks = Vec::new();
        for block in arr {
            let block_type = block.get("type")?.as_str()?;
            if block_type == "tool_result" {
                let tool_use_id = block.get("tool_use_id").and_then(|v| v.as_str()).map(|s| s.to_string());
                let result_content = block.get("content");
                let result_text = if let Some(text) = result_content.and_then(|v| v.as_str()) {
                    text.to_string()
                } else if let Some(arr) = result_content.and_then(|v| v.as_array()) {
                    // content can be an array of content blocks
                    arr.iter()
                        .filter_map(|b| {
                            if b.get("type")?.as_str()? == "text" {
                                Some(b.get("text")?.as_str()?.to_string())
                            } else {
                                None
                            }
                        })
                        .collect::<Vec<_>>()
                        .join("\n")
                } else {
                    serde_json::to_string_pretty(result_content.unwrap_or(&serde_json::Value::Null))
                        .unwrap_or_default()
                };

                blocks.push(ContentBlock {
                    block_type: "tool_result".to_string(),
                    text: None,
                    thinking: None,
                    tool_name: None,
                    tool_input: None,
                    tool_use_id,
                    tool_result: Some(result_text),
                });
            }
        }

        if blocks.is_empty() {
            return None;
        }

        Some(ChatMessage {
            id,
            role: "user".to_string(),
            timestamp,
            content: blocks,
        })
    } else {
        None
    }
}

/// Read and parse a Claude Code session JSONL file into structured messages
pub fn read_session_history(
    session_id: &str,
    project_path: &str,
) -> Result<Vec<ChatMessage>, String> {
    let jsonl_path = get_session_jsonl_path(session_id, project_path)?;

    if !jsonl_path.exists() {
        return Ok(Vec::new());
    }

    let file = fs::File::open(&jsonl_path)
        .map_err(|e| format!("Failed to open session file: {}", e))?;
    let reader = BufReader::new(file);

    let mut messages = Vec::new();
    for line in reader.lines() {
        let line = line.map_err(|e| format!("Failed to read line: {}", e))?;
        if let Some(msg) = parse_line(&line) {
            messages.push(msg);
        }
    }

    Ok(messages)
}
