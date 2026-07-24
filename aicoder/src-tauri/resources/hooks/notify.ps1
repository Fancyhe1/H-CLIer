# Claude Code Hook 通知脚本 (Windows)
# 当 Claude Code 需要用户操作时，通过 HTTP POST 通知 Tauri 应用

# 使用 .NET API 读取原始 stdin 字节，避免 PowerShell $input 破坏 JSON 转义
$stdin = [Console]::OpenStandardInput()
$ms = New-Object System.IO.MemoryStream
$buf = New-Object byte[] 4096
while ($true) {
    $n = $stdin.Read($buf, 0, $buf.Length)
    if ($n -eq 0) { break }
    $ms.Write($buf, 0, $n)
}
$stdin.Close()
$raw = [System.Text.Encoding]::UTF8.GetString($ms.ToArray())
$ms.Dispose()

# DEBUG: 记录调用
$logFile = Join-Path "$env:APPDATA\com.hcl-ier.dev" "hook-debug.log"
$preview = if ($raw.Length -gt 100) { $raw.Substring(0, 100) } else { $raw }
Add-Content $logFile "[$(Get-Date -Format 'HH:mm:ss')] PS called, len=$($raw.Length), preview=$preview"

if (-not $raw -or -not $raw.Trim()) {
    exit 0
}

# 读取配置
$configDir = "$env:APPDATA\com.hcl-ier.dev"
$tokenFile = Join-Path $configDir "web_access_token"

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
        -Method POST -Headers $headers -Body ([System.Text.Encoding]::UTF8.GetBytes($raw)) -ErrorAction Stop | Out-Null
    Add-Content $logFile "[$(Get-Date -Format 'HH:mm:ss')] PS POST OK"
} catch {
    Add-Content $logFile "[$(Get-Date -Format 'HH:mm:ss')] PS POST FAILED: $_"
}
