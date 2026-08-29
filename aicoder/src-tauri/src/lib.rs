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
mod agent_hub;
mod team;

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
    pub agent_hub_manager: Mutex<agent_hub::AgentHubManager>,
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
    cli_session_id: Option<String>,
) -> Result<Session, String> {
    let manager = state.session_manager.lock().map_err(|e| e.to_string())?;
    manager.create_session(&project_path, title.as_deref(), session_type.as_deref(), cli_session_id.as_deref())
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
fn touch_session(
    state: tauri::State<SharedAppState>,
    session_id: String,
) -> Result<(), String> {
    let manager = state.session_manager.lock().map_err(|e| e.to_string())?;
    manager.touch_session(&session_id)
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

// 归档相关命令
#[tauri::command]
fn get_archived_sessions(state: tauri::State<SharedAppState>) -> Result<Vec<Session>, String> {
    let manager = state.session_manager.lock().map_err(|e| e.to_string())?;
    manager.get_archived_sessions()
        .map_err(|e| e.to_string())
}

#[tauri::command]
fn archive_session(
    state: tauri::State<SharedAppState>,
    session_id: String,
) -> Result<(), String> {
    let manager = state.session_manager.lock().map_err(|e| e.to_string())?;
    manager.archive_session(&session_id)
        .map_err(|e| e.to_string())
}

#[tauri::command]
fn unarchive_session(
    state: tauri::State<SharedAppState>,
    session_id: String,
) -> Result<(), String> {
    let manager = state.session_manager.lock().map_err(|e| e.to_string())?;
    manager.unarchive_session(&session_id)
        .map_err(|e| e.to_string())
}

#[tauri::command]
fn archive_sessions_by_path(
    state: tauri::State<SharedAppState>,
    project_path: String,
) -> Result<usize, String> {
    let manager = state.session_manager.lock().map_err(|e| e.to_string())?;
    manager.archive_sessions_by_path(&project_path)
        .map_err(|e| e.to_string())
}

#[tauri::command]
fn unarchive_sessions_by_path(
    state: tauri::State<SharedAppState>,
    project_path: String,
) -> Result<usize, String> {
    let manager = state.session_manager.lock().map_err(|e| e.to_string())?;
    manager.unarchive_sessions_by_path(&project_path)
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

// 列出项目目录下所有 Claude 会话文件的 session ID
#[tauri::command]
fn list_session_files(project_path: String) -> Result<Vec<String>, String> {
    history::list_session_files(&project_path)
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

// 嵌入 hook 脚本到二进制文件
const HOOK_SCRIPT_PS1: &str = include_str!("../resources/hooks/notify.ps1");
const HOOK_SCRIPT_SH: &str = include_str!("../resources/hooks/notify.sh");

/// 将 hook 脚本写入配置目录，返回脚本路径
fn ensure_hook_scripts(config_dir: &std::path::Path) -> Result<String, String> {
    std::fs::create_dir_all(config_dir).map_err(|e| format!("创建配置目录失败: {}", e))?;

    if cfg!(target_os = "windows") {
        let script_path = config_dir.join("notify.ps1");
        std::fs::write(&script_path, HOOK_SCRIPT_PS1)
            .map_err(|e| format!("写入 hook 脚本失败: {}", e))?;
        Ok(script_path.to_string_lossy().to_string())
    } else {
        let script_path = config_dir.join("notify.sh");
        std::fs::write(&script_path, HOOK_SCRIPT_SH)
            .map_err(|e| format!("写入 hook 脚本失败: {}", e))?;
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            let _ = std::fs::set_permissions(&script_path, std::fs::Permissions::from_mode(0o755));
        }
        Ok(script_path.to_string_lossy().to_string())
    }
}

#[tauri::command]
fn setup_claude_hooks(app: tauri::AppHandle) -> Result<(), String> {
    let config_dir = app.path().app_config_dir()
        .map_err(|e| format!("无法获取配置目录: {}", e))?;
    let script_path = ensure_hook_scripts(&config_dir)?;
    claude_config::setup_claude_hooks(&script_path)
}

#[tauri::command]
fn is_claude_hooks_configured() -> Result<bool, String> {
    match claude_config::get_hook_script_path() {
        Ok(_) => Ok(true),
        Err(_) => Ok(false),
    }
}

#[tauri::command]
fn get_app_version() -> String {
    // 优先从环境变量读取（CI/CD 构建时注入），否则从 Cargo.toml 读取
    let version = option_env!("APP_VERSION")
        .unwrap_or(env!("CARGO_PKG_VERSION"));
    // 去掉可能的 v 前缀
    version.trim_start_matches('v').to_string()
}

/// 使用 Windows 原生 API FlashWindowEx 闪烁任务栏图标
/// flash=true: 闪烁5次后停止；flash=false: 停止闪烁
#[tauri::command]
fn flash_taskbar(window: tauri::Window, flash: bool) -> Result<(), String> {
    #[cfg(target_os = "windows")]
    {
        use windows::Win32::Foundation::HWND;
        use windows::Win32::UI::WindowsAndMessaging::{
            FlashWindowEx, FLASHWINFO, FLASHW_ALL, FLASHW_TIMER, FLASHW_STOP,
        };
        use std::mem;

        let hwnd = window.hwnd().map_err(|e| format!("获取窗口句柄失败: {}", e))?;

        let (flags, count) = if flash {
            (FLASHW_ALL | FLASHW_TIMER, 5)  // 闪烁5次
        } else {
            (FLASHW_STOP, 0)
        };
        let flash_info = FLASHWINFO {
            cbSize: mem::size_of::<FLASHWINFO>() as u32,
            hwnd: HWND(hwnd.0 as *mut _),
            dwFlags: flags,
            uCount: count,
            dwTimeout: 0,
        };
        unsafe {
            let _ = FlashWindowEx(&flash_info);
        }
        Ok(())
    }
    #[cfg(not(target_os = "windows"))]
    {
        let _ = (window, flash);
        Err("仅支持 Windows".to_string())
    }
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

// 读取 Windows 系统代理设置
#[cfg(target_os = "windows")]
fn get_windows_proxy() -> Option<String> {
    use winreg::enums::*;
    use winreg::RegKey;

    let hkcu = RegKey::predef(HKEY_CURRENT_USER);
    let internet_settings = hkcu.open_subkey_with_flags(
        "Software\\Microsoft\\Windows\\CurrentVersion\\Internet Settings",
        KEY_READ,
    ).ok()?;

    let proxy_enable: u32 = internet_settings.get_value("ProxyEnable").unwrap_or(0);
    if proxy_enable == 0 {
        return None;
    }

    let proxy_server: String = internet_settings.get_value("ProxyServer").unwrap_or_default();
    if proxy_server.is_empty() {
        return None;
    }

    // 确保有协议前缀
    if proxy_server.starts_with("http://") || proxy_server.starts_with("https://") || proxy_server.starts_with("socks") {
        Some(proxy_server)
    } else {
        Some(format!("http://{}", proxy_server))
    }
}

#[cfg(not(target_os = "windows"))]
fn get_windows_proxy() -> Option<String> {
    None
}

// 创建 HTTP 客户端，支持系统代理和超时
fn create_http_client() -> reqwest::Client {
    let mut builder = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(30))
        .redirect(reqwest::redirect::Policy::limited(5));

    // 读取系统代理环境变量
    let mut has_proxy = false;
    if let Ok(proxy) = std::env::var("HTTP_PROXY").or_else(|_| std::env::var("http_proxy")) {
        if let Ok(p) = reqwest::Proxy::http(&proxy) {
            builder = builder.proxy(p);
            has_proxy = true;
        }
    }
    if let Ok(proxy) = std::env::var("HTTPS_PROXY").or_else(|_| std::env::var("https_proxy")) {
        if let Ok(p) = reqwest::Proxy::https(&proxy) {
            builder = builder.proxy(p);
            has_proxy = true;
        }
    }
    if let Ok(proxy) = std::env::var("ALL_PROXY").or_else(|_| std::env::var("all_proxy")) {
        if let Ok(p) = reqwest::Proxy::all(&proxy) {
            builder = builder.proxy(p);
            has_proxy = true;
        }
    }

    // 如果没有环境变量，尝试读取 Windows 系统代理
    if !has_proxy {
        if let Some(proxy) = get_windows_proxy() {
            if let Ok(p) = reqwest::Proxy::all(&proxy) {
                builder = builder.proxy(p);
            }
        }
    }

    builder.build().unwrap_or_default()
}

// 细化 reqwest 错误信息
fn classify_reqwest_error(e: &reqwest::Error) -> String {
    if e.is_timeout() {
        "连接超时（30秒未响应）".to_string()
    } else if e.is_connect() {
        "连接失败：无法连接到服务器，请检查网络".to_string()
    } else if e.is_request() {
        format!("请求错误：{}", e)
    } else if let Some(status) = e.status() {
        format!("HTTP 错误：{}", status)
    } else {
        format!("网络错误：{}", e)
    }
}

#[tauri::command]
async fn check_github_update() -> Result<UpdateInfo, String> {
    let client = create_http_client();
    let response = client
        .get("https://api.github.com/repos/Fancyhe1/H-CLIer/releases/latest")
        .header("Accept", "application/vnd.github.v3+json")
        .header("User-Agent", "H-CLIer-App/1.0")
        .send()
        .await
        .map_err(|e| classify_reqwest_error(&e))?;

    if !response.status().is_success() {
        let status = response.status();
        return Err(if status.as_u16() == 403 {
            "GitHub API 请求被拒绝（403），可能请求过于频繁".to_string()
        } else if status.as_u16() == 404 {
            "GitHub API 请求失败（404），仓库可能不存在".to_string()
        } else {
            format!("GitHub API 请求失败：HTTP {}", status)
        });
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

    let client = create_http_client();

    // 重试机制，最多尝试 3 次
    let mut last_err = String::new();
    for attempt in 1..=3 {
        if attempt > 1 {
            // 等待 2 秒后重试
            tokio::time::sleep(std::time::Duration::from_secs(2)).await;
        }

        match client
            .get(&url)
            .header("User-Agent", "H-CLIer-App/1.0")
            .send()
            .await
        {
            Ok(response) => {
                let status = response.status();
                if !status.is_success() {
                    last_err = if status.as_u16() == 403 {
                        "下载失败：访问被拒绝（403），可能需要登录或链接已过期".to_string()
                    } else if status.as_u16() == 404 {
                        "下载失败：文件不存在（404），版本可能已删除".to_string()
                    } else if status.as_u16() == 429 {
                        "下载失败：请求过于频繁（429），请稍后再试".to_string()
                    } else {
                        format!("下载失败：HTTP {}", status)
                    };
                    continue;
                }

                match response.bytes().await {
                    Ok(bytes) => {
                        if bytes.is_empty() {
                            last_err = "下载失败：服务器返回空内容".to_string();
                            continue;
                        }
                        std::fs::write(&file_path, &bytes)
                            .map_err(|e| format!("保存文件失败：{}", e))?;
                        return Ok(file_path.to_string_lossy().to_string());
                    }
                    Err(e) => {
                        last_err = if e.is_body() {
                            "下载中断：连接在传输数据时断开".to_string()
                        } else {
                            format!("读取下载内容失败：{}", e)
                        };
                        continue;
                    }
                }
            }
            Err(e) => {
                last_err = classify_reqwest_error(&e);
                continue;
            }
        }
    }

    Err(format!("下载失败（已重试3次）：{}", last_err))
}

#[tauri::command]
async fn install_update(
    state: tauri::State<'_, SharedAppState>,
    file_path: String,
) -> Result<(), String> {
    #[cfg(target_os = "windows")]
    {
        use std::process::Command;
        Command::new("cmd")
            .args(["/C", "start", "", &file_path, "/S"])
            .spawn()
            .map_err(|e| format!("启动安装程序失败: {}", e))?;

        // 退出前关闭所有 PTY，避免 claude / powershell 进程残留
        if let Ok(mut manager) = state.pty_manager.lock() {
            manager.close_all();
        }

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

// 获取本机 IP 地址（带类型标签）
#[derive(serde::Serialize)]
struct LocalIpInfo {
    ip: String,
    label: String,  // "局域网" 或 "Tailscale"
}

#[tauri::command]
fn get_local_ips() -> Result<Vec<LocalIpInfo>, String> {
    let mut result = Vec::new();
    let mut seen = std::collections::HashSet::new();

    // 枚举所有网络接口
    if let Ok(interfaces) = local_ip_address::list_afinet_netifas() {
        for (_, ip) in interfaces {
            if let std::net::IpAddr::V4(v4) = ip {
                if v4.is_loopback() {
                    continue;
                }
                let ip_str = ip.to_string();
                if seen.contains(&ip_str) {
                    continue;
                }
                seen.insert(ip_str.clone());

                let octets = v4.octets();
                let label = if octets[0] == 100 {
                    "Tailscale".to_string()
                } else {
                    "局域网".to_string()
                };

                result.push(LocalIpInfo { ip: ip_str, label });
            }
        }
    }

    // 如果没找到，用 UDP 探测获取主 IP
    if result.is_empty() {
        if let Ok(socket) = std::net::UdpSocket::bind("0.0.0.0:0") {
            if socket.connect("8.8.8.8:80").is_ok() {
                if let Ok(addr) = socket.local_addr() {
                    result.push(LocalIpInfo {
                        ip: addr.ip().to_string(),
                        label: "局域网".to_string(),
                    });
                }
            }
        }
    }

    // Tailscale IP 排在前面
    result.sort_by(|a, b| {
        if a.label == "Tailscale" && b.label != "Tailscale" {
            std::cmp::Ordering::Less
        } else {
            std::cmp::Ordering::Greater
        }
    });

    Ok(result)
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

// ============================================================
// AgentHub 命令
// ============================================================

#[tauri::command]
fn agenthub_init(
    state: tauri::State<SharedAppState>,
    project_path: String,
) -> Result<(), String> {
    let mut manager = state.agent_hub_manager.lock().map_err(|e| e.to_string())?;
    manager.init(std::path::Path::new(&project_path))
}

#[tauri::command]
fn agenthub_is_initialized(
    state: tauri::State<SharedAppState>,
    project_path: String,
) -> Result<bool, String> {
    let manager = state.agent_hub_manager.lock().map_err(|e| e.to_string())?;
    Ok(manager.is_initialized(std::path::Path::new(&project_path)))
}

#[tauri::command]
fn agenthub_set_project(
    state: tauri::State<SharedAppState>,
    project_path: String,
) -> Result<(), String> {
    let mut manager = state.agent_hub_manager.lock().map_err(|e| e.to_string())?;
    manager.set_hub_path(std::path::Path::new(&project_path));
    Ok(())
}

#[tauri::command]
fn agenthub_load_tasks(
    state: tauri::State<SharedAppState>,
) -> Result<Vec<agent_hub::Task>, String> {
    let manager = state.agent_hub_manager.lock().map_err(|e| e.to_string())?;
    manager.load_tasks()
}

#[tauri::command]
fn agenthub_create_task(
    state: tauri::State<SharedAppState>,
    task: agent_hub::Task,
) -> Result<(), String> {
    let manager = state.agent_hub_manager.lock().map_err(|e| e.to_string())?;
    manager.create_task(&task)
}

#[tauri::command]
fn agenthub_update_task(
    state: tauri::State<SharedAppState>,
    id: String,
    updates: agent_hub::TaskUpdate,
) -> Result<(), String> {
    let manager = state.agent_hub_manager.lock().map_err(|e| e.to_string())?;
    manager.update_task(&id, &updates)
}

#[tauri::command]
fn agenthub_delete_task(
    state: tauri::State<SharedAppState>,
    id: String,
) -> Result<(), String> {
    let manager = state.agent_hub_manager.lock().map_err(|e| e.to_string())?;
    manager.delete_task(&id)
}

#[tauri::command]
fn agenthub_load_agent_roles(
    state: tauri::State<SharedAppState>,
) -> Result<Vec<agent_hub::AgentRole>, String> {
    let manager = state.agent_hub_manager.lock().map_err(|e| e.to_string())?;
    manager.load_agent_roles()
}

#[tauri::command]
fn agenthub_save_agent_role(
    state: tauri::State<SharedAppState>,
    role: agent_hub::AgentRole,
) -> Result<(), String> {
    let manager = state.agent_hub_manager.lock().map_err(|e| e.to_string())?;
    manager.save_agent_role(&role)
}

#[tauri::command]
fn agenthub_delete_agent_role(
    state: tauri::State<SharedAppState>,
    id: String,
) -> Result<(), String> {
    let manager = state.agent_hub_manager.lock().map_err(|e| e.to_string())?;
    manager.delete_agent_role(&id)
}

#[tauri::command]
fn agenthub_load_active_agents(
    state: tauri::State<SharedAppState>,
) -> Result<Vec<agent_hub::ActiveAgent>, String> {
    let manager = state.agent_hub_manager.lock().map_err(|e| e.to_string())?;
    manager.load_active_agents()
}

#[tauri::command]
fn agenthub_update_agent_status(
    state: tauri::State<SharedAppState>,
    agent_id: String,
    status: String,
    current_action: String,
) -> Result<(), String> {
    let manager = state.agent_hub_manager.lock().map_err(|e| e.to_string())?;
    manager.update_agent_status(&agent_id, &status, &current_action)
}

#[tauri::command]
fn agenthub_load_brain_meta(
    state: tauri::State<SharedAppState>,
) -> Result<agent_hub::BrainMeta, String> {
    let manager = state.agent_hub_manager.lock().map_err(|e| e.to_string())?;
    manager.load_brain_meta()
}

#[tauri::command]
fn agenthub_load_brain_section(
    state: tauri::State<SharedAppState>,
    section: String,
) -> Result<String, String> {
    let manager = state.agent_hub_manager.lock().map_err(|e| e.to_string())?;
    manager.load_brain_section(&section)
}

#[tauri::command]
fn agenthub_update_brain_section(
    state: tauri::State<SharedAppState>,
    section: String,
    content: String,
) -> Result<(), String> {
    let manager = state.agent_hub_manager.lock().map_err(|e| e.to_string())?;
    manager.update_brain_section(&section, &content)
}

#[tauri::command]
fn agenthub_build_context(
    state: tauri::State<SharedAppState>,
    task_id: String,
    agent_role_id: Option<String>,
    brain_sections: Option<Vec<String>>,
) -> Result<String, String> {
    let manager = state.agent_hub_manager.lock().map_err(|e| e.to_string())?;
    if let Some(role_id) = agent_role_id {
        let roles = manager.load_agent_roles()?;
        let role = roles.iter().find(|r| r.id == role_id || r.name == role_id);
        manager.build_context_with_agent(&task_id, role, brain_sections.as_deref())
    } else {
        manager.build_context_with_agent(&task_id, None, brain_sections.as_deref())
    }
}

#[tauri::command]
fn agenthub_build_context_with_paths(
    state: tauri::State<SharedAppState>,
    task_id: String,
    agent_role_id: Option<String>,
    brain_sections: Option<Vec<String>>,
) -> Result<String, String> {
    let manager = state.agent_hub_manager.lock().map_err(|e| e.to_string())?;
    let agent_roles = manager.load_agent_roles()?;
    let agent_role = agent_role_id
        .as_deref()
        .and_then(|id| agent_roles.iter().find(|r| r.id == id || r.name == id));
    manager.build_context_with_paths(
        &task_id,
        agent_role,
        brain_sections.as_deref(),
    )
}

#[tauri::command]
fn agenthub_get_brain_section_content(
    state: tauri::State<SharedAppState>,
    section: String,
) -> Result<String, String> {
    let manager = state.agent_hub_manager.lock().map_err(|e| e.to_string())?;
    manager.load_brain_section(&section)
}

#[tauri::command]
fn agenthub_load_events(
    state: tauri::State<SharedAppState>,
    limit: Option<usize>,
) -> Result<Vec<agent_hub::HubEvent>, String> {
    let manager = state.agent_hub_manager.lock().map_err(|e| e.to_string())?;
    manager.load_events(limit.unwrap_or(100))
}

#[tauri::command]
fn agenthub_scan_project(
    state: tauri::State<SharedAppState>,
    project_path: String,
) -> Result<agent_hub::BrainMeta, String> {
    let manager = state.agent_hub_manager.lock().map_err(|e| e.to_string())?;
    manager.scan_project(std::path::Path::new(&project_path))
}

#[tauri::command]
fn agenthub_run_task(
    app: tauri::AppHandle,
    state: tauri::State<SharedAppState>,
    task_id: String,
    agent_role_id: Option<String>,
    brain_sections: Option<Vec<String>>,
) -> Result<String, String> {
    let manager = state.agent_hub_manager.lock().map_err(|e| e.to_string())?;
    let context = manager.run_task(
        &task_id,
        agent_role_id.as_deref(),
        brain_sections.as_deref(),
    )?;
    let _ = app.emit("agenthub-update", serde_json::json!({"type": "task_started", "taskId": task_id}));
    Ok(context)
}

#[tauri::command]
fn agenthub_stop_agent(
    app: tauri::AppHandle,
    state: tauri::State<SharedAppState>,
    agent_id: String,
) -> Result<Option<String>, String> {
    let manager = state.agent_hub_manager.lock().map_err(|e| e.to_string())?;
    let session_id = manager.stop_agent(&agent_id)?;
    let _ = app.emit("agenthub-update", serde_json::json!({"type": "agent_stopped", "agentId": agent_id}));
    Ok(session_id)
}

#[tauri::command]
fn agenthub_terminate_task(
    app: tauri::AppHandle,
    state: tauri::State<SharedAppState>,
    task_id: String,
    agent_id: String,
    error: String,
) -> Result<Option<String>, String> {
    let manager = state.agent_hub_manager.lock().map_err(|e| e.to_string())?;
    let session_id = manager.terminate_task(&task_id, &agent_id, &error)?;
    let _ = app.emit("agenthub-update", serde_json::json!({"type": "task_terminated", "taskId": task_id}));
    Ok(session_id)
}

#[tauri::command]
fn agenthub_update_agent_session(
    state: tauri::State<SharedAppState>,
    agent_id: String,
    session_id: String,
) -> Result<(), String> {
    let manager = state.agent_hub_manager.lock().map_err(|e| e.to_string())?;
    manager.update_agent_session(&agent_id, &session_id)
}

#[tauri::command]
fn agenthub_generate_claude_md(
    state: tauri::State<SharedAppState>,
) -> Result<String, String> {
    let manager = state.agent_hub_manager.lock().map_err(|e| e.to_string())?;
    manager.generate_claude_md()
}

#[tauri::command]
fn agenthub_sync_claude_md(
    state: tauri::State<SharedAppState>,
) -> Result<String, String> {
    let manager = state.agent_hub_manager.lock().map_err(|e| e.to_string())?;
    manager.sync_claude_md()
}

#[tauri::command]
fn agenthub_load_claude_code_agents() -> Result<Vec<agent_hub::ClaudeCodeAgent>, String> {
    agent_hub::load_claude_code_agents()
}

#[tauri::command]
fn agenthub_collect_raw_data(
    state: tauri::State<SharedAppState>,
    project_path: String,
    scope: Vec<String>,
) -> Result<String, String> {
    let manager = state.agent_hub_manager.lock().map_err(|e| e.to_string())?;
    manager.collect_project_raw_data(std::path::Path::new(&project_path), &scope)
}

#[tauri::command]
fn agenthub_build_analysis_prompt(
    state: tauri::State<SharedAppState>,
    project_path: String,
    scope: Vec<String>,
    mode: String,
    raw_data: String,
) -> Result<String, String> {
    let manager = state.agent_hub_manager.lock().map_err(|e| e.to_string())?;
    manager.build_analysis_prompt(std::path::Path::new(&project_path), &scope, &mode, &raw_data)
}

#[tauri::command]
fn agenthub_save_analysis_manifest(
    state: tauri::State<SharedAppState>,
    scope: Vec<String>,
    file_hashes: std::collections::HashMap<String, String>,
) -> Result<(), String> {
    let manager = state.agent_hub_manager.lock().map_err(|e| e.to_string())?;
    manager.save_analysis_manifest(&scope, file_hashes)
}

#[tauri::command]
fn agenthub_load_analysis_manifest(
    state: tauri::State<SharedAppState>,
) -> Result<Option<agent_hub::AnalysisManifest>, String> {
    let manager = state.agent_hub_manager.lock().map_err(|e| e.to_string())?;
    manager.load_analysis_manifest()
}

#[tauri::command]
fn agenthub_scan_project_hashes(
    state: tauri::State<SharedAppState>,
    project_path: String,
) -> Result<std::collections::HashMap<String, String>, String> {
    let manager = state.agent_hub_manager.lock().map_err(|e| e.to_string())?;
    Ok(manager.scan_project_hashes(std::path::Path::new(&project_path)))
}

// Agent 间消息通信命令

#[tauri::command]
fn agenthub_send_message(
    app: tauri::AppHandle,
    state: tauri::State<SharedAppState>,
    from: String,
    to: String,
    action: String,
    content: String,
    task_id: Option<String>,
    context: Option<serde_json::Value>,
) -> Result<agent_hub::Message, String> {
    let manager = state.agent_hub_manager.lock().map_err(|e| e.to_string())?;
    let msg = manager.send_message(
        &from,
        &to,
        &action,
        &content,
        task_id.as_deref(),
        context,
    )?;
    let _ = app.emit("agenthub-message", serde_json::json!({
        "type": "new_message",
        "from": msg.from,
        "to": msg.to,
    }));
    Ok(msg)
}

#[tauri::command]
fn agenthub_get_messages(
    state: tauri::State<SharedAppState>,
    agent_id: Option<String>,
    limit: Option<usize>,
) -> Result<Vec<agent_hub::Message>, String> {
    let manager = state.agent_hub_manager.lock().map_err(|e| e.to_string())?;
    manager.get_messages(agent_id.as_deref(), limit.unwrap_or(50))
}

#[tauri::command]
fn agenthub_get_unread_messages(
    state: tauri::State<SharedAppState>,
    agent_id: String,
) -> Result<Vec<agent_hub::Message>, String> {
    let manager = state.agent_hub_manager.lock().map_err(|e| e.to_string())?;
    manager.get_unread_messages(&agent_id)
}

#[tauri::command]
fn agenthub_mark_message_read(
    state: tauri::State<SharedAppState>,
    message_id: String,
) -> Result<(), String> {
    let manager = state.agent_hub_manager.lock().map_err(|e| e.to_string())?;
    manager.mark_message_read(&message_id)
}

#[tauri::command]
fn agenthub_build_message_context(
    state: tauri::State<SharedAppState>,
    agent_id: String,
) -> Result<String, String> {
    let manager = state.agent_hub_manager.lock().map_err(|e| e.to_string())?;
    manager.build_message_context(&agent_id)
}

// 工作流命令

#[tauri::command]
fn agenthub_load_workflows(
    state: tauri::State<SharedAppState>,
) -> Result<Vec<agent_hub::Workflow>, String> {
    let manager = state.agent_hub_manager.lock().map_err(|e| e.to_string())?;
    manager.load_workflows()
}

#[tauri::command]
fn agenthub_save_workflow(
    state: tauri::State<SharedAppState>,
    workflow: agent_hub::Workflow,
) -> Result<(), String> {
    let manager = state.agent_hub_manager.lock().map_err(|e| e.to_string())?;
    manager.save_workflow(&workflow)
}

#[tauri::command]
fn agenthub_delete_workflow(
    state: tauri::State<SharedAppState>,
    id: String,
) -> Result<(), String> {
    let manager = state.agent_hub_manager.lock().map_err(|e| e.to_string())?;
    manager.delete_workflow(&id)
}

#[tauri::command]
fn agenthub_create_tasks_from_workflow(
    state: tauri::State<SharedAppState>,
    workflow_id: String,
    variables: std::collections::HashMap<String, String>,
) -> Result<Vec<agent_hub::Task>, String> {
    let manager = state.agent_hub_manager.lock().map_err(|e| e.to_string())?;
    manager.create_tasks_from_workflow(&workflow_id, &variables)
}

#[tauri::command]
fn agenthub_start_workflow(
    app: tauri::AppHandle,
    state: tauri::State<SharedAppState>,
    workflow_id: String,
    variables: std::collections::HashMap<String, String>,
) -> Result<Vec<agent_hub::Task>, String> {
    let manager = state.agent_hub_manager.lock().map_err(|e| e.to_string())?;
    let tasks = manager.start_workflow(&workflow_id, &variables)?;
    let _ = app.emit("agenthub-update", serde_json::json!({"type": "workflow_started", "workflowId": workflow_id}));
    Ok(tasks)
}

#[tauri::command]
fn agenthub_handle_task_completed(
    app: tauri::AppHandle,
    state: tauri::State<SharedAppState>,
    task_id: String,
) -> Result<Option<String>, String> {
    let manager = state.agent_hub_manager.lock().map_err(|e| e.to_string())?;
    let next_task_id = manager.handle_task_completed(&task_id)?;
    if next_task_id.is_some() {
        let _ = app.emit("agenthub-update", serde_json::json!({"type": "workflow_next", "taskId": task_id}));
    }
    Ok(next_task_id)
}

// Team 模式可视化命令
#[tauri::command]
fn team_scan(project_path: String) -> Result<Vec<team::TeamInfo>, String> {
    team::scan_teams(&project_path)
}

#[tauri::command]
fn team_scan_session(cli_session_id: String, project_path: String) -> Result<team::TeamInfo, String> {
    team::scan_session_team(&cli_session_id, &project_path)
}

#[tauri::command]
fn team_refresh(project_path: String) -> Result<Vec<team::TeamInfo>, String> {
    team::refresh_teams(&project_path)
}

#[tauri::command]
fn team_get_agent_output(
    jsonl_path: String,
    offset: u64,
    limit: u64,
) -> Result<team::AgentOutput, String> {
    team::get_agent_output(&jsonl_path, offset, limit)
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
            // 优先读取已有的 token（保证重启后 token 不变，hook 脚本可正常工作）
            let access_token = if let Ok(config_dir) = app_handle.path().app_config_dir() {
                let token_path = config_dir.join("web_access_token");
                if let Ok(existing) = std::fs::read_to_string(&token_path) {
                    let trimmed = existing.trim().to_string();
                    if !trimmed.is_empty() {
                        trimmed
                    } else {
                        web_server::generate_token()
                    }
                } else {
                    web_server::generate_token()
                }
            } else {
                web_server::generate_token()
            };
            let web_config = web_server::WebServerConfig {
                access_token: access_token.clone(),
                ..Default::default()
            };

            // 初始化 AgentHub 管理器（全局配置目录用于存储共享的 agent 角色）
            let mut agent_hub_manager = agent_hub::AgentHubManager::new();
            if let Ok(global_config) = app_handle.path().app_config_dir() {
                std::fs::create_dir_all(&global_config).ok();
                agent_hub_manager.set_global_config_path(global_config);
            }

            let app_state = Arc::new(AppState {
                session_manager: Mutex::new(session_manager),
                pty_manager: Mutex::new(pty_manager),
                config_manager: Mutex::new(config_manager),
                checkpoint_manager: Mutex::new(checkpoint_manager),
                license_manager: Mutex::new(license_manager),
                tunnel_manager: tunnel::TunnelManager::new(),
                web_access_token: Mutex::new(access_token.clone()),
                agent_hub_manager: Mutex::new(agent_hub_manager),
            });

            // 保存 web_access_token 到配置目录，供 Claude Code hook 脚本读取
            // 并自动配置 Claude Code hooks 通知（仅首次）
            if let Ok(config_dir) = app_handle.path().app_config_dir() {
                std::fs::create_dir_all(&config_dir).ok();
                let token_path = config_dir.join("web_access_token");
                let _ = std::fs::write(&token_path, &access_token);

                // 自动配置 Claude Code hooks（默认启用，仅未配置时）
                if claude_config::get_hook_script_path().is_err() {
                    if let Ok(script_path) = ensure_hook_scripts(&config_dir) {
                        if let Err(e) = claude_config::setup_claude_hooks(&script_path) {
                            eprintln!("[Hooks] 自动配置失败: {}", e);
                        }
                    }
                }
            }

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
            touch_session,
            delete_session,
            move_to_trash,
            delete_sessions_by_path,
            // 回收站
            get_trash_sessions,
            restore_from_trash,
            permanently_delete,
            empty_trash,
            // 归档
            get_archived_sessions,
            archive_session,
            unarchive_session,
            archive_sessions_by_path,
            unarchive_sessions_by_path,
            // Claude 会话检查
            check_claude_session_exists,
            list_session_files,
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
            setup_claude_hooks,
            flash_taskbar,
            is_claude_hooks_configured,
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
            get_local_ips,
            activate_session_on_desktop_ui,
            // AgentHub
            agenthub_init,
            agenthub_is_initialized,
            agenthub_set_project,
            agenthub_load_tasks,
            agenthub_create_task,
            agenthub_update_task,
            agenthub_delete_task,
            agenthub_load_agent_roles,
            agenthub_save_agent_role,
            agenthub_delete_agent_role,
            agenthub_load_active_agents,
            agenthub_update_agent_status,
            agenthub_load_brain_meta,
            agenthub_load_brain_section,
            agenthub_update_brain_section,
            agenthub_build_context,
            agenthub_build_context_with_paths,
            agenthub_get_brain_section_content,
            agenthub_load_events,
            agenthub_scan_project,
            agenthub_run_task,
            agenthub_stop_agent,
            agenthub_terminate_task,
            agenthub_update_agent_session,
            agenthub_generate_claude_md,
            agenthub_sync_claude_md,
            agenthub_load_claude_code_agents,
            agenthub_collect_raw_data,
            agenthub_build_analysis_prompt,
            agenthub_save_analysis_manifest,
            agenthub_load_analysis_manifest,
            agenthub_scan_project_hashes,
            agenthub_send_message,
            agenthub_get_messages,
            agenthub_get_unread_messages,
            agenthub_mark_message_read,
            agenthub_build_message_context,
            agenthub_load_workflows,
            agenthub_save_workflow,
            agenthub_delete_workflow,
            agenthub_create_tasks_from_workflow,
            agenthub_start_workflow,
            agenthub_handle_task_completed,
            // Team 模式可视化
            team_scan,
            team_scan_session,
            team_refresh,
            team_get_agent_output,
        ])
        .build(tauri::generate_context!())
        .expect("error while building tauri application")
        .run(|app_handle, event| {
            // 应用退出前关闭所有 PTY，避免 claude / powershell 进程残留
            if let tauri::RunEvent::ExitRequested { .. } = event {
                if let Some(state) = app_handle.try_state::<SharedAppState>() {
                    if let Ok(mut manager) = state.pty_manager.lock() {
                        manager.close_all();
                    }
                }
            }
        });
}
