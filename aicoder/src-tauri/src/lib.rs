mod session;
mod pty;
mod cli;
mod config;
mod checkpoint;
mod license;
mod history;

use session::{Session, SessionManager};
use pty::PtyManager;
use config::{AppConfig, ConfigManager, ClaudeConfig, GeneralConfig};
use checkpoint::{Checkpoint, CheckpointDiff, CheckpointManager};
use std::sync::Mutex;
use tauri::Manager;
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
    session_manager: Mutex<SessionManager>,
    pty_manager: Mutex<PtyManager>,
    config_manager: Mutex<ConfigManager>,
    checkpoint_manager: Mutex<CheckpointManager>,
    license_manager: Mutex<license::LicenseManager>,
}

// 会话管理命令
#[tauri::command]
fn create_session(
    state: tauri::State<AppState>,
    project_path: String,
    title: Option<String>,
    session_type: Option<String>,
) -> Result<Session, String> {
    let manager = state.session_manager.lock().map_err(|e| e.to_string())?;
    manager.create_session(&project_path, title.as_deref(), session_type.as_deref())
        .map_err(|e| e.to_string())
}

#[tauri::command]
fn get_sessions(state: tauri::State<AppState>) -> Result<Vec<Session>, String> {
    let manager = state.session_manager.lock().map_err(|e| e.to_string())?;
    manager.get_sessions()
        .map_err(|e| e.to_string())
}

#[tauri::command]
fn update_session(
    state: tauri::State<AppState>,
    session: Session,
) -> Result<(), String> {
    let manager = state.session_manager.lock().map_err(|e| e.to_string())?;
    manager.update_session(&session)
        .map_err(|e| e.to_string())
}

#[tauri::command]
fn delete_session(
    state: tauri::State<AppState>,
    session_id: String,
) -> Result<(), String> {
    let manager = state.session_manager.lock().map_err(|e| e.to_string())?;
    manager.delete_session(&session_id)
        .map_err(|e| e.to_string())
}

#[tauri::command]
fn move_to_trash(
    state: tauri::State<AppState>,
    session_id: String,
) -> Result<(), String> {
    let manager = state.session_manager.lock().map_err(|e| e.to_string())?;
    manager.move_to_trash(&session_id)
        .map_err(|e| e.to_string())
}

// 回收站相关命令
#[tauri::command]
fn get_trash_sessions(state: tauri::State<AppState>) -> Result<Vec<Session>, String> {
    let manager = state.session_manager.lock().map_err(|e| e.to_string())?;
    manager.get_trash_sessions()
        .map_err(|e| e.to_string())
}

#[tauri::command]
fn restore_from_trash(
    state: tauri::State<AppState>,
    session_id: String,
) -> Result<(), String> {
    let manager = state.session_manager.lock().map_err(|e| e.to_string())?;
    manager.restore_from_trash(&session_id)
        .map_err(|e| e.to_string())
}

#[tauri::command]
fn permanently_delete(
    state: tauri::State<AppState>,
    session_id: String,
) -> Result<(), String> {
    let manager = state.session_manager.lock().map_err(|e| e.to_string())?;
    manager.permanently_delete(&session_id)
        .map_err(|e| e.to_string())
}

#[tauri::command]
fn empty_trash(state: tauri::State<AppState>) -> Result<usize, String> {
    let manager = state.session_manager.lock().map_err(|e| e.to_string())?;
    manager.empty_trash()
        .map_err(|e| e.to_string())
}

// 检查 Claude 会话是否存在
#[tauri::command]
fn check_claude_session_exists(session_id: String, project_path: String) -> Result<bool, String> {
    use std::path::PathBuf;

    // Claude 路径编码规则：
    // : → -, \ 或 / → -, 英文字母保持原样, 中文字符每个变成一个 -
    let encoded_path: String = project_path
        .chars()
        .map(|c| {
            if c == ':' || c == '\\' || c == '/' {
                "-".to_string()
            } else if c.is_ascii() {
                c.to_string()
            } else {
                // 中文字符或其他非ASCII字符，每个变成一个 -
                "-".to_string()
            }
        })
        .collect();

    // Claude 会话文件路径
    let home = std::env::var("USERPROFILE")
        .or_else(|_| std::env::var("HOME"))
        .map_err(|e| e.to_string())?;

    let session_file = PathBuf::from(home)
        .join(".claude")
        .join("projects")
        .join(&encoded_path)
        .join(format!("{}.jsonl", session_id));

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

// PTY终端命令
#[tauri::command]
fn create_pty(
    state: tauri::State<AppState>,
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
    state: tauri::State<AppState>,
    session_id: String,
) -> Result<String, String> {
    let manager = state.pty_manager.lock().map_err(|e| e.to_string())?;
    manager.read_history(&session_id)
        .map_err(|e| e.to_string())
}

#[tauri::command]
fn was_running_claude(
    state: tauri::State<AppState>,
    session_id: String,
) -> Result<bool, String> {
    let manager = state.pty_manager.lock().map_err(|e| e.to_string())?;
    manager.was_running_claude(&session_id)
        .map_err(|e| e.to_string())
}

#[tauri::command]
fn write_terminal_history(
    state: tauri::State<AppState>,
    session_id: String,
    content: String,
) -> Result<(), String> {
    let manager = state.pty_manager.lock().map_err(|e| e.to_string())?;
    manager.write_history(&session_id, &content)
        .map_err(|e| e.to_string())
}

#[tauri::command]
fn write_to_pty(
    state: tauri::State<AppState>,
    pty_id: String,
    data: String,
) -> Result<(), String> {
    let mut manager = state.pty_manager.lock().map_err(|e| e.to_string())?;
    manager.write(&pty_id, data.as_bytes())
        .map_err(|e| e.to_string())
}

#[tauri::command]
fn resize_pty(
    state: tauri::State<AppState>,
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
    state: tauri::State<AppState>,
    pty_id: String,
) -> Result<(), String> {
    let mut manager = state.pty_manager.lock().map_err(|e| e.to_string())?;
    manager.close(&pty_id)
        .map_err(|e| e.to_string())
}

#[tauri::command]
fn spawn_command_in_pty(
    state: tauri::State<AppState>,
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
    state: tauri::State<AppState>,
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
fn get_config(state: tauri::State<AppState>) -> Result<AppConfig, String> {
    let manager = state.config_manager.lock().map_err(|e| e.to_string())?;
    manager.load().map_err(|e| e.to_string())
}

#[tauri::command]
fn save_config(
    state: tauri::State<AppState>,
    config: AppConfig,
) -> Result<(), String> {
    let manager = state.config_manager.lock().map_err(|e| e.to_string())?;
    manager.save(&config).map_err(|e| e.to_string())
}

#[tauri::command]
fn update_claude_config(
    state: tauri::State<AppState>,
    config: ClaudeConfig,
) -> Result<(), String> {
    let manager = state.config_manager.lock().map_err(|e| e.to_string())?;
    manager.update_claude_config(config).map_err(|e| e.to_string())
}

#[tauri::command]
fn update_general_config(
    state: tauri::State<AppState>,
    config: GeneralConfig,
) -> Result<(), String> {
    let manager = state.config_manager.lock().map_err(|e| e.to_string())?;
    manager.update_general_config(config).map_err(|e| e.to_string())
}

#[tauri::command]
fn spawn_claude(
    _state: tauri::State<AppState>,
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
    state: tauri::State<AppState>,
    code: String,
) -> Result<license::LicenseState, String> {
    let manager = state.license_manager.lock().map_err(|e| e.to_string())?;
    manager.activate(&code)
}

#[tauri::command]
fn get_license_status(
    state: tauri::State<AppState>,
) -> Result<license::LicenseStatus, String> {
    let manager = state.license_manager.lock().map_err(|e| e.to_string())?;
    manager.get_status()
}

#[tauri::command]
fn get_machine_id(
    state: tauri::State<AppState>,
) -> Result<String, String> {
    let manager = state.license_manager.lock().map_err(|e| e.to_string())?;
    Ok(manager.get_machine_id())
}

// 检查点管理命令
#[tauri::command]
fn create_checkpoint(
    state: tauri::State<AppState>,
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
    state: tauri::State<AppState>,
    session_id: String,
) -> Result<Vec<Checkpoint>, String> {
    let manager = state.checkpoint_manager.lock().map_err(|e| e.to_string())?;
    manager.list_checkpoints(&session_id)
}

#[tauri::command]
fn restore_checkpoint(
    state: tauri::State<AppState>,
    session_id: String,
    checkpoint_id: String,
    project_path: String,
) -> Result<CheckpointDiff, String> {
    let manager = state.checkpoint_manager.lock().map_err(|e| e.to_string())?;
    manager.restore_checkpoint(&session_id, &checkpoint_id, &project_path)
}

#[tauri::command]
fn delete_checkpoint(
    state: tauri::State<AppState>,
    session_id: String,
    checkpoint_id: String,
) -> Result<(), String> {
    let manager = state.checkpoint_manager.lock().map_err(|e| e.to_string())?;
    manager.delete_checkpoint(&session_id, &checkpoint_id)
}

#[tauri::command]
fn get_checkpoint_diff(
    state: tauri::State<AppState>,
    session_id: String,
    checkpoint_id: String,
    project_path: String,
) -> Result<Vec<CheckpointDiff>, String> {
    let manager = state.checkpoint_manager.lock().map_err(|e| e.to_string())?;
    manager.get_checkpoint_diff(&session_id, &checkpoint_id, &project_path)
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

            app.manage(AppState {
                session_manager: Mutex::new(session_manager),
                pty_manager: Mutex::new(pty_manager),
                config_manager: Mutex::new(config_manager),
                checkpoint_manager: Mutex::new(checkpoint_manager),
                license_manager: Mutex::new(license_manager),
            });

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            // 会话管理
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
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
