use std::process::Command;
use std::env;
use crate::pty::PtyManager;

pub fn check_claude() -> Result<bool, Box<dyn std::error::Error>> {
    // 检测 Claude Code CLI (@anthropic-ai/claude-code)
    // 1. 检测 claude.cmd (Windows npm 全局安装，最快)
    if let Ok(output) = Command::new("claude.cmd").arg("--version").output() {
        if output.status.success() {
            return Ok(true);
        }
    }

    // 2. 检测 claude (非 .cmd)
    if let Ok(output) = Command::new("claude").arg("--version").output() {
        if output.status.success() {
            return Ok(true);
        }
    }

    // 3. 检测 npx claude-code（较慢，作为回退）
    if let Ok(output) = Command::new("npx")
        .args(&["-y", "@anthropic-ai/claude-code", "--version"])
        .output()
    {
        if output.status.success() {
            return Ok(true);
        }
    }

    // 4. 检测 npx claude (另一种调用方式)
    if let Ok(output) = Command::new("npx")
        .args(&["-y", "claude", "--version"])
        .output()
    {
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
    // 优先使用 claude.cmd（快速，全局安装时可用）
    let output = Command::new("claude.cmd")
        .arg("--version")
        .output();

    if let Ok(output) = output {
        if output.status.success() {
            let version = String::from_utf8_lossy(&output.stdout);
            let version = version.trim();
            // 提取版本号，去掉 "(Claude Code)" 等后缀
            let version = version.split_whitespace().next().unwrap_or(version);
            return Ok(version.to_string());
        }
    }

    // 回退到 npx（较慢）
    let output = Command::new("npx")
        .args(&["-y", "@anthropic-ai/claude-code", "--version"])
        .output()?;

    if output.status.success() {
        let version = String::from_utf8_lossy(&output.stdout);
        let version = version.trim();
        let version = version.split_whitespace().next().unwrap_or(version);
        return Ok(version.to_string());
    }

    // 回退到 claude（非 .cmd）
    let output = Command::new("claude")
        .arg("--version")
        .output()?;

    if output.status.success() {
        let version = String::from_utf8_lossy(&output.stdout);
        let version = version.trim();
        let version = version.split_whitespace().next().unwrap_or(version);
        Ok(version.to_string())
    } else {
        Err("Failed to get Claude Code version".into())
    }
}

pub fn get_claude_versions() -> Result<Vec<String>, Box<dyn std::error::Error>> {
    // 获取已安装的 Claude Code CLI 版本列表
    let output = Command::new("npm")
        .args(&["list", "-g", "@anthropic-ai/claude-code", "--depth=0", "--json"])
        .output()?;

    if output.status.success() {
        let json_str = String::from_utf8_lossy(&output.stdout);
        // 解析 npm list 输出获取版本
        let versions: Vec<String> = if json_str.contains("version") {
            json_str.lines()
                .filter(|line| line.contains("\"version\""))
                .filter_map(|line| {
                    let parts: Vec<&str> = line.split(':').collect();
                    if parts.len() > 1 {
                        let v = parts[1].trim().replace('"', "").replace(',', "");
                        if !v.is_empty() && v.starts_with('2') || v.starts_with('1') {
                            Some(v)
                        } else {
                            None
                        }
                    } else {
                        None
                    }
                })
                .collect()
        } else {
            vec![]
        };
        return Ok(versions);
    }

    Ok(vec![])
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
