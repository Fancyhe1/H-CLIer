# Claude Code Hook 通知脚本 (Windows)
# 当 Claude Code 需要用户操作时，通过 HTTP POST 通知 Tauri 应用

$input = $input | Out-String
if (-not $input.Trim()) {
    exit 0
}

# 读取配置
$configDir = "$env:APPDATA\com.hcl-ier.dev"
$tokenFile = Join-Path $configDir "web_access_token"

if (-not (Test-Path $tokenFile)) {
    # 尝试开发环境路径
    $configDir = "$env:APPDATA\com.hcl-ier.dev"
    $tokenFile = Join-Path $configDir "web_access_token"
}

if (-not (Test-Path $tokenFile)) {
    exit 0
}

$token = Get-Content $tokenFile -ErrorAction SilentlyContinue
if (-not $token) {
    exit 0
}

# 发送通知到本地 Tauri 应用
$headers = @{
    "Authorization" = "Bearer $token"
    "Content-Type" = "application/json"
}

try {
    Invoke-RestMethod -Uri "http://localhost:9527/api/hooks/notification" `
        -Method POST -Headers $headers -Body $input -ErrorAction SilentlyContinue | Out-Null
} catch {
    # 静默失败，不影响 Claude Code 正常运行
}
