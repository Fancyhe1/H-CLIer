#!/bin/bash
# Claude Code Hook 通知脚本 (macOS/Linux)
# 当 Claude Code 需要用户操作时，通过 HTTP POST 通知 Tauri 应用

INPUT=$(cat)
if [ -z "$INPUT" ]; then
    exit 0
fi

# 读取配置
CONFIG_DIR="${XDG_CONFIG_HOME:-$HOME/.config}/com.hcl-ier.dev"
TOKEN_FILE="$CONFIG_DIR/web_access_token"

if [ ! -f "$TOKEN_FILE" ]; then
    exit 0
fi

TOKEN=$(cat "$TOKEN_FILE" 2>/dev/null)
if [ -z "$TOKEN" ]; then
    exit 0
fi

# 发送通知到本地 Tauri 应用
curl -s -X POST "http://localhost:9527/api/hooks/notification" \
    -H "Authorization: Bearer $TOKEN" \
    -H "Content-Type: application/json" \
    -d "$INPUT" >/dev/null 2>&1 &

exit 0
