use ngrok::config::ForwarderBuilder;
use ngrok::tunnel::EndpointInfo;
use serde::{Deserialize, Serialize};
use std::sync::Arc;
use tokio::sync::Mutex;
use url::Url;

/// 隧道状态
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TunnelStatus {
    pub running: bool,
    pub url: Option<String>,
    pub error: Option<String>,
}

/// 隧道管理器
pub struct TunnelManager {
    /// 当前隧道的 URL
    tunnel_url: Arc<Mutex<Option<String>>>,
    /// 是否正在运行
    running: Arc<Mutex<bool>>,
    /// 关闭信号
    shutdown_tx: Arc<Mutex<Option<tokio::sync::oneshot::Sender<()>>>>,
    /// 错误信息
    error: Arc<Mutex<Option<String>>>,
}

impl TunnelManager {
    pub fn new() -> Self {
        Self {
            tunnel_url: Arc::new(Mutex::new(None)),
            running: Arc::new(Mutex::new(false)),
            shutdown_tx: Arc::new(Mutex::new(None)),
            error: Arc::new(Mutex::new(None)),
        }
    }

    /// 启动 ngrok 隧道
    pub async fn start(
        &self,
        authtoken: String,
        local_port: u16,
    ) -> Result<String, String> {
        // 如果已经在运行，先停止
        if *self.running.lock().await {
            self.stop().await;
        }

        *self.error.lock().await = None;

        // 安装 rustls crypto provider（ring 后端）
        let _ = rustls::crypto::ring::default_provider().install_default();

        let tunnel_url = self.tunnel_url.clone();
        let running = self.running.clone();
        let error_store = self.error.clone();
        let (tx, rx) = tokio::sync::oneshot::channel::<()>();
        *self.shutdown_tx.lock().await = Some(tx);

        let local_url = format!("http://localhost:{}", local_port);

        // 在后台任务中启动隧道
        tokio::spawn(async move {
            *running.lock().await = true;

            let result = async {
                let session = ngrok::Session::builder()
                    .authtoken(&authtoken)
                    .connect()
                    .await
                    .map_err(|e| format!("ngrok 连接失败: {}", e))?;

                let listener = session
                    .http_endpoint()
                    .listen_and_forward(Url::parse(&local_url).map_err(|e| format!("URL 解析失败: {}", e))?)
                    .await
                    .map_err(|e| format!("隧道创建失败: {}", e))?;

                let url = listener.url().to_string();
                *tunnel_url.lock().await = Some(url.clone());

                println!("[Tunnel] ngrok 隧道已建立: {}", url);

                // 等待关闭信号或隧道断开
                tokio::select! {
                    _ = rx => {
                        println!("[Tunnel] 收到关闭信号");
                    }
                    // 保持隧道活跃（listener drop 时自动关闭）
                    _ = tokio::signal::ctrl_c() => {}
                }

                Ok::<String, String>(url)
            }
            .await;

            match result {
                Ok(_) => {}
                Err(e) => {
                    eprintln!("[Tunnel] 错误: {}", e);
                    *error_store.lock().await = Some(e);
                }
            }

            *running.lock().await = false;
            *tunnel_url.lock().await = None;
        });

        // 等待隧道建立（最多 15 秒）
        for _ in 0..150 {
            tokio::time::sleep(tokio::time::Duration::from_millis(100)).await;
            if let Some(url) = self.tunnel_url.lock().await.clone() {
                return Ok(url);
            }
            if let Some(err) = self.error.lock().await.clone() {
                return Err(err);
            }
        }

        Err("隧道建立超时".to_string())
    }

    /// 停止隧道
    pub async fn stop(&self) {
        if let Some(tx) = self.shutdown_tx.lock().await.take() {
            let _ = tx.send(());
        }
        *self.running.lock().await = false;
        *self.tunnel_url.lock().await = None;
        *self.error.lock().await = None;
        println!("[Tunnel] 隧道已关闭");
    }

    /// 获取当前状态
    pub async fn status(&self) -> TunnelStatus {
        TunnelStatus {
            running: *self.running.lock().await,
            url: self.tunnel_url.lock().await.clone(),
            error: self.error.lock().await.clone(),
        }
    }
}
