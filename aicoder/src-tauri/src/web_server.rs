use axum::{
    extract::{Path, State, WebSocketUpgrade},
    extract::ws::{Message, WebSocket},
    http::{header, Request, StatusCode},
    middleware::{self, Next},
    response::{IntoResponse, Response},
    routing::{delete, get, post},
    Json, Router,
};
use futures::{SinkExt, StreamExt};
use serde::{Deserialize, Serialize};
use std::sync::Arc;
use std::io::{Seek, SeekFrom, Read};
use tauri::Emitter;
use tower_http::cors::CorsLayer;
use tower_http::services::ServeDir;

use crate::SharedAppState;

// ============================================================
// 配置
// ============================================================

/// Web Server 配置
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WebServerConfig {
    pub enabled: bool,
    pub port: u16,
    pub access_token: String,
    pub ngrok_enabled: bool,
    pub ngrok_token: String,
}

impl Default for WebServerConfig {
    fn default() -> Self {
        Self {
            enabled: false,
            port: 9527,
            access_token: generate_token(),
            ngrok_enabled: false,
            ngrok_token: String::new(),
        }
    }
}

/// 生成随机访问令牌
pub fn generate_token() -> String {
    use rand::Rng;
    let mut rng = rand::rng();
    (0..16)
        .map(|_| {
            let idx = rng.random_range(0..62);
            match idx {
                0..10 => (b'0' + idx) as char,
                10..36 => (b'a' + idx - 10) as char,
                _ => (b'A' + idx - 36) as char,
            }
        })
        .collect()
}

// ============================================================
// 共享状态
// ============================================================

pub type SharedState = Arc<WebServerInner>;

pub struct WebServerInner {
    pub app_state: SharedAppState,
    pub config: WebServerConfig,
    pub app_handle: tauri::AppHandle,
}

// ============================================================
// 通用响应
// ============================================================

#[derive(Serialize)]
struct ApiResponse<T: Serialize> {
    success: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    data: Option<T>,
    #[serde(skip_serializing_if = "Option::is_none")]
    error: Option<String>,
}

impl<T: Serialize> ApiResponse<T> {
    fn ok(data: T) -> Self {
        Self { success: true, data: Some(data), error: None }
    }
    fn err(msg: impl Into<String>) -> Self {
        Self { success: false, data: None, error: Some(msg.into()) }
    }
}

/// 将 Mutex 锁错误转为 API 响应
fn lock_err() -> (StatusCode, Json<ApiResponse<()>>) {
    (StatusCode::INTERNAL_SERVER_ERROR, Json(ApiResponse::err("Internal lock error")))
}

fn db_err(e: impl std::fmt::Display) -> (StatusCode, Json<ApiResponse<()>>) {
    (StatusCode::INTERNAL_SERVER_ERROR, Json(ApiResponse::err(e.to_string())))
}

// ============================================================
// 公开接口（无需认证）
// ============================================================

async fn health_check() -> impl IntoResponse {
    Json(ApiResponse::ok("AICoder Web Server is running"))
}

#[derive(Deserialize)]
struct LoginRequest { token: String }

async fn login(
    State(state): State<SharedState>,
    Json(req): Json<LoginRequest>,
) -> impl IntoResponse {
    if req.token == state.config.access_token {
        Json(ApiResponse::ok("authenticated")).into_response()
    } else {
        (StatusCode::UNAUTHORIZED, Json(ApiResponse::<()>::err("Invalid token"))).into_response()
    }
}

// ============================================================
// 会话管理 API
// ============================================================

async fn list_sessions(
    State(state): State<SharedState>,
) -> impl IntoResponse {
    let manager = state.app_state.session_manager.lock().map_err(|_| lock_err())?;
    match manager.get_sessions() {
        Ok(sessions) => Ok(Json(ApiResponse::ok(sessions))),
        Err(e) => Err(db_err(e)),
    }
}

#[derive(Deserialize)]
struct CreateSessionRequest {
    project_path: String,
    title: Option<String>,
    #[serde(rename = "sessionType")]
    session_type: Option<String>,
}

async fn create_session(
    State(state): State<SharedState>,
    Json(req): Json<CreateSessionRequest>,
) -> impl IntoResponse {
    let manager = state.app_state.session_manager.lock().map_err(|_| lock_err())?;
    match manager.create_session(&req.project_path, req.title.as_deref(), req.session_type.as_deref(), None) {
        Ok(session) => Ok((StatusCode::CREATED, Json(ApiResponse::ok(session)))),
        Err(e) => Err(db_err(e)),
    }
}

async fn get_session(
    State(state): State<SharedState>,
    Path(id): Path<String>,
) -> impl IntoResponse {
    let manager = state.app_state.session_manager.lock().map_err(|_| lock_err())?;
    match manager.get_sessions() {
        Ok(sessions) => {
            match sessions.into_iter().find(|s| s.id == id) {
                Some(session) => Ok(Json(ApiResponse::ok(session)).into_response()),
                None => Err((StatusCode::NOT_FOUND, Json(ApiResponse::<()>::err("Session not found")))),
            }
        }
        Err(e) => Err(db_err(e)),
    }
}

async fn update_session(
    State(state): State<SharedState>,
    Path(_id): Path<String>,
    Json(session): Json<crate::session::Session>,
) -> impl IntoResponse {
    let manager = state.app_state.session_manager.lock().map_err(|_| lock_err())?;
    match manager.update_session(&session) {
        Ok(_) => Ok(Json(ApiResponse::ok("updated"))),
        Err(e) => Err(db_err(e)),
    }
}

async fn delete_session(
    State(state): State<SharedState>,
    Path(id): Path<String>,
) -> impl IntoResponse {
    let manager = state.app_state.session_manager.lock().map_err(|_| lock_err())?;
    match manager.delete_session(&id) {
        Ok(_) => Ok(Json(ApiResponse::ok("deleted"))),
        Err(e) => Err(db_err(e)),
    }
}

// ============================================================
// 回收站 API
// ============================================================

async fn list_trash(
    State(state): State<SharedState>,
) -> impl IntoResponse {
    let manager = state.app_state.session_manager.lock().map_err(|_| lock_err())?;
    match manager.get_trash_sessions() {
        Ok(sessions) => Ok(Json(ApiResponse::ok(sessions))),
        Err(e) => Err(db_err(e)),
    }
}

async fn restore_from_trash(
    State(state): State<SharedState>,
    Path(id): Path<String>,
) -> impl IntoResponse {
    let manager = state.app_state.session_manager.lock().map_err(|_| lock_err())?;
    match manager.restore_from_trash(&id) {
        Ok(_) => Ok(Json(ApiResponse::ok("restored"))),
        Err(e) => Err(db_err(e)),
    }
}

async fn empty_trash(
    State(state): State<SharedState>,
) -> impl IntoResponse {
    let manager = state.app_state.session_manager.lock().map_err(|_| lock_err())?;
    match manager.empty_trash() {
        Ok(count) => Ok(Json(ApiResponse::ok(count))),
        Err(e) => Err(db_err(e)),
    }
}

// ============================================================
// 聊天历史 API
// ============================================================

async fn get_session_history(
    State(state): State<SharedState>,
    Path(id): Path<String>,
) -> impl IntoResponse {
    // 先从 session_manager 找到 session 的 project_path 和 cli_session_id
    let manager = state.app_state.session_manager.lock().map_err(|_| lock_err())?;
    let sessions = manager.get_sessions().map_err(|e| db_err(e))?;
    let session = sessions.into_iter().find(|s| s.id == id);
    drop(manager);

    let session = match session {
        Some(s) => s,
        None => return Err((StatusCode::NOT_FOUND, Json(ApiResponse::<()>::err("Session not found")))),
    };

    let cli_session_id = match &session.cli_session_id {
        Some(id) => id.clone(),
        None => return Err((StatusCode::BAD_REQUEST, Json(ApiResponse::<()>::err("No CLI session ID")))),
    };

    match crate::history::read_session_history(&cli_session_id, &session.project_path) {
        Ok(messages) => Ok(Json(ApiResponse::ok(messages))),
        Err(e) => Err(db_err(e)),
    }
}

// ============================================================
// Token 用量 API
// ============================================================

async fn get_token_usage(
    State(state): State<SharedState>,
    Path(id): Path<String>,
) -> impl IntoResponse {
    let manager = state.app_state.session_manager.lock().map_err(|_| lock_err())?;
    let sessions = manager.get_sessions().map_err(|e| db_err(e))?;
    let session = sessions.into_iter().find(|s| s.id == id);
    drop(manager);

    let session = match session {
        Some(s) => s,
        None => return Err((StatusCode::NOT_FOUND, Json(ApiResponse::<()>::err("Session not found")))),
    };

    let cli_session_id = match &session.cli_session_id {
        Some(id) => id.clone(),
        None => return Err((StatusCode::BAD_REQUEST, Json(ApiResponse::<()>::err("No CLI session ID")))),
    };

    match crate::token_usage::get_session_total_usage(&cli_session_id, &session.project_path) {
        Ok(usage) => Ok(Json(ApiResponse::ok(usage))),
        Err(e) => Err(db_err(e)),
    }
}

// ============================================================
// Checkpoint API
// ============================================================

async fn list_checkpoints(
    State(state): State<SharedState>,
    Path(session_id): Path<String>,
) -> impl IntoResponse {
    let manager = state.app_state.checkpoint_manager.lock().map_err(|_| lock_err())?;
    match manager.list_checkpoints(&session_id) {
        Ok(checkpoints) => Ok(Json(ApiResponse::ok(checkpoints))),
        Err(e) => Err(db_err(e)),
    }
}

#[derive(Deserialize)]
struct CreateCheckpointRequest {
    name: Option<String>,
    description: Option<String>,
    #[serde(rename = "projectPath")]
    project_path: String,
}

async fn create_checkpoint_handler(
    State(state): State<SharedState>,
    Path(session_id): Path<String>,
    Json(req): Json<CreateCheckpointRequest>,
) -> impl IntoResponse {
    let manager = state.app_state.checkpoint_manager.lock().map_err(|_| lock_err())?;
    let name = req.name.as_deref().unwrap_or("Checkpoint");
    match manager.create_checkpoint(&session_id, &req.project_path, name, req.description.as_deref()) {
        Ok(checkpoint) => Ok((StatusCode::CREATED, Json(ApiResponse::ok(checkpoint)))),
        Err(e) => Err(db_err(e)),
    }
}

async fn restore_checkpoint_handler(
    State(state): State<SharedState>,
    Path((session_id, checkpoint_id)): Path<(String, String)>,
) -> impl IntoResponse {
    // 需要 project_path，从 session 获取
    let sm = state.app_state.session_manager.lock().map_err(|_| lock_err())?;
    let sessions = sm.get_sessions().map_err(|e| db_err(e))?;
    let session = sessions.into_iter().find(|s| s.id == session_id);
    drop(sm);

    let project_path = match session {
        Some(s) => s.project_path,
        None => return Err((StatusCode::NOT_FOUND, Json(ApiResponse::<()>::err("Session not found")))),
    };

    let manager = state.app_state.checkpoint_manager.lock().map_err(|_| lock_err())?;
    match manager.restore_checkpoint(&session_id, &checkpoint_id, &project_path) {
        Ok(diff) => Ok(Json(ApiResponse::ok(diff))),
        Err(e) => Err(db_err(e)),
    }
}

async fn delete_checkpoint_handler(
    State(state): State<SharedState>,
    Path((session_id, checkpoint_id)): Path<(String, String)>,
) -> impl IntoResponse {
    let manager = state.app_state.checkpoint_manager.lock().map_err(|_| lock_err())?;
    match manager.delete_checkpoint(&session_id, &checkpoint_id) {
        Ok(_) => Ok(Json(ApiResponse::ok("deleted"))),
        Err(e) => Err(db_err(e)),
    }
}

// ============================================================
// 配置 API
// ============================================================

async fn get_config(
    State(state): State<SharedState>,
) -> impl IntoResponse {
    let manager = state.app_state.config_manager.lock().map_err(|_| lock_err())?;
    match manager.load() {
        Ok(config) => Ok(Json(ApiResponse::ok(config))),
        Err(e) => Err(db_err(e)),
    }
}

#[derive(Deserialize)]
struct UpdateGeneralConfigRequest {
    theme: Option<String>,
    #[serde(rename = "terminalFontSize")]
    terminal_font_size: Option<u32>,
}

async fn update_config(
    State(state): State<SharedState>,
    Json(req): Json<UpdateGeneralConfigRequest>,
) -> impl IntoResponse {
    let manager = state.app_state.config_manager.lock().map_err(|_| lock_err())?;
    let mut config = manager.load().map_err(|e| db_err(e))?;

    if let Some(theme) = req.theme {
        config.general.theme = theme;
    }
    if let Some(size) = req.terminal_font_size {
        config.general.terminal_font_size = size;
    }

    match manager.save(&config) {
        Ok(_) => Ok(Json(ApiResponse::ok("updated"))),
        Err(e) => Err(db_err(e)),
    }
}

// ============================================================
// Web Server 信息 API
// ============================================================

async fn get_server_info(
    State(state): State<SharedState>,
) -> impl IntoResponse {
    #[derive(Serialize)]
    struct ServerInfo {
        version: String,
        port: u16,
        ngrok_enabled: bool,
    }
    Json(ApiResponse::ok(ServerInfo {
        version: env!("CARGO_PKG_VERSION").to_string(),
        port: state.config.port,
        ngrok_enabled: state.config.ngrok_enabled,
    }))
}

// ============================================================
// 终端 WebSocket 流
// ============================================================

/// WebSocket 终端流处理
/// 客户端连接后，实时接收 PTY 输出
async fn ws_terminal_handler(
    ws: WebSocketUpgrade,
    State(state): State<SharedState>,
    Path(session_id): Path<String>,
) -> Response {
    ws.on_upgrade(move |socket| handle_ws_terminal(socket, state, session_id))
}

async fn handle_ws_terminal(ws: WebSocket, state: SharedState, session_id: String) {
    let (mut sender, mut receiver) = ws.split();

    // 获取日志文件路径
    let log_path = {
        let manager = match state.app_state.pty_manager.lock() {
            Ok(m) => m,
            Err(_) => return,
        };
        manager.get_log_path(&session_id)
    };

    // 先发送历史内容
    if log_path.exists() {
        if let Ok(content) = std::fs::read_to_string(&log_path) {
            if !content.is_empty() {
                let history = if content.len() > 50000 {
                    content[content.len() - 50000..].to_string()
                } else {
                    content
                };
                let _ = sender.send(Message::Text(history.into())).await;
            }
        }
    }

    // 启动文件监听任务，实时推送新内容
    let log_path_clone = log_path.clone();
    let (tx, mut rx) = tokio::sync::mpsc::channel::<String>(100);

    let watch_handle = tokio::spawn(async move {
        let mut last_size = if log_path_clone.exists() {
            std::fs::metadata(&log_path_clone).map(|m| m.len()).unwrap_or(0)
        } else {
            0
        };

        loop {
            tokio::time::sleep(tokio::time::Duration::from_millis(100)).await;

            if !log_path_clone.exists() {
                continue;
            }

            let current_size = match std::fs::metadata(&log_path_clone) {
                Ok(m) => m.len(),
                Err(_) => continue,
            };

            if current_size > last_size {
                match std::fs::File::open(&log_path_clone) {
                    Ok(mut file) => {
                        let _ = file.seek(SeekFrom::Start(last_size));
                        let mut new_content = String::new();
                        let _ = file.read_to_string(&mut new_content);
                        if !new_content.is_empty() {
                            if tx.send(new_content).await.is_err() {
                                break;
                            }
                        }
                    }
                    Err(_) => continue,
                }
                last_size = current_size;
            }
        }
    });

    // 转发任务：将新内容发送到 WebSocket
    let send_task = tokio::spawn(async move {
        while let Some(content) = rx.recv().await {
            if sender.send(Message::Text(content.into())).await.is_err() {
                break;
            }
        }
    });

    // 接收客户端消息（用于 ping/pong 或关闭）
    let recv_task = tokio::spawn(async move {
        while let Some(Ok(msg)) = receiver.next().await {
            match msg {
                Message::Close(_) => break,
                _ => {}
            }
        }
    });

    tokio::select! {
        _ = send_task => {}
        _ = recv_task => {}
    }

    watch_handle.abort();
}

/// 获取终端历史内容（非 WebSocket 的 HTTP 方式）
async fn get_terminal_history(
    State(state): State<SharedState>,
    Path(session_id): Path<String>,
) -> impl IntoResponse {
    let manager = state.app_state.pty_manager.lock().map_err(|_| lock_err())?;
    match manager.read_history(&session_id) {
        Ok(content) => Ok(Json(ApiResponse::ok(content))),
        Err(e) => Err(db_err(e)),
    }
}

/// 通知桌面端打开会话（创建 PTY 并启动 Claude）
async fn activate_session_on_desktop(
    State(state): State<SharedState>,
    Path(session_id): Path<String>,
) -> impl IntoResponse {
    println!("[Activate] Request to open session: {}", session_id);

    // 检查 PTY 是否已存在
    let has_pty = {
        let manager = match state.app_state.pty_manager.lock() {
            Ok(m) => m,
            Err(_) => return Err((StatusCode::INTERNAL_SERVER_ERROR, Json(ApiResponse::<()>::err("Lock error")))),
        };
        manager.has_pty(&session_id)
    };

    if has_pty {
        println!("[Activate] PTY already exists for session: {}", session_id);
        return Ok(Json(ApiResponse::ok("already_open")));
    }

    // 获取会话信息
    let session = {
        let sm = match state.app_state.session_manager.lock() {
            Ok(m) => m,
            Err(_) => return Err((StatusCode::INTERNAL_SERVER_ERROR, Json(ApiResponse::<()>::err("Lock error")))),
        };
        let sessions = match sm.get_sessions() {
            Ok(s) => s,
            Err(e) => return Err((StatusCode::INTERNAL_SERVER_ERROR, Json(ApiResponse::<()>::err(e.to_string())))),
        };
        match sessions.into_iter().find(|s| s.id == session_id) {
            Some(s) => s,
            None => return Err((StatusCode::NOT_FOUND, Json(ApiResponse::<()>::err("Session not found")))),
        }
    };

    // 创建 PTY
    {
        let mut manager = match state.app_state.pty_manager.lock() {
            Ok(m) => m,
            Err(_) => return Err((StatusCode::INTERNAL_SERVER_ERROR, Json(ApiResponse::<()>::err("Lock error")))),
        };

        match manager.create_pty(session_id.clone(), 120, 40, &state.app_handle) {
            Ok(pty_id) => println!("[Activate] PTY created: {}", pty_id),
            Err(e) => {
                println!("[Activate] PTY creation failed: {}", e);
                return Err((StatusCode::INTERNAL_SERVER_ERROR, Json(ApiResponse::<()>::err(e.to_string()))));
            }
        }

        // 启动 PowerShell（和桌面端使用同样的命令）
        let project_path = session.project_path.clone();
        match manager.spawn_command(&session_id, "powershell.exe", &[], &project_path) {
            Ok(_) => println!("[Activate] PowerShell spawned"),
            Err(e) => println!("[Activate] PowerShell spawn failed: {}", e),
        }
    }

    // 等待 PowerShell 启动
    tokio::time::sleep(tokio::time::Duration::from_millis(1000)).await;

    // 发送 Claude 命令
    if session.session_type == "claude" {
        let cli_id = session.cli_session_id.clone().unwrap_or(session_id.clone());
        let project_path = session.project_path.clone();

        let session_file_exists = crate::history::get_session_jsonl_path(&cli_id, &project_path)
            .map(|p| p.exists())
            .unwrap_or(false);

        let cmd = if session_file_exists {
            format!("claude --resume {}", cli_id)
        } else {
            format!("claude --session-id {}", cli_id)
        };

        println!("[Activate] Sending Claude command: {}", cmd);
        if let Ok(mut manager) = state.app_state.pty_manager.lock() {
            let _ = manager.write(&session_id, format!("{}\r", cmd).as_bytes());
        }

        // 等待 Claude 启动
        tokio::time::sleep(tokio::time::Duration::from_millis(5000)).await;
    }

    // 通知桌面端 UI 切换到该会话
    if let Err(e) = state.app_handle.emit("web-activate-session", &session_id) {
        println!("[Activate] Failed to emit event: {}", e);
    }

    println!("[Activate] Session opened successfully");
    Ok(Json(ApiResponse::ok("opened")))
}

/// 发送输入到 PTY
#[derive(Deserialize)]
struct PtyInputRequest {
    data: String,
}

async fn pty_input(
    State(state): State<SharedState>,
    Path(session_id): Path<String>,
    Json(req): Json<PtyInputRequest>,
) -> Response {
    let mut manager = match state.app_state.pty_manager.lock() {
        Ok(m) => m,
        Err(_) => return (StatusCode::INTERNAL_SERVER_ERROR, Json(ApiResponse::<()>::err("Lock error"))).into_response(),
    };
    match manager.write(&session_id, req.data.as_bytes()) {
        Ok(_) => Json(ApiResponse::ok("sent")).into_response(),
        Err(e) => (StatusCode::INTERNAL_SERVER_ERROR, Json(ApiResponse::<()>::err(e.to_string()))).into_response(),
    }
}

// ============================================================
// 隧道控制 API
// ============================================================

async fn get_tunnel_status(
    State(state): State<SharedState>,
) -> impl IntoResponse {
    let status = state.app_state.tunnel_manager.status().await;
    Json(ApiResponse::ok(status))
}

#[derive(Deserialize)]
struct StartTunnelRequest {
    authtoken: String,
}

async fn start_tunnel_handler(
    State(state): State<SharedState>,
    Json(req): Json<StartTunnelRequest>,
) -> impl IntoResponse {
    match state.app_state.tunnel_manager.start(req.authtoken, state.config.port).await {
        Ok(url) => Ok(Json(ApiResponse::ok(url))),
        Err(e) => Err(db_err(e)),
    }
}

async fn stop_tunnel_handler(
    State(state): State<SharedState>,
) -> impl IntoResponse {
    state.app_state.tunnel_manager.stop().await;
    Json(ApiResponse::ok("stopped"))
}

// ============================================================
// 认证中间件
// ============================================================

async fn auth_middleware(
    State(state): State<SharedState>,
    request: Request<axum::body::Body>,
    next: Next,
) -> Response {
    let path = request.uri().path();

    // 公开接口跳过认证
    if path == "/api/auth/login" || path == "/api/health" {
        return next.run(request).await;
    }

    // 静态文件跳过认证（前端自行处理登录）
    if !path.starts_with("/api/") {
        return next.run(request).await;
    }

    // 检查 Authorization header
    let header_authorized = request
        .headers()
        .get(header::AUTHORIZATION)
        .and_then(|v| v.to_str().ok())
        .and_then(|h| h.strip_prefix("Bearer "))
        .map(|token| token == state.config.access_token)
        .unwrap_or(false);

    // 检查 URL 参数中的 token（WebSocket 需要）
    let query_authorized = request
        .uri()
        .query()
        .and_then(|q| {
            url::form_urlencoded::parse(q.as_bytes())
                .find(|(key, _)| key == "token")
                .map(|(_, value)| value == state.config.access_token)
        })
        .unwrap_or(false);

    if header_authorized || query_authorized {
        next.run(request).await
    } else {
        (
            StatusCode::UNAUTHORIZED,
            Json(ApiResponse::<()>::err("Unauthorized")),
        ).into_response()
    }
}

// ============================================================
// Claude Code Hooks 通知
// ============================================================

/// Claude Code hook 事件通知结构
#[derive(Debug, Deserialize, Serialize, Clone)]
pub struct HookNotification {
    /// 事件类型: "Notification" | "Stop"
    pub hook_event_name: String,
    /// 匹配器: "permission_prompt" | "idle_prompt" | "elicitation_dialog"
    #[serde(default)]
    pub matcher: String,
    /// 通知消息
    #[serde(default)]
    pub message: String,
    /// Claude Code session ID
    #[serde(default)]
    pub session_id: String,
}

/// 接收 Claude Code hook 通知，转发为 Tauri 事件
async fn handle_hook_notification(
    State(state): State<SharedState>,
    Json(payload): Json<HookNotification>,
) -> StatusCode {
    println!("[Hooks] 收到通知: event={}, matcher={}, session={}",
        payload.hook_event_name, payload.matcher, payload.session_id);

    // 向前端发送事件
    match state.app_handle.emit("claude-hook-notification", &payload) {
        Ok(_) => StatusCode::OK,
        Err(e) => {
            eprintln!("[Hooks] 发送事件失败: {}", e);
            StatusCode::INTERNAL_SERVER_ERROR
        }
    }
}

// ============================================================
// 路由
// ============================================================

fn create_router(state: SharedState) -> Router {
    let public_routes = Router::new()
        .route("/api/health", get(health_check))
        .route("/api/auth/login", post(login));

    let session_routes = Router::new()
        .route("/api/sessions", get(list_sessions).post(create_session))
        .route("/api/sessions/{id}", get(get_session).put(update_session).delete(delete_session))
        .route("/api/sessions/{id}/history", get(get_session_history))
        .route("/api/sessions/{id}/tokens", get(get_token_usage));

    let trash_routes = Router::new()
        .route("/api/trash", get(list_trash))
        .route("/api/trash/{id}/restore", post(restore_from_trash))
        .route("/api/trash/empty", post(empty_trash));

    let checkpoint_routes = Router::new()
        .route("/api/sessions/{session_id}/checkpoints", get(list_checkpoints).post(create_checkpoint_handler))
        .route("/api/sessions/{session_id}/checkpoints/{checkpoint_id}/restore", post(restore_checkpoint_handler))
        .route("/api/sessions/{session_id}/checkpoints/{checkpoint_id}", delete(delete_checkpoint_handler));

    let config_routes = Router::new()
        .route("/api/config", get(get_config).put(update_config))
        .route("/api/server-info", get(get_server_info));

    let tunnel_routes = Router::new()
        .route("/api/tunnel/status", get(get_tunnel_status))
        .route("/api/tunnel/start", post(start_tunnel_handler))
        .route("/api/tunnel/stop", post(stop_tunnel_handler));

    let terminal_routes = Router::new()
        .route("/api/sessions/{session_id}/terminal/history", get(get_terminal_history))
        .route("/api/sessions/{session_id}/terminal/input", post(pty_input))
        .route("/api/sessions/{session_id}/terminal/activate", post(activate_session_on_desktop))
        .route("/api/ws/terminal/{session_id}", get(ws_terminal_handler));

    let hook_routes = Router::new()
        .route("/api/hooks/notification", post(handle_hook_notification));

    let protected_routes = Router::new()
        .merge(session_routes)
        .merge(trash_routes)
        .merge(checkpoint_routes)
        .merge(config_routes)
        .merge(tunnel_routes)
        .merge(terminal_routes)
        .merge(hook_routes);

    // 静态文件服务（移动端 Web UI）
    // 获取当前工作目录
    let cwd = std::env::current_dir().unwrap_or_else(|_| std::path::PathBuf::from("."));

    // 尝试多个可能的路径
    let web_dist_paths = vec![
        cwd.join("src-tauri").join("web-dist"),
        cwd.join("web-dist"),
        cwd.join("..").join("src-tauri").join("web-dist"),
        std::path::PathBuf::from("web-dist"),
    ];

    println!("[Web Server] 当前工作目录: {:?}", cwd);

    let mut static_service = None;
    for path in &web_dist_paths {
        println!("[Web Server] 尝试路径: {:?}", path);
        if path.exists() {
            println!("[Web Server] ✓ 找到静态文件目录: {:?}", path);
            static_service = Some(ServeDir::new(path));
            break;
        }
    }

    let static_service = static_service.unwrap_or_else(|| {
        eprintln!("[Web Server] ✗ 警告: 未找到 web-dist 目录");
        ServeDir::new("web-dist")
    });

    Router::new()
        .merge(public_routes)
        .merge(protected_routes)
        .layer(middleware::from_fn_with_state(state.clone(), auth_middleware))
        .layer(CorsLayer::permissive())
        .fallback_service(static_service)
        .with_state(state)
}

// ============================================================
// 启动
// ============================================================

pub async fn start_web_server(app_state: SharedAppState, config: WebServerConfig, app_handle: tauri::AppHandle) -> Result<(), String> {
    let port = config.port;
    let token = config.access_token.clone();

    let inner = Arc::new(WebServerInner { app_state, config, app_handle });
    let router = create_router(inner);

    let addr = format!("0.0.0.0:{}", port);
    let listener = tokio::net::TcpListener::bind(&addr)
        .await
        .map_err(|e| format!("Failed to bind to {}: {}", addr, e))?;

    println!("[Web Server] Listening on http://localhost:{}", port);
    println!("[Web Server] Access token: {}", token);

    axum::serve(listener, router)
        .await
        .map_err(|e| format!("Web server error: {}", e))?;

    Ok(())
}
