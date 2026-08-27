use portable_pty::{CommandBuilder, NativePtySystem, PtyPair, PtySize, PtySystem};
use std::collections::HashMap;
use std::fs::{self, File, OpenOptions};
use std::io::{Read, Write};
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex};
use std::thread;
use std::time::{Duration, Instant};
use tauri::Emitter;

pub struct PtyInstance {
    pub pair: PtyPair,
    pub writer: Arc<Mutex<Box<dyn Write + Send>>>,
    _reader_thread: Option<thread::JoinHandle<()>>,
    log_file: Arc<Mutex<File>>,
    /// PTY 中的子进程（通常是 powershell），关闭时用于优雅退出/强杀
    child: Option<Box<dyn portable_pty::Child + Send + Sync>>,
}

pub struct PtyManager {
    ptys: HashMap<String, PtyInstance>,
    pty_system: NativePtySystem,
    log_dir: PathBuf,
}

impl PtyManager {
    pub fn new(log_dir: &Path) -> Self {
        // 确保日志目录存在
        fs::create_dir_all(log_dir).ok();

        Self {
            ptys: HashMap::new(),
            pty_system: NativePtySystem::default(),
            log_dir: log_dir.to_path_buf(),
        }
    }

    /// 获取会话的日志文件路径
    pub fn get_log_path(&self, session_id: &str) -> PathBuf {
        self.log_dir.join(format!("{}.log", session_id))
    }

    /// 读取历史日志内容
    pub fn read_history(&self, session_id: &str) -> Result<String, Box<dyn std::error::Error>> {
        let log_path = self.get_log_path(session_id);
        if log_path.exists() {
            let content = fs::read_to_string(&log_path)?;
            Ok(content)
        } else {
            Ok(String::new())
        }
    }

    /// 写入历史日志内容（用于克隆会话）
    pub fn write_history(&self, session_id: &str, content: &str) -> Result<(), Box<dyn std::error::Error>> {
        let log_path = self.get_log_path(session_id);
        let mut file = OpenOptions::new()
            .create(true)
            .write(true)
            .truncate(true)
            .open(&log_path)?;
        file.write_all(content.as_bytes())?;
        file.flush()?;
        Ok(())
    }

    /// 检测会话是否在运行 Claude（通过分析日志）
    pub fn was_running_claude(&self, session_id: &str) -> Result<bool, Box<dyn std::error::Error>> {
        let history = self.read_history(session_id)?;
        // 检查日志中是否有 claude 相关的内容
        // 如果最后有 claude 的输出特征，说明之前在运行
        let has_claude_marker = history.contains("Claude") ||
                                 history.contains("anthropic") ||
                                 history.contains("╭") ||  // Claude 的边框字符
                                 history.contains("╯");
        Ok(has_claude_marker)
    }

    /// 检查 PTY 是否存在
    pub fn has_pty(&self, session_id: &str) -> bool {
        self.ptys.contains_key(session_id)
    }

    /// 清理旧日志文件（保留最近30天）
    pub fn cleanup_old_logs(&self) -> Result<(), Box<dyn std::error::Error>> {
        let entries = fs::read_dir(&self.log_dir)?;
        let now = std::time::SystemTime::now();
        let thirty_days = Duration::from_secs(30 * 24 * 60 * 60);

        for entry in entries {
            if let Ok(entry) = entry {
                if let Ok(metadata) = entry.metadata() {
                    if let Ok(modified) = metadata.modified() {
                        if let Ok(elapsed) = now.duration_since(modified) {
                            if elapsed > thirty_days {
                                let _ = fs::remove_file(entry.path());
                            }
                        }
                    }
                }
            }
        }
        Ok(())
    }

    pub fn create_pty(
        &mut self,
        session_id: String,
        cols: u16,
        rows: u16,
        app_handle: &tauri::AppHandle,
    ) -> Result<String, Box<dyn std::error::Error>> {
        let pair = self.pty_system.openpty(PtySize {
            rows,
            cols,
            pixel_width: 0,
            pixel_height: 0,
        })?;

        let reader = pair.master.try_clone_reader()?;
        let writer = pair.master.take_writer()?;

        // 创建或打开日志文件
        let log_path = self.get_log_path(&session_id);
        let log_file = OpenOptions::new()
            .create(true)
            .append(true)
            .open(&log_path)?;

        let log_file_arc = Arc::new(Mutex::new(log_file));

        // 启动读取线程，将数据通过事件发送到前端并记录到日志
        let session_id_clone = session_id.clone();
        let app_handle_clone = app_handle.clone();
        let log_file_clone = Arc::clone(&log_file_arc);
        let reader_thread = thread::spawn(move || {
            let mut reader = reader;
            let mut buf = [0u8; 4096];

            loop {
                match reader.read(&mut buf) {
                    Ok(0) => {
                        // EOF - PTY 已关闭
                        let _ = app_handle_clone.emit(
                            &format!("pty-output-{}", session_id_clone),
                            "",
                        );
                        break;
                    }
                    Ok(n) => {
                        let data = String::from_utf8_lossy(&buf[..n]).to_string();

                        // 记录到日志
                        if let Ok(mut file) = log_file_clone.lock() {
                            let _ = file.write_all(data.as_bytes());
                            let _ = file.flush();
                        }

                        // 将数据编码为 hex 以避免特殊字符问题
                        let encoded = data.bytes().map(|b| format!("{:02x}", b)).collect::<String>();
                        let event_data = format!("hex:{}", encoded);

                        // 发送事件到前端
                        let event_name = format!("pty-output-{}", session_id_clone);
                        if app_handle_clone.emit(&event_name, &event_data).is_err() {
                            break;
                        }
                    }
                    Err(_) => {
                        break;
                    }
                }
                // 短暂休眠避免CPU占用过高
                thread::sleep(Duration::from_millis(1));
            }
        });

        let instance = PtyInstance {
            pair,
            writer: Arc::new(Mutex::new(writer)),
            _reader_thread: Some(reader_thread),
            log_file: log_file_arc,
            child: None,
        };

        self.ptys.insert(session_id.clone(), instance);
        Ok(session_id)
    }

    pub fn write(&mut self, pty_id: &str, data: &[u8]) -> Result<(), Box<dyn std::error::Error>> {
        if let Some(pty) = self.ptys.get_mut(pty_id) {
            let mut writer = pty.writer.lock().map_err(|_| "Lock poisoned")?;
            writer.write_all(data)?;
            writer.flush()?;
            Ok(())
        } else {
            Err("PTY not found".into())
        }
    }

    pub fn resize(
        &mut self,
        pty_id: &str,
        cols: u16,
        rows: u16,
    ) -> Result<(), Box<dyn std::error::Error>> {
        if let Some(pty) = self.ptys.get_mut(pty_id) {
            pty.pair.master.resize(PtySize {
                rows,
                cols,
                pixel_width: 0,
                pixel_height: 0,
            })?;
            Ok(())
        } else {
            Err("PTY not found".into())
        }
    }

    pub fn close(&mut self, pty_id: &str) -> Result<(), Box<dyn std::error::Error>> {
        if let Some(pty) = self.ptys.remove(pty_id) {
            // 后台线程执行完整清理流程（Ctrl+Q 优雅退出 → 等待 → 强杀），
            // 立即返回，不阻塞 UI
            std::thread::spawn(move || cleanup_instance(pty));
        }
        Ok(())
    }

    /// 关闭所有 PTY（应用退出时调用）：直接强杀进程树，保证退出前清理完成
    pub fn close_all(&mut self) {
        for (_, mut pty) in self.ptys.drain() {
            if let Some(child) = pty.child.as_mut() {
                if let Some(pid) = child.process_id() {
                    let _ = kill_process_tree(pid);
                } else {
                    let _ = child.kill();
                }
            }
            drop(pty.pair);
        }
    }

    pub fn spawn_command(
        &mut self,
        pty_id: &str,
        command: &str,
        args: &[&str],
        cwd: &str,
    ) -> Result<(), Box<dyn std::error::Error>> {
        if let Some(pty) = self.ptys.get_mut(pty_id) {
            let mut cmd = CommandBuilder::new(command);
            cmd.args(args);
            cmd.cwd(cwd);

            // 记录命令到日志
            let cmd_str = format!("\r\n[{}] $ {} {}\r\n", cwd, command, args.join(" "));
            if let Ok(mut file) = pty.log_file.lock() {
                let _ = file.write_all(cmd_str.as_bytes());
                let _ = file.flush();
            }

            // 保存子进程句柄，关闭 PTY 时用于优雅退出/强杀
            let child = pty.pair.slave.spawn_command(cmd)?;
            if let Some(mut old) = pty.child.replace(child) {
                // 同一 PTY 重复 spawn 时，先结束旧进程
                let _ = old.kill();
            }
            Ok(())
        } else {
            Err("PTY not found".into())
        }
    }
}

// 后台清理单个 PTY 实例：发 Ctrl+Q 优雅退出 → 最多等待 2 秒 → 未退出则强杀进程树
fn cleanup_instance(mut pty: PtyInstance) {
    if pty.child.is_some() {
        // 1. 发送 Ctrl+Q（Claude Code 的退出快捷键），让 claude 有机会保存状态
        if let Ok(mut writer) = pty.writer.lock() {
            let _ = writer.write_all(b"\x11");
            let _ = writer.flush();
        }

        // 2. 等待最多 2 秒让子进程自行退出
        let deadline = Instant::now() + Duration::from_secs(2);
        loop {
            let exited = match pty.child.as_mut() {
                Some(child) => child.try_wait().map(|s| s.is_some()).unwrap_or(true),
                None => true,
            };
            if exited || Instant::now() >= deadline {
                break;
            }
            thread::sleep(Duration::from_millis(100));
        }

        // 3. 仍未退出 → 强杀整个进程树（shell + claude 及其子进程），避免孤儿进程残留
        let still_running = match pty.child.as_mut() {
            Some(child) => child.try_wait().map(|s| s.is_none()).unwrap_or(false),
            None => false,
        };
        if still_running {
            if let Some(pid) = pty.child.as_ref().and_then(|c| c.process_id()) {
                let _ = kill_process_tree(pid);
            } else {
                let _ = pty.child.as_mut().map(|c| c.kill());
            }
        }
    }

    // 4. 关闭 PTY 导致读取线程退出，并等待其结束
    drop(pty.pair);
    if let Some(handle) = pty._reader_thread.take() {
        let _ = handle.join();
    }
}

// 强杀进程树：Windows 用 taskkill /T 递归终止所有子进程（shell → claude → claude 的子任务）
#[cfg(target_os = "windows")]
fn kill_process_tree(pid: u32) -> Result<(), Box<dyn std::error::Error>> {
    use std::os::windows::process::CommandExt;
    let _ = std::process::Command::new("taskkill")
        .args(["/F", "/T", "/PID", &pid.to_string()])
        // CREATE_NO_WINDOW：避免从 GUI 进程启动控制台程序时闪现终端窗口
        .creation_flags(0x08000000)
        .output()?;
    Ok(())
}

#[cfg(not(target_os = "windows"))]
fn kill_process_tree(pid: u32) -> Result<(), Box<dyn std::error::Error>> {
    let _ = std::process::Command::new("kill")
        .args(["-9", &pid.to_string()])
        .output()?;
    Ok(())
}

unsafe impl Send for PtyManager {}
unsafe impl Sync for PtyManager {}
