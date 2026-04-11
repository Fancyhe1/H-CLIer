mod session;
mod pty;
mod cli;
mod config;

use session::{Session, SessionManager};
use pty::PtyManager;
use config::{AppConfig, ConfigManager, ClaudeConfig, GeneralConfig};
use std::sync::Mutex;
use tauri::Manager;

pub struct AppState {
    session_manager: Mutex<SessionManager>,
    pty_manager: Mutex<PtyManager>,
    config_manager: Mutex<ConfigManager>,
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

// 主函数
#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_dialog::init())
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

            app.manage(AppState {
                session_manager: Mutex::new(session_manager),
                pty_manager: Mutex::new(pty_manager),
                config_manager: Mutex::new(config_manager),
            });

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            // 会话管理
            create_session,
            get_sessions,
            update_session,
            delete_session,
            // 文件对话框
            select_folder,
            // PTY终端
            create_pty,
            read_terminal_history,
            was_running_claude,
            write_to_pty,
            resize_pty,
            close_pty,
            spawn_command_in_pty,
            // CLI工具
            check_claude_installation,
            spawn_claude,
            get_claude_version,
            // 配置管理
            get_config,
            save_config,
            update_claude_config,
            update_general_config,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
