use std::process::Command;
use std::env;
use crate::pty::PtyManager;

pub fn check_claude() -> Result<bool, Box<dyn std::error::Error>> {
    // 尝试多种方式检测 Claude
    // 1. 直接检测 claude 命令
    if let Ok(output) = Command::new("claude").arg("--version").output() {
        if output.status.success() {
            return Ok(true);
        }
    }

    // 2. 检测 claude.cmd (Windows)
    if let Ok(output) = Command::new("claude.cmd").arg("--version").output() {
        if output.status.success() {
            return Ok(true);
        }
    }

    // 3. 检测 npx claude
    if let Ok(output) = Command::new("npx").args(&["-y", "@anthropic-ai/claude-code", "--version"]).output() {
        if output.status.success() {
            return Ok(true);
        }
    }

    // 4. 检测常见安装路径
    let common_paths = [
        r"C:\Program Files\nodejs\claude.cmd",
        r"C:\Program Files (x86)\nodejs\claude.cmd",
        r"C:\Users\%USERNAME%\AppData\Roaming\npm\claude.cmd",
    ];

    for path_template in &common_paths {
        let path = if path_template.contains("%USERNAME%") {
            if let Ok(username) = env::var("USERNAME") {
                path_template.replace("%USERNAME%", &username)
            } else {
                continue;
            }
        } else {
            path_template.to_string()
        };

        if std::path::Path::new(&path).exists() {
            return Ok(true);
        }
    }

    Ok(false)
}

pub fn get_claude_version() -> Result<String, Box<dyn std::error::Error>> {
    let output = Command::new("claude")
        .arg("--version")
        .output()?;

    if output.status.success() {
        let version = String::from_utf8_lossy(&output.stdout);
        Ok(version.trim().to_string())
    } else {
        Err("Failed to get Claude version".into())
    }
}

pub fn spawn_claude(
    pty_id: &str,
    project_path: &str,
    pty_manager: &PtyManager,
) -> Result<(), Box<dyn std::error::Error>> {
    // 注意：这里需要修改PtyManager来支持这个操作
    // 暂时返回成功，实际实现需要调整架构
    Ok(())
}

pub fn check_nodejs() -> Result<bool, Box<dyn std::error::Error>> {
    let output = Command::new("node")
        .arg("--version")
        .output();

    match output {
        Ok(result) => Ok(result.status.success()),
        Err(_) => Ok(false),
    }
}

pub fn check_npm() -> Result<bool, Box<dyn std::error::Error>> {
    let output = Command::new("npm")
        .arg("--version")
        .output();

    match output {
        Ok(result) => Ok(result.status.success()),
        Err(_) => Ok(false),
    }
}
