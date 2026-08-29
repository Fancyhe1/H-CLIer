//! Team 模式可视化模块
//!
//! 扫描 `~/.claude/projects/{encoded}/` 下的 subagents 目录结构，
//! 提供团队成员列表、状态推断和输出分页查询能力。
//!
//! 数据来源（Claude Code 存储结构）：
//! ```text
//! ~/.claude/projects/{encoded-project-path}/
//! ├── {sessionId}.jsonl                    # 主会话（lead）
//! ├── {sessionId}/
//! │   └── subagents/
//! │       ├── agent-{agentId}.jsonl        # teammate 完整记录
//! │       └── agent-{agentId}.meta.json    # teammate 元数据
//! ```

use serde::{Deserialize, Serialize};
use std::collections::HashSet;
use std::fs;
use std::io::{BufRead, BufReader, Seek, SeekFrom};
use std::path::{Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};

use crate::history;

// ========== 数据结构 ==========

/// 一个团队的完整信息（lead 会话 + teammates）
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TeamInfo {
    /// lead 会话 ID（subagents 父目录的目录名）
    pub team_session_id: String,
    /// 项目路径
    pub project_path: String,
    /// 所有 teammates（lead 是主会话，不在此列）
    pub agents: Vec<AgentInfo>,
    /// 团队创建时间（最早 agent 文件的修改时间）
    pub created_at: String,
    /// 主会话 JSONL 是否存在
    pub has_lead_session: bool,
}

/// 单个 teammate 的信息
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentInfo {
    /// agent 唯一 ID（来自文件名 agent-{id}.jsonl）
    pub agent_id: String,
    /// agent 类型（来自 .meta.json，如 "Explore"、"general-purpose"）
    pub agent_type: String,
    /// 任务描述（来自 .meta.json）
    pub description: String,
    /// 嵌套深度（1 = 直接由 lead 创建）
    pub spawn_depth: u32,
    /// 推断的状态
    pub status: AgentStatus,
    /// 该 agent 的 JSONL 文件路径
    pub jsonl_path: String,
    /// JSONL 文件当前大小（字节）
    pub jsonl_size: u64,
    /// 文件最后修改时间（Unix 秒）
    pub last_modified: u64,
}

/// Agent 状态（基于文件写入活动和 lead 会话完成通知推断）
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub enum AgentStatus {
    /// 文件近期有写入（正在工作）
    Running,
    /// 文件超过 5 秒无变化（空闲或等待）
    Idle,
    /// 已检测到完成通知
    Completed,
    /// 文件不存在或无法读取
    Unknown,
}

/// Agent 输出的分页查询结果
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentOutput {
    /// 解析后的条目
    pub entries: Vec<AgentEntry>,
    /// 是否还有更多
    pub has_more: bool,
    /// 文件总行数
    pub total_lines: u64,
    /// 本次已读到的行数（offset + 读取行数）
    pub lines_consumed: u64,
}

/// 单条输出记录
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentEntry {
    /// 类型：text / thinking / tool_use / tool_result / user
    pub entry_type: String,
    /// ISO 8601 时间戳
    pub timestamp: Option<String>,
    /// 内容文本
    pub content: String,
    /// 工具名（仅 tool_use）
    pub tool_name: Option<String>,
}

/// subagent 元数据（对应 .meta.json 文件）
#[derive(Debug, Deserialize)]
struct SubagentMeta {
    #[serde(default)]
    agent_type: String,
    #[serde(default)]
    description: String,
    #[serde(default)]
    spawn_depth: Option<u32>,
}

// ========== 工具函数 ==========

/// 获取 ~/.claude/projects 目录
fn claude_projects_dir() -> Result<PathBuf, String> {
    let home = std::env::var("USERPROFILE")
        .or_else(|_| std::env::var("HOME"))
        .map_err(|e| format!("Failed to get home directory: {}", e))?;
    Ok(PathBuf::from(home).join(".claude").join("projects"))
}

/// 获取文件最后修改时间（Unix 秒），失败返回 0
fn modified_epoch(path: &Path) -> u64 {
    fs::metadata(path)
        .ok()
        .and_then(|m| m.modified().ok())
        .and_then(|t| t.duration_since(UNIX_EPOCH).ok())
        .map(|d| d.as_secs())
        .unwrap_or(0)
}

/// 获取文件大小（字节），失败返回 0
fn file_size(path: &Path) -> u64 {
    fs::metadata(path).map(|m| m.len()).unwrap_or(0)
}

/// 当前 Unix 秒
fn now_epoch() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0)
}

/// 读取并解析 .meta.json 文件
fn read_meta_json(meta_path: &Path) -> Option<SubagentMeta> {
    let content = fs::read_to_string(meta_path).ok()?;
    serde_json::from_str::<SubagentMeta>(&content).ok()
}

// ========== 状态推断 ==========

/// 检测 agent 状态：
/// 1. 完成通知优先（lead 会话的 queue-operation 中已标记）
/// 2. 否则基于文件写入活动（5 秒阈值）
fn detect_status(jsonl_path: &Path, completed_ids: &HashSet<String>, agent_id: &str) -> AgentStatus {
    if completed_ids.contains(agent_id) {
        return AgentStatus::Completed;
    }
    if !jsonl_path.exists() {
        return AgentStatus::Unknown;
    }
    let now = now_epoch();
    let mtime = modified_epoch(jsonl_path);
    if now.saturating_sub(mtime) < 5 {
        AgentStatus::Running
    } else {
        AgentStatus::Idle
    }
}

/// 扫描 lead 会话末尾的 queue-operation 条目，提取已完成（收到 task-notification）的 agentId 集合
fn scan_completed_agents(lead_jsonl: &Path) -> HashSet<String> {
    let mut completed = HashSet::new();
    let file = match fs::File::open(lead_jsonl) {
        Ok(f) => f,
        Err(_) => return completed,
    };
    let size = file_size(lead_jsonl);
    if size == 0 {
        return completed;
    }

    let mut reader = BufReader::new(file);
    // 只读文件末尾 16KB（最近的完成通知都在这里）
    if size > 16 * 1024 {
        let _ = reader.seek(SeekFrom::Start(size - 16 * 1024));
    }

    for line in reader.lines().take(200) {
        let line = match line {
            Ok(l) => l,
            Err(_) => continue,
        };
        let v: serde_json::Value = match serde_json::from_str(&line) {
            Ok(v) => v,
            Err(_) => continue,
        };
        if v.get("type").and_then(|t| t.as_str()) != Some("queue-operation") {
            continue;
        }
        let content = v.get("content").and_then(|c| c.as_str()).unwrap_or("");
        if content.contains("completed") || content.contains("finished") {
            if let Some(id) = extract_agent_id(content) {
                completed.insert(id);
            }
        }
    }
    completed
}

/// 从 `<task-notification>` XML 中提取 `<task-id>` 值
fn extract_agent_id(xml: &str) -> Option<String> {
    let start = xml.find("<task-id>")?;
    let rest = &xml[start + "<task-id>".len()..];
    let end = rest.find("</task-id>")?;
    Some(rest[..end].to_string())
}

// ========== 核心命令逻辑 ==========

/// 扫描一个 subagents 目录，构建 TeamInfo
fn scan_subagents_dir(
    subagents_dir: &Path,
    lead_jsonl: &Path,
    session_id: &str,
    project_path: &str,
) -> Option<TeamInfo> {
    if !subagents_dir.exists() {
        return None;
    }

    // 已完成的 agent（从 lead 会话的完成通知提取）
    let completed_ids = scan_completed_agents(lead_jsonl);

    let mut agents = Vec::new();
    let mut earliest_modified = u64::MAX;

    if let Ok(sub_entries) = fs::read_dir(subagents_dir) {
        for sub_entry in sub_entries.flatten() {
            let sub_path = sub_entry.path();
            let fname = sub_path
                .file_name()
                .map(|n| n.to_string_lossy().to_string())
                .unwrap_or_default();

            // 只处理 agent-{id}.jsonl 文件
            if !fname.starts_with("agent-") || sub_path.extension().map_or(true, |e| e != "jsonl")
            {
                continue;
            }
            let agent_id = fname
                .trim_start_matches("agent-")
                .trim_end_matches(".jsonl")
                .to_string();
            let meta_path = subagents_dir.join(format!("agent-{}.meta.json", agent_id));

            let meta = read_meta_json(&meta_path);
            let mtime = modified_epoch(&sub_path);
            if mtime > 0 && mtime < earliest_modified {
                earliest_modified = mtime;
            }

            agents.push(AgentInfo {
                agent_id: agent_id.clone(),
                agent_type: meta
                    .as_ref()
                    .map(|m| m.agent_type.clone())
                    .filter(|s| !s.is_empty())
                    .unwrap_or_else(|| "subagent".to_string()),
                description: meta.as_ref().map(|m| m.description.clone()).unwrap_or_default(),
                spawn_depth: meta.as_ref().and_then(|m| m.spawn_depth).unwrap_or(1),
                status: detect_status(&sub_path, &completed_ids, &agent_id),
                jsonl_path: sub_path.to_string_lossy().to_string(),
                jsonl_size: file_size(&sub_path),
                last_modified: mtime,
            });
        }
    }

    // 按嵌套深度 + 创建时间排序（先创建的在前）
    agents.sort_by_key(|a| (a.spawn_depth, a.last_modified));

    Some(TeamInfo {
        team_session_id: session_id.to_string(),
        project_path: project_path.to_string(),
        agents,
        created_at: if earliest_modified == u64::MAX {
            String::new()
        } else {
            earliest_modified.to_string()
        },
        has_lead_session: lead_jsonl.exists(),
    })
}

/// 扫描指定项目的所有 team 结构
pub fn scan_teams(project_path: &str) -> Result<Vec<TeamInfo>, String> {
    let projects_dir = claude_projects_dir()?;
    let encoded = history::encode_project_path(project_path);
    let project_dir = projects_dir.join(&encoded);

    if !project_dir.exists() {
        return Ok(Vec::new());
    }

    let mut teams = Vec::new();
    let entries = fs::read_dir(&project_dir)
        .map_err(|e| format!("Failed to read project directory: {}", e))?;

    for entry in entries.flatten() {
        let path = entry.path();
        if !path.is_dir() {
            continue;
        }

        let session_id = path
            .file_name()
            .map(|n| n.to_string_lossy().to_string())
            .unwrap_or_default();
        let subagents_dir = path.join("subagents");
        let lead_jsonl = project_dir.join(format!("{}.jsonl", session_id));

        if let Some(team) = scan_subagents_dir(&subagents_dir, &lead_jsonl, &session_id, project_path)
        {
            teams.push(team);
        }
    }

    Ok(teams)
}

/// 按 cliSessionId 精确定位某个会话的 team（不扫描整个项目目录）
pub fn scan_session_team(cli_session_id: &str, project_path: &str) -> Result<TeamInfo, String> {
    let projects_dir = claude_projects_dir()?;
    let encoded = history::encode_project_path(project_path);
    let project_dir = projects_dir.join(&encoded);
    let session_dir = project_dir.join(cli_session_id);
    let subagents_dir = session_dir.join("subagents");
    let lead_jsonl = project_dir.join(format!("{}.jsonl", cli_session_id));

    scan_subagents_dir(&subagents_dir, &lead_jsonl, cli_session_id, project_path)
        .ok_or_else(|| format!("No team found for session: {}", cli_session_id))
}

/// 轻量级状态刷新：重新扫描文件元数据和状态
/// （文件本身很小，直接复用完整扫描，保持逻辑单一）
pub fn refresh_teams(project_path: &str) -> Result<Vec<TeamInfo>, String> {
    scan_teams(project_path)
}

/// 分页读取某个 agent 的 JSONL 输出
pub fn get_agent_output(jsonl_path: &str, offset: u64, limit: u64) -> Result<AgentOutput, String> {
    let path = PathBuf::from(jsonl_path);
    if !path.exists() {
        return Ok(AgentOutput {
            entries: Vec::new(),
            has_more: false,
            total_lines: 0,
            lines_consumed: 0,
        });
    }

    let total_lines = count_lines(&path)?;
    let file = fs::File::open(&path).map_err(|e| format!("Failed to open: {}", e))?;
    let reader = BufReader::new(file);
    let mut lines = reader.lines();

    // 跳过 offset 行（前端维护已读行号，增量读取）
    let mut skipped = 0u64;
    while skipped < offset {
        match lines.next() {
            Some(Ok(_)) | Some(Err(_)) => skipped += 1,
            None => break,
        }
    }

    // 读取最多 limit 行
    let mut entries = Vec::new();
    let mut read = 0u64;
    while read < limit {
        match lines.next() {
            Some(Ok(line)) => {
                read += 1;
                entries.extend(parse_agent_line(&line));
            }
            Some(Err(_)) => {
                read += 1; // 坏行跳过，但计入行号
            }
            None => break, // EOF
        }
    }

    // 判断是否还有更多
    let has_more = read >= limit && lines.next().is_some();

    Ok(AgentOutput {
        entries,
        has_more,
        total_lines,
        lines_consumed: skipped + read,
    })
}

/// 统计 JSONL 文件总行数
fn count_lines(path: &Path) -> Result<u64, String> {
    let file = fs::File::open(path).map_err(|e| format!("Failed to open: {}", e))?;
    let reader = BufReader::new(file);
    let mut count = 0u64;
    for line in reader.lines() {
        if line.is_ok() {
            count += 1;
        }
    }
    Ok(count)
}

// ========== JSONL 解析 ==========

/// 解析一行 JSONL，可能产生多条条目（一个 assistant 消息含多个 content block）
fn parse_agent_line(line: &str) -> Vec<AgentEntry> {
    let v: serde_json::Value = match serde_json::from_str(line) {
        Ok(v) => v,
        Err(_) => return Vec::new(),
    };
    let event_type = match v.get("type").and_then(|t| t.as_str()) {
        Some(t) => t,
        None => return Vec::new(),
    };
    let timestamp = v
        .get("timestamp")
        .and_then(|t| t.as_str())
        .map(|s| s.to_string());

    match event_type {
        "assistant" => parse_assistant_blocks(&v, timestamp),
        "user" => parse_user_blocks(&v, timestamp),
        _ => Vec::new(),
    }
}

/// 解析 assistant 消息的 content blocks（text / thinking / tool_use 各自成条）
fn parse_assistant_blocks(v: &serde_json::Value, timestamp: Option<String>) -> Vec<AgentEntry> {
    let content = match v
        .get("message")
        .and_then(|m| m.get("content"))
        .and_then(|c| c.as_array())
    {
        Some(arr) => arr,
        None => return Vec::new(),
    };

    let mut entries = Vec::new();
    for block in content {
        let block_type = match block.get("type").and_then(|t| t.as_str()) {
            Some(t) => t,
            None => continue,
        };
        match block_type {
            "text" => {
                if let Some(text) = block.get("text").and_then(|t| t.as_str()) {
                    if !text.trim().is_empty() {
                        entries.push(AgentEntry {
                            entry_type: "text".to_string(),
                            timestamp: timestamp.clone(),
                            content: text.to_string(),
                            tool_name: None,
                        });
                    }
                }
            }
            "thinking" => {
                if let Some(thinking) = block.get("thinking").and_then(|t| t.as_str()) {
                    if !thinking.trim().is_empty() {
                        entries.push(AgentEntry {
                            entry_type: "thinking".to_string(),
                            timestamp: timestamp.clone(),
                            content: thinking.to_string(),
                            tool_name: None,
                        });
                    }
                }
            }
            "tool_use" => {
                let name = block
                    .get("name")
                    .and_then(|n| n.as_str())
                    .unwrap_or("tool")
                    .to_string();
                let input = block.get("input").cloned().unwrap_or(serde_json::Value::Null);
                entries.push(AgentEntry {
                    entry_type: "tool_use".to_string(),
                    timestamp: timestamp.clone(),
                    content: serde_json::to_string_pretty(&input).unwrap_or_default(),
                    tool_name: Some(name),
                });
            }
            _ => {}
        }
    }
    entries
}

/// 解析 user 消息（纯文本用户消息或 tool_result 数组）
fn parse_user_blocks(v: &serde_json::Value, timestamp: Option<String>) -> Vec<AgentEntry> {
    let message = match v.get("message") {
        Some(m) => m,
        None => return Vec::new(),
    };
    let content = match message.get("content") {
        Some(c) => c,
        None => return Vec::new(),
    };

    // 纯文本用户消息
    if let Some(text) = content.as_str() {
        if text.trim().is_empty() {
            return Vec::new();
        }
        return vec![AgentEntry {
            entry_type: "user".to_string(),
            timestamp,
            content: text.to_string(),
            tool_name: None,
        }];
    }

    // tool_result 数组
    let arr = match content.as_array() {
        Some(a) => a,
        None => return Vec::new(),
    };
    let mut entries = Vec::new();
    for block in arr {
        if block.get("type").and_then(|t| t.as_str()) != Some("tool_result") {
            continue;
        }
        let result_content = block.get("content");
        let result_text = if let Some(text) = result_content.and_then(|c| c.as_str()) {
            text.to_string()
        } else if let Some(arr) = result_content.and_then(|c| c.as_array()) {
            arr.iter()
                .filter_map(|b| {
                    if b.get("type").and_then(|t| t.as_str()) == Some("text") {
                        b.get("text").and_then(|t| t.as_str()).map(|s| s.to_string())
                    } else {
                        None
                    }
                })
                .collect::<Vec<_>>()
                .join("\n")
        } else {
            serde_json::to_string_pretty(
                result_content.unwrap_or(&serde_json::Value::Null),
            )
            .unwrap_or_default()
        };

        if !result_text.trim().is_empty() {
            entries.push(AgentEntry {
                entry_type: "tool_result".to_string(),
                timestamp: timestamp.clone(),
                content: result_text,
                tool_name: None,
            });
        }
    }
    entries
}
