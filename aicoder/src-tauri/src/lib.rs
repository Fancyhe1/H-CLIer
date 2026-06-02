mod session;
mod pty;
mod cli;
mod config;
mod checkpoint;
mod license;
mod history;
mod token_usage;
mod claude_config;
mod web_server;
mod tunnel;

use session::{Session, SessionManager};
use pty::PtyManager;
use config::{AppConfig, ConfigManager, ClaudeConfig, GeneralConfig};
use checkpoint::{Checkpoint, CheckpointDiff, CheckpointManager};
use std::sync::{Arc, Mutex};
use tauri::{Emitter, Manager};
use serde::{Deserialize, Serialize};

// Windows 平台隐藏终端窗口
#[cfg(target_os = "windows")]
use std::os::windows::process::CommandExt;

// 更新相关结构体
#[derive(Debug, Serialize, Deserialize)]
pub struct UpdateInfo {
    pub version: String,
    pub download_url: String,
    pub body: String,
    pub published_at: String,
    pub file_size: u64,
}

#[derive(Debug, Deserialize)]
struct GitHubRelease {
    tag_name: String,
    body: Option<String>,
    published_at: String,
    assets: Vec<GitHubAsset>,
}

#[derive(Debug, Deserialize)]
struct GitHubAsset {
    name: String,
    browser_download_url: String,
    size: u64,
}

pub struct AppState {
    pub session_manager: Mutex<SessionManager>,
    pub pty_manager: Mutex<PtyManager>,
    pub config_manager: Mutex<ConfigManager>,
    pub checkpoint_manager: Mutex<CheckpointManager>,
    pub license_manager: Mutex<license::LicenseManager>,
    pub tunnel_manager: tunnel::TunnelManager,
    pub web_access_token: Mutex<String>,
}

/// Arc 包装的 AppState，供 Tauri 和 Web Server 共享
pub type SharedAppState = Arc<AppState>;

// 会话管理命令
#[tauri::command]
fn reorder_sessions(
    state: tauri::State<SharedAppState>,
    session_ids: Vec<String>,
) -> Result<(), String> {
    let manager = state.session_manager.lock().map_err(|e| e.to_string())?;
    manager.reorder_sessions(&session_ids)
        .map_err(|e| e.to_string())
}

#[tauri::command]
fn create_session(
    state: tauri::State<SharedAppState>,
    project_path: String,
    title: Option<String>,
    session_type: Option<String>,
) -> Result<Session, String> {
    let manager = state.session_manager.lock().map_err(|e| e.to_string())?;
    manager.create_session(&project_path, title.as_deref(), session_type.as_deref())
        .map_err(|e| e.to_string())
}

#[tauri::command]
fn get_sessions(state: tauri::State<SharedAppState>) -> Result<Vec<Session>, String> {
    let manager = state.session_manager.lock().map_err(|e| e.to_string())?;
    manager.get_sessions()
        .map_err(|e| e.to_string())
}

#[tauri::command]
fn update_session(
    state: tauri::State<SharedAppState>,
    session: Session,
) -> Result<(), String> {
    let manager = state.session_manager.lock().map_err(|e| e.to_string())?;
    manager.update_session(&session)
        .map_err(|e| e.to_string())
}

#[tauri::command]
fn delete_session(
    state: tauri::State<SharedAppState>,
    session_id: String,
) -> Result<(), String> {
    let manager = state.session_manager.lock().map_err(|e| e.to_string())?;
    manager.delete_session(&session_id)
        .map_err(|e| e.to_string())
}

#[tauri::command]
fn move_to_trash(
    state: tauri::State<SharedAppState>,
    session_id: String,
) -> Result<(), String> {
    let manager = state.session_manager.lock().map_err(|e| e.to_string())?;
    manager.move_to_trash(&session_id)
        .map_err(|e| e.to_string())
}

// 回收站相关命令
#[tauri::command]
fn get_trash_sessions(state: tauri::State<SharedAppState>) -> Result<Vec<Session>, String> {
    let manager = state.session_manager.lock().map_err(|e| e.to_string())?;
    manager.get_trash_sessions()
        .map_err(|e| e.to_string())
}

#[tauri::command]
fn restore_from_trash(
    state: tauri::State<SharedAppState>,
    session_id: String,
) -> Result<(), String> {
    let manager = state.session_manager.lock().map_err(|e| e.to_string())?;
    manager.restore_from_trash(&session_id)
        .map_err(|e| e.to_string())
}

#[tauri::command]
fn permanently_delete(
    state: tauri::State<SharedAppState>,
    session_id: String,
) -> Result<(), String> {
    let manager = state.session_manager.lock().map_err(|e| e.to_string())?;
    manager.permanently_delete(&session_id)
        .map_err(|e| e.to_string())
}

#[tauri::command]
fn empty_trash(state: tauri::State<SharedAppState>) -> Result<usize, String> {
    let manager = state.session_manager.lock().map_err(|e| e.to_string())?;
    manager.empty_trash()
        .map_err(|e| e.to_string())
}

// 检查 Claude 会话是否存在
#[tauri::command]
fn check_claude_session_exists(session_id: String, project_path: String) -> Result<bool, String> {
    let session_file = history::get_session_jsonl_path(&session_id, &project_path)?;
    Ok(session_file.exists())
}

// 读取会话历史（从 Claude Code 的 session JSONL 文件）
#[tauri::command]
fn read_session_history(
    session_id: String,
    project_path: String,
) -> Result<Vec<history::ChatMessage>, String> {
    history::read_session_history(&session_id, &project_path)
}

// 获取会话 token 用量（增量扫描 JSONL 文件，按日期分组）
#[tauri::command]
fn get_session_token_usage(
    session_id: String,
    project_path: String,
    last_offset: u64,
) -> Result<token_usage::SessionUsageResult, String> {
    token_usage::scan_session_usage(&session_id, &project_path, last_offset)
}

// 获取单个会话的 token 总量（全量扫描）
#[tauri::command]
fn get_session_total_usage(
    session_id: String,
    project_path: String,
) -> Result<token_usage::SessionTotalUsage, String> {
    token_usage::get_session_total_usage(&session_id, &project_path)
}

// PTY终端命令
#[tauri::command]
fn create_pty(
    state: tauri::State<SharedAppState>,
    app_handle: tauri::AppHandle,
    session_id: String,
    cols: u16,
    rows: u16,
) -> Result<String, String> {
    let mut manager = state.pty_manager.lock().map_err(|e| e.to_string())?;
    manager.create_pty(session_id.clone(), cols, rows, &app_handle)
        .map_err(|e| e.to_string())
}

#[tauri::command]
fn read_terminal_history(
    state: tauri::State<SharedAppState>,
    session_id: String,
) -> Result<String, String> {
    let manager = state.pty_manager.lock().map_err(|e| e.to_string())?;
    manager.read_history(&session_id)
        .map_err(|e| e.to_string())
}

#[tauri::command]
fn was_running_claude(
    state: tauri::State<SharedAppState>,
    session_id: String,
) -> Result<bool, String> {
    let manager = state.pty_manager.lock().map_err(|e| e.to_string())?;
    manager.was_running_claude(&session_id)
        .map_err(|e| e.to_string())
}

#[tauri::command]
fn write_terminal_history(
    state: tauri::State<SharedAppState>,
    session_id: String,
    content: String,
) -> Result<(), String> {
    let manager = state.pty_manager.lock().map_err(|e| e.to_string())?;
    manager.write_history(&session_id, &content)
        .map_err(|e| e.to_string())
}

#[tauri::command]
fn write_to_pty(
    state: tauri::State<SharedAppState>,
    pty_id: String,
    data: String,
) -> Result<(), String> {
    let mut manager = state.pty_manager.lock().map_err(|e| e.to_string())?;
    manager.write(&pty_id, data.as_bytes())
        .map_err(|e| e.to_string())
}

#[tauri::command]
fn resize_pty(
    state: tauri::State<SharedAppState>,
    pty_id: String,
    cols: u16,
    rows: u16,
) -> Result<(), String> {
    let mut manager = state.pty_manager.lock().map_err(|e| e.to_string())?;
    manager.resize(&pty_id, cols, rows)
        .map_err(|e| e.to_string())
}

#[tauri::command]
fn close_pty(
    state: tauri::State<SharedAppState>,
    pty_id: String,
) -> Result<(), String> {
    let mut manager = state.pty_manager.lock().map_err(|e| e.to_string())?;
    manager.close(&pty_id)
        .map_err(|e| e.to_string())
}

#[tauri::command]
fn spawn_command_in_pty(
    state: tauri::State<SharedAppState>,
    pty_id: String,
    command: String,
    args: Vec<String>,
    cwd: String,
) -> Result<(), String> {
    let mut manager = state.pty_manager.lock().map_err(|e| e.to_string())?;
    let args_ref: Vec<&str> = args.iter().map(|s| s.as_str()).collect();
    manager.spawn_command(&pty_id, &command, &args_ref, &cwd)
        .map_err(|e| e.to_string())
}

// 文件对话框命令
#[tauri::command]
async fn select_folder(app: tauri::AppHandle) -> Result<Option<String>, String> {
    use tauri_plugin_dialog::DialogExt;

    let result = app.dialog().file().blocking_pick_folder();

    Ok(result.map(|p| p.to_string()))
}

// 保存文件对话框
#[tauri::command]
async fn save_file_dialog(
    app: tauri::AppHandle,
    default_path: Option<String>,
    filters: Option<Vec<(String, Vec<String>)>>,
) -> Result<Option<String>, String> {
    use tauri_plugin_dialog::DialogExt;

    let mut dialog = app.dialog().file();

    if let Some(path) = default_path {
        dialog = dialog.set_file_name(path);
    }

    if let Some(filter_list) = filters {
        for (name, extensions) in filter_list {
            let ext_refs: Vec<&str> = extensions.iter().map(|s| s.as_str()).collect();
            dialog = dialog.add_filter(name, &ext_refs);
        }
    }

    let result = dialog.blocking_save_file();

    Ok(result.map(|p| p.to_string()))
}

// 写入文件
#[tauri::command]
async fn write_text_file(path: String, content: String) -> Result<(), String> {
    use std::fs;
    use std::path::Path;

    let file_path = Path::new(&path);

    // 确保父目录存在
    if let Some(parent) = file_path.parent() {
        if !parent.exists() {
            fs::create_dir_all(parent).map_err(|e| e.to_string())?;
        }
    }

    fs::write(file_path, content).map_err(|e| e.to_string())
}

// 通过 VS Code 打开项目
#[tauri::command]
async fn open_in_vscode(project_path: String) -> Result<(), String> {
    use std::process::Command;

    Command::new("code")
        .arg(&project_path)
        .creation_flags(0x08000000)
        .spawn()
        .map_err(|e| format!("无法启动 VS Code: {}。请确保已安装 VS Code 并添加到 PATH。", e))?;

    Ok(())
}

// 在资源管理器中打开
#[tauri::command]
async fn open_in_explorer(project_path: String) -> Result<(), String> {
    use std::process::Command;

    if project_path.is_empty() {
        return Err("路径不能为空".to_string());
    }

    let path = std::path::Path::new(&project_path);

    // 如果是文件，打开其父目录
    let target = if path.is_file() {
        path.parent()
            .map(|p| p.to_string_lossy().to_string())
            .unwrap_or(project_path.clone())
    } else {
        project_path.clone()
    };

    // 使用 CREATE_NO_WINDOW 标志隐藏终端窗口
    Command::new("cmd")
        .args(["/C", "start", "", &target])
        .creation_flags(0x08000000) // CREATE_NO_WINDOW
        .spawn()
        .map_err(|e| format!("无法打开资源管理器: {}", e))?;

    Ok(())
}

// 通过 IDEA 打开项目
#[tauri::command]
async fn open_in_idea(project_path: String) -> Result<(), String> {
    use std::process::Command;

    // 尝试常见的 IDEA 启动命令
    let idea_commands = ["idea64", "idea"];

    for cmd in &idea_commands {
        if Command::new(cmd).arg(&project_path).creation_flags(0x08000000).spawn().is_ok() {
            return Ok(());
        }
    }

    Err("无法启动 IntelliJ IDEA。请确保已安装 IDEA 并添加到 PATH。".to_string())
}

// 选择文件对话框（用于导入）
#[tauri::command]
async fn select_file(
    app: tauri::AppHandle,
    filters: Option<Vec<(String, Vec<String>)>>,
) -> Result<Option<String>, String> {
    use tauri_plugin_dialog::DialogExt;

    let mut dialog = app.dialog().file();

    if let Some(filter_list) = filters {
        for (name, extensions) in filter_list {
            let ext_refs: Vec<&str> = extensions.iter().map(|s| s.as_str()).collect();
            dialog = dialog.add_filter(name, &ext_refs);
        }
    }

    let result = dialog.blocking_pick_file();

    Ok(result.map(|p| p.to_string()))
}

// 读取文本文件
#[tauri::command]
async fn read_text_file(path: String) -> Result<String, String> {
    use std::fs;

    fs::read_to_string(&path).map_err(|e| format!("读取文件失败: {}", e))
}

// 文件浏览器：读取目录内容
#[derive(serde::Serialize)]
pub struct FileEntry {
    pub name: String,
    pub path: String,
    pub is_dir: bool,
    pub size: u64,
    pub modified: Option<u64>,
}

#[tauri::command]
async fn read_directory(path: String) -> Result<Vec<FileEntry>, String> {
    use std::fs;
    use std::time::UNIX_EPOCH;

    let entries = fs::read_dir(&path).map_err(|e| format!("读取目录失败: {}", e))?;

    let mut result: Vec<FileEntry> = Vec::new();

    for entry in entries {
        let entry = entry.map_err(|e| e.to_string())?;
        let metadata = entry.metadata().map_err(|e| e.to_string())?;
        let modified = metadata.modified().ok()
            .and_then(|t| t.duration_since(UNIX_EPOCH).ok())
            .map(|d| d.as_secs());

        result.push(FileEntry {
            name: entry.file_name().to_string_lossy().to_string(),
            path: entry.path().to_string_lossy().to_string(),
            is_dir: metadata.is_dir(),
            size: metadata.len(),
            modified,
        });
    }

    // 按文件夹优先，再按名称排序
    result.sort_by(|a, b| {
        match (a.is_dir, b.is_dir) {
            (true, false) => std::cmp::Ordering::Less,
            (false, true) => std::cmp::Ordering::Greater,
            _ => a.name.to_lowercase().cmp(&b.name.to_lowercase()),
        }
    });

    Ok(result)
}

// 在系统默认应用中打开文件
#[tauri::command]
async fn open_file_in_system(path: String) -> Result<(), String> {
    use std::process::Command;

    Command::new("cmd")
        .args(["/C", "start", "", &path])
        .creation_flags(0x08000000)
        .spawn()
        .map_err(|e| format!("无法打开文件: {}", e))?;

    Ok(())
}

// 删除指定项目路径下的所有会话
#[tauri::command]
fn delete_sessions_by_path(
    state: tauri::State<SharedAppState>,
    project_path: String,
) -> Result<usize, String> {
    let manager = state.session_manager.lock().map_err(|e| e.to_string())?;
    manager.delete_sessions_by_path(&project_path)
        .map_err(|e| e.to_string())
}

// CLI工具命令
#[tauri::command]
fn check_claude_installation() -> Result<bool, String> {
    cli::check_claude().map_err(|e| e.to_string())
}

// 配置管理命令
#[tauri::command]
fn get_config(state: tauri::State<SharedAppState>) -> Result<AppConfig, String> {
    let manager = state.config_manager.lock().map_err(|e| e.to_string())?;
    manager.load().map_err(|e| e.to_string())
}

#[tauri::command]
fn save_config(
    state: tauri::State<SharedAppState>,
    config: AppConfig,
) -> Result<(), String> {
    let manager = state.config_manager.lock().map_err(|e| e.to_string())?;
    manager.save(&config).map_err(|e| e.to_string())
}

#[tauri::command]
fn update_claude_config(
    state: tauri::State<SharedAppState>,
    config: ClaudeConfig,
) -> Result<(), String> {
    let manager = state.config_manager.lock().map_err(|e| e.to_string())?;
    manager.update_claude_config(config).map_err(|e| e.to_string())
}

#[tauri::command]
fn update_general_config(
    state: tauri::State<SharedAppState>,
    config: GeneralConfig,
) -> Result<(), String> {
    let manager = state.config_manager.lock().map_err(|e| e.to_string())?;
    manager.update_general_config(config).map_err(|e| e.to_string())
}

#[tauri::command]
fn spawn_claude(
    _state: tauri::State<SharedAppState>,
    _pty_id: String,
    _project_path: String,
) -> Result<(), String> {
    // TODO: 实现实际的Claude启动逻辑
    Ok(())
}

#[tauri::command]
fn get_claude_version() -> Result<String, String> {
    cli::get_claude_version().map_err(|e| e.to_string())
}

#[tauri::command]
fn get_claude_versions() -> Result<Vec<String>, String> {
    cli::get_claude_versions().map_err(|e| e.to_string())
}

#[tauri::command]
fn get_claude_mcp_servers() -> Result<Vec<claude_config::McpServerInfo>, String> {
    claude_config::get_mcp_servers().map_err(|e| e.to_string())
}

#[tauri::command]
fn get_claude_skills() -> Result<Vec<claude_config::SkillInfo>, String> {
    claude_config::get_skills().map_err(|e| e.to_string())
}

#[tauri::command]
fn get_claude_hooks() -> Result<Vec<claude_config::HookInfo>, String> {
    claude_config::get_hooks().map_err(|e| e.to_string())
}

#[tauri::command]
fn get_app_version() -> String {
    // 优先从环境变量读取（CI/CD 构建时注入），否则从 Cargo.toml 读取
    let version = option_env!("APP_VERSION")
        .unwrap_or(env!("CARGO_PKG_VERSION"));
    // 去掉可能的 v 前缀
    version.trim_start_matches('v').to_string()
}

// 版本比较函数：返回 true 如果 remote_version > current_version
fn is_newer_version(current: &str, remote: &str) -> bool {
    let parse_version = |v: &str| -> Vec<u32> {
        v.trim_start_matches('v')
            .split('.')
            .filter_map(|s| s.parse().ok())
            .collect()
    };

    let current_parts = parse_version(current);
    let remote_parts = parse_version(remote);

    for i in 0..std::cmp::max(current_parts.len(), remote_parts.len()) {
        let c = current_parts.get(i).copied().unwrap_or(0);
        let r = remote_parts.get(i).copied().unwrap_or(0);
        if r > c {
            return true;
        } else if r < c {
            return false;
        }
    }
    false
}

#[tauri::command]
async fn check_github_update() -> Result<UpdateInfo, String> {
    let client = reqwest::Client::new();
    let response = client
        .get("https://api.github.com/repos/Fancyhe1/H-CLIer/releases/latest")
        .header("Accept", "application/vnd.github.v3+json")
        .header("User-Agent", "H-CLIer-App")
        .send()
        .await
        .map_err(|e| format!("网络请求失败: {}", e))?;

    if !response.status().is_success() {
        let status = response.status();
        return Err(format!("GitHub API 请求失败: HTTP {}", status));
    }

    let release: GitHubRelease = response
        .json()
        .await
        .map_err(|e| format!("解析响应失败: {}", e))?;

    let current_version = get_app_version();

    if !is_newer_version(&current_version, &release.tag_name) {
        return Err("当前已是最新版本".to_string());
    }

    // 查找 Windows 安装包（.exe 文件）
    let installer = release.assets.iter()
        .find(|a| a.name.ends_with(".exe") && !a.name.ends_with(".sig"))
        .ok_or("未找到安装包")?;

    Ok(UpdateInfo {
        version: release.tag_name.trim_start_matches('v').to_string(),
        download_url: installer.browser_download_url.clone(),
        body: release.body.unwrap_or_default(),
        published_at: release.published_at,
        file_size: installer.size,
    })
}

#[tauri::command]
async fn download_update(url: String, app_handle: tauri::AppHandle) -> Result<String, String> {
    let temp_dir = app_handle.path().temp_dir()
        .map_err(|e| format!("获取临时目录失败: {}", e))?;

    let file_name = url.split('/').last().unwrap_or("update.exe");
    let file_path = temp_dir.join(file_name);

    let client = reqwest::Client::new();
    let response = client
        .get(&url)
        .header("User-Agent", "H-CLIer-App")
        .send()
        .await
        .map_err(|e| format!("下载失败: {}", e))?;

    if !response.status().is_success() {
        return Err(format!("下载失败: HTTP {}", response.status()));
    }

    let bytes = response.bytes().await
        .map_err(|e| format!("读取下载内容失败: {}", e))?;

    std::fs::write(&file_path, &bytes)
        .map_err(|e| format!("保存文件失败: {}", e))?;

    Ok(file_path.to_string_lossy().to_string())
}

#[tauri::command]
async fn install_update(file_path: String) -> Result<(), String> {
    #[cfg(target_os = "windows")]
    {
        use std::process::Command;
        Command::new("cmd")
            .args(["/C", "start", "", &file_path, "/S"])
            .spawn()
            .map_err(|e| format!("启动安装程序失败: {}", e))?;

        // 退出当前应用
        std::process::exit(0);
    }

    #[cfg(not(target_os = "windows"))]
    {
        Err("当前平台暂不支持自动安装".to_string())
    }
}

// License 管理命令
#[tauri::command]
fn activate_license(
    state: tauri::State<SharedAppState>,
    code: String,
) -> Result<license::LicenseState, String> {
    let manager = state.license_manager.lock().map_err(|e| e.to_string())?;
    manager.activate(&code)
}

#[tauri::command]
fn get_license_status(
    state: tauri::State<SharedAppState>,
) -> Result<license::LicenseStatus, String> {
    let manager = state.license_manager.lock().map_err(|e| e.to_string())?;
    manager.get_status()
}

#[tauri::command]
fn get_machine_id(
    state: tauri::State<SharedAppState>,
) -> Result<String, String> {
    let manager = state.license_manager.lock().map_err(|e| e.to_string())?;
    Ok(manager.get_machine_id())
}

// 检查点管理命令
#[tauri::command]
fn create_checkpoint(
    state: tauri::State<SharedAppState>,
    session_id: String,
    project_path: String,
    name: String,
    description: Option<String>,
) -> Result<Checkpoint, String> {
    let manager = state.checkpoint_manager.lock().map_err(|e| e.to_string())?;
    manager.create_checkpoint(&session_id, &project_path, &name, description.as_deref())
}

#[tauri::command]
fn list_checkpoints(
    state: tauri::State<SharedAppState>,
    session_id: String,
) -> Result<Vec<Checkpoint>, String> {
    let manager = state.checkpoint_manager.lock().map_err(|e| e.to_string())?;
    manager.list_checkpoints(&session_id)
}

#[tauri::command]
fn restore_checkpoint(
    state: tauri::State<SharedAppState>,
    session_id: String,
    checkpoint_id: String,
    project_path: String,
) -> Result<CheckpointDiff, String> {
    let manager = state.checkpoint_manager.lock().map_err(|e| e.to_string())?;
    manager.restore_checkpoint(&session_id, &checkpoint_id, &project_path)
}

#[tauri::command]
fn delete_checkpoint(
    state: tauri::State<SharedAppState>,
    session_id: String,
    checkpoint_id: String,
) -> Result<(), String> {
    let manager = state.checkpoint_manager.lock().map_err(|e| e.to_string())?;
    manager.delete_checkpoint(&session_id, &checkpoint_id)
}

#[tauri::command]
fn get_checkpoint_diff(
    state: tauri::State<SharedAppState>,
    session_id: String,
    checkpoint_id: String,
    project_path: String,
) -> Result<Vec<CheckpointDiff>, String> {
    let manager = state.checkpoint_manager.lock().map_err(|e| e.to_string())?;
    manager.get_checkpoint_diff(&session_id, &checkpoint_id, &project_path)
}

// 获取 Web 访问令牌
#[tauri::command]
fn get_web_access_token(state: tauri::State<SharedAppState>) -> Result<String, String> {
    let token = state.web_access_token.lock().map_err(|e| e.to_string())?;
    Ok(token.clone())
}

// 通知桌面端切换到指定会话（从网页端调用）
#[tauri::command]
fn activate_session_on_desktop_ui(app: tauri::AppHandle, session_id: String) -> Result<(), String> {
    app.emit("web-activate-session", &session_id).map_err(|e| e.to_string())
}

// 隧道控制命令
#[tauri::command]
async fn start_tunnel(
    state: tauri::State<'_, SharedAppState>,
    authtoken: String,
) -> Result<String, String> {
    state.tunnel_manager.start(authtoken, 9527).await
}

#[tauri::command]
async fn stop_tunnel(
    state: tauri::State<'_, SharedAppState>,
) -> Result<(), String> {
    state.tunnel_manager.stop().await;
    Ok(())
}

#[tauri::command]
async fn get_tunnel_status(
    state: tauri::State<'_, SharedAppState>,
) -> Result<tunnel::TunnelStatus, String> {
    Ok(state.tunnel_manager.status().await)
}

// 主函数
#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_clipboard_manager::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .setup(|app| {
            // 初始化数据库
            let app_handle = app.handle();
            let app_dir = app_handle.path().app_data_dir()
                .expect("Failed to get app data dir");
            std::fs::create_dir_all(&app_dir).ok();

            let db_path = app_dir.join("sessions.db");
            let session_manager = SessionManager::new(&db_path)
                .expect("Failed to create session manager");

            // 初始化PTY管理器（传入日志目录）
            let log_dir = app_dir.join("terminal_logs");
            let pty_manager = PtyManager::new(&log_dir);

            // 清理旧日志
            let _ = pty_manager.cleanup_old_logs();

            // 初始化配置管理器
            let config_dir = app_dir.join("config");
            let config_manager = ConfigManager::new(&config_dir)
                .expect("Failed to create config manager");

            // 初始化检查点管理器
            let checkpoint_manager = CheckpointManager::new(&app_dir);

            // 初始化 License 管理器
            let license_manager = license::LicenseManager::new(&db_path, &app_dir)
                .expect("Failed to create license manager");

            // 生成 Web Server 访问令牌
            let access_token = web_server::generate_token();
            let web_config = web_server::WebServerConfig {
                access_token: access_token.clone(),
                ..Default::default()
            };

            let app_state = Arc::new(AppState {
                session_manager: Mutex::new(session_manager),
                pty_manager: Mutex::new(pty_manager),
                config_manager: Mutex::new(config_manager),
                checkpoint_manager: Mutex::new(checkpoint_manager),
                license_manager: Mutex::new(license_manager),
                tunnel_manager: tunnel::TunnelManager::new(),
                web_access_token: Mutex::new(access_token),
            });

            // 启动 Web Server（远程访问，在独立线程中运行）
            let web_state = Arc::clone(&app_state);
            let web_app_handle = app.handle().clone();
            std::thread::spawn(move || {
                let rt = tokio::runtime::Runtime::new().expect("Failed to create tokio runtime");
                rt.block_on(async move {
                    if let Err(e) = web_server::start_web_server(web_state, web_config, web_app_handle).await {
                        eprintln!("Web server error: {}", e);
                    }
                });
            });

            app.manage(app_state);

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            // 会话管理
            reorder_sessions,
            create_session,
            get_sessions,
            update_session,
            delete_session,
            move_to_trash,
            delete_sessions_by_path,
            // 回收站
            get_trash_sessions,
            restore_from_trash,
            permanently_delete,
            empty_trash,
            // Claude 会话检查
            check_claude_session_exists,
            read_session_history,
            get_session_token_usage,
            get_session_total_usage,
            // 文件对话框
            select_folder,
            select_file,
            save_file_dialog,
            write_text_file,
            read_text_file,
            open_in_vscode,
            open_in_explorer,
            open_in_idea,
            open_file_in_system,
            read_directory,
            // PTY终端
            create_pty,
            read_terminal_history,
            was_running_claude,
            write_terminal_history,
            write_to_pty,
            resize_pty,
            close_pty,
            spawn_command_in_pty,
            // CLI工具
            check_claude_installation,
            spawn_claude,
            get_claude_version,
            get_claude_versions,
            get_claude_mcp_servers,
            get_claude_skills,
            get_claude_hooks,
            get_app_version,
            check_github_update,
            download_update,
            install_update,
            // 配置管理
            get_config,
            save_config,
            update_claude_config,
            update_general_config,
            // 检查点管理
            create_checkpoint,
            list_checkpoints,
            restore_checkpoint,
            delete_checkpoint,
            get_checkpoint_diff,
            // License 管理
            activate_license,
            get_license_status,
            get_machine_id,
            // 隧道控制
            start_tunnel,
            stop_tunnel,
            get_tunnel_status,
            get_web_access_token,
            activate_session_on_desktop_ui,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
