import type { Session } from '../types/session'
import { message } from 'antd'
import { invoke } from '@tauri-apps/api/core'
import { useSettingsStore } from '../stores/settingsStore'

export function exportToMarkdown(session: Session, messages: string[]): string {
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
    messages.forEach((msg, index) => {
      content += `## 消息 ${index + 1}\n\n${msg}\n\n`
    })
  }

  content += `\n---\n\n`
  content += `*导出时间: ${timestamp}*\n`
  content += `*由 智码 AICoder 导出*\n`

  return content
}

export function exportToHTML(session: Session, messages: string[]): string {
  const timestamp = new Date().toLocaleString()

  const messagesHTML = messages.length === 0
    ? '<p><em>暂无消息记录</em></p>'
    : messages.map((msg, index) => `
        <div class="message">
          <h3>消息 ${index + 1}</h3>
          <pre>${escapeHtml(msg)}</pre>
        </div>
      `).join('')

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
    h3 { color: #666; margin-top: 30px; }
    .meta { background: #f5f5f5; padding: 15px; border-radius: 8px; margin: 20px 0; }
    .meta p { margin: 5px 0; }
    .message { margin: 20px 0; padding: 15px; background: #fafafa; border-radius: 8px; }
    .message pre {
      white-space: pre-wrap;
      word-wrap: break-word;
      background: #fff;
      padding: 15px;
      border-radius: 4px;
      border: 1px solid #e8e8e8;
    }
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
    <p>由 智码 AICoder 导出</p>
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
  format: 'md' | 'html'
): Promise<void> {
  // 获取默认导出路径
  const config = useSettingsStore.getState().config
  const defaultPath = config.general.default_export_path

  // 模拟消息数据（实际应从终端获取历史记录）
  const messages = [
    '用户: 你好，请帮我分析这个代码',
    'AI: 好的，让我分析一下...',
    'AI: 这段代码的主要问题是...',
  ]

  const safeTitle = session.title.replace(/[\\/:*?"<>|]/g, '_')
  const filename = format === 'md' ? `${safeTitle}.md` : `${safeTitle}.html`

  try {
    // 弹出保存对话框
    const filters = format === 'md'
      ? [['Markdown 文件', ['md']]]
      : [['HTML 文件', ['html']]]

    const savePath = await invoke<string | null>('save_file_dialog', {
      defaultPath: defaultPath ? `${defaultPath}\\${filename}` : filename,
      filters: filters,
    })

    if (!savePath) {
      // 用户取消
      return
    }

    // 生成内容
    const content = format === 'md'
      ? exportToMarkdown(session, messages)
      : exportToHTML(session, messages)

    // 保存文件
    await invoke('write_text_file', { path: savePath, content })

    message.success(`已保存到: ${savePath}`, 3)
  } catch (err) {
    console.error('导出失败:', err)
    message.error('导出失败: ' + String(err))
  }
}
