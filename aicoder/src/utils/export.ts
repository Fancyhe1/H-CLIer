import type { Session } from '../types/session'
import type { ChatMessage, ContentBlock } from '../types/history'
import { message } from 'antd'
import { invoke } from '@tauri-apps/api/core'
import { useSettingsStore } from '../stores/settingsStore'

// 将 ContentBlock 转为 Markdown
function blockToMarkdown(block: ContentBlock): string {
  switch (block.blockType) {
    case 'text':
      return block.text || ''
    case 'thinking':
      return block.thinking
        ? `<details><summary>💭 思考过程</summary>\n\n${block.thinking}\n\n</details>`
        : ''
    case 'tool_use': {
      const name = block.toolName || '未知工具'
      const input = block.toolInput ? `\`\`\`json\n${JSON.stringify(block.toolInput, null, 2)}\n\`\`\`` : ''
      return `> 🔧 **调用工具: ${name}**\n${input}`
    }
    case 'tool_result':
      return block.toolResult
        ? `> 📋 **工具结果**\n\`\`\`\n${block.toolResult}\n\`\`\``
        : ''
    default:
      return ''
  }
}

// 将 ContentBlock 转为 HTML
function blockToHTML(block: ContentBlock): string {
  switch (block.blockType) {
    case 'text':
      return `<div class="text-block">${escapeHtml(block.text || '')}</div>`
    case 'thinking':
      return block.thinking
        ? `<details class="thinking-block"><summary>💭 思考过程</summary><pre>${escapeHtml(block.thinking)}</pre></details>`
        : ''
    case 'tool_use': {
      const name = block.toolName || '未知工具'
      const input = block.toolInput ? `<pre>${escapeHtml(JSON.stringify(block.toolInput, null, 2))}</pre>` : ''
      return `<div class="tool-use-block"><strong>🔧 调用工具: ${escapeHtml(name)}</strong>${input}</div>`
    }
    case 'tool_result':
      return block.toolResult
        ? `<div class="tool-result-block"><strong>📋 工具结果</strong><pre>${escapeHtml(block.toolResult)}</pre></div>`
        : ''
    default:
      return ''
  }
}

// 导出为JSON
export function exportToJSON(session: Session, messages: ChatMessage[]): string {
  const data = {
    version: '2.0',
    exportedAt: new Date().toISOString(),
    session: {
      id: session.id,
      title: session.title,
      projectPath: session.projectPath,
      sessionType: session.sessionType,
      color: session.color,
      isFavorite: session.isFavorite,
      createdAt: session.createdAt,
      lastActivityAt: session.lastActivityAt,
      messageCount: session.messageCount,
    },
    messages: messages.map(msg => ({
      id: msg.id,
      role: msg.role,
      timestamp: msg.timestamp,
      content: msg.content.map(block => {
        switch (block.blockType) {
          case 'text': return { type: 'text', text: block.text }
          case 'thinking': return { type: 'thinking', thinking: block.thinking }
          case 'tool_use': return { type: 'tool_use', name: block.toolName, input: block.toolInput }
          case 'tool_result': return { type: 'tool_result', result: block.toolResult }
          default: return block
        }
      }),
    })),
  }
  return JSON.stringify(data, null, 2)
}

export function exportToMarkdown(session: Session, messages: ChatMessage[]): string {
  const timestamp = new Date().toLocaleString()

  let content = `# ${session.title}\n\n`
  content += `**项目路径**: ${session.projectPath}\n\n`
  content += `**创建时间**: ${new Date(session.createdAt).toLocaleString()}\n\n`
  content += `**最后活动**: ${new Date(session.lastActivityAt).toLocaleString()}\n\n`
  content += `**消息数量**: ${session.messageCount}\n\n`
  content += `---\n\n`

  if (messages.length === 0) {
    content += `*暂无消息记录*\n`
  } else {
    messages.forEach((msg) => {
      const roleLabel = msg.role === 'user' ? '👤 用户' : '🤖 AI'
      const time = msg.timestamp ? new Date(msg.timestamp).toLocaleString() : ''
      content += `## ${roleLabel} ${time ? `(${time})` : ''}\n\n`
      msg.content.forEach(block => {
        const md = blockToMarkdown(block)
        if (md) content += md + '\n\n'
      })
    })
  }

  content += `\n---\n\n`
  content += `*导出时间: ${timestamp}*\n`
  content += `*由 H CLIer 导出*\n`

  return content
}

export function exportToHTML(session: Session, messages: ChatMessage[]): string {
  const timestamp = new Date().toLocaleString()

  const messagesHTML = messages.length === 0
    ? '<p><em>暂无消息记录</em></p>'
    : messages.map((msg) => {
      const roleLabel = msg.role === 'user' ? '👤 用户' : '🤖 AI'
      const roleClass = msg.role === 'user' ? 'user' : 'assistant'
      const time = msg.timestamp ? new Date(msg.timestamp).toLocaleString() : ''
      const blocksHTML = msg.content.map(blockToHTML).filter(Boolean).join('\n')
      return `
        <div class="message ${roleClass}">
          <div class="message-header">
            <span class="role">${roleLabel}</span>
            ${time ? `<span class="time">${escapeHtml(time)}</span>` : ''}
          </div>
          <div class="message-body">
            ${blocksHTML}
          </div>
        </div>`
    }).join('')

  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(session.title)} - 会话记录</title>
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      max-width: 800px;
      margin: 0 auto;
      padding: 40px 20px;
      line-height: 1.6;
      color: #333;
    }
    h1 { color: #1677ff; border-bottom: 2px solid #1677ff; padding-bottom: 10px; }
    .meta { background: #f5f5f5; padding: 15px; border-radius: 8px; margin: 20px 0; }
    .meta p { margin: 5px 0; }
    .message { margin: 20px 0; padding: 15px; border-radius: 8px; }
    .message.user { background: #e6f7ff; }
    .message.assistant { background: #f6ffed; }
    .message-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px; }
    .role { font-weight: bold; font-size: 14px; }
    .time { color: #999; font-size: 12px; }
    .message-body { margin-top: 8px; }
    .text-block { white-space: pre-wrap; word-wrap: break-word; }
    .thinking-block { margin: 8px 0; }
    .thinking-block summary { cursor: pointer; color: #888; font-size: 13px; }
    .thinking-block pre { background: #fff; padding: 12px; border-radius: 4px; border: 1px solid #e8e8e8; font-size: 13px; }
    .tool-use-block { margin: 8px 0; padding: 10px; background: #fffbe6; border-radius: 4px; border: 1px solid #ffe58f; }
    .tool-use-block pre { background: #fff; padding: 10px; border-radius: 4px; margin-top: 6px; font-size: 13px; }
    .tool-result-block { margin: 8px 0; padding: 10px; background: #f0f0f0; border-radius: 4px; }
    .tool-result-block pre { background: #fff; padding: 10px; border-radius: 4px; margin-top: 6px; font-size: 13px; }
    .footer {
      margin-top: 40px;
      padding-top: 20px;
      border-top: 1px solid #e8e8e8;
      color: #999;
      font-size: 12px;
      text-align: center;
    }
  </style>
</head>
<body>
  <h1>${escapeHtml(session.title)}</h1>

  <div class="meta">
    <p><strong>项目路径:</strong> ${escapeHtml(session.projectPath)}</p>
    <p><strong>创建时间:</strong> ${new Date(session.createdAt).toLocaleString()}</p>
    <p><strong>最后活动:</strong> ${new Date(session.lastActivityAt).toLocaleString()}</p>
    <p><strong>消息数量:</strong> ${session.messageCount}</p>
  </div>

  <hr>

  ${messagesHTML}

  <div class="footer">
    <p>导出时间: ${timestamp}</p>
    <p>由 H CLIer 导出</p>
  </div>
</body>
</html>`
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;')
}

// 统一的导出处理函数
export async function handleExportSession(
  session: Session,
  format: 'md' | 'html' | 'json'
): Promise<void> {
  // 获取默认导出路径
  const config = useSettingsStore.getState().config
  const defaultPath = config.general.default_export_path

  // 从 JSONL 文件读取真实会话历史
  let messages: ChatMessage[] = []
  try {
    messages = await invoke<ChatMessage[]>('read_session_history', {
      sessionId: session.cliSessionId || session.id,
      projectPath: session.projectPath,
    }) || []
  } catch (err) {
    console.warn('读取会话历史失败，将导出会话信息（不含消息）:', err)
  }

  const safeTitle = session.title.replace(/[\\/:*?"<>|]/g, '_')
  const ext = format === 'md' ? 'md' : format === 'html' ? 'html' : 'json'
  const filename = `${safeTitle}.${ext}`

  try {
    // 弹出保存对话框
    const filters: Array<[string, string[]]> = []
    if (format === 'md') {
      filters.push(['Markdown 文件', ['md']])
    } else if (format === 'html') {
      filters.push(['HTML 文件', ['html']])
    } else {
      filters.push(['JSON 文件', ['json']])
    }

    const savePath = await invoke<string | null>('save_file_dialog', {
      defaultPath: defaultPath ? `${defaultPath}\\${filename}` : filename,
      filters: filters,
    })

    if (!savePath) {
      // 用户取消
      return
    }

    // 生成内容
    let content: string
    if (format === 'md') {
      content = exportToMarkdown(session, messages)
    } else if (format === 'html') {
      content = exportToHTML(session, messages)
    } else {
      content = exportToJSON(session, messages)
    }

    // 保存文件
    await invoke('write_text_file', { path: savePath, content })

    message.success(`已保存到: ${savePath}`, 3)
  } catch (err) {
    console.error('导出失败:', err)
    message.error('导出失败: ' + String(err))
  }
}
